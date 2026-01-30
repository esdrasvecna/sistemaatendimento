/*
  PATCH: lista lateral de pessoas (compat)
  - Garante que a listagem (#listaPessoas) funcione sempre
  - Inicializa somente após auth estar pronto
  - Mantém o layout/HTML/CSS como está
*/

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function fmtDate(v) {
  if (!v) return "-";
  // aceita string YYYY-MM-DD, Date, Timestamp compat
  if (typeof v === "string") return v;
  try {
    if (v.toDate) return v.toDate().toLocaleDateString("pt-BR");
  } catch {}
  try {
    return new Date(v).toLocaleDateString("pt-BR");
  } catch {
    return "-";
  }
}

function includesAnyField(p, q) {
  if (!q) return true;
  const hay = [
    p.nome,
    p.cartaoSus,
    p.telefone,
    p.endereco,
    p.dataNascimento,
    p.observacaoPessoa || p.observacao,
  ]
    .map(normalize)
    .join(" ");
  return hay.includes(q);
}

// ===== Firebase compat =====
if (!window.firebase || !firebase.apps || !firebase.apps.length) {
  console.error("Firebase não inicializado. Verifique firebase-config.js");
}

const auth = firebase.auth();
const db = firebase.firestore();

// ===== State =====
let pessoas = [];
let unsubPessoas = null;

// ===== Render lateral =====
function renderPessoas() {
  const container = $("listaPessoas");
  if (!container) {
    console.warn("Elemento #listaPessoas não encontrado no HTML.");
    return;
  }

  const q = normalize($("pesquisa")?.value || "");
  container.innerHTML = "";

  const filtered = pessoas.filter((p) => includesAnyField(p, q)).slice(0, 500);

  if (!filtered.length) {
    container.innerHTML = `<div class="item"><div class="meta">Nenhuma pessoa encontrada.</div></div>`;
    return;
  }

  for (const p of filtered) {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="title">${p.nome || "(sem nome)"}</div>
      <div class="meta">
        Nasc.: ${fmtDate(p.dataNascimento)} · SUS: ${p.cartaoSus || "-"}<br>
        Tel.: ${p.telefone || "-"}<br>
        End.: ${p.endereco || "-"}
      </div>
      <div class="mini-actions">
        <button class="btn btn-ghost" data-action="select" data-id="${p.id}">Abrir</button>
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll("button[data-action='select']").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-id");
      const p = pessoas.find((x) => x.id === id);
      if (p) {
        // Mantém compatibilidade: se existir função fillPessoaForm no seu cadastro.js original, chama.
        if (typeof window.fillPessoaForm === "function") {
          window.fillPessoaForm(p);
        } else {
          // fallback: preenche os campos básicos
          if ($("pessoaId")) $("pessoaId").value = p.id || "";
          if ($("nome")) $("nome").value = p.nome || "";
          if ($("dataNascimento")) $("dataNascimento").value = p.dataNascimento || "";
          if ($("cartaoSus")) $("cartaoSus").value = p.cartaoSus || "";
          if ($("telefone")) $("telefone").value = p.telefone || "";
          if ($("endereco")) $("endereco").value = p.endereco || "";
          if ($("observacaoPessoa")) $("observacaoPessoa").value = p.observacaoPessoa || p.observacao || "";
        }
      }
    };
  });
}

// ===== Listener =====
function listenPessoas() {
  if (unsubPessoas) unsubPessoas();

  // Não dependa de updatedAt existir — lista pelo nome para evitar erros e confusão.
  // (Se quiser por data depois, dá pra voltar a orderBy("updatedAt","desc") desde que você sempre grave updatedAt.)
  unsubPessoas = db.collection("pessoas").orderBy("nome").limit(2000).onSnapshot(
    (snap) => {
      pessoas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderPessoas();
    },
    (err) => {
      console.error("Erro ao listar pessoas:", err);
      alert("Erro ao carregar pessoas. Abra o console (F12) e verifique permissões/regras.");
    }
  );
}

// ===== Boot =====
function boot() {
  // Busca reativa ao digitar
  const pesquisa = $("pesquisa");
  if (pesquisa) pesquisa.addEventListener("input", renderPessoas);

  listenPessoas();
}

// Garante que só inicializa depois que o Auth resolver o estado
auth.onAuthStateChanged((user) => {
  const loading = $("authLoading");
  if (loading) loading.style.display = "none";

  if (!user) {
    // se seu projeto usa index.html como login:
    window.location.replace("index.html");
    return;
  }
  boot();
});
