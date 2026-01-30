/*
  Cadastro de pessoas + Relatórios (Firebase compat)
  - Lista reativa (onSnapshot)
  - Sem localStorage como fonte de verdade
  - Relatórios como subcoleção da pessoa
  - Upload de laudo no Storage (opcional)
  - Exportação de PDF (jsPDF)
  - Mantém layout/HTML/CSS como está
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

function safe(v, fallback = "-") {
  return v === undefined || v === null || v === "" ? fallback : v;
}

function tsToDateInput(v) {
  if (!v) return "";
  if (typeof v === "string") return v;
  try {
    if (v.toDate) {
      const d = v.toDate();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }
  } catch {}
  try {
    const d = new Date(v);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } catch {
    return "";
  }
}

function fmtDateBR(v) {
  if (!v) return "-";
  if (typeof v === "string") {
    // YYYY-MM-DD -> dd/mm/yyyy
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return v;
  }
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
    p.observacaoPessoa,
  ]
    .map(normalize)
    .join(" ");
  return hay.includes(q);
}

async function deleteSubcollection(colRef, batchSize = 50) {
  // Apaga em lotes (suficiente para uso do sistema; para grandes volumes, usar Cloud Function)
  while (true) {
    const snap = await colRef.limit(batchSize).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

// ===== Firebase compat =====
if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const FieldValue = firebase.firestore.FieldValue;

// ===== State =====
let pessoas = [];
let pessoaAtual = null;
let relatorios = [];
let unsubPessoas = null;
let unsubRelatorios = null;

// ===== Render pessoas =====
function renderPessoas() {
  const container = $("listaPessoas");
  if (!container) return;

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
      <div class="title">${safe(p.nome, "(sem nome)")}</div>
      <div class="meta">
        Nasc.: ${fmtDateBR(p.dataNascimento)} · SUS: ${safe(p.cartaoSus)}<br>
        Tel.: ${safe(p.telefone)}<br>
        End.: ${safe(p.endereco)}
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
      if (p) fillPessoaForm(p);
    };
  });
}

function renderRelatorios() {
  const box = $("listaRelatorios");
  const btnExcluir = $("btnExcluirRelatorio");
  if (btnExcluir) btnExcluir.style.display = $("relatorioId")?.value ? "inline-flex" : "none";
  if (!box) return;

  if (!pessoaAtual) {
    box.innerHTML = `<div class="item"><div class="meta">Selecione uma pessoa para ver os relatórios.</div></div>`;
    return;
  }

  if (!relatorios.length) {
    box.innerHTML = `<div class="item"><div class="meta">Nenhum relatório para esta pessoa.</div></div>`;
    return;
  }

  box.innerHTML = "";
  relatorios.slice(0, 200).forEach((r) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="title">${fmtDateBR(r.dataRelatorio || r.ultimaData)} · ${r.concluida === "sim" ? "Concluída" : "Em andamento"}</div>
      <div class="meta">
        Última data: ${fmtDateBR(r.ultimaData)} · Urgência: ${safe(r.urgencia, "sem")}
        <br>
        Enviado para: ${safe(r.enviadoPara)}
      </div>
      <div class="mini-actions">
        <button class="btn btn-ghost" data-open="${r.id}">Abrir</button>
      </div>
    `;
    box.appendChild(div);
  });

  box.querySelectorAll("button[data-open]").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-open");
      const r = relatorios.find((x) => x.id === id);
      if (r) fillRelatorioForm(r);
    };
  });
}

// ===== Loaders =====
function listenPessoas() {
  if (unsubPessoas) unsubPessoas();

  unsubPessoas = db
    .collection("pessoas")
    .orderBy("nome")
    .limit(2000)
    .onSnapshot(
      (snap) => {
        pessoas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderPessoas();
      },
      (err) => {
        console.error("Erro ao listar pessoas:", err);
        alert("Erro ao carregar pessoas. Verifique regras/permissões do Firestore.");
      }
    );
}

function listenRelatorios(pessoaId) {
  if (unsubRelatorios) unsubRelatorios();
  relatorios = [];
  renderRelatorios();

  if (!pessoaId) return;
  unsubRelatorios = db
    .collection("pessoas")
    .doc(pessoaId)
    .collection("relatorios")
    .orderBy("updatedAt", "desc")
    .limit(200)
    .onSnapshot(
      (snap) => {
        relatorios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderRelatorios();
      },
      (err) => {
        // fallback: se não existir updatedAt ainda, tenta ordenar por createdAt
        console.warn("Falha ao ordenar por updatedAt. Tentando createdAt...", err);
        if (unsubRelatorios) unsubRelatorios();
        unsubRelatorios = db
          .collection("pessoas")
          .doc(pessoaId)
          .collection("relatorios")
          .orderBy("createdAt", "desc")
          .limit(200)
          .onSnapshot(
            (snap2) => {
              relatorios = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
              renderRelatorios();
            },
            (err2) => {
              console.error("Erro ao listar relatórios:", err2);
              alert("Erro ao carregar relatórios.");
            }
          );
      }
    );
}

// ===== Form fill / reset =====
function resetPessoaForm() {
  pessoaAtual = null;
  $("pessoaId").value = "";
  $("nome").value = "";
  $("dataNascimento").value = "";
  $("cartaoSus").value = "";
  $("telefone").value = "";
  $("endereco").value = "";
  $("observacaoPessoa").value = "";
  if ($("laudo")) $("laudo").value = "";
  const btnExcluir = $("btnExcluir");
  if (btnExcluir) btnExcluir.style.display = "none";
  $("laudoHint").textContent = "Você pode anexar PDF ou imagem. O arquivo ficará salvo no Firebase Storage.";

  resetRelatorioForm();
  if (unsubRelatorios) unsubRelatorios();
  relatorios = [];
  renderRelatorios();
}

function fillPessoaForm(p) {
  pessoaAtual = p;
  $("pessoaId").value = p.id || "";
  $("nome").value = p.nome || "";
  $("dataNascimento").value = tsToDateInput(p.dataNascimento);
  $("cartaoSus").value = p.cartaoSus || "";
  $("telefone").value = p.telefone || "";
  $("endereco").value = p.endereco || "";
  $("observacaoPessoa").value = p.observacaoPessoa || "";
  if ($("laudo")) $("laudo").value = "";

  const btnExcluir = $("btnExcluir");
  if (btnExcluir) btnExcluir.style.display = "inline-flex";

  if (p.laudoUrl) {
    $("laudoHint").innerHTML = `Arquivo atual: <a href="${p.laudoUrl}" target="_blank" rel="noopener">abrir</a> (enviar novo arquivo para substituir)`;
  } else {
    $("laudoHint").textContent = "Você pode anexar PDF ou imagem. O arquivo ficará salvo no Firebase Storage.";
  }

  resetRelatorioForm();
  listenRelatorios(p.id);
}

function resetRelatorioForm() {
  $("relatorioId").value = "";
  $("ultimaData").value = "";
  $("concluida").value = "nao";
  $("enviadoPara").value = "";
  $("urgencia").value = "sem";
  $("dataRelatorio").value = "";
  $("observacoes").value = "";
  const btnExcluir = $("btnExcluirRelatorio");
  if (btnExcluir) btnExcluir.style.display = "none";
}

function fillRelatorioForm(r) {
  $("relatorioId").value = r.id || "";
  $("ultimaData").value = tsToDateInput(r.ultimaData);
  $("concluida").value = r.concluida || "nao";
  $("enviadoPara").value = r.enviadoPara || "";
  $("urgencia").value = r.urgencia || "sem";
  $("dataRelatorio").value = tsToDateInput(r.dataRelatorio);
  $("observacoes").value = r.observacoes || "";
  const btnExcluir = $("btnExcluirRelatorio");
  if (btnExcluir) btnExcluir.style.display = "inline-flex";
}

// ===== Save / Delete pessoa =====
async function upsertPessoa(ev) {
  ev.preventDefault();
  const btn = $("btnSalvar");
  if (btn) btn.disabled = true;

  try {
    const id = $("pessoaId").value || "";
    const payloadBase = {
      nome: $("nome").value.trim(),
      dataNascimento: $("dataNascimento").value || "",
      cartaoSus: $("cartaoSus").value.trim(),
      telefone: $("telefone").value.trim(),
      endereco: $("endereco").value.trim(),
      observacaoPessoa: $("observacaoPessoa").value.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    let docRef;
    if (!id) {
      docRef = await db.collection("pessoas").add({
        ...payloadBase,
        createdAt: FieldValue.serverTimestamp(),
      });
      $("pessoaId").value = docRef.id;
    } else {
      docRef = db.collection("pessoas").doc(id);
      await docRef.set(payloadBase, { merge: true });
    }

    // Upload laudo (opcional)
    const file = $("laudo")?.files?.[0];
    if (file) {
      const pessoaId = docRef.id;
      // Se havia um arquivo antigo, tenta apagar
      const existing = (await docRef.get()).data() || {};
      if (existing.laudoPath) {
        try {
          await storage.ref(existing.laudoPath).delete();
        } catch (e) {
          console.warn("Não foi possível apagar o laudo antigo:", e);
        }
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `laudos/${pessoaId}/${Date.now()}_${safeName}`;
      const ref = storage.ref(path);
      await ref.put(file);
      const url = await ref.getDownloadURL();
      await docRef.set(
        {
          laudoUrl: url,
          laudoPath: path,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      $("laudo").value = "";
    }

    // Recarrega pessoa atual (para hint de laudo e relatórios)
    const saved = await docRef.get();
    fillPessoaForm({ id: docRef.id, ...saved.data() });
    alert("Salvo com sucesso!");
  } catch (e) {
    console.error(e);
    alert("Não foi possível salvar. Verifique o console (F12) e as permissões do Firebase.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function excluirPessoa() {
  if (!pessoaAtual?.id) return;
  if (!confirm("Excluir esta pessoa e todos os relatórios?")) return;
  const pessoaId = pessoaAtual.id;

  try {
    const ref = db.collection("pessoas").doc(pessoaId);
    const data = (await ref.get()).data() || {};
    await deleteSubcollection(ref.collection("relatorios"));
    await ref.delete();
    if (data.laudoPath) {
      try {
        await storage.ref(data.laudoPath).delete();
      } catch (e) {
        console.warn("Não foi possível apagar arquivo do Storage:", e);
      }
    }
    resetPessoaForm();
    alert("Pessoa excluída.");
  } catch (e) {
    console.error(e);
    alert("Erro ao excluir. Verifique permissões/regras.");
  }
}

// ===== Save / Delete relatório =====
async function upsertRelatorio(ev) {
  ev.preventDefault();
  if (!pessoaAtual?.id) {
    alert("Selecione uma pessoa antes de salvar um relatório.");
    return;
  }

  const btn = $("btnSalvarRelatorio");
  if (btn) btn.disabled = true;

  try {
    const pessoaId = pessoaAtual.id;
    const relId = $("relatorioId").value || "";
    const col = db.collection("pessoas").doc(pessoaId).collection("relatorios");
    const payload = {
      ultimaData: $("ultimaData").value || "",
      concluida: $("concluida").value || "nao",
      enviadoPara: $("enviadoPara").value.trim(),
      urgencia: $("urgencia").value || "sem",
      dataRelatorio: $("dataRelatorio").value || "",
      observacoes: $("observacoes").value.trim(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    let ref;
    if (!relId) {
      ref = await col.add({ ...payload, createdAt: FieldValue.serverTimestamp() });
      $("relatorioId").value = ref.id;
    } else {
      ref = col.doc(relId);
      await ref.set(payload, { merge: true });
    }

    alert("Relatório salvo!");
  } catch (e) {
    console.error(e);
    alert("Não foi possível salvar o relatório.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function excluirRelatorio() {
  if (!pessoaAtual?.id) return;
  const relId = $("relatorioId")?.value;
  if (!relId) return;
  if (!confirm("Excluir este relatório?")) return;

  try {
    await db
      .collection("pessoas")
      .doc(pessoaAtual.id)
      .collection("relatorios")
      .doc(relId)
      .delete();
    resetRelatorioForm();
    alert("Relatório excluído.");
  } catch (e) {
    console.error(e);
    alert("Erro ao excluir relatório.");
  }
}

// ===== PDF =====
function gerarPDF() {
  if (!pessoaAtual?.id) {
    alert("Selecione uma pessoa.");
    return;
  }
  const relId = $("relatorioId")?.value;
  const rel = relatorios.find((r) => r.id === relId) || null;
  if (!rel) {
    alert("Abra um relatório antes de gerar o PDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(14);
  doc.text("Relatório de atendimento", 14, 16);
  doc.setFontSize(10);
  doc.text("Vereadora Vanessa da Usina", 14, 22);

  const linhasPessoa = [
    ["Nome", safe(pessoaAtual.nome)],
    ["Data de nascimento", fmtDateBR(pessoaAtual.dataNascimento)],
    ["Cartão SUS", safe(pessoaAtual.cartaoSus)],
    ["Telefone", safe(pessoaAtual.telefone)],
    ["Endereço", safe(pessoaAtual.endereco)],
  ];

  doc.autoTable({
    startY: 28,
    head: [["Pessoa", "Informações"]],
    body: linhasPessoa,
    theme: "grid",
    styles: { fontSize: 9 },
  });

  const y = doc.lastAutoTable.finalY + 8;
  doc.setFontSize(12);
  doc.text("Demanda / Encaminhamento", 14, y);

  const linhasRel = [
    ["Última data", fmtDateBR(rel.ultimaData)],
    ["Concluída", rel.concluida === "sim" ? "Sim" : "Não"],
    ["Enviado para", safe(rel.enviadoPara)],
    ["Urgência", safe(rel.urgencia, "sem")],
    ["Data do relatório", fmtDateBR(rel.dataRelatorio)],
    ["Observações", safe(rel.observacoes, "")],
  ];

  doc.autoTable({
    startY: y + 4,
    body: linhasRel,
    theme: "grid",
    styles: { fontSize: 9, cellWidth: "wrap" },
    columnStyles: { 0: { cellWidth: 45 } },
  });

  doc.save(`relatorio_${(pessoaAtual.nome || "pessoa").replace(/\s+/g, "_")}.pdf`);
}

// ===== Boot =====
function boot() {
  // busca ao digitar
  const pesquisa = $("pesquisa");
  if (pesquisa) pesquisa.addEventListener("input", renderPessoas);

  // pessoa
  $("pessoaForm").addEventListener("submit", upsertPessoa);
  $("btnNovo").addEventListener("click", resetPessoaForm);
  $("btnExcluir").addEventListener("click", excluirPessoa);

  // relatório
  $("relatorioForm").addEventListener("submit", upsertRelatorio);
  $("btnNovoRelatorio").addEventListener("click", resetRelatorioForm);
  $("btnExcluirRelatorio").addEventListener("click", excluirRelatorio);
  $("btnExportar").addEventListener("click", gerarPDF);

  listenPessoas();
  renderRelatorios();
}

auth.onAuthStateChanged((user) => {
  const loading = $("authLoading");
  if (loading) loading.style.display = "none";
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  boot();
});
