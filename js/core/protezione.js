// Protezione dal clickjacking: impedisce che un altro sito mostri l'app dentro
// un proprio riquadro (iframe) per far cliccare l'utente a sua insaputa.
// L'intestazione X-Frame-Options funziona solo se inviata dal server, e GitHub
// Pages non permette di impostarla (nel <meta> il browser la ignora): finché
// il sito resta su GitHub Pages la protezione è affidata a questo script,
// caricato per primo. Con un hosting che consente le intestazioni (es. Firebase
// Hosting) andranno aggiunte X-Frame-Options: DENY e frame-ancestors 'none'.
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location.replace(window.self.location.href); } catch (e) { /* bloccato dal browser: la pagina resta nascosta */ }
}
