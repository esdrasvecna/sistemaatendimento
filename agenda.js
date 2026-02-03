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

// ===== Status =====
// status possíveis: "ativa" | "concluida" | "cancelada"
function normStatus(s) {
  const v = (s || "").toString().toLowerCase().trim();
  if (v === "concluida" || v === "concluída") return "concluida";
  if (v === "cancelada") return "cancelada";
  return "ativa";
}

function statusLabel(st) {
  const v = normStatus(st);
  if (v === "concluida") return "✅ Concluída";
  if (v === "cancelada") return "⛔ Cancelada";
  return "🟢 Ativa";
}

function updateStatusButtons() {
  const id = $("agendaId")?.value || "";
  const st = normStatus($("agendaStatus")?.value);

  const btnConcluir = $("btnConcluirAgenda");
  const btnCancelar = $("btnCancelarAgenda");
  const btnReabrir = $("btnReabrirAgenda");

  // só mostra quando estiver editando um item existente
  const show = Boolean(id);
  if (btnConcluir) btnConcluir.style.display = show && st === "ativa" ? "inline-flex" : "none";
  if (btnCancelar) btnCancelar.style.display = show && st === "ativa" ? "inline-flex" : "none";
  if (btnReabrir) btnReabrir.style.display = show && st !== "ativa" ? "inline-flex" : "none";
}

// ===== Exportação WhatsApp =====
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function getAgendaDate(it) {
  return it?.dataHora?.toDate ? it.dataHora.toDate() : new Date(it?.dataHora || 0);
}

function fmtDateBR(d) {
  try {
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
}

function fmtTimeBR(d) {
  try {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function periodoToRange(key) {
  const now = new Date();
  const start = startOfDay(now);
  let end;

  if (key === "dia") {
    end = endOfDay(now);
  } else if (key === "semana") {
    end = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));
  } else if (key === "15") {
    end = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14));
  } else {
    // mes
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end = endOfDay(lastDay);
  }
  return { start, end };
}

function buildWhatsAppText(periodKey) {
  const { start, end } = periodoToRange(periodKey);

  const list = itens
    .slice()
    .map((it) => ({ ...it, _d: getAgendaDate(it) }))
    // por padrão, não exporta itens concluídos/cancelados
    .filter((it) => normStatus(it.status) === "ativa")
    .filter((it) => it._d instanceof Date && !isNaN(it._d) && it._d >= start && it._d <= end)
    .sort((a, b) => a._d - b._d)
    .slice(0, 400);

  const periodoLabel = {
    dia: "Hoje",
    semana: "Próximos 7 dias",
    "15": "Próximos 15 dias",
    mes: "Este mês",
  }[periodKey] || "Período selecionado";

  const nome = (document.title || "Agenda").split("·")[0].trim();
  const header = `📝 Agenda da ${nome} 🏭\n✳️ ${periodoLabel}`;

  if (!list.length) return `${header}\n\n(sem compromissos nesse período)`;

  // agrupa por dia (dd/mm/aaaa)
  const groups = new Map();
  for (const it of list) {
    const key = it._d.toLocaleDateString("pt-BR");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const cap1 = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const weekdayLine = (d) => {
    const weekday = cap1(
      d.toLocaleDateString("pt-BR", { weekday: "long" })
    );
    return `✳️ ${weekday} – ${fmtDateBR(d)}`;
  };

  const clockEmoji = (d) => {
    if (!(d instanceof Date) || isNaN(d)) return "🕘";
    let h = d.getHours();
    let m = d.getMinutes();

    // arredonda para o emoji mais próximo (hora cheia / meia hora)
    let half = false;
    if (m >= 45) {
      h = (h + 1) % 12;
      if (h === 0) h = 12;
      half = false;
    } else if (m >= 15) {
      half = true;
    } else {
      half = false;
    }

    const hour = ((h % 12) || 12);
    const full = {
      1: "🕐", 2: "🕑", 3: "🕒", 4: "🕓", 5: "🕔", 6: "🕕",
      7: "🕖", 8: "🕗", 9: "🕘", 10: "🕙", 11: "🕚", 12: "🕛",
    };
    const halfMap = {
      1: "🕜", 2: "🕝", 3: "🕞", 4: "🕟", 5: "🕠", 6: "🕡",
      7: "🕢", 8: "🕣", 9: "🕤", 10: "🕥", 11: "🕦", 12: "🕧",
    };
    return half ? (halfMap[hour] || "🕘") : (full[hour] || "🕘");
  };

  const statusEmoji = (st) => {
    const v = normStatus(st);
    if (v === "cancelada") return "⛔";
    if (v === "concluida") return "✅";
    // na exportação padrão, os itens são "ativos"; usamos ✅ para ficar no formato de repasse
    return "✅";
  };

  const parseObs = (rawObs) => {
    const obs = safe(rawObs, "");
    const lines = obs
      .split(/\r?\n+/)
      .map((l) => l.trim())
      .filter(Boolean);

    let local = "";
    let extra = [];

    if (lines.length) {
      // se vier com 📍, assume que é local
      if (lines[0].startsWith("📍")) {
        local = lines[0].replace(/^📍\s*/, "").trim();
        extra = lines.slice(1);
      } else {
        // heurística: primeira linha curta -> local
        const first = lines[0];
        const looksLikePlace =
          first.length <= 50 ||
          /rua|av\.|avenida|praça|bairro|prefeitura|igreja|almoxarifado/i.test(first);
        if (looksLikePlace) {
          local = first;
          extra = lines.slice(1);
        } else {
          extra = lines;
        }
      }
    }
    return { local, extra };
  };

  let out = `${header}\n\n`;

  for (const [dayKey, dayItems] of groups.entries()) {
    const d = dayItems[0]._d;
    out += `${weekdayLine(d)}\n\n`;

    for (const it of dayItems) {
      const t = fmtTimeBR(it._d);
      const title = safe(it.titulo, "(sem título)");
      const { local, extra } = parseObs(it.obs);

      out += `${statusEmoji(it.status)} ${title}\n`;
      if (extra.length) {
        for (const ln of extra) out += `${ln}\n`;
      }
      if (local) out += `📍 ${local}\n`;
      out += `${clockEmoji(it._d)} ${t}\n\n`;
    }
  }

  return out.trim();
}

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
  const st = $("agendaStatus");
  if (st) st.value = "ativa";
  const btnEx = $("btnExcluirAgenda");
  if (btnEx) btnEx.style.display = "none";
  updateStatusButtons();
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

  const st = $("agendaStatus");
  if (st) st.value = normStatus(it.status);

  const btnEx = $("btnExcluirAgenda");
  if (btnEx) btnEx.style.display = it.id ? "inline-flex" : "none";

  updateStatusButtons();

  setStatus(it.id ? `Editando: ${safe(it.titulo, "(sem título)")} · ${statusLabel(it.status)}` : "");
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
    const st = normStatus(it.status);
    div.className = `item agenda-item status-${st}`;
    const dt = it.dataHora?.toDate ? it.dataHora.toDate() : (it.dataHora ? new Date(it.dataHora) : null);
    const when = dt ? dt.toLocaleString("pt-BR") : "-";
    div.innerHTML = `
      <div class="title">${safe(it.titulo, "(sem título)")}</div>
      <div class="meta">${statusLabel(st)} · ${when}<br>${safe(it.obs).slice(0, 120)}${(it.obs || "").length > 120 ? "..." : ""}</div>
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
  const status = normStatus($("agendaStatus")?.value);
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
        status,
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
        status,
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

async function marcarStatus(novoStatus) {
  const id = $("agendaId")?.value;
  if (!id) return;
  const st = normStatus(novoStatus);

  const msgMap = {
    concluida: "Marcar como concluída?",
    cancelada: "Marcar como cancelada?",
    ativa: "Reabrir este item?",
  };
  if (!confirm(msgMap[st] || "Alterar status?")) return;

  try {
    await db.collection("agenda").doc(id).set(
      { status: st, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    const sel = $("agendaStatus");
    if (sel) sel.value = st;
    updateStatusButtons();
    setStatus(`Status atualizado: ${statusLabel(st)}`);
  } catch (e) {
    console.error(e);
    alert("Erro ao atualizar status.");
  }
}

function boot() {
  // auth-guard controla visibilidade do mainApp; aqui só iniciamos listeners
  $("btnSalvarAgenda")?.addEventListener("click", salvar);
  $("btnNovaAgenda")?.addEventListener("click", clearForm);
  $("btnExcluirAgenda")?.addEventListener("click", excluir);

  $("agendaStatus")?.addEventListener("change", () => {
    updateStatusButtons();
  });

  $("btnConcluirAgenda")?.addEventListener("click", (e) => {
    e.preventDefault();
    marcarStatus("concluida");
  });
  $("btnCancelarAgenda")?.addEventListener("click", (e) => {
    e.preventDefault();
    marcarStatus("cancelada");
  });
  $("btnReabrirAgenda")?.addEventListener("click", (e) => {
    e.preventDefault();
    marcarStatus("ativa");
  });

  $("pesquisaAgenda")?.addEventListener("input", renderLista);
  $("ordenacaoAgenda")?.addEventListener("change", renderLista);

  // WhatsApp
  const renderWhats = () => {
    const periodo = $("whatsPeriodo")?.value || "dia";
    const txt = buildWhatsAppText(periodo);
    const box = $("whatsPreview");
    if (box) box.value = txt;
  };

  $("btnGerarWhats")?.addEventListener("click", (e) => {
    e.preventDefault();
    renderWhats();
  });

  $("whatsPeriodo")?.addEventListener("change", () => {
    // se já existe prévia, atualiza automaticamente
    const box = $("whatsPreview");
    if (box && box.value?.trim()) renderWhats();
  });

  $("btnCopiarWhats")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const box = $("whatsPreview");
    const text = box?.value || "";
    if (!text.trim()) {
      renderWhats();
    }
    const finalText = (box?.value || "").trim();
    if (!finalText) return;
    try {
      await navigator.clipboard.writeText(finalText);
      setStatus("Texto copiado. Cole no WhatsApp.");
    } catch {
      // fallback
      if (box) {
        box.removeAttribute("readonly");
        box.select();
        document.execCommand("copy");
        box.setAttribute("readonly", "readonly");
        setStatus("Texto copiado. Cole no WhatsApp.");
      }
    }
  });

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
