// Documentos do gabinete (biblioteca)
// Regras:
// - Layout não deve ser alterado: usamos as mesmas classes do projeto
// - Fonte da verdade: Firestore (coleção "documentos")

(function () {
  if (!window.firebaseConfig) return;
  if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);

  const db = firebase.firestore();
  const storage = firebase.storage();

  const els = {
    status: document.getElementById("statusDocs"),
    titulo: document.getElementById("docTitulo"),
    categoria: document.getElementById("docCategoria"),
    arquivo: document.getElementById("docArquivo"),
    btnEnviar: document.getElementById("btnEnviarDoc"),
    btnLimpar: document.getElementById("btnLimparDoc"),
    toggleModelos: document.getElementById("toggleModelos"),
    blocoModelos: document.getElementById("blocoModelos"),
    btnSalvarModeloGabinete: document.getElementById("btnSalvarModeloGabinete"),
    pesquisa: document.getElementById("pesquisaDocs"),
    filtroCategoria: document.getElementById("filtroCategoria"),
    ordenacao: document.getElementById("ordenacaoDocs"),
    lista: document.getElementById("listaDocs"),
    btnPdfLista: document.getElementById("btnGerarPdfLista"),
  };

  let docsCache = [];

  function setStatus(msg, kind) {
    if (!els.status) return;
    els.status.textContent = msg || "";
    els.status.style.color = kind === "err" ? "#ffb3b3" : "";
  }

  function normalize(s) {
    return (s || "").toString().toLowerCase();
  }

  function limparForm() {
    if (els.titulo) els.titulo.value = "";
    if (els.categoria) els.categoria.value = "Modelos";
    if (els.arquivo) els.arquivo.value = "";
  }

  async function uploadDocumento({ file, titulo, categoria }) {
    const safeName = (file.name || "arquivo").replace(/[^a-zA-Z0-9._-]+/g, "_");
    const storagePath = `documentos/${Date.now()}_${safeName}`;

    const ref = storage.ref(storagePath);
    await ref.put(file);
    const downloadUrl = await ref.getDownloadURL();

    const payload = {
      titulo: titulo || file.name,
      categoria: categoria || "Outros",
      filename: file.name,
      storagePath,
      downloadUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection("documentos").add(payload);
  }

  async function deletarDocumento(docItem) {
    const ok = confirm("Excluir este documento da biblioteca?\n\n" + (docItem.titulo || docItem.filename || ""));
    if (!ok) return;

    try {
      // Apaga no Firestore
      await db.collection("documentos").doc(docItem.id).delete();
    } catch (_) {}

    // Tenta apagar no Storage (se existir)
    if (docItem.storagePath) {
      try {
        await storage.ref(docItem.storagePath).delete();
      } catch (_) {
        // Se falhar (permissão ou já apagado), não trava o fluxo
      }
    }
  }

  function renderLista() {
    if (!els.lista) return;
    const q = normalize(els.pesquisa?.value);
    const cat = els.filtroCategoria?.value || "";
    const ord = els.ordenacao?.value || "recentes";

    let arr = docsCache.slice();

    // filtro categoria
    if (cat) arr = arr.filter((d) => (d.categoria || "") === cat);

    // pesquisa
    if (q) {
      arr = arr.filter((d) => {
        const hay = [d.titulo, d.categoria, d.filename].map(normalize).join(" ");
        return hay.includes(q);
      });
    }

    // ordenação
    if (ord === "a-z") {
      arr.sort((a, b) => (a.titulo || "").localeCompare(b.titulo || "", "pt-BR"));
    } else if (ord === "z-a") {
      arr.sort((a, b) => (b.titulo || "").localeCompare(a.titulo || "", "pt-BR"));
    } else {
      // recentes
      arr.sort((a, b) => (b._ts || 0) - (a._ts || 0));
    }

    // modo cards
    els.lista.classList.add("cards-grid");

    if (!arr.length) {
      els.lista.innerHTML = `<div class="hint">Nenhum documento encontrado.</div>`;
      return;
    }

    // Agrupa por categoria (mantém filtro/pesquisa/ordenação)
    const groups = new Map();
    for (const d of arr) {
      const key = (d.categoria || "Outros").trim() || "Outros";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d);
    }

    els.lista.innerHTML = "";

    const orderedCats = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, "pt-BR"));
    for (const catName of orderedCats) {
      const catBox = document.createElement("div");
      catBox.className = "doc-group";

      const h = document.createElement("div");
      h.className = "doc-group-title";
      h.innerHTML = `<span>${catName}</span><span class="badge">${groups.get(catName).length}</span>`;

      const grid = document.createElement("div");
      grid.className = "doc-cards";

      for (const d of groups.get(catName)) {
        const card = document.createElement("div");
        card.className = "doc-card";

        const title = document.createElement("div");
        title.className = "doc-title";
        title.textContent = d.titulo || d.filename || "Documento";

        const dataTxt = d.createdAt ? new Date(d.createdAt).toLocaleString("pt-BR") : "";
        const meta = document.createElement("div");
        meta.className = "doc-meta";
        meta.textContent = [d.filename ? `Arquivo: ${d.filename}` : "", dataTxt ? `Criado: ${dataTxt}` : ""].filter(Boolean).join(" · ");

        const actions = document.createElement("div");
        actions.className = "mini-actions";

        const a = document.createElement("a");
        a.className = "btn btn-ghost";
        a.href = d.downloadUrl || "#";
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = "Abrir";

        const btnDel = document.createElement("button");
        btnDel.className = "btn btn-red";
        btnDel.textContent = "Excluir";
        btnDel.onclick = () => deletarDocumento(d);

        actions.appendChild(a);
        actions.appendChild(btnDel);

        card.appendChild(title);
        if (meta.textContent) card.appendChild(meta);
        card.appendChild(actions);
        grid.appendChild(card);
      }

      catBox.appendChild(h);
      catBox.appendChild(grid);
      els.lista.appendChild(catBox);
    }
  }

  function gerarPdfDaLista() {
    if (!window.jspdf?.jsPDF) {
      alert("Biblioteca de PDF não carregou.");
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    doc.setFontSize(14);
    doc.text("Biblioteca de Documentos", 40, 40);

    const rows = docsCache
      .slice()
      .sort((a, b) => (b._ts || 0) - (a._ts || 0))
      .map((d) => [
        d.titulo || d.filename || "",
        d.categoria || "",
        d.createdAt ? new Date(d.createdAt).toLocaleString("pt-BR") : "",
      ]);

    doc.autoTable({
      head: [["Título", "Categoria", "Criado em"]],
      body: rows,
      startY: 60,
      styles: { fontSize: 9 },
      headStyles: { fontStyle: "bold" },
      margin: { left: 40, right: 40 },
    });

    doc.save("biblioteca-documentos.pdf");
  }

  async function salvarModeloGabineteNaBiblioteca() {
    try {
      setStatus("Salvando modelo na biblioteca...", "ok");

      const resp = await fetch("assets/docs/Gabinete.docx");
      if (!resp.ok) throw new Error("Não foi possível ler o arquivo do modelo.");
      const blob = await resp.blob();
      const file = new File([blob], "Gabinete.docx", { type: blob.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });

      await uploadDocumento({
        file,
        titulo: "Lista de Acompanhamento do Gabinete",
        categoria: "Listas",
      });

      setStatus("Modelo salvo na biblioteca com sucesso.", "ok");
    } catch (e) {
      console.error(e);
      setStatus("Erro ao salvar modelo. Verifique permissões do Storage/Firestore.", "err");
    }
  }

  function bindUI() {
    els.btnLimpar?.addEventListener("click", (e) => {
      e.preventDefault();
      limparForm();
      setStatus("", "ok");
    });

    els.btnEnviar?.addEventListener("click", async (e) => {
      e.preventDefault();
      const file = els.arquivo?.files?.[0];
      if (!file) {
        setStatus("Selecione um arquivo para enviar.", "err");
        return;
      }

      try {
        setStatus("Enviando documento...", "ok");
        await uploadDocumento({
          file,
          titulo: (els.titulo?.value || "").trim(),
          categoria: els.categoria?.value || "Outros",
        });
        limparForm();
        setStatus("Documento enviado com sucesso.", "ok");
      } catch (err) {
        console.error(err);
        setStatus("Erro ao enviar. Verifique permissões do Storage/Firestore.", "err");
      }
    });

    els.pesquisa?.addEventListener("input", renderLista);
    els.filtroCategoria?.addEventListener("change", renderLista);
    els.ordenacao?.addEventListener("change", renderLista);

    els.btnPdfLista?.addEventListener("click", (e) => {
      e.preventDefault();
      gerarPdfDaLista();
    });

    // Bloco fechável "Modelos rápidos"
    els.toggleModelos?.addEventListener("click", (e) => {
      e.preventDefault();
      const open = els.blocoModelos?.style.display !== "none";
      if (els.blocoModelos) els.blocoModelos.style.display = open ? "none" : "block";
      if (els.toggleModelos) els.toggleModelos.textContent = open ? "▸ Modelos rápidos" : "▾ Modelos rápidos";
    });

    els.btnSalvarModeloGabinete?.addEventListener("click", (e) => {
      e.preventDefault();
      salvarModeloGabineteNaBiblioteca();
    });
  }

  function listenDocs() {
    db.collection("documentos").onSnapshot((snap) => {
      const arr = [];
      snap.forEach((d) => {
        const data = d.data() || {};
        const ts = data.createdAt?.toDate ? data.createdAt.toDate().getTime() : 0;
        arr.push({
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
          _ts: ts,
        });
      });
      docsCache = arr;
      renderLista();
    });
  }

  bindUI();
  listenDocs();
})();
