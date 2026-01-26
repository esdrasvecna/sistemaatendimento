// ================= FIREBASE =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";

// Configuração Firebase
const firebaseConfig = {
  apiKey: "AIzaSyC0ZrUAeNGBTZefNuoL9Qf9iJBtpaIwG7M",
  authDomain: "SEU-PROJETO.firebaseapp.com",
  projectId: "SEU-PROJETO",
  storageBucket: "SEU-PROJETO.appspot.com",
  messagingSenderId: "777994155306",
  appId: "1:777994155306:web:a1c31903c6128a30acda53",
  measurementId: "G-YH8V0BZHXL"
};

// Inicializa Firebase e Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================= REGISTRO =================
const registerForm = document.getElementById("registerForm");
if(registerForm){
  registerForm.addEventListener("submit", async e => {
    e.preventDefault();
    const nome = document.getElementById("regNome").value;
    const id = document.getElementById("regId").value;
    const patente = document.getElementById("regPatente").value;

    // Gera token automático
    const token = Math.random().toString(36).substr(2,8).toUpperCase();

    try {
      // Salva no Firestore na coleção "pendentes"
      await setDoc(doc(db, "pendentes", nome), {
        nome,
        id,
        patente,
        token: token,
        nivel: "oficial" // padrão, comando pode ser alterado depois
      });

      document.getElementById("registerMsg").textContent = Solicitação enviada! Token gerado: ${token};
      registerForm.reset();
    } catch (err) {
      console.error(err);
      document.getElementById("registerMsg").textContent = "Erro ao enviar!";
    }
  });
}

// ================= ATIVAR CONTA =================
// ================= ATIVAR CONTA =================
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js";
import { getApp } from "https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js";

const db = getFirestore(getApp());

const ativarForm = document.getElementById("ativarForm");
if (ativarForm) {
  ativarForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const user = document.getElementById("ativarUser").value.trim();
    const token = document.getElementById("ativarToken").value.trim();
    const senha = document.getElementById("ativarSenha").value.trim();
    const ativarMsg = document.getElementById("ativarMsg");

    try {
      const userRef = doc(db, "whitelist", user);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        ativarMsg.textContent = "Usuário não existe.";
        return;
      }

      const userData = userSnap.data();

      if (!userData.token) {
        ativarMsg.textContent = "Conta já foi ativada.";
        return;
      }

      if (userData.token !== token) {
        ativarMsg.textContent = "Código inválido.";
        return;
      }

      // Atualiza senha e remove token no Firestore
      await updateDoc(userRef, { senha: senha, token: "" });

      // Mensagem de sucesso
      ativarMsg.textContent = "Conta ativada! Redirecionando para login...";

      // Espera 2 segundos e redireciona
      setTimeout(() => {
        window.location.href = "index.html";
      }, 2000);

    } catch (err) {
      console.error("Erro ao ativar conta:", err);
      ativarMsg.textContent = "Erro ao ativar conta. Tente novamente.";
    }
  });
}


      // Atualiza senha e remove token no Firestore
      await updateDoc(userRef, { senha: senha, token: "" });

      // Mensagem de sucesso
      ativarMsg.textContent = "Conta ativada! Redirecionando para login...";

      // Espera 2 segundos e redireciona
      setTimeout(() => {
        window.location.href = "index.html";
      }, 2000);

    } catch (err) {
      console.error("Erro ao ativar conta:", err);
      ativarMsg.textContent = "Erro ao ativar conta. Tente novamente.";
    }
  });
}


// ================= LOGOUT =================
const logoutBtn = document.getElementById("logoutBtn");
if(logoutBtn){
  logoutBtn.addEventListener("click", () => {
    sessionStorage.clear();
    window.location.href="index.html";
  });
}

// ================= MENU BLOQUEIO =================
document.querySelectorAll("nav a").forEach(link=>{
  const href = link.getAttribute("href");
  if(nivelLogado !== "comando" && (href==="admin.html" || href==="usuarios.html")){
    link.style.pointerEvents="none";
    link.style.opacity="0.5";
    link.style.cursor="not-allowed";
  }
});

// ================= ADMIN =================
const listaPendentes = document.getElementById("listaPendentes");
if (listaPendentes) {
  if (nivelLogado !== "comando") window.location.href = "dashboard.html";
  let pendentes = JSON.parse(localStorage.getItem("pendentes")) || [];
  function renderPendentes() {
    listaPendentes.innerHTML = "";
    pendentes.forEach((p, index) => {
      const div = document.createElement("div");
      div.className = "ocorrencia";
      div.innerHTML = <strong>${p.nome}</strong> (ID:${p.id}) - ${p.patente}<br> <button onclick="aprovar(${index},'oficial')">Aprovar Oficial</button> <button onclick="aprovar(${index},'comando')">Aprovar Comando</button> <button onclick="recusar(${index})">Recusar</button> ;
      listaPendentes.appendChild(div);
    });
  }

  window.aprovar = async function(index, nivel) {
    const user = pendentes[index].nome;
    const patente = pendentes[index].patente;
    const token = Math.random().toString(36).substr(2, 8).toUpperCase();
    try {
      // Salva direto no Firestore
      await db.collection("whitelist").doc(user).set({
        senha: null,   // ainda não ativado
        nivel: nivel,
        patente: patente,
        token: token
      });

      // Remove da lista de pendentes local
      pendentes.splice(index, 1);
      localStorage.setItem("pendentes", JSON.stringify(pendentes));

      // Atualiza interface
      renderPendentes();
      alert(✅ Código de ativação para ${user}: ${token});
    } catch (err) {
      console.error("❌ Erro ao aprovar usuário:", err);
      alert("❌ Falha ao aprovar usuário. Veja o console.");
    }
  };

  window.recusar = function(index) {
    pendentes.splice(index, 1);
    localStorage.setItem("pendentes", JSON.stringify(pendentes));
    renderPendentes();
  };

  renderPendentes();
}





