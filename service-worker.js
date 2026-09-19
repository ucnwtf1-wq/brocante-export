// ============================================================
// Service Worker — met en cache la "coquille" de l'application
// (HTML, CSS, JS, icônes) pour que l'app s'ouvre même sans réseau
// ou avec un réseau faible (hangar, zone rurale...).
//
// Important : ce fichier ne touche JAMAIS aux données des articles.
// Les données sont gérées uniquement par IndexedDB (voir idb.js) et
// la file de synchronisation (voir sync.js). Le service worker sert
// seulement à afficher l'application elle-même plus vite et hors-ligne.
//
// À chaque changement de version ci-dessous, les téléphones déjà
// installés récupéreront automatiquement la nouvelle version au
// prochain lancement de l'application.
// ============================================================

const VERSION = 'v2';
const CACHE_NAME = 'brocante-export-' + VERSION;

const FICHIERS_A_METTRE_EN_CACHE = [
  './',
  './index.html',
  './style.css',
  './config.js',
  './idb.js',
  './api.js',
  './sync.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FICHIERS_A_METTRE_EN_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((noms) =>
      Promise.all(
        noms
          .filter((nom) => nom.startsWith('brocante-export-') && nom !== CACHE_NAME)
          .map((nom) => caches.delete(nom))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // On ne s'occupe QUE des fichiers de l'application elle-même
  // (même origine, méthode GET). Tous les appels vers le Google
  // Apps Script (autre domaine) passent directement au réseau,
  // sans jamais être interceptés ni mis en cache ici — c'est
  // sync.js/api.js qui gèrent seuls leur fiabilité.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((reponseEnCache) => {
      if (reponseEnCache) return reponseEnCache;
      return fetch(event.request)
        .then((reponseReseau) => {
          const copie = reponseReseau.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copie));
          return reponseReseau;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
