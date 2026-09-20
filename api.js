// ============================================================
// Appels réseau vers le backend Google Apps Script.
//
// Astuce importante : on envoie le corps de la requête POST comme
// une simple chaîne de texte, SANS fixer nous-mêmes l'en-tête
// Content-Type. Le navigateur choisit alors "text/plain" par
// défaut, ce qui évite une requête de pré-vérification (preflight)
// que Google Apps Script ne gère pas bien — c'est ce qui permet à
// l'app (hébergée ailleurs) d'appeler le script sans erreur bloquée
// par le navigateur.
// ============================================================

const REQUEST_TIMEOUT_MS = 20000;

function fetchAvecDelai(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, Object.assign({}, options, { signal: controller.signal }))
    .finally(() => clearTimeout(timer));
}

async function apiPost(action, payload) {
  // La clé secrète (voir config.js) part avec chaque appel, mélangée aux
  // autres champs — pas dans un en-tête, pour ne pas casser l'astuce
  // anti-preflight expliquée en haut de ce fichier.
  const body = JSON.stringify(Object.assign({ action, api_secret: window.API_SECRET }, payload));
  const res = await fetchAvecDelai(window.BACKEND_URL, { method: 'POST', body });
  if (!res.ok) throw new Error('Réponse serveur invalide (' + res.status + ')');
  return res.json();
}

async function apiGet(action, params) {
  const qs = new URLSearchParams(Object.assign({ action, api_secret: window.API_SECRET }, params || {})).toString();
  const res = await fetchAvecDelai(window.BACKEND_URL + '?' + qs, { method: 'GET' });
  if (!res.ok) throw new Error('Réponse serveur invalide (' + res.status + ')');
  return res.json();
}

async function apiCreateItem(payload) {
  return apiPost('create_item', payload);
}

async function apiCheckContainer(letter) {
  return apiGet('check_container', { container_letter: letter });
}

async function apiListContainers() {
  return apiGet('list_containers', {});
}

async function apiGetSuggestions() {
  return apiGet('get_suggestions', {});
}

async function apiSetContainerStatus(letter, statut) {
  return apiPost('set_container_status', { container_letter: letter, statut });
}
