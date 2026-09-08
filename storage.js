/*
 * storage.js — camada de dados (Firebase, banco único compartilhado)
 * ---------------------------------------------------------
 * Todos os dados ficam num só lugar (negocios/la-cerise/...) e
 * qualquer pessoa com login (criado manualmente no Firebase
 * Console) enxerga e edita tudo — ingredientes, receitas e
 * orçamentos são compartilhados entre toda a equipe.
 *
 * O caminho "negocios/la-cerise" foi deixado fixo de propósito:
 * se um dia a empresa quiser separar dados de outra unidade/marca,
 * basta trocar NEGOCIO_ID por um valor dinâmico (ex: escolhido no
 * login) sem mudar mais nada na estrutura.
 * ---------------------------------------------------------
 */

import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const NEGOCIO_ID = "la-cerise";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const dbFirestore = getFirestore(app);

// permite continuar usando o app com internet instável (sincroniza quando voltar)
enableIndexedDbPersistence(dbFirestore).catch(() => {
  // falha silenciosa (ex: várias abas abertas) — o app continua funcionando online
});

// ---------------- autenticação (só login — contas são criadas manualmente no Firebase Console) ----------------
export const Auth = {
  onChange(callback) {
    onAuthStateChanged(auth, callback);
  },
  async login(email, senha) {
    await signInWithEmailAndPassword(auth, email, senha);
  },
  async logout() {
    await signOut(auth);
  },
  currentUser() {
    return auth.currentUser;
  },
};

// ---------------- CRUD genérico por coleção (negocios/la-cerise/<nome>) ----------------
function collectionFactory(nome) {
  const colRef = () => collection(dbFirestore, "negocios", NEGOCIO_ID, nome);
  const docRef = (id) => doc(dbFirestore, "negocios", NEGOCIO_ID, nome, id);
  const autor = () => auth.currentUser?.email || "desconhecido";

  return {
    list: async () => {
      const snap = await getDocs(colRef());
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    get: async (id) => {
      const snap = await getDoc(docRef(id));
      return snap.exists() ? { id: snap.id, ...snap.data() } : null;
    },
    create: async (obj) => {
      const payload = { ...obj, criadoEm: new Date().toISOString(), criadoPor: autor() };
      const ref = await addDoc(colRef(), payload);
      return { id: ref.id, ...payload };
    },
    update: async (id, patch) => {
      await updateDoc(docRef(id), { ...patch, editadoEm: new Date().toISOString(), editadoPor: autor() });
      return { id, ...patch };
    },
    remove: async (id) => {
      await deleteDoc(docRef(id));
      return true;
    },
    // grava um lote de itens já prontos (usado só na migração de dados locais)
    _bulkCreate: async (itens) => {
      for (const item of itens) {
        const { id, ...resto } = item;
        await addDoc(colRef(), { ...resto, criadoPor: autor() });
      }
    },
  };
}

const ingredientes = collectionFactory("ingredientes");
const receitas = collectionFactory("receitas");
const orcamentos = collectionFactory("orcamentos");

// ---------------- cálculos derivados (iguais a antes) ----------------
async function custoReceita(receita) {
  const ings = await ingredientes.list();
  let custoIngredientes = 0;
  for (const item of receita.itens || []) {
    const ing = ings.find((i) => i.id === item.ingredienteId);
    if (!ing) continue;
    custoIngredientes += (Number(ing.preco) || 0) * (Number(item.percentual) || 0) / 100;
  }
  const custoPreparo = Number(receita.custoPreparo) || 0;
  const custoTotal = custoIngredientes + custoPreparo;
  const porcoes = Number(receita.porcoes) || 0;
  const custoPorcao = porcoes > 0 ? custoTotal / porcoes : 0;
  const precoVenda = Number(receita.precoVenda) || 0;
  const lucroPorcao = precoVenda - custoPorcao;
  return { custoIngredientes, custoPreparo, custoTotal, porcoes, custoPorcao, precoVenda, lucroPorcao };
}

async function resumoCustos() {
  const lista = await receitas.list();
  const linhas = [];
  for (const r of lista) {
    const calc = await custoReceita(r);
    linhas.push({ id: r.id, nome: r.nome, ...calc });
  }
  return linhas;
}

async function custoOrcamento(orcamento) {
  const resumo = await resumoCustos();
  let custoItens = 0;
  let vendaItens = 0;
  const itensCalc = (orcamento.itens || []).map((item) => {
    const r = resumo.find((x) => x.id === item.receitaId);
    const custoUnit = r ? r.custoPorcao : 0;
    const vendaUnit = r ? r.precoVenda : 0;
    const qtd = Number(item.quantidade) || 0;
    const custo = custoUnit * qtd;
    const venda = vendaUnit * qtd;
    custoItens += custo;
    vendaItens += venda;
    return { ...item, nome: r ? r.nome : "(receita removida)", custoUnit, vendaUnit, qtd, custo, venda };
  });
  const embalagem = Number(orcamento.custoEmbalagem) || 0;
  const frete = Number(orcamento.custoFrete) || 0;
  // embalagem/frete entram tanto no custo quanto no valor cobrado do cliente
  // (repasse direto) — se quiser ganhar em cima do frete, é só informar um
  // valor de frete maior do que o custo real.
  const custoTotal = custoItens + embalagem + frete;
  const vendaTotal = vendaItens + embalagem + frete;
  const lucro = vendaTotal - custoTotal;
  const valorPago = Number(orcamento.valorPago) || 0;
  const saldoDevedor = vendaTotal - valorPago;
  return { itensCalc, custoItens, vendaItens, embalagem, frete, custoTotal, vendaTotal, lucro, valorPago, saldoDevedor };
}

async function balancoGeral() {
  const lista = await orcamentos.list();
  const linhas = [];
  for (const o of lista) {
    const calc = await custoOrcamento(o);
    linhas.push({
      id: o.id, data: o.data, cliente: o.cliente, status: o.status,
      custoTotal: calc.custoTotal, vendaTotal: calc.vendaTotal, lucro: calc.lucro,
      valorPago: calc.valorPago, saldoDevedor: calc.saldoDevedor,
    });
  }
  return linhas;
}

// ---------------- backup manual (continua útil, agora como cópia extra) ----------------
async function exportarTudo() {
  return {
    versao: 2,
    exportadoEm: new Date().toISOString(),
    ingredientes: await ingredientes.list(),
    receitas: await receitas.list(),
    orcamentos: await orcamentos.list(),
  };
}

async function importarTudo(dump) {
  if (dump.ingredientes?.length) await ingredientes._bulkCreate(dump.ingredientes);
  if (dump.receitas?.length) await receitas._bulkCreate(dump.receitas);
  if (dump.orcamentos?.length) await orcamentos._bulkCreate(dump.orcamentos);
}

// ---------------- migração automática dos dados antigos (localStorage) ----------------
const LEGACY_KEYS = { ingredientes: "doces_ingredientes", receitas: "doces_receitas", orcamentos: "doces_orcamentos" };

function lerDadosLocaisAntigos() {
  try {
    const ing = JSON.parse(localStorage.getItem(LEGACY_KEYS.ingredientes) || "[]");
    const rec = JSON.parse(localStorage.getItem(LEGACY_KEYS.receitas) || "[]");
    const orc = JSON.parse(localStorage.getItem(LEGACY_KEYS.orcamentos) || "[]");
    if (ing.length || rec.length || orc.length) return { ingredientes: ing, receitas: rec, orcamentos: orc };
  } catch (e) { /* ignora dado corrompido */ }
  return null;
}

// Ao migrar receitas/orçamentos que referenciam ingredienteId/receitaId antigos
// (gerados pelo localStorage), os ids trocam ao virar documento do Firestore.
// Por isso migramos em ordem e reescrevemos as referências.
async function migrarDadosLocaisParaNuvem(dump) {
  const mapaIngredientes = {};
  for (const ing of dump.ingredientes) {
    const { id: idAntigo, ...resto } = ing;
    const novo = await ingredientes.create(resto);
    mapaIngredientes[idAntigo] = novo.id;
  }
  const mapaReceitas = {};
  for (const rec of dump.receitas) {
    const { id: idAntigo, itens, ...resto } = rec;
    const itensNovos = (itens || []).map((it) => ({ ...it, ingredienteId: mapaIngredientes[it.ingredienteId] || it.ingredienteId }));
    const novo = await receitas.create({ ...resto, itens: itensNovos });
    mapaReceitas[idAntigo] = novo.id;
  }
  for (const orc of dump.orcamentos) {
    const { id: idAntigo, itens, ...resto } = orc;
    const itensNovos = (itens || []).map((it) => ({ ...it, receitaId: mapaReceitas[it.receitaId] || it.receitaId }));
    await orcamentos.create({ ...resto, itens: itensNovos });
  }
  // limpa os dados antigos do navegador para não perguntar de novo
  Object.values(LEGACY_KEYS).forEach((k) => localStorage.removeItem(k));
}

export const DB = {
  ingredientes,
  receitas,
  orcamentos,
  custoReceita,
  resumoCustos,
  custoOrcamento,
  balancoGeral,
  exportarTudo,
  importarTudo,
  lerDadosLocaisAntigos,
  migrarDadosLocaisParaNuvem,
};
