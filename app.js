/* app.js — telas e interação. Só fala com o backend através de `DB` (storage.js). */

import { DB, Auth } from "./storage.js";

const appEl = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const toastRoot = document.getElementById("toast-root");
const topbarSub = document.getElementById("topbar-sub");

const TAB_LABELS = {
  ingredientes: "Cadastro de ingredientes e embalagens",
  receitas: "Suas receitas e o custo de cada uma",
  resumo: "Custo e lucro de todas as receitas",
  orcamentos: "Pedidos e orçamentos de clientes",
  balanco: "Visão geral de todos os pedidos",
};

let state = { tab: "ingredientes" };

// ---------------- utilidades ----------------
function fmtMoney(n) {
  n = Number(n) || 0;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtPct(n) {
  return `${(Number(n) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
function fmtDate(d) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y) return d;
  return `${day}/${m}/${y}`;
}
function fmtQtd(n, unidade) {
  const rounded = Math.round((Number(n) || 0) * 100) / 100;
  return `${rounded.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unidade || ""}`.trim();
}
function linkify(escapedText) {
  const urlRegex = /((https?:\/\/|www\.)[^\s<]+)/g;
  return escapedText.replace(urlRegex, (match) => {
    const href = match.startsWith("http") ? match : `https://${match}`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:var(--cherry-dark);text-decoration:underline;word-break:break-all">${match}</a>`;
  });
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  toastRoot.innerHTML = "";
  toastRoot.appendChild(el);
  setTimeout(() => { el.remove(); }, 2200);
}
function closeModal() { modalRoot.innerHTML = ""; }
function openModal(innerHTML, onMount) {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal-sheet">${innerHTML}</div></div>`;
  document.getElementById("modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  });
  if (onMount) onMount();
}

// ---------------- navegação ----------------
document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => { state.tab = btn.dataset.tab; render(); });
});

document.getElementById("btn-menu").addEventListener("click", openMenu);

function openMenu() {
  openModal(`
    <h2 class="modal-title">Mais opções</h2>
    <div class="menu-sheet">
      <div class="card" id="opt-export"><div class="card-title">⬇️ Exportar backup (.json)</div><div class="card-meta">Salva uma cópia de tudo no seu celular</div></div>
      <div class="card" id="opt-import"><div class="card-title">⬆️ Importar backup (.json)</div><div class="card-meta">Restaura dados de um arquivo salvo antes</div></div>
      <div class="card" id="opt-about"><div class="card-title">ℹ️ Sobre este app</div><div class="card-meta">Como os dados são guardados</div></div>
      <div class="card" id="opt-logout"><div class="card-title">🚪 Sair da conta</div><div class="card-meta">${esc(Auth.currentUser()?.email ?? "")}</div></div>
    </div>
    <input type="file" id="import-file" accept="application/json" style="display:none">
  `, () => {
    document.getElementById("opt-export").onclick = async () => {
      const dump = await DB.exportarTudo();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url; a.download = `backup-doces-${stamp}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      closeModal();
      toast("Backup exportado");
    };
    document.getElementById("opt-import").onclick = () => document.getElementById("import-file").click();
    document.getElementById("import-file").onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const dump = JSON.parse(text);
        await DB.importarTudo(dump);
        closeModal();
        toast("Backup importado");
        render();
      } catch (err) {
        toast("Arquivo inválido");
      }
    };
    document.getElementById("opt-about").onclick = () => {
      openModal(`
        <h2 class="modal-title">Sobre este app</h2>
        <p>Este é o banco de dados único da La Cerise: tudo que qualquer pessoa da equipe cadastra —
        ingredientes, receitas ou orçamentos — fica visível e editável para todos que têm login. Novas
        contas são criadas manualmente pelo administrador direto no Firebase, não existe autocadastro.</p>
        <div class="modal-actions"><button class="btn btn-primary btn-block" id="close-about">Entendi</button></div>
      `, () => { document.getElementById("close-about").onclick = closeModal; });
    };
    document.getElementById("opt-logout").onclick = async () => {
      closeModal();
      await Auth.logout();
    };
  });
}

// ---------------- render raiz ----------------
async function render() {
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
  topbarSub.textContent = TAB_LABELS[state.tab];
  appEl.innerHTML = `<div class="empty">Carregando...</div>`;
  const renderers = {
    ingredientes: renderIngredientes,
    receitas: renderReceitas,
    resumo: renderResumo,
    orcamentos: renderOrcamentos,
    balanco: renderBalanco,
  };
  await renderers[state.tab]();
}

/* =========================================================
   INGREDIENTES
   ========================================================= */
async function renderIngredientes() {
  const lista = await DB.ingredientes.list();
  lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  let html = `<h2 class="section-title">Ingredientes</h2><p class="section-sub">Produtos e embalagens usados nas receitas</p>`;
  if (lista.length === 0) {
    html += `<div class="empty"><span class="emoji">🧺</span>Nenhum ingrediente cadastrado ainda.<br>Toque em + para adicionar o primeiro.</div>`;
  } else {
    for (const ing of lista) {
      html += `
        <div class="card">
          <div class="card-row">
            <div>
              <div class="card-title">${esc(ing.nome)}</div>
              <div class="card-meta">${esc(ing.quantidade)} ${esc(ing.unidade)} por pacote ${ing.obs ? "· " + esc(ing.obs) : ""}</div>
            </div>
            <div class="card-value">${fmtMoney(ing.preco)}</div>
          </div>
          <div class="card-actions">
            <button class="btn btn-ghost btn-sm" data-edit="${ing.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-del="${ing.id}">Excluir</button>
          </div>
        </div>`;
    }
  }
  appEl.innerHTML = html + `<button class="fab" id="fab-add" aria-label="Adicionar ingrediente">+</button>`;

  document.getElementById("fab-add").onclick = () => formIngrediente();
  appEl.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => formIngrediente(await DB.ingredientes.get(b.dataset.edit)));
  appEl.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => confirmDelete("ingrediente", async () => {
    await DB.ingredientes.remove(b.dataset.del); render();
  }));
}

function formIngrediente(existing) {
  const isEdit = !!existing;
  openModal(`
    <h2 class="modal-title">${isEdit ? "Editar" : "Novo"} ingrediente</h2>
    <div class="field"><label>Nome do produto</label><input id="f-nome" value="${esc(existing?.nome ?? "")}" placeholder="Ex: Leite Condensado"></div>
    <div class="field-row">
      <div class="field"><label>Quantidade do pacote</label><input id="f-qtd" type="number" step="any" value="${existing?.quantidade ?? ""}" placeholder="395"></div>
      <div class="field"><label>Unidade</label>
        <select id="f-unidade">
          ${["un","kg","g","l","ml"].map(u => `<option value="${u}" ${existing?.unidade===u?"selected":""}>${u}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="field"><label>Preço do pacote (R$)</label><input id="f-preco" type="number" step="any" value="${existing?.preco ?? ""}" placeholder="6.50"></div>
    <div class="field"><label>Observações (opcional)</label><input id="f-obs" value="${esc(existing?.obs ?? "")}" placeholder="Ex: lata, embalagem..."></div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="f-cancel">Cancelar</button>
      <button class="btn btn-primary" id="f-save">Salvar</button>
    </div>
  `, () => {
    document.getElementById("f-cancel").onclick = closeModal;
    document.getElementById("f-save").onclick = async () => {
      const nome = document.getElementById("f-nome").value.trim();
      if (!nome) { toast("Informe o nome do produto"); return; }
      const payload = {
        nome,
        quantidade: parseFloat(document.getElementById("f-qtd").value) || 0,
        unidade: document.getElementById("f-unidade").value,
        preco: parseFloat(document.getElementById("f-preco").value) || 0,
        obs: document.getElementById("f-obs").value.trim(),
      };
      if (isEdit) await DB.ingredientes.update(existing.id, payload);
      else await DB.ingredientes.create(payload);
      closeModal(); toast("Ingrediente salvo"); render();
    };
  });
}

/* =========================================================
   RECEITAS
   ========================================================= */
async function renderReceitas() {
  const lista = await DB.receitas.list();
  let html = `<h2 class="section-title">Receitas</h2><p class="section-sub">Toque em "Ver" para abrir o modo de preparo, sem valores</p>`;
  if (lista.length === 0) {
    html += `<div class="empty"><span class="emoji">📖</span>Nenhuma receita cadastrada ainda.<br>Cadastre os ingredientes primeiro, depois toque em + aqui.</div>`;
  } else {
    for (const r of lista) {
      const calc = await DB.custoReceita(r);
      const cls = calc.lucroPorcao >= 0 ? "profit-positive" : "profit-negative";
      html += `
        <div class="card">
          <div class="card-row">
            <div>
              <div class="card-title">${esc(r.nome)}</div>
              <div class="card-meta">${calc.porcoes || 0} porções · custo/porção ${fmtMoney(calc.custoPorcao)}</div>
            </div>
            <div class="card-value">${fmtMoney(calc.custoTotal)}</div>
          </div>
          <div class="card-meta" style="margin-top:6px">Lucro por porção: <strong class="${cls}">${fmtMoney(calc.lucroPorcao)}</strong></div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" data-view="${r.id}">Ver receita</button>
            <button class="btn btn-ghost btn-sm" data-edit="${r.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-del="${r.id}">Excluir</button>
          </div>
        </div>`;
    }
  }
  appEl.innerHTML = html + `<button class="fab" id="fab-add" aria-label="Adicionar receita">+</button>`;

  document.getElementById("fab-add").onclick = async () => formReceita();
  appEl.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => viewReceita(b.dataset.view));
  appEl.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => formReceita(await DB.receitas.get(b.dataset.edit)));
  appEl.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => confirmDelete("receita", async () => {
    await DB.receitas.remove(b.dataset.del); render();
  }));
}

async function viewReceita(id) {
  const r = await DB.receitas.get(id);
  if (!r) { toast("Receita não encontrada"); return; }
  const todosIngredientes = await DB.ingredientes.list();
  const linhas = (r.itens || []).map((it) => {
    const ing = todosIngredientes.find((i) => i.id === it.ingredienteId);
    const qtd = ing ? (Number(ing.quantidade) || 0) * (Number(it.percentual) || 0) / 100 : 0;
    return { nome: ing ? ing.nome : "(ingrediente removido)", qtd, unidade: ing ? ing.unidade : "" };
  });

  openModal(`
    <h2 class="modal-title">${esc(r.nome)}</h2>
    <p class="card-meta">${r.porcoes ? `${r.porcoes} porções` : ""}${r.tempoPreparo ? ` · ${esc(r.tempoPreparo)}` : ""}</p>

    <div class="card" style="margin-top:12px">
      <div class="card-title" style="margin-bottom:8px">Ingredientes</div>
      ${linhas.length
        ? linhas.map((l) => `<div class="card-row" style="padding:4px 0"><span>${esc(l.nome)}</span><strong>${fmtQtd(l.qtd, l.unidade)}</strong></div>`).join("")
        : `<p class="card-meta">Nenhum ingrediente cadastrado nesta receita.</p>`}
    </div>

    ${r.modoPreparo ? `
    <div class="card" style="margin-top:10px">
      <div class="card-title" style="margin-bottom:8px">Modo de preparo</div>
      <div style="white-space:pre-wrap;font-size:0.92rem;line-height:1.55">${linkify(esc(r.modoPreparo))}</div>
    </div>` : ""}

    <div class="modal-actions">
      <button class="btn btn-primary btn-block" id="view-close">Fechar</button>
    </div>
  `, () => { document.getElementById("view-close").onclick = closeModal; });
}

async function formReceita(existing) {
  const isEdit = !!existing;
  const ingredientes = (await DB.ingredientes.list()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (ingredientes.length === 0) {
    toast("Cadastre ao menos um ingrediente primeiro");
    return;
  }
  const itensIniciais = existing?.itens?.length ? existing.itens : [{ ingredienteId: "", percentual: "" }];

  function lineHTML(item, idx) {
    const options = ingredientes.map((i) => `<option value="${i.id}" ${item.ingredienteId === i.id ? "selected" : ""}>${esc(i.nome)}</option>`).join("");
    return `
      <div class="item-line" data-line="${idx}">
        <select class="line-ing"><option value="">Selecione...</option>${options}</select>
        <input class="line-pct" type="number" step="any" placeholder="% usado" value="${item.percentual ?? ""}">
        <span class="line-qtd-hint"></span>
        <button type="button" class="remove-line" title="Remover">✕</button>
      </div>`;
  }

  openModal(`
    <h2 class="modal-title">${isEdit ? "Editar" : "Nova"} receita</h2>
    <div class="field"><label>Nome da receita</label><input id="f-nome" value="${esc(existing?.nome ?? "")}" placeholder="Ex: Brigadeiro Gourmet"></div>

    <label style="font-size:0.78rem;font-weight:600;color:var(--cherry-dark)">Ingredientes usados</label>
    <p class="section-sub" style="margin:2px 0 6px">Informe o % do pacote usado — a quantidade aparece calculada ao lado</p>
    <div id="lines" style="margin-top:6px">${itensIniciais.map(lineHTML).join("")}</div>
    <button type="button" class="btn btn-secondary btn-sm" id="add-line" style="margin-bottom:12px">+ ingrediente</button>

    <div class="field"><label>Custo do preparo (mão de obra, gás, energia — R$)</label><input id="f-preparo" type="number" step="any" value="${existing?.custoPreparo ?? 0}"></div>
    <div class="field-row">
      <div class="field"><label>Porções que rende</label><input id="f-porcoes" type="number" step="any" value="${existing?.porcoes ?? ""}"></div>
      <div class="field"><label>Preço de venda/unid. (R$)</label><input id="f-venda" type="number" step="any" value="${existing?.precoVenda ?? ""}"></div>
    </div>
    <div class="field"><label>Tempo de preparo</label><input id="f-tempo" value="${esc(existing?.tempoPreparo ?? "")}" placeholder="Ex: 45 minutos"></div>
    <div class="field"><label>Modo de preparo</label><textarea id="f-modo" placeholder="Passo a passo... (links colados aqui ficam clicáveis na visualização)">${esc(existing?.modoPreparo ?? "")}</textarea></div>

    <div class="card" id="preview-card" style="background:var(--cream-deep)">
      <div class="card-row"><span>Custo total estimado</span><strong id="preview-total">R$ 0,00</strong></div>
      <div class="card-row"><span>Custo por porção</span><strong id="preview-porcao">R$ 0,00</strong></div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="f-cancel">Cancelar</button>
      <button class="btn btn-primary" id="f-save">Salvar</button>
    </div>
  `, () => {
    const linesEl = document.getElementById("lines");

    function refreshLineHint(line) {
      const ing = ingredientes.find((i) => i.id === line.querySelector(".line-ing").value);
      const pct = parseFloat(line.querySelector(".line-pct").value) || 0;
      const hint = line.querySelector(".line-qtd-hint");
      hint.textContent = ing ? fmtQtd((Number(ing.quantidade) || 0) * pct / 100, ing.unidade) : "";
    }
    function bindLineEvents() {
      linesEl.querySelectorAll(".remove-line").forEach((btn) => {
        btn.onclick = () => { btn.closest(".item-line").remove(); updatePreview(); };
      });
      linesEl.querySelectorAll(".item-line").forEach((line) => {
        line.querySelectorAll(".line-ing, .line-pct").forEach((el) => {
          el.oninput = () => { refreshLineHint(line); updatePreview(); };
        });
        refreshLineHint(line);
      });
    }
    function updatePreview() {
      let custoIng = 0;
      linesEl.querySelectorAll(".item-line").forEach((line) => {
        const id = line.querySelector(".line-ing").value;
        const pct = parseFloat(line.querySelector(".line-pct").value) || 0;
        const ing = ingredientes.find((i) => i.id === id);
        if (ing) custoIng += (ing.preco || 0) * pct / 100;
      });
      const preparo = parseFloat(document.getElementById("f-preparo").value) || 0;
      const total = custoIng + preparo;
      const porcoes = parseFloat(document.getElementById("f-porcoes").value) || 0;
      document.getElementById("preview-total").textContent = fmtMoney(total);
      document.getElementById("preview-porcao").textContent = fmtMoney(porcoes > 0 ? total / porcoes : 0);
    }
    document.getElementById("add-line").onclick = () => {
      const idx = linesEl.children.length;
      linesEl.insertAdjacentHTML("beforeend", lineHTML({ ingredienteId: "", percentual: "" }, idx));
      bindLineEvents();
    };
    document.getElementById("f-preparo").oninput = updatePreview;
    document.getElementById("f-porcoes").oninput = updatePreview;
    bindLineEvents();
    updatePreview();

    document.getElementById("f-cancel").onclick = closeModal;
    document.getElementById("f-save").onclick = async () => {
      const nome = document.getElementById("f-nome").value.trim();
      if (!nome) { toast("Informe o nome da receita"); return; }
      const itens = [...linesEl.querySelectorAll(".item-line")]
        .map((line) => ({
          ingredienteId: line.querySelector(".line-ing").value,
          percentual: parseFloat(line.querySelector(".line-pct").value) || 0,
        }))
        .filter((i) => i.ingredienteId);
      const payload = {
        nome,
        itens,
        custoPreparo: parseFloat(document.getElementById("f-preparo").value) || 0,
        porcoes: parseFloat(document.getElementById("f-porcoes").value) || 0,
        precoVenda: parseFloat(document.getElementById("f-venda").value) || 0,
        tempoPreparo: document.getElementById("f-tempo").value.trim(),
        modoPreparo: document.getElementById("f-modo").value.trim(),
      };
      if (isEdit) await DB.receitas.update(existing.id, payload);
      else await DB.receitas.create(payload);
      closeModal(); toast("Receita salva"); render();
    };
  });
}

/* =========================================================
   RESUMO DE CUSTOS
   ========================================================= */
async function renderResumo() {
  const linhas = await DB.resumoCustos();
  let html = `<h2 class="section-title">Resumo de custos</h2><p class="section-sub">Gerado automaticamente a partir das receitas</p>`;

  if (linhas.length === 0) {
    html += `<div class="empty"><span class="emoji">📊</span>Cadastre receitas para ver o resumo aqui.</div>`;
  } else {
    const maisLucrativa = [...linhas].sort((a, b) => b.lucroPorcao - a.lucroPorcao)[0];
    html += `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Receitas cadastradas</div><div class="value">${linhas.length}</div></div>
        <div class="stat-card"><div class="label">Mais lucrativa</div><div class="value" style="font-size:0.95rem">${esc(maisLucrativa.nome)}</div></div>
      </div>
      <div class="table-wrap"><table class="mini">
        <thead><tr><th>Receita</th><th>Custo total</th><th>Porções</th><th>Custo/porção</th><th>Venda/unid.</th><th>Lucro/porção</th></tr></thead>
        <tbody>
        ${linhas.map((l) => `
          <tr>
            <td>${esc(l.nome)}</td>
            <td>${fmtMoney(l.custoTotal)}</td>
            <td>${l.porcoes}</td>
            <td>${fmtMoney(l.custoPorcao)}</td>
            <td>${fmtMoney(l.precoVenda)}</td>
            <td class="${l.lucroPorcao >= 0 ? "profit-positive" : "profit-negative"}">${fmtMoney(l.lucroPorcao)}</td>
          </tr>`).join("")}
        </tbody>
      </table></div>`;
  }
  appEl.innerHTML = html;
}

/* =========================================================
   ORÇAMENTOS
   ========================================================= */
const STATUS_OPTS = ["Online", "Aprovando", "Preparar", "Pronto", "Enviando", "Entregue"];

async function renderOrcamentos() {
  const lista = await DB.orcamentos.list();
  lista.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  let html = `<h2 class="section-title">Orçamentos</h2><p class="section-sub">Pedidos de clientes</p>`;

  if (lista.length === 0) {
    html += `<div class="empty"><span class="emoji">🧾</span>Nenhum orçamento ainda.<br>Cadastre receitas primeiro, depois toque em + aqui.</div>`;
  } else {
    for (const o of lista) {
      const calc = await DB.custoOrcamento(o);
      const statusClass = "status-" + (o.status || "online").toLowerCase();
      const saldoCls = calc.saldoDevedor > 0.005 ? "profit-negative" : "profit-positive";
      html += `
        <div class="card">
          <div class="card-row">
            <div>
              <div class="card-title">${esc(o.cliente || "(sem nome)")}</div>
              <div class="card-meta">${fmtDate(o.data)}</div>
            </div>
            <span class="pill ${statusClass}">${esc(o.status || "Online")}</span>
          </div>
          <div class="card-row" style="margin-top:8px">
            <span class="card-meta">Total ${fmtMoney(calc.vendaTotal)}</span>
            <span class="card-value" style="font-size:0.95rem">Lucro ${fmtMoney(calc.lucro)}</span>
          </div>
          <div class="card-row" style="margin-top:2px">
            <span class="card-meta">Pago ${fmtMoney(calc.valorPago)}</span>
            <span class="${saldoCls}" style="font-size:0.85rem;font-weight:600">Falta ${fmtMoney(calc.saldoDevedor)}</span>
          </div>
          <div class="card-actions">
            <button class="btn btn-secondary btn-sm" data-view="${o.id}">Ver resumo</button>
            <button class="btn btn-ghost btn-sm" data-edit="${o.id}">Editar</button>
            <button class="btn btn-danger btn-sm" data-del="${o.id}">Excluir</button>
          </div>
        </div>`;
    }
  }
  appEl.innerHTML = html + `<button class="fab" id="fab-add" aria-label="Adicionar orçamento">+</button>`;

  document.getElementById("fab-add").onclick = () => formOrcamento();
  appEl.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => viewOrcamento(b.dataset.view));
  appEl.querySelectorAll("[data-edit]").forEach((b) => b.onclick = async () => formOrcamento(await DB.orcamentos.get(b.dataset.edit)));
  appEl.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => confirmDelete("orçamento", async () => {
    await DB.orcamentos.remove(b.dataset.del); render();
  }));
}

async function formOrcamento(existing) {
  const isEdit = !!existing;
  const receitas = (await DB.receitas.list()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (receitas.length === 0) {
    toast("Cadastre ao menos uma receita primeiro");
    return;
  }
  const itensIniciais = existing?.itens?.length ? existing.itens : [{ receitaId: "", quantidade: "" }];

  function lineHTML(item) {
    const options = receitas.map((r) => `<option value="${r.id}" ${item.receitaId === r.id ? "selected" : ""}>${esc(r.nome)}</option>`).join("");
    return `
      <div class="item-line">
        <select class="line-receita"><option value="">Selecione...</option>${options}</select>
        <input class="line-qtd" type="number" step="any" placeholder="Qtd" value="${item.quantidade ?? ""}">
        <button type="button" class="remove-line" title="Remover">✕</button>
      </div>`;
  }

  openModal(`
    <h2 class="modal-title">${isEdit ? "Editar" : "Novo"} orçamento</h2>
    <div class="field"><label>Cliente</label><input id="f-cliente" value="${esc(existing?.cliente ?? "")}"></div>
    <div class="field"><label>Endereço</label><input id="f-endereco" value="${esc(existing?.endereco ?? "")}"></div>
    <div class="field-row">
      <div class="field"><label>Telefone</label><input id="f-telefone" value="${esc(existing?.telefone ?? "")}"></div>
      <div class="field"><label>Data</label><input id="f-data" type="date" value="${existing?.data ?? new Date().toISOString().slice(0,10)}"></div>
    </div>
    <div class="field"><label>Status do pedido</label>
      <select id="f-status">${STATUS_OPTS.map(s => `<option ${(existing?.status ?? "Online")===s?"selected":""}>${s}</option>`).join("")}</select>
    </div>

    <label style="font-size:0.78rem;font-weight:600;color:var(--cherry-dark)">Itens do pedido</label>
    <div id="lines" style="margin-top:6px">${itensIniciais.map(lineHTML).join("")}</div>
    <button type="button" class="btn btn-secondary btn-sm" id="add-line" style="margin-bottom:12px">+ item</button>

    <div class="field-row">
      <div class="field"><label>Custo de embalagem (R$)</label><input id="f-embalagem" type="number" step="any" value="${existing?.custoEmbalagem ?? 0}"></div>
      <div class="field"><label>Custo de frete (R$)</label><input id="f-frete" type="number" step="any" value="${existing?.custoFrete ?? 0}"></div>
    </div>
    <div class="field"><label>Valor já pago (R$)</label><input id="f-pago" type="number" step="any" value="${existing?.valorPago ?? 0}"></div>
    <div class="field"><label>Observações</label><textarea id="f-obs" placeholder="Detalhes do pedido, restrições, combinados...">${esc(existing?.observacoes ?? "")}</textarea></div>

    <div class="card" id="preview-card" style="background:var(--cream-deep)">
      <div class="card-row"><span>Custo total</span><strong id="preview-custo">R$ 0,00</strong></div>
      <div class="card-row"><span>Valor total (com frete/embalagem)</span><strong id="preview-venda">R$ 0,00</strong></div>
      <div class="card-row"><span>Lucro</span><strong id="preview-lucro">R$ 0,00</strong></div>
      <div class="card-row"><span>Falta pagar</span><strong id="preview-saldo">R$ 0,00</strong></div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="f-cancel">Cancelar</button>
      <button class="btn btn-primary" id="f-save">Salvar</button>
    </div>
  `, () => {
    const linesEl = document.getElementById("lines");
    function bindLineEvents() {
      linesEl.querySelectorAll(".remove-line").forEach((btn) => { btn.onclick = () => { btn.closest(".item-line").remove(); updatePreview(); }; });
      linesEl.querySelectorAll(".line-receita, .line-qtd").forEach((el) => { el.oninput = updatePreview; });
    }
    async function updatePreview() {
      const resumo = await DB.resumoCustos();
      let custo = 0, venda = 0;
      linesEl.querySelectorAll(".item-line").forEach((line) => {
        const id = line.querySelector(".line-receita").value;
        const qtd = parseFloat(line.querySelector(".line-qtd").value) || 0;
        const r = resumo.find((x) => x.id === id);
        if (r) { custo += r.custoPorcao * qtd; venda += r.precoVenda * qtd; }
      });
      const embalagem = parseFloat(document.getElementById("f-embalagem").value) || 0;
      const frete = parseFloat(document.getElementById("f-frete").value) || 0;
      custo += embalagem + frete;
      venda += embalagem + frete;
      const pago = parseFloat(document.getElementById("f-pago").value) || 0;
      document.getElementById("preview-custo").textContent = fmtMoney(custo);
      document.getElementById("preview-venda").textContent = fmtMoney(venda);
      document.getElementById("preview-lucro").textContent = fmtMoney(venda - custo);
      document.getElementById("preview-saldo").textContent = fmtMoney(venda - pago);
    }
    document.getElementById("add-line").onclick = () => {
      linesEl.insertAdjacentHTML("beforeend", lineHTML({ receitaId: "", quantidade: "" }));
      bindLineEvents();
    };
    document.getElementById("f-embalagem").oninput = updatePreview;
    document.getElementById("f-frete").oninput = updatePreview;
    document.getElementById("f-pago").oninput = updatePreview;
    bindLineEvents();
    updatePreview();

    document.getElementById("f-cancel").onclick = closeModal;
    document.getElementById("f-save").onclick = async () => {
      const cliente = document.getElementById("f-cliente").value.trim();
      if (!cliente) { toast("Informe o nome do cliente"); return; }
      const itens = [...linesEl.querySelectorAll(".item-line")]
        .map((line) => ({
          receitaId: line.querySelector(".line-receita").value,
          quantidade: parseFloat(line.querySelector(".line-qtd").value) || 0,
        }))
        .filter((i) => i.receitaId);
      const payload = {
        cliente,
        endereco: document.getElementById("f-endereco").value.trim(),
        telefone: document.getElementById("f-telefone").value.trim(),
        data: document.getElementById("f-data").value,
        status: document.getElementById("f-status").value,
        itens,
        custoEmbalagem: parseFloat(document.getElementById("f-embalagem").value) || 0,
        custoFrete: parseFloat(document.getElementById("f-frete").value) || 0,
        valorPago: parseFloat(document.getElementById("f-pago").value) || 0,
        observacoes: document.getElementById("f-obs").value.trim(),
      };
      if (isEdit) await DB.orcamentos.update(existing.id, payload);
      else await DB.orcamentos.create(payload);
      closeModal(); toast("Orçamento salvo"); render();
    };
  });
}

async function viewOrcamento(id) {
  const o = await DB.orcamentos.get(id);
  if (!o) { toast("Orçamento não encontrado"); return; }
  const calc = await DB.custoOrcamento(o);
  const saldoCls = calc.saldoDevedor > 0.005 ? "profit-negative" : "profit-positive";

  openModal(`
    <h2 class="modal-title">Resumo do orçamento</h2>
    <div class="card">
      <div class="card-row">
        <div>
          <div class="card-title">${esc(o.cliente || "")}</div>
          <div class="card-meta">${esc(o.endereco || "")}</div>
          <div class="card-meta">${esc(o.telefone || "")}${o.telefone ? " · " : ""}${fmtDate(o.data)}</div>
        </div>
        <span class="pill status-${(o.status||"online").toLowerCase()}">${esc(o.status || "Online")}</span>
      </div>
    </div>

    <div class="card" style="margin-top:10px">
      <div class="card-title" style="margin-bottom:6px">Itens</div>
      ${calc.itensCalc.map((i) => `<div class="card-row" style="padding:4px 0"><span>${esc(i.nome)} × ${i.qtd}</span><strong>${fmtMoney(i.venda)}</strong></div>`).join("") || `<p class="card-meta">Nenhum item</p>`}
      <div class="card-row" style="padding:8px 0 4px;border-top:1px solid var(--line);margin-top:6px"><span>Embalagem + Frete</span><strong>${fmtMoney(calc.embalagem + calc.frete)}</strong></div>
      <div class="card-row" style="padding-top:4px"><span><strong>Valor Total</strong></span><strong>${fmtMoney(calc.vendaTotal)}</strong></div>
      <div class="card-row" style="padding-top:8px"><span>Pago</span><strong>${fmtMoney(calc.valorPago)}</strong></div>
      <div class="card-row"><span>Falta pagar</span><strong class="${saldoCls}">${fmtMoney(calc.saldoDevedor)}</strong></div>
    </div>

    ${o.observacoes ? `<div class="card" style="margin-top:10px"><div class="card-title" style="margin-bottom:6px">Observações</div><div style="white-space:pre-wrap;font-size:0.9rem">${esc(o.observacoes)}</div></div>` : ""}

    <div class="card" style="margin-top:10px;background:var(--cream-deep)">
      <div class="card-row"><span>Custo total (interno)</span><strong>${fmtMoney(calc.custoTotal)}</strong></div>
      <div class="card-row"><span>Lucro (interno)</span><strong>${fmtMoney(calc.lucro)}</strong></div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="view-close">Fechar</button>
      <button class="btn btn-primary" id="gerar-doc">Gerar documento p/ cliente</button>
    </div>
  `, () => {
    document.getElementById("view-close").onclick = closeModal;
    document.getElementById("gerar-doc").onclick = () => gerarDocumentoCliente(o, calc);
  });
}

function gerarDocumentoCliente(o, calc) {
  let printArea = document.getElementById("print-area");
  if (!printArea) {
    printArea = document.createElement("div");
    printArea.id = "print-area";
    document.body.appendChild(printArea);
  }
  printArea.innerHTML = `
    <div class="doc-header">
      <h1>🍒 La Cerise</h1>
      <p>Resumo do pedido</p>
    </div>
    <table class="doc-info">
      <tr><td>Cliente</td><td>${esc(o.cliente || "")}</td></tr>
      <tr><td>Data</td><td>${fmtDate(o.data)}</td></tr>
    </table>
    <table class="doc-items">
      <thead><tr><th>Item</th><th>Qtd</th><th>Valor</th></tr></thead>
      <tbody>
        ${calc.itensCalc.map((i) => `<tr><td>${esc(i.nome)}</td><td>${i.qtd}</td><td>${fmtMoney(i.venda)}</td></tr>`).join("")}
        <tr><td colspan="2">Embalagem / Frete</td><td>${fmtMoney(calc.embalagem + calc.frete)}</td></tr>
      </tbody>
      <tfoot><tr><td colspan="2">Valor Total</td><td>${fmtMoney(calc.vendaTotal)}</td></tr></tfoot>
    </table>
    ${o.observacoes ? `<p class="doc-obs"><strong>Observações:</strong> ${esc(o.observacoes)}</p>` : ""}
    <p class="doc-footer">La Cerise — obrigado pela preferência! 🍒</p>
  `;
  document.body.classList.add("printing");
  window.print();
}
window.addEventListener("afterprint", () => document.body.classList.remove("printing"));

/* =========================================================
   BALANÇO GERAL
   ========================================================= */
async function renderBalanco() {
  const linhas = await DB.balancoGeral();
  let html = `<h2 class="section-title">Balanço geral</h2><p class="section-sub">Todos os orçamentos, gerado automaticamente</p>`;

  if (linhas.length === 0) {
    html += `<div class="empty"><span class="emoji">💰</span>Cadastre orçamentos para ver o balanço aqui.</div>`;
  } else {
    const totalCusto = linhas.reduce((s, l) => s + l.custoTotal, 0);
    const totalVenda = linhas.reduce((s, l) => s + l.vendaTotal, 0);
    const totalLucro = linhas.reduce((s, l) => s + l.lucro, 0);
    const totalRecebido = linhas.reduce((s, l) => s + l.valorPago, 0);
    const totalPendente = linhas.reduce((s, l) => s + l.saldoDevedor, 0);
    html += `
      <div class="stat-grid">
        <div class="stat-card"><div class="label">Total vendido</div><div class="value">${fmtMoney(totalVenda)}</div></div>
        <div class="stat-card"><div class="label">Lucro total</div><div class="value">${fmtMoney(totalLucro)}</div></div>
        <div class="stat-card"><div class="label">Recebido</div><div class="value">${fmtMoney(totalRecebido)}</div></div>
        <div class="stat-card"><div class="label">A receber</div><div class="value">${fmtMoney(totalPendente)}</div></div>
      </div>
      <div class="table-wrap"><table class="mini">
        <thead><tr><th>Data</th><th>Cliente</th><th>Custo</th><th>Venda</th><th>Lucro</th><th>Recebido</th><th>A receber</th><th>Status</th></tr></thead>
        <tbody>
        ${linhas.sort((a,b)=>(b.data||"").localeCompare(a.data||"")).map((l) => `
          <tr>
            <td>${fmtDate(l.data)}</td>
            <td>${esc(l.cliente)}</td>
            <td>${fmtMoney(l.custoTotal)}</td>
            <td>${fmtMoney(l.vendaTotal)}</td>
            <td class="${l.lucro >= 0 ? "profit-positive" : "profit-negative"}">${fmtMoney(l.lucro)}</td>
            <td>${fmtMoney(l.valorPago)}</td>
            <td class="${l.saldoDevedor > 0.005 ? "profit-negative" : "profit-positive"}">${fmtMoney(l.saldoDevedor)}</td>
            <td><span class="pill status-${(l.status||"").toLowerCase()}">${esc(l.status||"")}</span></td>
          </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="2"><strong>Totais</strong></td>
          <td><strong>${fmtMoney(totalCusto)}</strong></td>
          <td><strong>${fmtMoney(totalVenda)}</strong></td>
          <td><strong>${fmtMoney(totalLucro)}</strong></td>
          <td><strong>${fmtMoney(totalRecebido)}</strong></td>
          <td><strong>${fmtMoney(totalPendente)}</strong></td>
          <td></td>
        </tr></tfoot>
      </table></div>`;
  }
  appEl.innerHTML = html;
}

/* =========================================================
   confirmação de exclusão
   ========================================================= */
function confirmDelete(label, onConfirm) {
  openModal(`
    <h2 class="modal-title">Excluir ${label}?</h2>
    <p style="color:var(--ink-soft)">Essa ação não pode ser desfeita.</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="cd-cancel">Cancelar</button>
      <button class="btn btn-danger" id="cd-ok" style="background:var(--danger);color:white">Excluir</button>
    </div>
  `, () => {
    document.getElementById("cd-cancel").onclick = closeModal;
    document.getElementById("cd-ok").onclick = async () => { closeModal(); await onConfirm(); toast("Excluído"); };
  });
}

// ---------------- service worker (offline) ----------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

/* =========================================================
   LOGIN / CADASTRO
   ========================================================= */
const tabbarEl = document.getElementById("tabbar");
const topbarEl = document.querySelector(".topbar");

function showChrome(visible) {
  tabbarEl.style.display = visible ? "flex" : "none";
  topbarEl.style.display = visible ? "flex" : "none";
}

function renderLogin(errorMsg = "") {
  showChrome(false);
  appEl.innerHTML = `
    <div style="max-width:380px;margin:14vh auto 0;text-align:center">
      <div class="brand-mark" style="width:56px;height:56px;font-size:1.8rem;margin:0 auto 14px;background:var(--cherry)">🍒</div>
      <h2 class="display" style="margin-bottom:4px">La Cerise</h2>
      <p class="section-sub" style="margin-bottom:20px">Entre com a conta da equipe</p>
      <div class="field" style="text-align:left"><label>E-mail</label><input id="lg-email" type="email" autocomplete="username"></div>
      <div class="field" style="text-align:left"><label>Senha</label><input id="lg-senha" type="password" autocomplete="current-password"></div>
      ${errorMsg ? `<p style="color:var(--danger);font-size:0.85rem;margin-bottom:10px">${esc(errorMsg)}</p>` : ""}
      <button class="btn btn-primary btn-block" id="lg-submit">Entrar</button>
      <p style="margin-top:16px;font-size:0.8rem;color:var(--ink-soft)">
        Não tem uma conta? Peça para o administrador cadastrar seu e-mail.
      </p>
    </div>`;

  document.getElementById("lg-submit").onclick = async () => {
    const email = document.getElementById("lg-email").value.trim();
    const senha = document.getElementById("lg-senha").value;
    if (!email || !senha) { renderLogin("Preencha e-mail e senha"); return; }
    try {
      await Auth.login(email, senha);
      // o restante acontece em Auth.onChange
    } catch (err) {
      renderLogin(traduzErroFirebase(err));
    }
  };
}

function traduzErroFirebase(err) {
  const code = err?.code || "";
  const mapa = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Não existe conta com esse e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Já existe uma conta com esse e-mail.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  };
  return mapa[code] || "Não foi possível continuar. Tente novamente.";
}

async function ofertarMigracao() {
  const dump = DB.lerDadosLocaisAntigos();
  if (!dump) return;
  openModal(`
    <h2 class="modal-title">Encontramos dados neste celular</h2>
    <p>Antes de usar a nuvem, este app guardava os dados só aqui no aparelho. Encontramos
    ${dump.ingredientes.length} ingrediente(s), ${dump.receitas.length} receita(s) e
    ${dump.orcamentos.length} orçamento(s) salvos localmente. Quer copiá-los para sua conta agora?</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="mig-nao">Ignorar</button>
      <button class="btn btn-primary" id="mig-sim">Importar para a nuvem</button>
    </div>
  `, () => {
    document.getElementById("mig-nao").onclick = closeModal;
    document.getElementById("mig-sim").onclick = async () => {
      closeModal();
      toast("Importando dados...");
      await DB.migrarDadosLocaisParaNuvem(dump);
      toast("Dados importados com sucesso");
      render();
    };
  });
}

// ---------------- start ----------------
showChrome(false);
appEl.innerHTML = `<div class="empty">Carregando...</div>`;
Auth.onChange(async (user) => {
  if (user) {
    showChrome(true);
    await render();
    await ofertarMigracao();
  } else {
    renderLogin();
  }
});
