
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth } from "./firebase-config.js";

document.getElementById("loginBtn").onclick = async () => {
  try {
    await signInWithEmailAndPassword(
      auth,
      email.value,
      senha.value
    );
    location.href="cadastro.html";
  } catch {
    erro.textContent="Login inválido";
  }
};
