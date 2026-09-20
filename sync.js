// ============================================================
// File de synchronisation — envoie en arrière-plan les articles
// "en attente" vers le Google Sheet, avec nouvelles tentatives
// automatiques en cas d'échec (réseau absent, serveur occupé...).
//
// Règle d'or : un article est déjà en sécurité sur le téléphone
// (voir idb.js) AVANT même la première tentative d'envoi. Cette
// file ne fait qu'essayer de le faire "monter" vers le tableau,
// sans jamais mettre en danger ce qui est déjà sauvegardé.
// ============================================================

let syncEnCours = false;
const ecouteursEtatSync = [];

function onSyncStateChange(fn) {
  ecouteursEtatSync.push(fn);
}

function notifierEtatSync() {
  ecouteursEtatSync.forEach((fn) => fn());
}

function genererUUID() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  // Repli simple si randomUUID indisponible (vieux navigateurs Android)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Codes d'erreur qui ne se résoudront JAMAIS en réessayant (un problème
// dans les données ou de configuration, pas un souci réseau/serveur
// passager) : autant le signaler tout de suite plutôt que de retenter en
// boucle pendant des heures sans jamais prévenir clairement l'utilisateur.
// INVALID_PRICE / INVALID_PAYLOAD : quelque chose à corriger dans l'article
// lui-même. UNAUTHORIZED : la clé de sécurité de l'app (voir config.js) ne
// correspond plus à celle du serveur — un réessai ne changera rien tant que
// les deux ne sont pas remis d'accord.
const ERREURS_DEFINITIVES = ['INVALID_PRICE', 'INVALID_PAYLOAD', 'UNAUTHORIZED'];

function calculerDelaiAttente(tentatives) {
  const paliers = [10, 30, 60, 300, 900]; // secondes : 10s, 30s, 1min, 5min, 15min
  const idx = Math.min(tentatives, paliers.length - 1);
  return paliers[idx] * 1000;
}

async function synchroniserFile() {
  if (syncEnCours) return;
  if (!navigator.onLine) return;
  syncEnCours = true;
  notifierEtatSync();
  try {
    const enAttente = await dbGetPendingArticles();
    const maintenant = Date.now();
    for (const article of enAttente) {
      if (!navigator.onLine) break; // le réseau a coupé pendant la boucle, on arrête proprement
      if (article.prochaineTentativeAt && article.prochaineTentativeAt > maintenant) continue;

      article.statutSync = 'envoi_en_cours';
      await dbPutArticle(article);
      notifierEtatSync();

      try {
        const reponse = await apiCreateItem(construirePayload(article));
        if (reponse && reponse.status === 'success') {
          article.statutSync = 'envoye';
          article.reference = reponse.data.reference;
          article.derniereErreur = null;
          await dbPutArticle(article);
        } else {
          const message = (reponse && reponse.message) || 'Erreur inconnue du serveur';
          if (reponse && ERREURS_DEFINITIVES.includes(reponse.error_code)) {
            // Erreur définitive : ne sert à rien de retenter indéfiniment
            // (le problème ne se résoudra pas tout seul avec le temps —
            // contrairement à un serveur momentanément occupé), mais on ne
            // supprime JAMAIS l'article : il reste visible et modifiable
            // pour que l'utilisateur corrige ce qui doit l'être.
            article.statutSync = 'echec_a_corriger';
          } else {
            article.statutSync = 'en_attente';
            article.tentatives = (article.tentatives || 0) + 1;
            article.prochaineTentativeAt = Date.now() + calculerDelaiAttente(article.tentatives);
          }
          article.derniereErreur = message;
          await dbPutArticle(article);
        }
      } catch (err) {
        article.statutSync = 'en_attente';
        article.tentatives = (article.tentatives || 0) + 1;
        article.prochaineTentativeAt = Date.now() + calculerDelaiAttente(article.tentatives);
        article.derniereErreur = String((err && err.message) || err);
        await dbPutArticle(article);
      }
      notifierEtatSync();
    }
  } finally {
    syncEnCours = false;
    notifierEtatSync();
  }
}

function construirePayload(article) {
  return {
    client_item_id: article.localId,
    container_letter: article.containerLetter,
    designation: article.designation,
    nombre_colis: article.nombreColis,
    matiere_finale: article.matiereFinale,
    pesees_kg: article.peseesKg,
    prix_achat_eur: article.prixEur,
    origine: article.origine,
    periode: article.periode,
    dimensions: article.dimensions,
    photo_base64: article.photoBase64 || null
  };
}

function demarrerDeclencheursSync() {
  window.addEventListener('online', () => synchroniserFile());
  window.addEventListener('offline', () => notifierEtatSync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') synchroniserFile();
  });
  setInterval(() => synchroniserFile(), 30000);
  synchroniserFile();
}
