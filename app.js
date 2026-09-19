// ============================================================
// Brocante Export — logique de l'application
// ============================================================

const DEFAULT_MATIERES = ['Bois', 'Faïence', 'Céramique', 'Porcelaine', 'Verre', 'Métal', 'Marbre', 'Textile', 'Cuir', 'Osier / rotin'];
const DEFAULT_ESSENCES = ['Chêne', 'Noyer', 'Merisier', 'Hêtre', 'Acajou', 'Teck'];
const DEFAULT_ORIGINES = ['France', 'Belgique', 'Chine', 'Japon', 'Angleterre', 'Hollande', 'Italie'];
const DRAFT_KEY = 'draft_en_cours';
const CONTAINER_KEY = 'container_actuel';
const SUGGESTIONS_KEY = 'suggestions_cache';

const el = (id) => document.getElementById(id);

const state = {
  containerLetter: localStorage.getItem(CONTAINER_KEY) || null,
  draft: null,
  suggestions: { matiere: [...DEFAULT_MATIERES], origine: [...DEFAULT_ORIGINES] },
  matiereChoisie: null,
  essenceChoisie: null,
  origineChoisie: null,
  periodeMode: 'annee'
};

// ---------------- Navigation entre écrans ----------------

function afficherEcran(id) {
  document.querySelectorAll('.screen').forEach((s) => (s.hidden = true));
  el(id).hidden = false;
  window.scrollTo(0, 0);
}

// ---------------- Accueil ----------------

async function rafraichirAccueil() {
  el('home-lettre').textContent = state.containerLetter || '-';
  if (!state.containerLetter) {
    afficherEcran('screen-container');
    return;
  }
  const counts = await dbCountByStatus(state.containerLetter);
  el('home-count-total').textContent = counts.total;
  afficherEcran('screen-home');
}

el('btn-ajouter').addEventListener('click', () => demarrerNouvelArticle());
el('btn-voir-articles').addEventListener('click', () => afficherListeArticles());
el('btn-nouveau-container').addEventListener('click', () => afficherEcran('screen-container'));

// ---------------- Nouveau container ----------------

function construireGrilleLettres() {
  const grille = el('grille-lettres');
  grille.innerHTML = '';
  for (let i = 0; i < 26; i++) {
    const lettre = String.fromCharCode(65 + i);
    const btn = document.createElement('button');
    btn.textContent = lettre;
    btn.addEventListener('click', () => choisirLettreContainer(lettre));
    grille.appendChild(btn);
  }
}

async function choisirLettreContainer(lettre) {
  let info = { exists: false, nb_articles: 0 };
  try {
    if (navigator.onLine) {
      const rep = await apiCheckContainer(lettre);
      if (rep && rep.status === 'success') info = rep.data;
    }
  } catch (e) {
    // Hors-ligne ou serveur injoignable : on continue quand même,
    // le serveur fera foi de toute façon à la synchronisation.
  }

  el('confirm-container-titre').textContent = info.exists
    ? 'Continuer ce container ?'
    : 'Créer le container ' + lettre + ' ?';
  el('confirm-container-texte').textContent = info.exists
    ? 'Le container ' + lettre + ' contient déjà ' + info.nb_articles + ' article(s).'
    : 'Un nouveau container vide va être créé.';

  el('btn-confirmer-container').onclick = () => {
    state.containerLetter = lettre;
    localStorage.setItem(CONTAINER_KEY, lettre);
    rafraichirAccueil();
  };
  afficherEcran('screen-confirm-container');
}

el('btn-annuler-container').addEventListener('click', () => rafraichirAccueil());
el('btn-annuler-confirm-container').addEventListener('click', () => afficherEcran('screen-container'));

// ---------------- Nouvel article : photo ----------------

function demarrerNouvelArticle() {
  const brouillonExistant = chargerBrouillon();
  if (brouillonExistant) {
    state.draft = brouillonExistant;
  } else {
    state.draft = creerBrouillonVide();
  }
  restaurerEcranPhoto();
}

function creerBrouillonVide() {
  return {
    localId: genererUUID(),
    containerLetter: state.containerLetter,
    designation: '',
    nombreColis: 1,
    matiereCategorie: null,
    matiereAutre: '',
    essenceBois: null,
    essenceAutre: '',
    origine: null,
    origineAutre: '',
    peseesKg: [],
    prixEur: '',
    periode: { type: 'annee_precise', annee: '' },
    dimensions: '',
    photoBase64: null
  };
}

function sauvegarderBrouillon() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(state.draft));
  } catch (e) { /* stockage plein — pas bloquant pour l'instant */ }
}
function chargerBrouillon() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function effacerBrouillon() {
  localStorage.removeItem(DRAFT_KEY);
}

function restaurerEcranPhoto() {
  if (state.draft.photoBase64) {
    el('photo-apercu').src = state.draft.photoBase64;
    el('photo-apercu').hidden = false;
    el('photo-placeholder').hidden = true;
    el('btn-photo-suivant').hidden = false;
  } else {
    el('photo-apercu').hidden = true;
    el('photo-placeholder').hidden = false;
    el('btn-photo-suivant').hidden = true;
  }
  afficherEcran('screen-photo');
}

el('btn-prendre-photo').addEventListener('click', () => el('photo-input').click());

el('photo-input').addEventListener('change', async () => {
  const fichier = el('photo-input').files[0];
  if (!fichier) return;
  try {
    const dataUrl = await compresserPhoto(fichier);
    state.draft.photoBase64 = dataUrl;
    sauvegarderBrouillon();
    el('photo-apercu').src = dataUrl;
    el('photo-apercu').hidden = false;
    el('photo-placeholder').hidden = true;
    el('btn-photo-suivant').hidden = false;
  } catch (e) {
    alert("La photo n'a pas pu être utilisée, vous pouvez continuer sans elle ou réessayer.");
  }
});

function compresserPhoto(fichier) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let dim = 1000;
        let qualite = 0.72;
        function tenter(d, q) {
          let w = img.width;
          let h = img.height;
          if (w >= h && w > d) { h = Math.round((h * d) / w); w = d; }
          else if (h > w && h > d) { w = Math.round((w * d) / h); h = d; }
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          return canvas.toDataURL('image/jpeg', q);
        }
        let out = tenter(dim, qualite);
        let iter = 0;
        while (out.length > 260000 && iter < 6) {
          qualite = Math.max(0.35, qualite - 0.1);
          dim = Math.round(dim * 0.85);
          out = tenter(dim, qualite);
          iter++;
        }
        resolve(out);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(fichier);
  });
}

el('btn-photo-suivant').addEventListener('click', () => allerAuFormulaire());
el('btn-sans-photo').addEventListener('click', () => allerAuFormulaire());

// ---------------- Formulaire ----------------

function allerAuFormulaire() {
  if (state.draft.photoBase64) {
    el('form-photo-mini-img').src = state.draft.photoBase64;
    el('form-photo-mini-img').hidden = false;
  } else {
    el('form-photo-mini-img').hidden = true;
  }

  el('champ-designation').value = state.draft.designation || '';
  el('champ-colis').value = state.draft.nombreColis != null ? state.draft.nombreColis : 1;
  el('champ-prix').value = state.draft.prixEur || '';
  el('champ-dimensions').value = state.draft.dimensions || '';

  construireChips('grille-matiere', state.suggestions.matiere, state.draft.matiereCategorie, (val) => {
    state.draft.matiereCategorie = val;
    el('champ-matiere-autre').hidden = val !== 'Autre';
    afficherBlocEssenceSiBesoin();
    sauvegarderBrouillon();
  });
  el('champ-matiere-autre').hidden = state.draft.matiereCategorie !== 'Autre';
  el('champ-matiere-autre').value = state.draft.matiereAutre || '';
  afficherBlocEssenceSiBesoin();

  construireChips('grille-essence', DEFAULT_ESSENCES, state.draft.essenceBois, (val) => {
    state.draft.essenceBois = val;
    el('champ-essence-autre').hidden = val !== 'Autre';
    sauvegarderBrouillon();
  });
  el('champ-essence-autre').hidden = state.draft.essenceBois !== 'Autre';
  el('champ-essence-autre').value = state.draft.essenceAutre || '';

  construireChips('grille-origine', state.suggestions.origine, state.draft.origine, (val) => {
    state.draft.origine = val;
    el('champ-origine-autre').hidden = val !== 'Autre';
    sauvegarderBrouillon();
  });
  el('champ-origine-autre').hidden = state.draft.origine !== 'Autre';
  el('champ-origine-autre').value = state.draft.origineAutre || '';

  if (state.draft.periode && state.draft.periode.type === 'fourchette') {
    basculerPeriode('fourchette');
    el('champ-annee-de').value = state.draft.periode.de || '';
    el('champ-annee-a').value = state.draft.periode.a || '';
  } else {
    basculerPeriode('annee');
    el('champ-annee').value = (state.draft.periode && state.draft.periode.annee) || '';
  }

  rafraichirPanierPoids();
  afficherEcran('screen-form');
}

function afficherBlocEssenceSiBesoin() {
  const estBois = state.draft.matiereCategorie === 'Bois';
  el('bloc-essence').hidden = !estBois;
}

function construireChips(idGrille, valeurs, valeurChoisie, onChoix) {
  const grille = el(idGrille);
  grille.innerHTML = '';
  const toutes = [...valeurs];
  if (!toutes.includes('Autre')) toutes.push('Autre');
  toutes.forEach((val) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip' + (val === valeurChoisie ? ' selected' : '');
    chip.textContent = val;
    chip.addEventListener('click', () => {
      grille.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      onChoix(val);
    });
    grille.appendChild(chip);
  });
}

// Champs texte : sauvegarde automatique du brouillon à chaque frappe
['champ-designation', 'champ-matiere-autre', 'champ-essence-autre', 'champ-origine-autre',
  'champ-prix', 'champ-dimensions', 'champ-annee', 'champ-annee-de', 'champ-annee-a'].forEach((id) => {
  el(id).addEventListener('input', () => {
    state.draft.designation = el('champ-designation').value;
    state.draft.matiereAutre = el('champ-matiere-autre').value;
    state.draft.essenceAutre = el('champ-essence-autre').value;
    state.draft.origineAutre = el('champ-origine-autre').value;
    state.draft.prixEur = el('champ-prix').value;
    state.draft.dimensions = el('champ-dimensions').value;
    sauvegarderBrouillon();
  });
});

el('btn-colis-moins').addEventListener('click', () => {
  const v = Math.max(0, (parseInt(el('champ-colis').value, 10) || 0) - 1);
  el('champ-colis').value = v;
  state.draft.nombreColis = v;
  sauvegarderBrouillon();
});
el('btn-colis-plus').addEventListener('click', () => {
  const v = (parseInt(el('champ-colis').value, 10) || 0) + 1;
  el('champ-colis').value = v;
  state.draft.nombreColis = v;
  sauvegarderBrouillon();
});
el('champ-colis').addEventListener('input', () => {
  state.draft.nombreColis = parseInt(el('champ-colis').value, 10) || 0;
  sauvegarderBrouillon();
});

// ---- Panier de pesées ----

function rafraichirPanierPoids() {
  const liste = el('liste-pesees');
  liste.innerHTML = '';
  (state.draft.peseesKg || []).forEach((val, idx) => {
    const chip = document.createElement('div');
    chip.className = 'pesee-chip';
    chip.innerHTML = '<span>' + val + ' kg</span>';
    const btnSuppr = document.createElement('button');
    btnSuppr.textContent = '×';
    btnSuppr.addEventListener('click', () => {
      state.draft.peseesKg.splice(idx, 1);
      sauvegarderBrouillon();
      rafraichirPanierPoids();
    });
    chip.appendChild(btnSuppr);
    liste.appendChild(chip);
  });
  const total = (state.draft.peseesKg || []).reduce((a, b) => a + Number(b), 0);
  el('poids-total').textContent = Math.round(total * 100) / 100;
}

el('btn-ajouter-pesee').addEventListener('click', () => {
  const champ = el('champ-nouvelle-pesee');
  const v = parseFloat(champ.value);
  if (!isNaN(v) && v > 0) {
    state.draft.peseesKg = state.draft.peseesKg || [];
    state.draft.peseesKg.push(v);
    champ.value = '';
    sauvegarderBrouillon();
    rafraichirPanierPoids();
  }
});

// ---- Période ----

function basculerPeriode(mode) {
  state.periodeMode = mode;
  el('btn-periode-annee').classList.toggle('active', mode === 'annee');
  el('btn-periode-fourchette').classList.toggle('active', mode === 'fourchette');
  el('periode-annee-bloc').hidden = mode !== 'annee';
  el('periode-fourchette-bloc').hidden = mode !== 'fourchette';
}
el('btn-periode-annee').addEventListener('click', () => basculerPeriode('annee'));
el('btn-periode-fourchette').addEventListener('click', () => basculerPeriode('fourchette'));

// ---------------- Récapitulatif ----------------

function calculerMatiereFinale() {
  let base = state.draft.matiereCategorie === 'Autre' ? state.draft.matiereAutre : state.draft.matiereCategorie;
  base = (base || '').trim();
  if (state.draft.matiereCategorie === 'Bois' && state.draft.essenceBois) {
    const essence = state.draft.essenceBois === 'Autre' ? state.draft.essenceAutre : state.draft.essenceBois;
    if (essence && essence.trim()) return essence.trim().toUpperCase();
  }
  return base.toUpperCase();
}

function calculerOrigineFinale() {
  const val = state.draft.origine === 'Autre' ? state.draft.origineAutre : state.draft.origine;
  return (val || '').trim();
}

function calculerPeriodeFinale() {
  if (state.periodeMode === 'fourchette') {
    return { type: 'fourchette', de: el('champ-annee-de').value, a: el('champ-annee-a').value };
  }
  return { type: 'annee_precise', annee: el('champ-annee').value };
}

function texteRecapPeriode(p) {
  if (p.type === 'fourchette') return (p.de || '?') + ' à ' + (p.a || '?');
  return p.annee || '(non précisée)';
}

el('btn-voir-recap').addEventListener('click', () => {
  state.draft.origine = state.draft.origine; // déjà à jour via chips
  state.draft.periode = calculerPeriodeFinale();
  sauvegarderBrouillon();

  const matiereFinale = calculerMatiereFinale();
  const origineFinale = calculerOrigineFinale();
  const totalPoids = (state.draft.peseesKg || []).reduce((a, b) => a + Number(b), 0);

  const lignes = [
    ['Désignation', state.draft.designation || '(vide)'],
    ['Matière', matiereFinale || '(non précisée)'],
    ['Origine', origineFinale || '(non précisée)'],
    ['Nombre de colis', state.draft.nombreColis],
    ['Poids total', Math.round(totalPoids * 100) / 100 + ' kg'],
    ['Prix d\'achat', (state.draft.prixEur || 0) + ' €'],
    ['Période', texteRecapPeriode(state.draft.periode)],
    ['Dimensions', state.draft.dimensions || '(non précisées)']
  ];

  const conteneur = el('recap-contenu');
  conteneur.innerHTML = '';
  if (state.draft.photoBase64) {
    const img = document.createElement('img');
    img.src = state.draft.photoBase64;
    img.className = 'recap-photo';
    conteneur.appendChild(img);
  }
  lignes.forEach(([label, valeur]) => {
    const ligne = document.createElement('div');
    ligne.className = 'recap-ligne';
    ligne.innerHTML = '<span>' + label + '</span><span class="valeur"></span>';
    ligne.querySelector('.valeur').textContent = valeur;
    conteneur.appendChild(ligne);
  });

  afficherEcran('screen-recap');
});

el('btn-modifier-article').addEventListener('click', () => allerAuFormulaire());
el('btn-annuler-form').addEventListener('click', () => {
  effacerBrouillon();
  state.draft = null;
  rafraichirAccueil();
});

// ---------------- Validation ----------------

el('btn-valider-article').addEventListener('click', async () => {
  const article = {
    localId: state.draft.localId,
    containerLetter: state.draft.containerLetter,
    designation: state.draft.designation || '',
    nombreColis: state.draft.nombreColis || 0,
    matiereFinale: calculerMatiereFinale(),
    origine: calculerOrigineFinale(),
    peseesKg: state.draft.peseesKg || [],
    prixEur: parseFloat(state.draft.prixEur) || 0,
    periode: state.draft.periode,
    dimensions: state.draft.dimensions || '',
    photoBase64: state.draft.photoBase64 || null,
    dateValidation: new Date().toISOString(),
    statutSync: 'en_attente',
    tentatives: 0,
    prochaineTentativeAt: null,
    reference: null,
    derniereErreur: null
  };

  // Écriture locale durable AVANT toute tentative réseau — cœur de la
  // garantie "rien ne se perd".
  await dbPutArticle(article);
  effacerBrouillon();
  state.draft = null;

  afficherEcran('screen-confirmation');
  synchroniserFile();
});

el('btn-article-suivant').addEventListener('click', () => demarrerNouvelArticle());
el('btn-retour-accueil').addEventListener('click', () => rafraichirAccueil());

// ---------------- Liste des articles ----------------

async function afficherListeArticles() {
  el('list-lettre').textContent = state.containerLetter || '';
  const articles = await dbGetArticlesByContainer(state.containerLetter);
  const conteneur = el('liste-articles');
  conteneur.innerHTML = '';
  if (articles.length === 0) {
    conteneur.innerHTML = '<p class="texte-info">Aucun article pour l\'instant.</p>';
  }
  articles.forEach((a) => {
    const carte = document.createElement('div');
    carte.className = 'article-carte';
    const img = a.photoBase64
      ? '<img src="' + a.photoBase64 + '">'
      : '<div class="article-placeholder">📦</div>';
    const badgeTexte = a.statutSync === 'envoye' ? '✔✔ Reçu au bureau'
      : a.statutSync === 'echec_a_corriger' ? '⚠ À corriger'
      : '✔ Enregistré, en attente';
    const badgeClasse = a.statutSync === 'envoye' ? 'envoye'
      : a.statutSync === 'echec_a_corriger' ? 'echec_a_corriger' : 'en_attente';
    carte.innerHTML = img +
      '<div class="article-info">' +
        '<div class="article-designation">' + (a.reference || '(réf. à venir)') + ' — ' + (a.designation || '(sans désignation)') + '</div>' +
        '<div class="article-meta">' + (a.matiereFinale || '') + '</div>' +
      '</div>' +
      '<span class="badge ' + badgeClasse + '">' + badgeTexte + '</span>' +
      '<button class="btn-supprimer-article" title="Supprimer">🗑</button>';
    carte.querySelector('.btn-supprimer-article').addEventListener('click', () => supprimerArticle(a));
    conteneur.appendChild(carte);
  });
  afficherEcran('screen-list');
}

el('btn-liste-retour').addEventListener('click', () => rafraichirAccueil());

// window.confirm() ne s'affiche pas de façon fiable dans une application
// installée en plein écran (mode "standalone") sur certains téléphones
// Android : la boîte native peut ne jamais apparaître, et la fonction
// renvoie alors silencieusement "false" — on a ce comportement exact avec
// le bouton supprimer qui semblait ne rien faire. On utilise donc notre
// propre fenêtre de confirmation, qui fonctionne partout de la même façon.
function confirmerPersonnalise(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const boite = document.createElement('div');
    boite.className = 'modal-boite';

    const texte = document.createElement('p');
    texte.className = 'modal-texte';
    texte.textContent = message;

    const boutons = document.createElement('div');
    boutons.className = 'modal-boutons';

    const btnAnnuler = document.createElement('button');
    btnAnnuler.type = 'button';
    btnAnnuler.className = 'btn-mini modal-btn-annuler';
    btnAnnuler.textContent = 'Annuler';

    const btnConfirmer = document.createElement('button');
    btnConfirmer.type = 'button';
    btnConfirmer.className = 'btn-mini modal-btn-confirmer';
    btnConfirmer.textContent = 'Supprimer';

    boutons.appendChild(btnAnnuler);
    boutons.appendChild(btnConfirmer);
    boite.appendChild(texte);
    boite.appendChild(boutons);
    overlay.appendChild(boite);
    document.body.appendChild(overlay);

    function fermer(resultat) {
      document.body.removeChild(overlay);
      resolve(resultat);
    }
    btnAnnuler.addEventListener('click', () => fermer(false));
    btnConfirmer.addEventListener('click', () => fermer(true));
  });
}

async function supprimerArticle(article) {
  const label = (article.reference || '(sans référence)') + ' — ' + (article.designation || 'sans désignation');
  const avertissement = article.statutSync === 'envoye'
    ? 'Cet article a déjà été envoyé au tableau : le supprimer ici ne l\'enlèvera PAS du Google Sheet (il faudra effacer la ligne à la main sur le tableau si besoin).\n\n'
    : '';
  const confirme = await confirmerPersonnalise(avertissement + 'Supprimer définitivement cet article du téléphone ?\n\n' + label);
  if (!confirme) return;
  await dbDeleteArticle(article.localId);
  await afficherListeArticles();
  rafraichirBandeau();
}

// ---------------- Bandeau d'état de synchronisation ----------------

async function rafraichirBandeau() {
  if (!state.containerLetter) { el('banner-sync').hidden = true; return; }
  const counts = await dbCountByStatus(state.containerLetter);
  const banniere = el('banner-sync');
  if (counts.en_attente === 0) {
    if (counts.total > 0) {
      banniere.hidden = false;
      banniere.className = 'banner ok';
      banniere.textContent = 'Tout est envoyé (' + counts.total + ' article(s))';
      setTimeout(() => { banniere.hidden = true; }, 4000);
    } else {
      banniere.hidden = true;
    }
    return;
  }
  banniere.hidden = false;
  banniere.className = 'banner';
  banniere.textContent = navigator.onLine
    ? 'Envoi en cours… ' + counts.en_attente + ' article(s) en attente'
    : 'Pas de connexion — ' + counts.en_attente + ' article(s) enregistrés, en attente d\'envoi';
}

onSyncStateChange(() => { rafraichirBandeau(); });
window.addEventListener('online', rafraichirBandeau);
window.addEventListener('offline', rafraichirBandeau);
setInterval(rafraichirBandeau, 5000);

// ---------------- Suggestions (matière / origine) ----------------

async function chargerSuggestions() {
  try {
    const cache = localStorage.getItem(SUGGESTIONS_KEY);
    if (cache) {
      const parsed = JSON.parse(cache);
      fusionnerSuggestions(parsed);
    }
  } catch (e) { /* pas grave */ }

  if (!navigator.onLine) return;
  try {
    const rep = await apiGetSuggestions();
    if (rep && rep.status === 'success') {
      localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(rep.data));
      fusionnerSuggestions(rep.data);
    }
  } catch (e) { /* hors-ligne ou serveur indisponible : on garde le cache */ }
}

function fusionnerSuggestions(data) {
  const matieres = (data.matiere || []).map((x) => x.valeur);
  const origines = (data.origine || []).map((x) => x.valeur);
  state.suggestions.matiere = Array.from(new Set([...matieres, ...DEFAULT_MATIERES]));
  state.suggestions.origine = Array.from(new Set([...origines, ...DEFAULT_ORIGINES]));
}

// ---------------- Démarrage ----------------

(async function demarrer() {
  await demanderStockagePersistant();
  construireGrilleLettres();
  await chargerSuggestions();
  demarrerDeclencheursSync();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  const brouillon = chargerBrouillon();
  if (brouillon && state.containerLetter) {
    state.draft = brouillon;
    restaurerEcranPhoto();
  } else {
    rafraichirAccueil();
  }
  rafraichirBandeau();
})();
