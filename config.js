// ============================================================
// CONFIGURATION — à modifier après le déploiement Apps Script
// ============================================================
// Coller ici l'URL du Web App Google Apps Script (celle qui se
// termine par /exec), obtenue après "Déployer > Nouveau déploiement".
window.BACKEND_URL = "https://script.google.com/macros/s/AKfycbzP1S5tOA14sLnBkjsrlwifXUXBKVrjlvdbAJQRO4GNMsRglGJeMIJeV3rTlJIKQmK8qQ/exec";

// Clé secrète partagée avec le backend (voir API_SECRET tout en haut de
// Code.gs) : sans elle, le serveur refuse toute demande. Le but n'est pas
// de rendre l'app "privée" au sens strict (n'importe qui pourrait la
// retrouver en lisant le code de l'app, publiquement visible sur GitHub),
// mais d'empêcher qu'une personne extérieure tombe par hasard sur l'adresse
// du serveur et envoie des données au tableau sans le vouloir ni le savoir.
// Cette valeur DOIT être exactement la même des deux côtés (ici et dans
// Code.gs) : si vous la changez ici, changez-la aussi côté serveur puis
// redéployez ("Gérer les déploiements" > crayon > Nouvelle version).
window.API_SECRET = "55cea8b3fd76a7cd289e09f541ebc5b502bbf34ee89f862d";
