(function () {
  // Precisa que firebase-app-compat e firebase-auth-compat estejam carregados
  if (!window.firebaseConfig) {
    console.error("firebaseConfig não encontrado. Verifique firebase-config.js");
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
  }

  const auth = firebase.auth();

  auth.onAuthStateChanged((user) => {
    if (!user) {
      // Não está logado: volta para o login
      window.location.replace("index.html");
      return;
    }
    // Marca sessão apenas para UI (não é segurança)
    try {
      sessionStorage.setItem("uid", user.uid);
      if (user.email) sessionStorage.setItem("usuario", user.email);
      sessionStorage.setItem("logado", "1");
    } catch (e) {}
    // libera UI
    const ov = document.getElementById("authLoading");
    if (ov) ov.style.display = "none";
  });
})();
