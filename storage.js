/*
 * storage.js — camada de dados
 * ---------------------------------------------------------
 * Todas as telas do app (app.js) só conversam com o objeto `DB`
 * abaixo, e todo método de `DB` é assíncrono (retorna Promise) —
 * mesmo hoje, rodando 100% local com localStorage.
 *
 * Por quê? Quando você quiser migrar para nuvem com múltiplos
 * usuários (Firebase, Supabase, uma API própria...), NENHUMA
 * tela precisa mudar. Você só troca o "motor" aqui dentro:
 * cada função continua recebendo os mesmos parâmetros e
 * devolvendo os mesmos formatos de dado, só que buscando de um
 * servidor em vez do localStorage do navegador.
 *
 * Guia rápido de migração está no final deste arquivo.
 * ---------------------------------------------------------
 */

const DB = (() => {
  const KEYS = {
    ingredientes: "doces_ingredientes",
    receitas: "doces_receitas",
    orcamentos: "doces_orcamentos",
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error("Erro lendo storage", key, e);
      return [];
    }
  }

  function write(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  }

  // ---- fábrica genérica de CRUD por coleção -----------------
  function collection(key) {
    return {
      list: async () => read(key),
      get: async (id) => read(key).find((x) => x.id === id) || null,
      create: async (obj) => {
        const items = read(key);
        const item = { ...obj, id: uid(), criadoEm: new Date().toISOString() };
        items.push(item);
        write(key, items);
        return item;
      },
      update: async (id, patch) => {
        const items = read(key);
        const idx = items.findIndex((x) => x.id === id);
        if (idx === -1) throw new Error("Registro não encontrado");
        items[idx] = { ...items[idx], ...patch };
        write(key, items);
        return items[idx];
      },
      remove: async (id) => {
        const items = read(key).filter((x) => x.id !== id);
        write(key, items);
        return true;
      },
    };
  }

  const ingredientes = collection(KEYS.ingredientes);
  const receitas = collection(KEYS.receitas);
  const orcamentos = collection(KEYS.orcamentos);

  // ---- cálculos derivados (equivalentes às fórmulas do Excel) ----

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
    let custoTotal = 0;
    let vendaTotal = 0;
    const itensCalc = (orcamento.itens || []).map((item) => {
      const r = resumo.find((x) => x.id === item.receitaId);
      const custoUnit = r ? r.custoPorcao : 0;
      const vendaUnit = r ? r.precoVenda : 0;
      const qtd = Number(item.quantidade) || 0;
      const custo = custoUnit * qtd;
      const venda = vendaUnit * qtd;
      custoTotal += custo;
      vendaTotal += venda;
      return { ...item, nome: r ? r.nome : "(receita removida)", custoUnit, vendaUnit, qtd, custo, venda };
    });
    return { itensCalc, custoTotal, vendaTotal, lucro: vendaTotal - custoTotal };
  }

  async function balancoGeral() {
    const lista = await orcamentos.list();
    const linhas = [];
    for (const o of lista) {
      const calc = await custoOrcamento(o);
      linhas.push({
        id: o.id,
        data: o.data,
        cliente: o.cliente,
        status: o.status,
        custoTotal: calc.custoTotal,
        vendaTotal: calc.vendaTotal,
        lucro: calc.lucro,
      });
    }
    return linhas;
  }

  // ---- backup / restauração (útil também antes de migrar) ----
  async function exportarTudo() {
    return {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      ingredientes: await ingredientes.list(),
      receitas: await receitas.list(),
      orcamentos: await orcamentos.list(),
    };
  }

  async function importarTudo(dump) {
    if (dump.ingredientes) write(KEYS.ingredientes, dump.ingredientes);
    if (dump.receitas) write(KEYS.receitas, dump.receitas);
    if (dump.orcamentos) write(KEYS.orcamentos, dump.orcamentos);
  }

  return {
    ingredientes,
    receitas,
    orcamentos,
    custoReceita,
    resumoCustos,
    custoOrcamento,
    balancoGeral,
    exportarTudo,
    importarTudo,
  };
})();

/*
 * ---------------------------------------------------------
 * GUIA DE MIGRAÇÃO PARA NUVEM (multiusuário)
 * ---------------------------------------------------------
 * 1. Escolha um backend: Supabase e Firebase são os mais rápidos
 *    de configurar sem escrever servidor próprio; ambos têm login
 *    de usuários pronto (e-mail/senha, Google etc.) e banco na nuvem.
 *
 * 2. Crie 3 tabelas/coleções: ingredientes, receitas, orcamentos —
 *    mesmos campos que já existem aqui (veja app.js para o formato
 *    exato de cada objeto). Adicione uma coluna `userId` (ou use
 *    "linhas por usuário" nativo do Supabase via RLS) para separar
 *    os dados de cada confeiteira/confeiteiro.
 *
 * 3. Reescreva SOMENTE as funções `collection()` e as de cálculo
 *    acima para chamar a API do backend em vez de localStorage —
 *    por exemplo, `ingredientes.list()` passa a fazer
 *    `supabase.from('ingredientes').select('*').eq('userId', user.id)`
 *    em vez de `read(key)`. A assinatura (parâmetros e retorno)
 *    de cada função continua igual, então nenhuma tela quebra.
 *
 * 4. Adicione uma tela de login simples que preenche `user.id` e
 *    guarda a sessão — o resto do app não muda.
 *
 * 5. Para trabalho offline com sincronização posterior (útil numa
 *    cozinha sem sinal), Supabase e Firebase têm bibliotecas com
 *    cache local + sync automático quando a conexão volta.
 * ---------------------------------------------------------
 */
