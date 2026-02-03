/*
  Agenda (Firebase compat)
  - CRUD simples em /agenda
  - Upload opcional de imagem no Storage
  - Sem alterar layout: reutiliza classes existentes
*/

const $ = (id) => document.getElementById(id);
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
const db = firebase.firestore();
const storage = firebase.storage();
const auth = firebase.auth();
const FieldValue = firebase.firestore.FieldValue;

let itens = [];
let itemAtual = null;
let unsubAgenda = null;

function setStatus(msg) {
  const el = $("statusAgenda");
  if (el) el.textContent = msg || "";
}

function safe(s, fallback = "") {
  const v = (s ?? "").toString().trim();
  return v || fallback;
}

function includesAnyField(obj, q) {
  if (!q) return true;
  const hay = normalize(JSON.stringify(obj || {}));
  return hay.includes(q);
}

function parseDateTimeLocal(v) {
  // v = "YYYY-MM-DDTHH:mm"
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function toDateTimeLocalValue(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function clearForm() {
  itemAtual = null;
  $("agendaId").value = "";
  $("agendaData").value = "";
  $("agendaTitulo").value = "";
  $("agendaObs").value = "";
  $("agendaImagem").value = "";
  const btnEx = $("btnExcluirAgenda");
  if (btnEx) btnEx.style.display = "none";
  setStatus("");
}

function fillForm(it) {
  itemAtual = it;
  $("agendaId").value = it.id || "";
  const dt = it.dataHora?.toDate ? it.dataHora.toDate() : (it.dataHora ? new Date(it.dataHora) : null);
  $("agendaData").value = toDateTimeLocalValue(dt);
  $("agendaTitulo").value = it.titulo || "";
  $("agendaObs").value = it.obs || "";
  $("agendaImagem").value = "";

  const btnEx = $("btnExcluirAgenda");
  if (btnEx) btnEx.style.display = it.id ? "inline-flex" : "none";

  setStatus(it.id ? `Editando: ${safe(it.titulo, "(sem título)")}` : "");
}

async function uploadImagem(file, agendaId) {
  if (!file) return { url: "", path: "" };
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `agenda/${agendaId}/${Date.now()}.${ext}`;
  const ref = storage.ref().child(path);
  await ref.put(file);
  const url = await ref.getDownloadURL();
  return { url, path };
}

function renderLista() {
  const box = $("listaAgenda");
  if (!box) return;

  const q = normalize($("pesquisaAgenda")?.value || "");
  const ord = $("ordenacaoAgenda")?.value || "proximos";

  let list = itens.filter((x) => includesAnyField({ titulo: x.titulo, obs: x.obs }, q));

  if (ord === "a-z" || ord === "z-a") {
    list.sort((a, b) => normalize(a.titulo).localeCompare(normalize(b.titulo)));
    if (ord === "z-a") list.reverse();
  } else {
    // proximos / recentes: ordena por dataHora
    list.sort((a, b) => {
      const da = a.dataHora?.toDate ? a.dataHora.toDate() : new Date(a.dataHora || 0);
      const dbb = b.dataHora?.toDate ? b.dataHora.toDate() : new Date(b.dataHora || 0);
      return da - dbb;
    });
    if (ord === "recentes") list.reverse();
  }

  box.innerHTML = "";
  if (!list.length) {
    box.innerHTML = `<div class="item"><div class="meta">Nenhum item na agenda.</div></div>`;
    return;
  }

  for (const it of list.slice(0, 500)) {
    const div = document.createElement("div");
    div.className = "item";
    const dt = it.dataHora?.toDate ? it.dataHora.toDate() : (it.dataHora ? new Date(it.dataHora) : null);
    const when = dt ? dt.toLocaleString("pt-BR") : "-";
    div.innerHTML = `
      <div class="title">${safe(it.titulo, "(sem título)")}</div>
      <div class="meta">${when}<br>${safe(it.obs).slice(0, 120)}${(it.obs || "").length > 120 ? "..." : ""}</div>
      <div class="mini-actions">
        <button class="btn btn-ghost" data-action="open" data-id="${it.id}">Abrir</button>
      </div>
    `;
    box.appendChild(div);
  }

  box.querySelectorAll("button[data-action='open']").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-id");
      const it = itens.find((x) => x.id === id);
      if (it) fillForm(it);
    };
  });
}

async function salvar() {
  const dataHora = parseDateTimeLocal($("agendaData")?.value);
  const titulo = ($("agendaTitulo")?.value || "").trim();
  const obs = ($("agendaObs")?.value || "").trim();
  const file = $("agendaImagem")?.files?.[0];

  if (!dataHora) {
    alert("Informe a data e hora.");
    return;
  }
  if (!titulo) {
    alert("Informe um título.");
    return;
  }

  try {
    const id = $("agendaId")?.value || null;

    if (id) {
      // update
      const payload = {
        dataHora,
        titulo,
        obs,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (file) {
        const up = await uploadImagem(file, id);
        payload.imagemUrl = up.url;
        payload.imagemPath = up.path;
      }

      await db.collection("agenda").doc(id).set(payload, { merge: true });
      setStatus("Atualizado com sucesso.");
    } else {
      // create
      const docRef = await db.collection("agenda").add({
        dataHora,
        titulo,
        obs,
        imagemUrl: "",
        imagemPath: "",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (file) {
        const up = await uploadImagem(file, docRef.id);
        await db.collection("agenda").doc(docRef.id).set(
          { imagemUrl: up.url, imagemPath: up.path, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
      setStatus("Salvo com sucesso.");
      $("agendaId").value = docRef.id;
    }

  } catch (e) {
    console.error(e);
    alert("Erro ao salvar.");
  }
}

async function excluir() {
  const id = $("agendaId")?.value;
  if (!id) return;
  if (!confirm("Excluir este item da agenda?")) return;

  try {
    const snap = await db.collection("agenda").doc(id).get();
    const data = snap.exists ? snap.data() : null;

    // tenta deletar imagem, se existir
    const path = data?.imagemPath || "";
    if (path) {
      try { await storage.ref().child(path).delete(); } catch (_) {}
    }

    await db.collection("agenda").doc(id).delete();
    clearForm();
    setStatus("Excluído.");
  } catch (e) {
    console.error(e);
    alert("Erro ao excluir.");
  }
}

function boot() {
  // auth-guard controla visibilidade do mainApp; aqui só iniciamos listeners
  $("btnSalvarAgenda")?.addEventListener("click", salvar);
  $("btnNovaAgenda")?.addEventListener("click", clearForm);
  $("btnExcluirAgenda")?.addEventListener("click", excluir);

  $("pesquisaAgenda")?.addEventListener("input", renderLista);
  $("ordenacaoAgenda")?.addEventListener("change", renderLista);

  unsubAgenda?.();
  unsubAgenda = db
    .collection("agenda")
    .orderBy("dataHora", "asc")
    .limit(2000)
    .onSnapshot(
      (snap) => {
        itens = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderLista();
      },
      (err) => console.error(err)
    );

  clearForm();
}

document.addEventListener("DOMContentLoaded", () => {
  auth.onAuthStateChanged((u) => {
    if (u) boot();
  });
});
