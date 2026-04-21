  import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
  import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    onAuthStateChanged
  } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
  import {
    getDatabase,
    ref,
    get,
    set,
    update
  } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDC_eUKWvJT4P8S0mlEnJxEtP-BTQPW4K8",
    authDomain: "motor-estudos.firebaseapp.com",
    databaseURL: "https://motor-estudos-default-rtdb.firebaseio.com",
    projectId: "motor-estudos",
    storageBucket: "motor-estudos.firebasestorage.app",
    messagingSenderId: "287712661531",
    appId: "1:287712661531:web:b5347417fab5e2ef64e8be"
  };

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getDatabase(app);
  const provider = new GoogleAuthProvider();

  window.firebaseSync = {
    auth,
    db,
    provider,
    ref,
    get,
    set,
    update,
    signInWithPopup,
    signInWithRedirect,
    signOut,
    onAuthStateChanged
  };

  if (window.StudySync) {
    window.StudySync.installProvider(window.firebaseSync);
  }

  getRedirectResult(auth).catch((err) => {
    console.error("Erro no retorno do login:", err);
    if (window.StudySync) {
      window.StudySync.emitStatus(`Erro no login: ${err.code || "sem código"}`, "danger");
    }
  });

  console.log("Firebase conectado com sucesso.");
