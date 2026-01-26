/*
  Cadastro de pessoas + Relatórios
  - CRUD de pessoas (Firestore)
  - Upload de laudo (Firebase Storage)
  - CRUD de relatórios (subcoleção pessoas/{id}/relatorios)
  - Histórico de alterações por relatório
  - Exportação de “documento final” (HTML em formato .doc)
*/

// ===== Firebase (config centralizada) =====
if (!window.firebaseConfig) {
  console.error("firebaseConfig não encontrado. Verifique firebase-config.js");
}

if (!firebase.apps.length) {
  firebase.initializeApp(window.firebaseConfig);
}

const db = firebase.firestore();
const storage = firebase.storage();

// ===== Helpers =====
const $ = (id) => document.getElementById(id);
const usuario = sessionStorage.getItem("usuario") || "(desconhecido)";

function normalize(v) {
  return String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function includesAnyField(p, q) {
  if (!q) return true;
  const hay = [
    p.nome,
    p.dataNascimento,
    p.cartaoSus,
    p.telefone,
    p.endereco,
    p.observacao,
    p.laudoNome,
  ]
    .map(normalize)
    .join(" | ");
  return hay.includes(q);
}

function fmtDate(iso) {
  if (!iso) return "";
  // iso yyyy-mm-dd
  const [y, m, d] = String(iso).split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function urgenciaPill(u) {
  if (u === "alta") return `<span class="pill bad">Alta</span>`;
  if (u === "baixa") return `<span class="pill warn">Baixa</span>`;
  return `<span class="pill ok">Sem urgência</span>`;
}

function concluidaPill(v) {
  return v ? `<span class="pill ok">Concluída</span>` : `<span class="pill warn">Pendente</span>`;
}

async function safeConfirm(msg) {
  return window.confirm(msg);
}

// ===== Estado =====
let pessoas = []; // cache
let unsubPessoas = null;
let unsubRelatorios = null;

// ===== Pessoas: UI =====
function resetPessoaForm() {
  $("pessoaId").value = "";
  $("nome").value = "";
  $("dataNascimento").value = "";
  $("cartaoSus").value = "";
  $("telefone").value = "";
  $("endereco").value = "";
  $("observacaoPessoa").value = "";
  $("laudo").value = "";
  $("laudoHint").textContent = "Você pode anexar PDF ou imagem. O arquivo ficará salvo no Firebase Storage.";
  $("btnExcluir").style.display = "none";
  resetRelatorioForm();
  renderRelatorios([]);
}

function fillPessoaForm(p) {
  $("pessoaId").value = p.id;
  $("nome").value = p.nome || "";
  $("dataNascimento").value = p.dataNascimento || "";
  $("cartaoSus").value = p.cartaoSus || "";
  $("telefone").value = p.telefone || "";
  $("endereco").value = p.endereco || "";
  $("observacaoPessoa").value = p.observacao || "";
  $("laudo").value = "";
  if (p.laudoUrl) {
    $("laudoHint").innerHTML = `Arquivo atual: <a href="${p.laudoUrl}" target="_blank" rel="noopener">${p.laudoNome || "abrir"}</a>`;
  } else {
    $("laudoHint").textContent = "Você pode anexar PDF ou imagem. O arquivo ficará salvo no Firebase Storage.";
  }
  $("btnExcluir").style.display = "inline-block";

  // prepara relatório
  resetRelatorioForm();
  listenRelatorios(p.id);
}

function renderPessoas() {
  const q = normalize($("pesquisa").value);
  const container = $("listaPessoas");
  container.innerHTML = "";

  const filtered = pessoas
    .filter((p) => includesAnyField(p, q))
    .slice(0, 200);

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
        ${p.laudoUrl ? `<a class="btn btn-ghost" href="${p.laudoUrl}" target="_blank" rel="noopener">Laudo</a>` : ""}
      </div>
    `;
    container.appendChild(div);
  }

  // delegates
  container.querySelectorAll("button[data-action='select']").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-id");
      const p = pessoas.find((x) => x.id === id);
      if (p) fillPessoaForm(p);
    };
  });
}

// ===== Pessoas: Firestore =====
function listenPessoas() {
  if (unsubPessoas) unsubPessoas();

  unsubPessoas = db
    .collection("pessoas")
    .orderBy("updatedAt", "desc")
    .limit(1000)
    .onSnapshot(
      (snap) => {
        pessoas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderPessoas();
      },
      (err) => {
        console.error(err);
        alert("Erro ao carregar pessoas. Verifique regras do Firestore e conexão.");
      }
    );
}

async function uploadLaudoIfAny(pessoaId, previous) {
  const file = $("laudo").files && $("laudo").files[0];
  if (!file) return previous || null;

  // remove arquivo anterior (opcional) – não é obrigatório, mas ajuda a não acumular
  try {
    if (previous?.laudoPath) {
      await storage.ref(previous.laudoPath).delete();
    }
  } catch (e) {
    // ignore
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `laudos/${pessoaId}/${Date.now()}_${safeName}`;
  const ref = storage.ref(path);
  await ref.put(file);
  const url = await ref.getDownloadURL();

  return {
    laudoUrl: url,
    laudoPath: path,
    laudoNome: file.name
  };
}

async function salvarPessoa(e) {
  e.preventDefault();

  const id = $("pessoaId").value.trim();
  const payloadBase = {
    nome: $("nome").value.trim(),
    dataNascimento: $("dataNascimento").value,
    cartaoSus: $("cartaoSus").value.trim(),
    telefone: $("telefone").value.trim(),
    endereco: $("endereco").value.trim(),
    observacao: $("observacaoPessoa").value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: usuario
  };

  if (!payloadBase.nome) {
    alert("Informe o nome.");
    return;
  }

  try {
    if (!id) {
      // create
      const docRef = await db.collection("pessoas").add({
        ...payloadBase,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: usuario,
      });

      const laudo = await uploadLaudoIfAny(docRef.id, null);
      if (laudo) await docRef.set(laudo, { merge: true });

      $("pessoaId").value = docRef.id;
      // Carrega a pessoa recém-criada no formulário e já inicia os relatórios
      const pessoaNova = { id: docRef.id, ...payloadBase, ...(laudo || {}) };
      fillPessoaForm(pessoaNova);
      alert("Pessoa cadastrada. Agora você já pode salvar relatórios abaixo.");
    } else {
      // update
      const ref = db.collection("pessoas").doc(id);
      const snap = await ref.get();
      const prev = snap.exists ? snap.data() : null;

      await ref.set(payloadBase, { merge: true });

      const laudo = await uploadLaudoIfAny(id, prev);
      if (laudo) await ref.set(laudo, { merge: true });

      alert("Pessoa atualizada.");
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar cadastro. Verifique Firestore/Storage e permissões.");
  }
}

async function excluirPessoa() {
  const id = $("pessoaId").value.trim();
  if (!id) return;
  if (!(await safeConfirm("Excluir esta pessoa e todos os relatórios?"))) return;

  try {
    const ref = db.collection("pessoas").doc(id);
    const snap = await ref.get();
    const data = snap.exists ? snap.data() : null;

    // apaga relatórios (simples – para bases grandes, use Cloud Function)
    const relSnap = await ref.collection("relatorios").get();
    const batch = db.batch();
    relSnap.forEach((d) => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();

    // tenta apagar laudo
    try {
      if (data?.laudoPath) await storage.ref(data.laudoPath).delete();
    } catch (e) {
      // ignore
    }

    alert("Pessoa excluída.");
    resetPessoaForm();
  } catch (err) {
    console.error(err);
    alert("Erro ao excluir pessoa.");
  }
}

// ===== Relatórios =====
function resetRelatorioForm() {
  $("relatorioId").value = "";
  $("ultimaData").value = "";
  $("concluida").value = "nao";
  $("enviadoPara").value = "";
  $("urgencia").value = "sem";
  $("dataRelatorio").value = todayISO();
  $("observacoes").value = "";
  $("btnExcluirRelatorio").style.display = "none";
}

function fillRelatorioForm(r) {
  $("relatorioId").value = r.id;
  $("ultimaData").value = r.ultimaData || "";
  $("concluida").value = r.concluida ? "sim" : "nao";
  $("enviadoPara").value = r.enviadoPara || "";
  $("urgencia").value = r.urgencia || "sem";
  $("dataRelatorio").value = r.dataRelatorio || todayISO();
  $("observacoes").value = r.observacoes || "";
  $("btnExcluirRelatorio").style.display = "inline-block";
}

function renderRelatorios(rels) {
  const container = $("listaRelatorios");
  container.innerHTML = "";

  if (!rels.length) {
    container.innerHTML = `<div class="report"><div class="small">Nenhum relatório ainda.</div></div>`;
    return;
  }

  for (const r of rels) {
    const div = document.createElement("div");
    div.className = "report";
    div.innerHTML = `
      <div class="top">
        <b>${fmtDate(r.dataRelatorio) || "(sem data)"}</b>
        <div style="display:flex; gap:8px; align-items:center;">
          ${urgenciaPill(r.urgencia)}
          ${concluidaPill(!!r.concluida)}
        </div>
      </div>
      <div class="small">
        Última data: <b>${fmtDate(r.ultimaData) || "-"}</b> · Enviado: <b>${r.enviadoPara || "-"}</b>
      </div>
      <div class="small">${normalize(r.observacoes) ? (r.observacoes || "") : ""}</div>
      <div class="mini-actions" style="margin-top:10px;">
        <button class="btn btn-ghost" data-action="openRel" data-id="${r.id}">Abrir</button>
      </div>
    `;
    container.appendChild(div);
  }

  container.querySelectorAll("button[data-action='openRel']").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-id");
      const r = rels.find((x) => x.id === id);
      if (r) fillRelatorioForm(r);
    };
  });
}

function listenRelatorios(pessoaId) {
  if (unsubRelatorios) unsubRelatorios();
  if (!pessoaId) {
    renderRelatorios([]);
    return;
  }

  unsubRelatorios = db
    .collection("pessoas")
    .doc(pessoaId)
    .collection("relatorios")
    .orderBy("createdAt", "desc")
    .limit(200)
    .onSnapshot(
      (snap) => {
        const rels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // cache temporário pra abrir
        window.__rels = rels;
        renderRelatorios(rels);
      },
      (err) => {
        console.error(err);
        renderRelatorios([]);
      }
    );
}

function diffFields(oldData, newData, keys) {
  const changes = {};
  for (const k of keys) {
    const before = oldData?.[k];
    const after = newData?.[k];
    const b = before === undefined ? null : before;
    const a = after === undefined ? null : after;
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[k] = { de: b, para: a };
    }
  }
  return changes;
}

async async function salvarRelatorio(e) {
  e.preventDefault();
  const pessoaId = $("pessoaId").value.trim();
  if (!pessoaId) {
    alert("Selecione uma pessoa antes de criar relatório.");
    return;
  }

  const relId = $("relatorioId").value.trim();
  const payload = {
    ultimaData: $("ultimaData").value,
    concluida: $("concluida").value === "sim",
    enviadoPara: $("enviadoPara").value.trim(),
    urgencia: $("urgencia").value,
    dataRelatorio: $("dataRelatorio").value,
    observacoes: $("observacoes").value.trim(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedBy: usuario
  };

  try {
    const baseRef = db.collection("pessoas").doc(pessoaId).collection("relatorios");

    if (!relId) {
      const docRef = await baseRef.add({
        ...payload,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: usuario,
        historico: [
          {
            at: new Date().toISOString(),
            by: usuario,
            tipo: "criado",
            changes: diffFields({}, payload, Object.keys(payload))
          }
        ]
      });
      $("relatorioId").value = docRef.id;
      alert("Relatório criado.");
    } else {
      const ref = baseRef.doc(relId);
      const snap = await ref.get();
      const prev = snap.exists ? snap.data() : {};

      const keys = ["ultimaData", "concluida", "enviadoPara", "urgencia", "dataRelatorio", "observacoes"];
      const changes = diffFields(prev, payload, keys);

      const historicoEntry = {
        at: new Date().toISOString(),
        by: usuario,
        tipo: "editado",
        changes
      };

      await ref.set(
        {
          ...payload,
          historico: firebase.firestore.FieldValue.arrayUnion(historicoEntry)
        },
        { merge: true }
      );

      alert("Relatório atualizado.");
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao salvar relatório.");
  }
}

async function excluirRelatorio() {
  const pessoaId = $("pessoaId").value.trim();
  const relId = $("relatorioId").value.trim();
  if (!pessoaId || !relId) return;
  if (!(await safeConfirm("Excluir este relatório?"))) return;

  try {
    await db.collection("pessoas").doc(pessoaId).collection("relatorios").doc(relId).delete();
    alert("Relatório excluído.");
    resetRelatorioForm();
  } catch (err) {
    console.error(err);
    alert("Erro ao excluir relatório.");
  }
}

// ===== Export =====
function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadWordDoc(filename, html) {
  const header = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>`;
  const footer = `</body></html>`;
  const content = header + html + footer;
  const blob = new Blob([content], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".doc") ? filename : `${filename}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function prettyUrg(u) {
  if (u === "alta") return "Alta";
  if (u === "baixa") return "Baixa";
  return "Sem urgência";
}

async function exportarDocumentoFinal() {
  const pessoaId = $("pessoaId").value.trim();
  if (!pessoaId) {
    alert("Selecione uma pessoa.");
    return;
  }

  try {
    const pSnap = await db.collection("pessoas").doc(pessoaId).get();
    if (!pSnap.exists) {
      alert("Pessoa não encontrada.");
      return;
    }
    const p = { id: pSnap.id, ...pSnap.data() };

    const relSnap = await db
      .collection("pessoas")
      .doc(pessoaId)
      .collection("relatorios")
      .orderBy("createdAt", "asc")
      .get();

    const rels = relSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("Biblioteca de PDF não carregou. Verifique sua conexão.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 50;

    const title = "Documento Final — Cadastro de Pessoas";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(title, margin, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, margin, y);
    y += 18;

    // ===== Dados da pessoa
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Dados da pessoa", margin, y);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const linhasPessoa = [
      ["Nome", p.nome || "-"],
      ["Data de nascimento", fmtDate(p.dataNascimento) || "-"],
      ["Cartão SUS", p.cartaoSus || "-"],
      ["Telefone", p.telefone || "-"],
      ["Endereço", p.endereco || "-"],
      ["Observação", p.observacao || "-"],
    ];

    if (doc.autoTable) {
      doc.autoTable({
        startY: y,
        head: [["Campo", "Valor"]],
        body: linhasPessoa,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fontSize: 9 },
        margin: { left: margin, right: margin },
      });
      y = doc.lastAutoTable.finalY + 14;
    } else {
      // fallback simples
      for (const [k, v] of linhasPessoa) {
        doc.text(`${k}: ${String(v)}`, margin, y);
        y += 12;
      }
      y += 10;
    }

    // ===== Anexo (laudo)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Anexo (laudo)", margin, y);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (p.laudoUrl) {
      const nome = p.laudoNome || "abrir anexo";
      // Link clicável (quando o leitor de PDF suporta)
      if (doc.textWithLink) {
        doc.textWithLink(`Arquivo: ${nome}`, margin, y, { url: p.laudoUrl });
      } else {
        doc.text(`Arquivo: ${nome} — ${p.laudoUrl}`, margin, y);
      }
      y += 14;

      // Se for imagem, tenta incorporar no PDF
      const ext = (nome.split(".").pop() || "").toLowerCase();
      const isImg = ["png", "jpg", "jpeg", "webp"].includes(ext);

      if (isImg) {
        try {
          const resp = await fetch(p.laudoUrl);
          const blob = await resp.blob();
          const dataUrl = await new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });

          // calcula tamanho para caber na página
          const maxW = pageW - margin * 2;
          const imgW = maxW;
          const imgH = imgW * 0.6;

          if (y + imgH > doc.internal.pageSize.getHeight() - margin) {
            doc.addPage();
            y = margin;
          }

          doc.addImage(dataUrl, ext === "png" ? "PNG" : "JPEG", margin, y, imgW, imgH);
          y += imgH + 14;
        } catch (e) {
          console.warn("Não foi possível embutir a imagem do anexo no PDF:", e);
          doc.text("Obs.: não foi possível embutir a imagem no PDF, mas o link acima está disponível.", margin, y);
          y += 12;
        }
      } else {
        doc.text("Obs.: anexos PDF/DOC não são embutidos. O link acima abre o arquivo.", margin, y);
        y += 12;
      }
    } else {
      doc.text("Nenhum anexo enviado.", margin, y);
      y += 12;
    }

    // ===== Relatórios
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = margin;
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Relatórios (histórico)", margin, y);
    y += 12;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (!rels.length) {
      doc.text("Nenhum relatório cadastrado.", margin, y);
      y += 12;
    } else {
      const rows = rels.map((r) => ([
        fmtDate(r.dataRelatorio) || "-",
        fmtDate(r.ultimaData) || "-",
        r.concluida ? "Sim" : "Não",
        r.enviadoPara || "-",
        (r.urgencia || "sem").toUpperCase(),
        (r.observacoes || "").slice(0, 120)
      ]));

      if (doc.autoTable) {
        doc.autoTable({
          startY: y,
          head: [["Data", "Última data", "Concluída", "Enviado para", "Urgência", "Observações"]],
          body: rows,
          styles: { fontSize: 8, cellPadding: 3 },
          headStyles: { fontSize: 8 },
          margin: { left: margin, right: margin },
        });
        y = doc.lastAutoTable.finalY + 10;
      } else {
        for (const row of rows) {
          doc.text(row.join(" | "), margin, y);
          y += 12;
        }
      }
    }

    const safeName = (p.nome || "pessoa").replace(/[^\w\-]+/g, "_").slice(0, 40);
    doc.save(`documento_final_${safeName}.pdf`);
  } catch (err) {
    console.error(err);
    alert("Erro ao gerar PDF. Verifique conexão e permissões.");
  }
}


// ===== Eventos =====
document.addEventListener("DOMContentLoaded", () => {
  listenPessoas();

  $("pessoaForm").addEventListener("submit", salvarPessoa);
  $("btnNovo").onclick = resetPessoaForm;
  $("btnExcluir").onclick = excluirPessoa;
  $("pesquisa").addEventListener("input", renderPessoas);

  $("relatorioForm").addEventListener("submit", salvarRelatorio);
  $("btnNovoRelatorio").onclick = resetRelatorioForm;
  $("btnExcluirRelatorio").onclick = excluirRelatorio;
  $("btnExportar").onclick = exportarDocumentoFinal;

  // valores padrão
  $("dataRelatorio").value = todayISO();
});
