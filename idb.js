// ============================================================
// Stockage local durable (IndexedDB) — chaque article validé est
// écrit ICI avant toute tentative d'envoi réseau. Rien n'est perdu
// si l'app plante, si le téléphone s'éteint, ou si le réseau coupe.
// ============================================================

const DB_NAME = 'brocante-db';
const DB_VERSION = 1;
const STORE_ARTICLES = 'articles';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_ARTICLES)) {
        const store = db.createObjectStore(STORE_ARTICLES, { keyPath: 'localId' });
        store.createIndex('by_statutSync', 'statutSync', { unique: false });
        store.createIndex('by_containerLetter', 'containerLetter', { unique: false });
        store.createIndex('by_dateValidation', 'dateValidation', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

let dbPromise = null;
function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

/**
 * Écrit un article. Attend explicitement la fin de la TRANSACTION
 * (pas juste la requête individuelle) pour garantir que le
 * navigateur a bien acté l'écriture avant qu'on ne considère
 * l'article comme "en sécurité".
 */
async function dbPutArticle(article) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, 'readwrite');
    tx.objectStore(STORE_ARTICLES).put(article);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Supprime un article DU TÉLÉPHONE UNIQUEMENT. Si l'article avait déjà
 * été envoyé au Google Sheet, sa ligne reste dans le tableau (elle n'est
 * pas supprimée à distance) — voir l'avertissement affiché à l'écran
 * avant la suppression.
 */
async function dbDeleteArticle(localId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, 'readwrite');
    tx.objectStore(STORE_ARTICLES).delete(localId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function dbGetArticle(localId) {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, 'readonly');
    const req = tx.objectStore(STORE_ARTICLES).get(localId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAllArticles() {
  const db = await getDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_ARTICLES, 'readonly');
    const req = tx.objectStore(STORE_ARTICLES).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetArticlesByContainer(containerLetter) {
  const all = await dbGetAllArticles();
  return all.filter((a) => a.containerLetter === containerLetter)
    .sort((a, b) => (a.dateValidation < b.dateValidation ? 1 : -1));
}

async function dbGetPendingArticles() {
  const all = await dbGetAllArticles();
  return all.filter((a) => a.statutSync === 'en_attente' || a.statutSync === 'envoi_en_cours')
    .sort((a, b) => (a.dateValidation < b.dateValidation ? -1 : 1));
}

async function dbCountByStatus(containerLetter) {
  const arts = await dbGetArticlesByContainer(containerLetter);
  const counts = { total: arts.length, en_attente: 0, envoye: 0 };
  arts.forEach((a) => {
    if (a.statutSync === 'envoye') counts.envoye++;
    else counts.en_attente++;
  });
  return counts;
}

// Demande au navigateur de ne jamais purger nos données silencieusement.
async function demanderStockagePersistant() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch (e) {
    // Pas grave si indisponible — filet de sécurité, pas une exigence dure.
  }
}
