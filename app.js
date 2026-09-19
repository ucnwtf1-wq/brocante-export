// ============================================================
// Brocante Export — logique de l'application
// ============================================================

const DEFAULT_MATIERES = ['Bois', 'Faïence', 'Céramique', 'Porcelaine', 'Verre', 'Métal', 'Marbre', 'Textile', 'Cuir', 'Osier / rotin'];
const DEFAULT_ESSENCES = ['Chêne', 'Noyer', 'Merisier', 'Hêtre', 'Acajou', 'Teck'];
const DEFAULT_ORIGINES = ['France', 'Belgique', 'Chine', 'Japon', 'Angleterre', 'Hollande', 'Italie'];
const DRAFT_KEY = 'draft_en_cours';
const CONTAINER_KEY = 'container_actuel';
const SUGGESTIONS_KEY = 'suggestions_cache';
const CONTAINERS_LISTE_KEY = 'containers_liste_cache';

const el = (id) => document.getElementById(id);

// Accord simple singulier/pluriel pour "article(s)", utilisé à plusieurs
// endroits (accueil, liste des containers, confirmation de container).
function texteArticles(n) {
  return n + ' ' + (n === 1 ? 'article' : 'articles');
}

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
    afficherEcranContainer();
    return;
  }
  const counts = await dbCountByStatus(state.containerLetter);
  el('home-count-total').textContent = texteArticles(counts.total);
  afficherEcran('screen-home');
}

el('btn-ajouter').addEventListener('click', () => demarrerNouvelArticle());
el('btn-voir-articles').addEventListener('click', () => afficherListeArticles());
el('btn-nouveau-container').addEventListener('click', () => afficherEcranContainer());

// ---------------- Nouveau container ----------------
//
// L'utilisateur voit d'abord la liste des containers déjà utilisés (avec
// leur nombre d'articles), pour continuer facilement l'un d'eux plutôt que
// de deviner une lettre "à l'aveugle". En dessous, un champ texte libre
// permet de créer un nouveau container avec n'importe quel code court
// (une lettre, ou une variante une fois l'alphabet épuisé : Z1, Z2...).

async function afficherEcranContainer() {
  el('champ-nouveau-container').value = '';
  // Au tout premier lancement (aucun container choisi), il n'y a nulle
  // part où "annuler" — on masque donc ce bouton pour ne pas donner
  // l'impression que l'app est bloquée quand il ne se passe rien au tap.
  el('btn-annuler-container').hidden = !state.containerLetter;
  afficherEcran('screen-container');
  renderListeContainersExistants(chargerListeContainersDepuisCache());

  if (!navigator.onLine) return;
  try {
    const rep = await apiListContainers();
    if (rep && rep.status === 'success') {
      const containers = rep.data.containers || [];
      localStorage.setItem(CONTAINERS_LISTE_KEY, JSON.stringify(containers));
      renderListeContainersExistants(containers);
    }
  } catch (e) {
    // Hors-ligne ou serveur indisponible : on garde la liste déjà affichée
    // (celle en cache), ce n'est pas bloquant.
  }
}

function chargerListeContainersDepuisCache() {
  try {
    const raw = localStorage.getItem(CONTAINERS_LISTE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function renderListeContainersExistants(containers) {
  const conteneur = el('liste-containers-existants');
  conteneur.innerHTML = '';
  el('texte-aucun-container').hidden = containers.length > 0;
  containers.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-container-existant';
    btn.innerHTML = '<span>Container ' + c.letter + '</span><span class="compte">' + texteArticles(c.nb_articles) + '</span>';
    // On connaît déjà son nombre d'articles (affiché dans cette liste) :
    // pas besoin de revérifier auprès du serveur, ce qui rendait ce tap
    // lent (attente réseau) et donnait l'impression que rien ne se passait.
    btn.addEventListener('click', () => choisirLettreContainer(c.letter, { exists: true, nb_articles: c.nb_articles }));
    conteneur.appendChild(btn);
  });
}

// Le champ de saisie force automatiquement les majuscules et retire les
// caractères qui ne sont ni des lettres ni des chiffres, pour rester
// cohérent avec ce que le serveur accepte (voir normalizeLetter_ côté Code.gs).
el('champ-nouveau-container').addEventListener('input', () => {
  const champ = el('champ-nouveau-container');
  champ.value = champ.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

el('btn-creer-container').addEventListener('click', () => {
  const val = el('champ-nouveau-container').value.trim();
  if (!val) {
    alert('Merci de saisir une lettre ou un code pour le nouveau container (ex : A, Z1...).');
    return;
  }
  choisirLettreContainer(val);
});

// Empêche de lancer plusieurs vérifications réseau en même temps si
// l'utilisateur retape sur "Créer" en pensant que rien ne s'est passé
// (le seul cas restant qui a besoin du réseau — voir infoConnue ci-dessous).
let verificationContainerEnCours = false;

async function choisirLettreContainer(lettre, infoConnue) {
  let info = infoConnue || { exists: false, nb_articles: 0 };

  // infoConnue est fourni quand on vient de la liste des containers
  // existants (on connaît déjà son nombre d'articles, affiché juste avant) :
  // dans ce cas on saute complètement l'appel réseau, qui rendait ce tap
  // lent sur un réseau faible et sans aucun retour visuel entre-temps.
  if (!infoConnue) {
    if (verificationContainerEnCours) return;
    verificationContainerEnCours = true;
    const boutonCreer = el('btn-creer-container');
    const texteOriginalBouton = boutonCreer.textContent;
    boutonCreer.disabled = true;
    boutonCreer.textContent = 'Vérification…';
    try {
      if (navigator.onLine) {
        const rep = await apiCheckContainer(lettre);
        if (rep && rep.status === 'success') info = rep.data;
      }
    } catch (e) {
      // Hors-ligne ou serveur injoignable : on continue quand même,
      // le serveur fera foi de toute façon à la synchronisation.
    } finally {
      verificationContainerEnCours = false;
      boutonCreer.disabled = false;
      boutonCreer.textContent = texteOriginalBouton;
    }
  }

  el('confirm-container-titre').textContent = info.exists
    ? 'Continuer ce container ?'
    : 'Créer le container ' + lettre + ' ?';
  el('confirm-container-texte').textContent = info.exists
    ? 'Le container ' + lettre + ' contient déjà ' + texteArticles(info.nb_articles) + '.'
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
  majBandeauxContainer();
  restaurerEcranPhoto();
}

// Rappel discret du container en cours sur les écrans photo/formulaire/récap :
// utile pour quelqu'un qui gère plusieurs containers dans la même journée et
// pourrait sinon perdre le fil de celui en cours de remplissage.
function majBandeauxContainer() {
  const lettre = state.containerLetter || '-';
  el('photo-lettre-actif').textContent = lettre;
  el('form-lettre-actif').textContent = lettre;
  el('recap-lettre-actif').textContent = lettre;
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
    // Une fois une photo prise, ce bouton la garde quand même (il ne
    // supprime rien) : on évite donc de dire "sans photo", qui laisserait
    // croire qu'elle va être perdue.
    el('btn-sans-photo').textContent = 'Continuer';
  } else {
    el('photo-apercu').hidden = true;
    el('photo-placeholder').hidden = false;
    el('btn-photo-suivant').hidden = true;
    el('btn-sans-photo').textContent = 'Continuer sans photo';
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
    el('btn-sans-photo').textContent = 'Continuer';
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
  // Un objet catalogué représente toujours au moins un colis — on ne
  // laisse jamais retomber à 0 par un appui de trop (mains sales, geste
  // pressé), ce qui passerait inaperçu jusqu'au tableau final.
  const v = Math.max(1, (parseInt(el('champ-colis').value, 10) || 1) - 1);
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

    // Taper sur la valeur elle-même permet de la corriger : elle repasse
    // dans le champ de saisie du dessous, prête à être retapée puis
    // ré-ajoutée — au lieu de devoir supprimer puis retaper de zéro.
    const valeur = document.createElement('span');
    valeur.className = 'pesee-valeur';
    valeur.textContent = val + ' kg';
    valeur.addEventListener('click', () => {
      el('champ-nouvelle-pesee').value = val;
      state.draft.peseesKg.splice(idx, 1);
      sauvegarderBrouillon();
      rafraichirPanierPoids();
      el('champ-nouvelle-pesee').focus();
    });

    const btnSuppr = document.createElement('button');
    btnSuppr.textContent = '×';
    btnSuppr.addEventListener('click', () => {
      state.draft.peseesKg.splice(idx, 1);
      sauvegarderBrouillon();
      rafraichirPanierPoids();
    });
    chip.appendChild(valeur);
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
    // Un prix vide reste visible comme tel plutôt que d'afficher "0 €" en
    // silence — ça évite qu'un oubli de prix passe totalement inaperçu
    // jusqu'au tableau final.
    ['Prix d\'achat', state.draft.prixEur ? state.draft.prixEur + ' €' : '⚠ Prix non renseigné'],
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
    const valeurEl = ligne.querySelector('.valeur');
    valeurEl.textContent = valeur;
    if (typeof valeur === 'string' && valeur.indexOf('⚠') === 0) {
      valeurEl.classList.add('valeur-alerte');
    }
    conteneur.appendChild(ligne);
  });

  afficherEcran('screen-recap');
});

el('btn-modifier-article').addEventListener('click', () => allerAuFormulaire());
el('btn-annuler-form').addEventListener('click', async () => {
  // Abandonner ici fait perdre la photo et tout le formulaire déjà rempli —
  // c'est potentiellement plus destructeur qu'une suppression dans la liste
  // (qui, elle, demande déjà une confirmation) : on demande donc la même
  // confirmation ici, pour éviter qu'un tap accidentel (mains sales, geste
  // pressé) ne fasse tout perdre sans recours.
  const confirme = await confirmerPersonnalise('Abandonner cet article et sa photo ?\n\nCe qui a déjà été rempli sera perdu.');
  if (!confirme) return;
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
      : a.statutSync === 'echec_a_corriger' ? '⚠ Problème'
      : '✔ Enregistré, en attente';
    const badgeClasse = a.statutSync === 'envoye' ? 'envoye'
      : a.statutSync === 'echec_a_corriger' ? 'echec_a_corriger' : 'en_attente';
    // Un article "à corriger" affichait juste un badge d'alerte sans dire
    // pourquoi ni quoi faire : on montre maintenant la raison exacte
    // donnée par le serveur, avec une indication claire de la marche à
    // suivre (le supprimer puis le resaisir correctement).
    const raisonHtml = (a.statutSync === 'echec_a_corriger')
      ? '<div class="article-erreur">' + (a.derniereErreur || 'Cet article n\'a pas pu être envoyé.') + ' Supprimez-le puis resaisissez-le avec les bonnes informations.</div>'
      : '';
    carte.innerHTML = img +
      '<div class="article-info">' +
        '<div class="article-designation">' + (a.reference || '(réf. à venir)') + ' — ' + (a.designation || '(sans désignation)') + '</div>' +
        '<div class="article-meta">' + (a.matiereFinale || '') + '</div>' +
        raisonHtml +
      '</div>' +
      '<span class="badge ' + badgeClasse + '">' + badgeTexte + '</span>' +
      '<button class="btn-supprimer-article" title="Supprimer">🗑</button>';
    // Taper n'importe où sur la carte (sauf la poubelle) ouvre le détail
    // complet de l'article.
    carte.querySelector('.btn-supprimer-article').addEventListener('click', (evt) => {
      evt.stopPropagation();
      supprimerArticle(a);
    });
    carte.addEventListener('click', () => afficherDetailArticle(a));
    conteneur.appendChild(carte);
  });
  afficherEcran('screen-list');
}

el('btn-liste-retour').addEventListener('click', () => rafraichirAccueil());

// ---------------- Détail d'un article ----------------
// Toutes les informations viennent de l'article déjà enregistré sur le
// téléphone (IndexedDB) — aucun appel réseau nécessaire, ça marche donc
// aussi bien hors-ligne.

function afficherDetailArticle(article) {
  const poidsTotal = (article.peseesKg || []).reduce((a, b) => a + Number(b), 0);
  const lignes = [
    ['Référence', article.reference || '(à venir, pas encore envoyé)'],
    ['Désignation', article.designation || '(vide)'],
    ['Matière', article.matiereFinale || '(non précisée)'],
    ['Origine', article.origine || '(non précisée)'],
    ['Nombre de colis', article.nombreColis],
    ['Poids total', Math.round(poidsTotal * 100) / 100 + ' kg'],
    ['Prix d\'achat', article.prixEur ? article.prixEur + ' €' : '⚠ Prix non renseigné'],
    ['Période', article.periode ? texteRecapPeriode(article.periode) : '(non précisée)'],
    ['Dimensions', article.dimensions || '(non précisées)']
  ];

  const conteneur = el('detail-contenu');
  conteneur.innerHTML = '';
  if (article.photoBase64) {
    const img = document.createElement('img');
    img.src = article.photoBase64;
    img.className = 'recap-photo';
    conteneur.appendChild(img);
  }
  lignes.forEach(([label, valeur]) => {
    const ligne = document.createElement('div');
    ligne.className = 'recap-ligne';
    ligne.innerHTML = '<span>' + label + '</span><span class="valeur"></span>';
    const valeurEl = ligne.querySelector('.valeur');
    valeurEl.textContent = valeur;
    if (typeof valeur === 'string' && valeur.indexOf('⚠') === 0) valeurEl.classList.add('valeur-alerte');
    conteneur.appendChild(ligne);
  });

  if (article.statutSync === 'echec_a_corriger' && article.derniereErreur) {
    const erreur = document.createElement('div');
    erreur.className = 'article-erreur';
    erreur.textContent = 'Problème signalé par le serveur : ' + article.derniereErreur;
    conteneur.appendChild(erreur);
  }

  afficherEcran('screen-detail');
}

el('btn-detail-retour').addEventListener('click', () => afficherListeArticles());

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
    ? 'Cet article a déjà été envoyé au bureau. Le supprimer ici ne l\'effacera pas du tableau : il faudra l\'effacer là-bas aussi, à la main, si besoin.\n\n'
    : '';
  const confirme = await confirmerPersonnalise(avertissement + 'Supprimer définitivement cet article du téléphone ?\n\n' + label);
  if (!confirme) return;
  await dbDeleteArticle(article.localId);
  await afficherListeArticles();
  rafraichirBandeau();
}

// ---------------- Bandeau d'état de synchronisation ----------------

// Mémorise le dernier nombre d'articles "en attente" connu, pour ne
// déclencher le message "Tout est envoyé" qu'au moment où ça vient tout
// juste de se terminer — jamais à chaque vérification périodique.
// SANS CETTE MÉMOIRE : le setInterval ci-dessous appelle cette fonction
// toutes les 5 secondes, et tant que le container a des articles et que
// rien n'est en attente, elle réaffichait le bandeau à chaque fois (avant
// qu'il ne se cache tout seul 4 secondes plus tard) — ce qui le faisait
// clignoter en permanence et donnait l'impression que l'écran "tremble".
let dernierNombreEnAttente = null;

async function rafraichirBandeau() {
  const banniere = el('banner-sync');
  if (!state.containerLetter) { banniere.hidden = true; return; }
  const counts = await dbCountByStatus(state.containerLetter);

  if (counts.en_attente > 0) {
    dernierNombreEnAttente = counts.en_attente;
    banniere.hidden = false;
    banniere.className = 'banner';
    banniere.textContent = navigator.onLine
      ? 'Envoi en cours… ' + texteArticles(counts.en_attente) + ' en attente'
      : 'Pas de connexion — ' + texteArticles(counts.en_attente) + ' en attente d\'envoi';
    return;
  }

  const vientJusteDeFinir = dernierNombreEnAttente > 0;
  dernierNombreEnAttente = 0;
  if (vientJusteDeFinir && counts.total > 0) {
    banniere.hidden = false;
    banniere.className = 'banner ok';
    banniere.textContent = 'Tout est envoyé (' + texteArticles(counts.total) + ')';
    setTimeout(() => { banniere.hidden = true; }, 4000);
  }
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

// Nombre maximum de chips affichées par liste (matière/origine) : au-delà,
// l'écran deviendrait trop chargé pour rester rapide à utiliser au doigt.
// Le serveur trie déjà les valeurs par fréquence d'usage (voir
// handleGetSuggestions côté Code.gs), donc ne garder que les premières
// revient à garder les plus utilisées.
const MAX_SUGGESTIONS_AFFICHEES = 12;

function fusionnerSuggestions(data) {
  const matieres = (data.matiere || []).map((x) => x.valeur);
  const origines = (data.origine || []).map((x) => x.valeur);
  state.suggestions.matiere = Array.from(new Set([...matieres, ...DEFAULT_MATIERES])).slice(0, MAX_SUGGESTIONS_AFFICHEES);
  state.suggestions.origine = Array.from(new Set([...origines, ...DEFAULT_ORIGINES])).slice(0, MAX_SUGGESTIONS_AFFICHEES);
}

// ---------------- Démarrage ----------------

(async function demarrer() {
  await demanderStockagePersistant();
  await chargerSuggestions();
  demarrerDeclencheursSync();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }

  const brouillon = chargerBrouillon();
  if (brouillon && state.containerLetter) {
    state.draft = brouillon;
    majBandeauxContainer();
    restaurerEcranPhoto();
  } else {
    rafraichirAccueil();
  }
  rafraichirBandeau();
})();
