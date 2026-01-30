/*
  Formulários (Firebase compat)
  - Builder simples de campos personalizados
  - Respostas vinculadas a uma pessoa cadastrada
  - Mantém layout (reusa as classes do style.css)
*/

const $ = (id) => document.getElementById(id);
const normalize = (s) =>
  (s || "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function makeId() {
  return (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);
}

if (!firebase.apps.length) firebase.initializeApp(window.firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();
const FieldValue = firebase.firestore.FieldValue;

let formularios = [];
let pessoas = [];
let camposDraft = [];

let unsubForms = null;
let unsubPessoas = null;
let unsubRespostas = null;

function setBadge(txt) {
  const el = $("statusForm");
  if (el) el.textContent = txt;
}

function renderCamposBuilder() {
  const box = $("listaCampos");
  const btnExcluir = $("btnExcluirForm");
  if (btnExcluir) btnExcluir.style.display = $("formId")?.value ? "inline-flex" : "none";
  if (!box) return;

  if (!camposDraft.length) {
    box.innerHTML = `<div class="item"><div class="meta">Nenhum campo. Use “Adicionar” para criar campos.</div></div>`;
    return;
  }

  box.innerHTML = "";
  camposDraft.forEach((c, idx) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="title">${c.label || "(sem título)"} <span class="badge">${c.type}</span></div>
      <div class="meta">Obrigatório: ${c.required ? "Sim" : "Não"}${c.type === "select" ? " · Opções: " + (c.options || []).join(", ") : ""}</div>
      <div class="mini-actions">
        <button class="btn btn-ghost" data-act="up" data-idx="${idx}">↑</button>
        <button class="btn btn-ghost" data-act="down" data-idx="${idx}">↓</button>
        <button class="btn btn-ghost" data-act="edit" data-idx="${idx}">Editar</button>
        <button class="btn btn-danger" data-act="del" data-idx="${idx}">Remover</button>
      </div>
    `;
    box.appendChild(div);
  });

  box.querySelectorAll("button[data-act]").forEach((b) => {
    b.onclick = () => {
      const act = b.getAttribute("data-act");
      const idx = Number(b.getAttribute("data-idx"));

      if (act === "up" && idx > 0) {
        [camposDraft[idx - 1], camposDraft[idx]] = [camposDraft[idx], camposDraft[idx - 1]];
      }
      if (act === "down" && idx < camposDraft.length - 1) {
        [camposDraft[idx + 1], camposDraft[idx]] = [camposDraft[idx], camposDraft[idx + 1]];
      }
      if (act === "del") {
        if (confirm("Remover este campo?")) camposDraft.splice(idx, 1);
      }
      if (act === "edit") {
        const c = camposDraft[idx];
        const label = prompt("Título do campo:", c.label || "") ?? "";
        if (!label.trim()) return;
        const required = confirm("Campo obrigatório? (OK = Sim / Cancelar = Não)");
        let options = c.options || [];
        if (c.type === "select") {
          const raw = prompt("Opções separadas por vírgula:", (options || []).join(", ")) ?? "";
          options = raw
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
        }
        camposDraft[idx] = { ...c, label: label.trim(), required, options };
      }

      renderCamposBuilder();
      renderRespostaCampos();
    };
  });
}

function renderListaFormularios() {
  const box = $("listaFormularios");
  if (!box) return;

  const q = normalize($("pesquisaForm")?.value);
  const items = formularios
    .filter((f) => {
      if (!q) return true;
      return normalize(`${f.titulo} ${f.descricao} ${f.ativo}`).includes(q);
    })
    .slice(0, 200);

  box.innerHTML = "";
  if (!items.length) {
    box.innerHTML = `<div class="item"><div class="meta">Nenhum formulário encontrado.</div></div>`;
    return;
  }

  items.forEach((f) => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="title">${f.titulo || "(sem título)"}</div>
      <div class="meta">${f.descricao || ""}<br>Ativo: ${f.ativo === "sim" ? "Sim" : "Não"} · Campos: ${(f.campos || []).length}</div>
      <div class="mini-actions">
        <button class="btn btn-ghost" data-open="${f.id}">Abrir</button>
      </div>
    `;
    box.appendChild(div);
  });

  box.querySelectorAll("button[data-open]").forEach((b) => {
    b.onclick = () => {
      const id = b.getAttribute("data-open");
      const f = formularios.find((x) => x.id === id);
      if (!f) return;

      $("formId").value = f.id;
      $("formTitulo").value = f.titulo || "";
      $("formDescricao").value = f.descricao || "";
      $("formAtivo").value = f.ativo || "sim";
      camposDraft = Array.isArray(f.campos) ? JSON.parse(JSON.stringify(f.campos)) : [];
      setBadge("Editando");
      renderCamposBuilder();
      refreshDropdownFormularios();
      renderRespostaCampos();
    };
  });
}

function refreshDropdownPessoas() {
  const sel = $("respPessoa");
  if (!sel) return;
  sel.innerHTML = `<option value="">Selecione…</option>`;
  pessoas
    .slice()
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
    .forEach((p) => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.nome || "(sem nome)";
      sel.appendChild(opt);
    });
}

function refreshDropdownFormularios() {
  const sel = $("respFormulario");
  if (!sel) return;
  sel.innerHTML = `<option value="">Selecione…</option>`;
  formularios
    .filter((f) => f.ativo === "sim")
    .slice()
    .sort((a, b) => (a.titulo || "").localeCompare(b.titulo || ""))
    .forEach((f) => {
      const opt = document.createElement("option");
      opt.value = f.id;
      opt.textContent = f.titulo || "(sem título)";
      sel.appendChild(opt);
    });
}

function getFormularioSelecionado() {
  const id = $("respFormulario")?.value;
  return formularios.find((f) => f.id === id) || null;
}

function renderRespostaCampos() {
  const box = $("respCampos");
  if (!box) return;

  const form = getFormularioSelecionado();
  if (!form) {
    box.innerHTML = `<div class="hint">Selecione um formulário para ver os campos.</div>`;
    return;
  }

  const campos = Array.isArray(form.campos) ? form.campos : [];
  if (!campos.length) {
    box.innerHTML = `<div class="hint">Este formulário não tem campos.</div>`;
    return;
  }

  box.innerHTML = "";
  campos.forEach((c) => {
    const id = `campo_${c.id}`;
    const wrap = document.createElement("div");
    wrap.style.marginTop = "10px";
    wrap.innerHTML = `<label>${c.label || "Campo"}${c.required ? " *" : ""}</label>`;

    if (c.type === "textarea") {
      const ta = document.createElement("textarea");
      ta.id = id;
      ta.rows = 3;
      ta.placeholder = "Digite aqui...";
      wrap.appendChild(ta);
    } else if (c.type === "date") {
      const inp = document.createElement("input");
      inp.id = id;
      inp.type = "date";
      wrap.appendChild(inp);
    } else if (c.type === "select") {
      const sel = document.createElement("select");
      sel.id = id;
      const o0 = document.createElement("option");
      o0.value = "";
      o0.textContent = "Selecione…";
      sel.appendChild(o0);
      (c.options || []).forEach((opt) => {
        const o = document.createElement("option");
        o.value = opt;
        o.textContent = opt;
        sel.appendChild(o);
      });
      wrap.appendChild(sel);
    } else {
      const inp = document.createElement("input");
      inp.id = id;
      inp.type = "text";
      inp.placeholder = "Digite aqui...";
      wrap.appendChild(inp);
    }

    box.appendChild(wrap);
  });
}

function clearBuilder() {
  $("formId").value = "";
  $("formTitulo").value = "";
  $("formDescricao").value = "";
  $("formAtivo").value = "sim";
  camposDraft = [];
  setBadge("Novo");
  renderCamposBuilder();
}

function clearResposta() {
  const box = $("respCampos");
  if (!box) return;
  box.querySelectorAll("input, textarea, select").forEach((el) => (el.value = ""));
}

async function saveFormulario(ev) {
  ev.preventDefault();

  const titulo = $("formTitulo").value.trim();
  const descricao = $("formDescricao").value.trim();
  const ativo = $("formAtivo").value;
  const id = $("formId").value;

  if (!titulo) {
    alert("Informe um título.");
    return;
  }

  const payload = {
    titulo,
    descricao,
    ativo,
    campos: camposDraft,
    updatedAt: FieldValue.serverTimestamp(),
  };

  try {
    if (id) {
      await db.collection("formularios").doc(id).set(payload, { merge: true });
      setBadge("Salvo");
    } else {
      payload.createdAt = FieldValue.serverTimestamp();
      const ref = await db.collection("formularios").add(payload);
      $("formId").value = ref.id;
      setBadge("Salvo");
    }
  } catch (e) {
    console.error(e);
    alert("Erro ao salvar formulário. Verifique permissões/regras.");
  }
}

async function excluirFormulario() {
  const id = $("formId").value;
  if (!id) return;
  if (!confirm("Excluir este formulário? (As respostas permanecerão salvas)") ) return;
  try {
    await db.collection("formularios").doc(id).delete();
    clearBuilder();
  } catch (e) {
    console.error(e);
    alert("Erro ao excluir.");
  }
}

function addCampo() {
  const tipo = $("novoTipoCampo").value;
  const label = prompt("Título do campo:") || "";
  if (!label.trim()) return;
  const required = confirm("Campo obrigatório? (OK = Sim / Cancelar = Não)");
  let options = [];
  if (tipo === "select") {
    const raw = prompt("Opções separadas por vírgula (ex.: Sim, Não):") || "";
    options = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  }
  camposDraft.push({ id: makeId(), type: tipo, label: label.trim(), required, options });
  renderCamposBuilder();
}

async function salvarResposta(ev) {
  ev.preventDefault();
  const pessoaId = $("respPessoa").value;
  const formId = $("respFormulario").value;
  const form = formularios.find((f) => f.id === formId);
  const pessoa = pessoas.find((p) => p.id === pessoaId);

  if (!pessoaId || !formId) {
    alert("Selecione pessoa e formulário.");
    return;
  }
  if (!form) {
    alert("Formulário inválido.");
    return;
  }

  const respostas = {};
  const campos = Array.isArray(form.campos) ? form.campos : [];
  for (const c of campos) {
    const el = document.getElementById(`campo_${c.id}`);
    const val = (el?.value || "").trim();
    if (c.required && !val) {
      alert(`Preencha o campo obrigatório: ${c.label}`);
      return;
    }
    respostas[c.id] = val;
  }

  try {
    await db.collection("respostas").add({
      formId,
      formTitulo: form.titulo || "",
      pessoaId,
      pessoaNome: pessoa?.nome || "",
      respostas,
      createdAt: FieldValue.serverTimestamp(),
    });
    clearResposta();
    alert("Resposta salva!");
  } catch (e) {
    console.error(e);
    alert("Erro ao salvar resposta.");
  }
}

function renderRespostasRecentes(resps) {
  const box = $("listaRespostas");
  if (!box) return;
  box.innerHTML = "";
  if (!resps.length) {
    box.innerHTML = `<div class="item"><div class="meta">Nenhuma resposta ainda.</div></div>`;
    return;
  }

  resps.forEach((r) => {
    const div = document.createElement("div");
    div.className = "item";
    const when = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString("pt-BR") : "";
    div.innerHTML = `
      <div class="title">${r.formTitulo || "Formulário"}</div>
      <div class="meta">Pessoa: ${r.pessoaNome || "-"} · ${when}</div>
    `;
    box.appendChild(div);
  });
}

function boot() {
  // UI listeners
  $("pesquisaForm")?.addEventListener("input", renderListaFormularios);
  $("btnAddCampo")?.addEventListener("click", addCampo);
  $("btnNovoForm")?.addEventListener("click", clearBuilder);
  $("btnExcluirForm")?.addEventListener("click", excluirFormulario);
  $("formBuilder")?.addEventListener("submit", saveFormulario);

  $("respFormulario")?.addEventListener("change", renderRespostaCampos);
  $("btnLimparResposta")?.addEventListener("click", clearResposta);
  $("formResposta")?.addEventListener("submit", salvarResposta);

  // Firestore listeners
  unsubForms?.();
  unsubForms = db
    .collection("formularios")
    .orderBy("updatedAt", "desc")
    .limit(200)
    .onSnapshot(
      (snap) => {
        formularios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderListaFormularios();
        refreshDropdownFormularios();
        renderRespostaCampos();
      },
      (err) => {
        console.error(err);
        alert("Erro ao carregar formulários.");
      }
    );

  unsubPessoas?.();
  unsubPessoas = db
    .collection("pessoas")
    .orderBy("nome")
    .limit(2000)
    .onSnapshot(
      (snap) => {
        pessoas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        refreshDropdownPessoas();
      },
      (err) => {
        console.error(err);
      }
    );

  unsubRespostas?.();
  unsubRespostas = db
    .collection("respostas")
    .orderBy("createdAt", "desc")
    .limit(30)
    .onSnapshot(
      (snap) => {
        const r = snap.docs.map((d) => d.data());
        renderRespostasRecentes(r);
      },
      (err) => {
        console.error(err);
      }
    );

  clearBuilder();
  renderRespostaCampos();
}

auth.onAuthStateChanged((user) => {
  if (!user) {
    window.location.replace("index.html");
    return;
  }
  boot();
});
