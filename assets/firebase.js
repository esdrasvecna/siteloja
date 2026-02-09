// assets/firebase.js
import { firebaseConfig } from "./firebase-config.js";

let app = null;
let db = null;
let auth = null;

function isConfigured(cfg){
  return cfg && typeof cfg.apiKey === "string" && cfg.apiKey && !cfg.apiKey.includes("PASTE_")
    && typeof cfg.projectId === "string" && cfg.projectId && !cfg.projectId.includes("PASTE_");
}

try{
  if(isConfigured(firebaseConfig)){
    const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const { getFirestore } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
    const { getAuth } = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    auth = getAuth(app);
  }
}catch(err){
  // Falhou inicialização: mantemos null e o site usa fallback (JSON/localStorage).
  console.warn("[firebase] não inicializado:", err);
}

export { app, db, auth };
export const firebaseReady = !!db;
