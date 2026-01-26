document.addEventListener("DOMContentLoaded", () => {
  // Menu aparece apenas quando estiver logado (Firebase Auth)
  if (!window.firebaseConfig || !window.firebase) return;

  if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
  }

  const auth = firebase.auth();

  auth.onAuthStateChanged((user) => {
    if (!user) return;

    const nav = document.createElement("nav");
    nav.className = "menu";

    nav.innerHTML = `
      <a href="cadastro.html">Cadastro de pessoas</a>
      <button id="logoutBtn" class="btn-red">Sair</button>
    `;

    // Evita duplicar menu
    const existing = document.querySelector("nav.menu");
    if (!existing) document.body.insertBefore(nav, document.body.firstChild);

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          await auth.signOut();
        } catch (_) {}
        try { sessionStorage.clear(); } catch (_) {}
        window.location.href = "index.html";
      };
    }
  });
});
