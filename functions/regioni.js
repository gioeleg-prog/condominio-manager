// Region delle funzioni chiamate dall'app (onCall): europe-west1, vicino a
// Firestore (eur3), come trigger e funzioni a orario. Il client le chiama lì
// (js/firebase.js): le due region devono coincidere.
// Storia: fino al 2026-10-21 stavano in us-central1; il passaggio (PR #84)
// le ha tenute per qualche ora in tutte e due, poi le vecchie sono state
// cancellate dopo aver visto nei log che nessuno le chiamava più.
exports.REGIONI_CALLABLE = ['europe-west1'];
