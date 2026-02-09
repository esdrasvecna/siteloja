
// Firebase config (modo CDN / site estático)
const firebaseConfig = {
  apiKey: "AIzaSyC2ounkWYySgTAV8PyO1bNtlkSrTSBA4c8",
  authDomain: "site-studiomind.firebaseapp.com",
  projectId: "site-studiomind",
  storageBucket: "site-studiomind.firebasestorage.app",
  messagingSenderId: "191639707596",
  appId: "1:191639707596:web:a46f3d4033ed93ab180769",
  measurementId: "G-34SZF46TWR"
};

// Inicializa Firebase (CDN)
firebase.initializeApp(firebaseConfig);

// Serviços usados no site
window.auth = firebase.auth();
window.db = firebase.firestore();
