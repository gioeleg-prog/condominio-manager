// Region delle funzioni chiamate dall'app (onCall). Passaggio da us-central1 a
// europe-west1, vicino a Firestore (eur3): finché qualche pagina vecchia
// (tenuta in cache dal browser) chiama ancora us-central1, le callable stanno
// in tutte e due e il deploy non deve cancellare nulla. Quando i log di
// us-central1 sono fermi si toglie 'us-central1' da qui e si cancellano le
// vecchie con firebase functions:delete … --region us-central1 (PR #84).
// Il client nuovo le chiama in europe-west1 (js/firebase.js).
exports.REGIONI_CALLABLE = ['europe-west1', 'us-central1'];
