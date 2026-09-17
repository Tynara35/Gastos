// ============ CONSTANTES ============
const KEY = 'gastos-app-v1';

const EMOJIS = ['🏠','🍔','🚗','🏥','🎬','📺','📚','📦','💡','💧','📱','💊','🎵','✈️','🛒','🐶','👕','🎁','⛽','🚌','🏋️','☕','🍕','💳','🧾','🎮','🚿','🧹','💄','🛠️','🎓','💰','🏦','💸','📊'];

const PALETA = [
  '#ef4444','#f97316','#f59e0b','#eab308','#84cc16',
  '#22c55e','#10b981','#14b8a6','#06b6d4','#0ea5e9',
  '#3b82f6','#6366f1','#8b5cf6','#a855f7','#d946ef',
  '#ec4899','#f43f5e','#64748b','#0f172a','#000000'
];

const DEFAULT = {
  categorias: [
    { id: 1, nome: 'Moradia',     icone: '🏠', cor: '#6366f1' },
    { id: 2, nome: 'Alimentação', icone: '🍔', cor: '#f59e0b' },
    { id: 3, nome: 'Transporte',  icone: '🚗', cor: '#10b981' },
    { id: 4, nome: 'Saúde',       icone: '🏥', cor: '#ef4444' },
    { id: 5, nome: 'Lazer',       icone: '🎬', cor: '#a855f7' },
    { id: 6, nome: 'Assinaturas', icone: '📺', cor: '#ec4899' },
    { id: 7, nome: 'Educação',    icone: '📚', cor: '#0ea5e9' },
    { id: 8, nome: 'Outros',      icone: '📦', cor: '#64748b' },
  ],
  fixas: [],
  lancamentos: [],
  rendaPadrao: 0,
  rendasPorMes: {},   // { '2025-09': 4500, '2025-10': 5200 }
  nextId: { fixa: 1, lancamento: 1 }
};

// ============ STORAGE ============
let db = carregar();

function carregar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
    const d = JSON.parse(raw);
    return { ...JSON.parse(JSON.stringify(DEFAULT)), ...d };
  } catch { return JSON.parse(JSON.stringify(DEFAULT)); }
}

function salvar() {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function novoId(tipo) {
  db.nextId[tipo] = (db.nextId[tipo] || 0) + 1;
  salvar();
  return db.nextId[tipo];
}

// ============ UTILS ============
function fmtMoney(n) {
  return (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function hojeISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function mesAtual() { return hojeISO().slice(0, 7); }

function formatMes(ym) {
  const [a, m] = ym.split('-');
  const nomes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${nomes[+m - 1]} ${a}`;
}
function formatDia(iso) {
  const [a, m, d] = iso.split('-');
  const dias = ['dom','seg','ter','qua','qui','sex','sáb'];
  const data = new Date(+a, +m - 1, +d);
  return `${dias[data.getDay()]}, ${d}/${m}`;
}
function mudarMes(ym, delta) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ============ ESTADO ============
let state = {
  tab: 'home',
  mesRef: mesAtual(),
  // form adicionar
  form: { icone: '📦', tipo: 'VARIAVEL', cor: undefined },
  // edição
  editId: null,
  editCor: undefined,
  // categorias
  catEditId: null,
  // fixas
  fxFixaCor: null,
  // relatórios
  relPeriodo: 'mes',
  relMesRef: mesAtual(),
  relAno: new Date().getFullYear(),
  relCategoria: '',
  relTipo: '',
};

// ============ RENDA ============
function rendaDoMes(ym) {
  if (db.rendasPorMes && db.rendasPorMes[ym] !== undefined) return db.rendasPorMes[ym];
  return db.rendaPadrao || 0;
}

// ============ RECORRÊNCIA ============
function calcularParcela(inicioYM, total, mesAlvo) {
  const [ai, mi] = inicioYM.split('-').map(Number);
  const [am, mm] = mesAlvo.split('-').map(Number);
  const diff = (am - ai) * 12 + (mm - mi);
  const atual = diff + 1;
  if (atual < 1 || atual > total) return null;
  return { atual, total };
}

function garantirFixasDoMes(ym) {
  if (!ym) {
    const hoje = new Date();
    ym = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  }
  const hoje = new Date();
  const mesAtualStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  if (ym < mesAtualStr) return;

  let adicionou = false;
  db.fixas.filter(f => f.ativa !== false).forEach(f => {
    const jaTem = db.lancamentos.some(l => l.fixaId === f.id && l.data.startsWith(ym));
    if (jaTem) return;

    let parcelaInfo = null;
    if (f.parcelas && f.parcelas.inicio && f.parcelas.total) {
      parcelaInfo = calcularParcela(f.parcelas.inicio, f.parcelas.total, ym);
      if (!parcelaInfo) return;
    }

    const dia = String(Math.min(f.diaVencimento, 28)).padStart(2, '0');
    db.lancamentos.push({
      id: novoId('lancamento'),
      descricao: f.descricao,
      valor: f.valorPadrao,
      data: `${ym}-${dia}`,
      tipo: 'FIXA',
      categoriaId: f.categoriaId,
      icone: f.icone,
      cor: f.cor || null,
      parcela: parcelaInfo,
      status: 'PENDENTE',
      fixaId: f.id,
    });
    adicionou = true;
  });
  if (adicionou) salvar();
}

// ============ RENDER ============
function render() {
  garantirFixasDoMes(state.mesRef);
  const app = document.getElementById('app');

  if (state.tab === 'home') app.innerHTML = renderHome();
  else if (state.tab === 'add') app.innerHTML = renderAdd();
  else if (state.tab === 'edit') app.innerHTML = renderEdit();
  else if (state.tab === 'rel') app.innerHTML = renderRel();
  else if (state.tab === 'cats') app.innerHTML = state.catEditId ? renderCatEdit(state.catEditId) : renderCats();
  else if (state.tab === 'fixas') app.innerHTML = renderFixas();
  else if (state.tab === 'config') app.innerHTML = renderConfig();

  bindEventos();
  document.querySelectorAll('#nav button').forEach(b => {
    b.classList.toggle('ativo', b.dataset.tab === state.tab);
  });
}

// ============ TELA: HOME ============
function renderHome() {
  const mes = state.mesRef;
  const lancs = db.lancamentos
    .filter(l => l.data.startsWith(mes))
    .sort((a, b) => b.data.localeCompare(a.data));

  const totalFixo = lancs.filter(l => l.tipo === 'FIXA').reduce((s, l) => s + l.valor, 0);
  const totalVar = lancs.filter(l => l.tipo === 'VARIAVEL').reduce((s, l) => s + l.valor, 0);
  const total = totalFixo + totalVar;

  const renda = rendaDoMes(mes);
  const sobra = renda - total;
  const pctUsado = renda > 0 ? (total / renda * 100) : 0;
  const corSobra = sobra >= 0 ? 'var(--verde)' : 'var(--vermelho)';
  const rendaEhPadrao = !(db.rendasPorMes && db.rendasPorMes[mes] !== undefined);

  const byDay = {};
  lancs.forEach(l => { (byDay[l.data] ||= []).push(l); });
  const dias = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

  return `
    <div class="card resumo">
      <div class="mes-nav">
        <button data-action="mes-ant">←</button>
        <strong>${formatMes(mes)}</strong>
        <button data-action="mes-prox">→</button>
      </div>
      <div class="total">${fmtMoney(total)}</div>
      <div class="linha-2">
        <span>🔁 Fixo: ${fmtMoney(totalFixo)}</span>
        <span>📊 Variável: ${fmtMoney(totalVar)}</span>
      </div>

      ${renda > 0 ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--card2);">
          <div style="display:flex;justify-content:space-between;font-size:13px;color:var(--sub);margin-bottom:6px;">
            <span>Renda: ${fmtMoney(renda)}${rendaEhPadrao ? ' <span style="opacity:0.6;">(padrão)</span>' : ''}</span>
            <span>${pctUsado.toFixed(0)}% usado</span>
          </div>
          <div class="barra" style="height:8px;">
            <div style="width:${Math.min(pctUsado, 100)}%;background:${pctUsado > 100 ? 'var(--vermelho)' : pctUsado > 80 ? 'var(--amarelo)' : 'var(--verde)'};"></div>
          </div>
          <div style="margin-top:10px;text-align:center;font-size:14px;color:${corSobra};font-weight:600;">
            ${sobra >= 0 ? '💚 Sobrou ' + fmtMoney(sobra) : '🔴 Estourou ' + fmtMoney(Math.abs(sobra))}
          </div>
        </div>
      ` : `
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--card2);text-align:center;">
          <a href="#" data-action="ir-config" style="font-size:12px;color:var(--primaria);text-decoration:none;">
            💰 Cadastre sua renda em ⚙️ Ajustes
          </a>
        </div>
      `}
    </div>

    ${dias.length === 0 ? '<p class="vazio">Nenhum gasto neste mês ainda.<br>Toque em ➕ para adicionar.</p>' : ''}

    ${dias.map(dia => `
      <div class="dia">
        <div class="dia-header">${formatDia(dia)}</div>
        ${byDay[dia].map(renderItem).join('')}
      </div>
    `).join('')}
  `;
}

function renderItem(l) {
  const cat = db.categorias.find(c => c.id === l.categoriaId);
  const cor = l.cor || cat?.cor || '#64748b';
  const parc = l.parcela ? ` · Parcela ${l.parcela.atual}/${l.parcela.total}` : '';
  return `
    <div class="lanc">
      <span class="icone" style="background:${cor}33;box-shadow:inset 0 0 0 1.5px ${cor}66;">${l.icone}</span>
      <div class="info">
        <div class="desc">${escape(l.descricao)}</div>
        <div class="sub">${cat?.nome || ''} · ${l.tipo === 'FIXA' ? '🔁 Fixo' : '📊 Variável'}${parc}</div>
      </div>
      <div class="valor">${fmtMoney(l.valor)}</div>
      <button class="del" data-action="edit-lanc" data-id="${l.id}">✏️</button>
      <button class="del" data-action="del-lanc" data-id="${l.id}">🗑️</button>
    </div>
  `;
}

// ============ TELA: ADICIONAR ============
function renderAdd() {
  const c = state.form;
  return `
    <div class="card">
      <h2 style="margin-bottom:12px;">Novo gasto</h2>

      <label>Descrição</label>
      <input id="f-desc" type="text" placeholder="Ex: Aluguel, Mercado..." value="${escape(c.descricao || '')}">

      <label>Valor (R$)</label>
      <input id="f-valor" type="number" inputmode="decimal" step="0.01" placeholder="0,00" value="${c.valor || ''}">

      <label>Data</label>
      <input id="f-data" type="date" value="${c.data || hojeISO()}">

      <label>Tipo</label>
      <div class="toggle" id="f-tipo">
        <button data-tipo="VARIAVEL" class="${c.tipo === 'VARIAVEL' ? 'ativo' : ''}">📊 Variável</button>
        <button data-tipo="FIXA" class="${c.tipo === 'FIXA' ? 'ativo' : ''}">🔁 Fixo</button>
      </div>

      <label>Categoria</label>
      <select id="f-cat">
        <option value="">— escolha —</option>
        ${db.categorias.map(cat => `
          <option value="${cat.id}" ${c.categoriaId == cat.id ? 'selected' : ''}>
            ${cat.icone} ${cat.nome}
          </option>
        `).join('')}
      </select>

      <label>Ícone</label>
      <div class="icones-grid" id="f-icones">
        ${EMOJIS.map(e => `<button data-emoji="${e}" class="${c.icone === e ? 'sel' : ''}">${e}</button>`).join('')}
      </div>

      <label>Cor (opcional)</label>
      <p style="font-size:11px;color:var(--sub);margin-bottom:6px;">
        Útil pra diferenciar cartões (ex: Nubank roxo, Inter laranja).
      </p>
      <div id="f-cores" style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px;margin-bottom:8px;">
        <button data-cor="" style="aspect-ratio:1;border-radius:50%;border:3px solid ${!c.cor ? '#fff' : 'transparent'};background:linear-gradient(135deg,#64748b,#334155);cursor:pointer;font-size:10px;color:#fff;display:flex;align-items:center;justify-content:center;">×</button>
        ${PALETA.map(cor => `
          <button data-cor="${cor}" style="aspect-ratio:1;border-radius:50%;border:3px solid ${c.cor === cor ? '#fff' : 'transparent'};background:${cor};cursor:pointer;"></button>
        `).join('')}
      </div>

      <label>Cor personalizada</label>
      <input id="f-cor-custom" type="color" value="${c.cor || '#6366f1'}" style="height:46px;padding:4px;cursor:pointer;">

      <button class="btn-primario" id="btn-salvar">Salvar gasto</button>
    </div>
  `;
}

// ============ TELA: EDITAR ============
function renderEdit() {
  const l = db.lancamentos.find(x => x.id == state.editId);
  if (!l) { state.tab = 'home'; render(); return ''; }

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2>Editar gasto</h2>
        <button id="btn-cancelar" style="background:none;border:none;color:var(--sub);font-size:14px;cursor:pointer;">Cancelar</button>
      </div>

      <label>Descrição</label>
      <input id="e-desc" type="text" value="${escape(l.descricao)}">

      <label>Valor (R$)</label>
      <input id="e-valor" type="number" inputmode="decimal" step="0.01" value="${l.valor}">

      <label>Data</label>
      <input id="e-data" type="date" value="${l.data}">

      <label>Tipo</label>
      <div class="toggle" id="e-tipo">
        <button data-tipo="VARIAVEL" class="${l.tipo === 'VARIAVEL' ? 'ativo' : ''}">📊 Variável</button>
        <button data-tipo="FIXA" class="${l.tipo === 'FIXA' ? 'ativo' : ''}">🔁 Fixo</button>
      </div>

      <label>Categoria</label>
      <select id="e-cat">
        ${db.categorias.map(cat => `
          <option value="${cat.id}" ${cat.id == l.categoriaId ? 'selected' : ''}>
            ${cat.icone} ${cat.nome}
          </option>
        `).join('')}
      </select>

      <label>Ícone</label>
      <div class="icones-grid" id="e-icones">
        ${EMOJIS.map(e => `<button data-emoji="${e}" class="${l.icone === e ? 'sel' : ''}">${e}</button>`).join('')}
      </div>

      <label>Cor (opcional)</label>
      <div id="e-cores" style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px;margin-top:6px;">
        <button data-cor="" style="aspect-ratio:1;border-radius:50%;border:3px solid ${!l.cor ? '#fff' : 'transparent'};background:linear-gradient(135deg,#64748b,#334155);cursor:pointer;font-size:10px;color:#fff;display:flex;align-items:center;justify-content:center;">×</button>
        ${PALETA.map(cor => `
          <button data-cor="${cor}" style="aspect-ratio:1;border-radius:50%;border:3px solid ${l.cor === cor ? '#fff' : 'transparent'};background:${cor};cursor:pointer;"></button>
        `).join('')}
      </div>

      <label>Cor personalizada</label>
      <input id="e-cor-custom" type="color" value="${l.cor || '#6366f1'}" style="height:46px;padding:4px;cursor:pointer;">

      <button class="btn-primario" id="btn-salvar-edit">Salvar alterações</button>
    </div>
  `;
}

// ============ TELA: RELATÓRIOS ============
function renderRel() {
  const filtrados = filtrarRel();
  const total = filtrados.reduce((s, l) => s + l.valor, 0);
  const totalFixo = filtrados.filter(l => l.tipo === 'FIXA').reduce((s, l) => s + l.valor, 0);
  const totalVar = filtrados.filter(l => l.tipo === 'VARIAVEL').reduce((s, l) => s + l.valor, 0);

  const porCat = {};
  filtrados.forEach(l => { porCat[l.categoriaId] = (porCat[l.categoriaId] || 0) + l.valor; });
  const catOrdenadas = Object.entries(porCat).sort((a, b) => b[1] - a[1]);

  return `
    <div class="card">
      <label>Período</label>
      <div class="toggle" id="r-periodo">
        <button data-periodo="mes" class="${state.relPeriodo === 'mes' ? 'ativo' : ''}">Mês</button>
        <button data-periodo="ano" class="${state.relPeriodo === 'ano' ? 'ativo' : ''}">Ano</button>
      </div>

      ${state.relPeriodo === 'mes' ? `
        <label>Mês de referência</label>
        <input type="month" id="r-mes" value="${state.relMesRef}">
      ` : `
        <label>Ano</label>
        <input type="number" id="r-ano" value="${state.relAno}" min="2000" max="2100">
      `}

      <div class="filtros" style="margin-top:12px;">
        <div>
          <label>Categoria</label>
          <select id="r-cat">
            <option value="">Todas</option>
            ${db.categorias.map(c => `
              <option value="${c.id}" ${state.relCategoria == c.id ? 'selected' : ''}>${c.icone} ${c.nome}</option>
            `).join('')}
          </select>
        </div>
        <div>
          <label>Tipo</label>
          <select id="r-tipo">
            <option value="">Todos</option>
            <option value="FIXA" ${state.relTipo === 'FIXA' ? 'selected' : ''}>🔁 Fixo</option>
            <option value="VARIAVEL" ${state.relTipo === 'VARIAVEL' ? 'selected' : ''}>📊 Variável</option>
          </select>
        </div>
      </div>
    </div>

    <div class="card">
      <div style="font-size:26px;font-weight:700;text-align:center;margin-bottom:8px;">
        ${fmtMoney(total)}
      </div>
      <div style="display:flex;justify-content:space-around;font-size:13px;color:var(--sub);">
        <span>🔁 ${fmtMoney(totalFixo)}</span>
        <span>📊 ${fmtMoney(totalVar)}</span>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;">Por categoria</h3>
      ${catOrdenadas.length === 0 ? '<p class="vazio" style="padding:10px;">Sem dados</p>' : ''}
      ${catOrdenadas.map(([id, valor]) => {
        const cat = db.categorias.find(c => c.id == id);
        const pct = total ? (valor / total * 100) : 0;
        return `
          <div class="barra-linha">
            <div class="top">
              <span>${cat?.icone || '📦'} ${cat?.nome || 'Outros'}</span>
              <span>${fmtMoney(valor)} · ${pct.toFixed(0)}%</span>
            </div>
            <div class="barra">
              <div style="width:${pct}%;background:${cat?.cor || '#64748b'};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>

    ${renderTop5(filtrados, total)}
    ${renderDicas(filtrados, total, totalFixo, totalVar)}
  `;
}

function filtrarRel() {
  let lista = db.lancamentos;
  if (state.relPeriodo === 'mes') {
    lista = lista.filter(l => l.data.startsWith(state.relMesRef));
  } else {
    lista = lista.filter(l => l.data.startsWith(String(state.relAno)));
  }
  if (state.relCategoria) lista = lista.filter(l => l.categoriaId == state.relCategoria);
  if (state.relTipo) lista = lista.filter(l => l.tipo === state.relTipo);
  return lista;
}

// ============ TOP 5 ============
function renderTop5(lancs, total) {
  if (lancs.length === 0) return '';

  const porDesc = {};
  lancs.forEach(l => { porDesc[l.descricao] = (porDesc[l.descricao] || 0) + l.valor; });

  const top = Object.entries(porDesc).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maior = top[0]?.[1] || 1;

  return `
    <div class="card">
      <h3 style="margin-bottom:14px;">🔥 Top 5 maiores gastos</h3>
      ${top.map(([nome, valor], i) => {
        const pct = total ? (valor / total * 100) : 0;
        const largura = (valor / maior * 100);
        const medalhas = ['🥇','🥈','🥉','4º','5º'];
        const cores = ['#ef4444','#f97316','#f59e0b','#eab308','#84cc16'];
        return `
          <div class="barra-linha">
            <div class="top">
              <span>${medalhas[i]} ${escape(nome)}</span>
              <span>${fmtMoney(valor)} · ${pct.toFixed(0)}%</span>
            </div>
            <div class="barra">
              <div style="width:${largura}%;background:${cores[i]};"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ============ DICAS ============
function renderDicas(lancs, total, totalFixo, totalVar) {
  if (lancs.length === 0) return '';

  const dicas = [];
  const mesRef = state.relPeriodo === 'mes' ? state.relMesRef : null;
  const renda = mesRef ? rendaDoMes(mesRef) : (db.rendaPadrao || 0);

  if (renda <= 0) {
    dicas.push({
      emoji: '💰', cor: '#0ea5e9',
      titulo: 'Cadastre sua renda',
      texto: 'Sem a renda cadastrada não consigo comparar seus gastos. Vá em ⚙️ Ajustes e informe quanto você recebe.'
    });
  } else {
    const pctUsado = total / renda * 100;
    if (total > renda) {
      dicas.push({
        emoji: '🚨', cor: '#ef4444',
        titulo: 'Você gastou mais do que ganhou',
        texto: `Gastos de ${fmtMoney(total)} contra renda de ${fmtMoney(renda)}. Estourou ${fmtMoney(total - renda)}.`
      });
    } else if (pctUsado > 90) {
      dicas.push({
        emoji: '⚠️', cor: '#f59e0b',
        titulo: 'Quase toda a renda comprometida',
        texto: `Já usou ${pctUsado.toFixed(0)}% da renda. Sobrou apenas ${fmtMoney(renda - total)}.`
      });
    } else if (pctUsado < 70) {
      dicas.push({
        emoji: '🎉', cor: '#10b981',
        titulo: 'Ótimo controle!',
        texto: `Você usou só ${pctUsado.toFixed(0)}% da renda. Considere guardar ${fmtMoney(renda - total)}.`
      });
    }
  }

  if (total > 0) {
    const pctFixo = totalFixo / total * 100;
    if (pctFixo > 60) {
      dicas.push({
        emoji: '🔁', cor: '#8b5cf6',
        titulo: 'Seus gastos fixos estão altos',
        texto: `${pctFixo.toFixed(0)}% dos gastos são fixos. Revise assinaturas, planos e financiamentos — cortar aqui alivia todo mês.`
      });
    }
  }

  const LIMITES = { 'Alimentação': 20, 'Moradia': 30, 'Transporte': 15, 'Lazer': 10, 'Assinaturas': 5, 'Saúde': 10 };
  const porCat = {};
  lancs.forEach(l => { porCat[l.categoriaId] = (porCat[l.categoriaId] || 0) + l.valor; });
  const base = renda > 0 ? renda : total;

  Object.entries(porCat).forEach(([catId, valor]) => {
    const cat = db.categorias.find(c => c.id == catId);
    if (!cat) return;
    const limite = LIMITES[cat.nome];
    if (!limite) return;
    const pct = valor / base * 100;
    if (pct > limite * 1.5) {
      dicas.push({
        emoji: cat.icone, cor: cat.cor,
        titulo: `${cat.nome} muito acima do ideal`,
        texto: `Gastou ${fmtMoney(valor)} (${pct.toFixed(0)}% da ${renda > 0 ? 'renda' : 'total'}). O ideal é até ${limite}%. Economia possível: ${fmtMoney(Math.max(0, valor - base * limite / 100))}.`
      });
    }
  });

  if (renda > 0 && total > 0 && total < renda && (renda - total) < renda * 0.1) {
    dicas.push({
      emoji: '🏦', cor: '#22c55e',
      titulo: 'Sobra muito pequena',
      texto: `Sua sobra foi ${fmtMoney(renda - total)} (menos de 10% da renda). Tente guardar pelo menos 10% todo mês.`
    });
  }

  if (dicas.length === 0 && renda > 0) {
    dicas.push({
      emoji: '✨', cor: '#10b981',
      titulo: 'Tudo em ordem!',
      texto: 'Seus gastos estão dentro do esperado pra sua renda. Continue assim!'
    });
  }

  if (dicas.length === 0) return '';

  return `
    <div class="card">
      <h3 style="margin-bottom:14px;">💡 Dicas de economia</h3>
      ${dicas.map(d => `
        <div class="dica" style="background:${d.cor}15;border-left:3px solid ${d.cor};">
          <span style="font-size:20px;flex-shrink:0;">${d.emoji}</span>
          <div>
            <div style="font-size:13px;font-weight:600;color:${d.cor};margin-bottom:3px;">${d.titulo}</div>
            <div style="font-size:12px;color:var(--texto);line-height:1.5;">${d.escape ? d.escape : d.texto}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// ============ TELA: FIXAS ============
function renderFixas() {
  return `
    <div class="card">
      <h2 style="margin-bottom:12px;">Despesas fixas (recorrentes)</h2>
      <p style="font-size:13px;color:var(--sub);margin-bottom:12px;">
        Cadastre o "molde". O app lança automaticamente todo mês.
      </p>

      <label>Descrição</label>
      <input id="fx-desc" type="text" placeholder="Ex: Aluguel, Netflix...">

      <label>Valor padrão (R$)</label>
      <input id="fx-valor" type="number" inputmode="decimal" step="0.01" placeholder="0,00">

      <label>Dia do vencimento</label>
      <input id="fx-dia" type="number" min="1" max="31" value="5">

      <label>Categoria</label>
      <select id="fx-cat">
        ${db.categorias.map(c => `<option value="${c.id}">${c.icone} ${c.nome}</option>`).join('')}
      </select>

      <label>Ícone</label>
      <div class="icones-grid" id="fx-icones">
        ${EMOJIS.map(e => `<button data-emoji="${e}" class="${e === '🏠' ? 'sel' : ''}">${e}</button>`).join('')}
      </div>

      <label>Cor (opcional)</label>
      <p style="font-size:11px;color:var(--sub);margin-bottom:6px;">
        Útil pra diferenciar cartões (ex: Nubank roxo, Inter laranja).
      </p>
      <div id="fx-cores" style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px;margin-bottom:8px;">
        <button data-cor="" style="aspect-ratio:1;border-radius:50%;border:3px solid #fff;background:linear-gradient(135deg,#64748b,#334155);cursor:pointer;font-size:10px;color:#fff;display:flex;align-items:center;justify-content:center;">×</button>
        ${PALETA.map(cor => `<button data-cor="${cor}" style="aspect-ratio:1;border-radius:50%;border:3px solid transparent;background:${cor};cursor:pointer;"></button>`).join('')}
      </div>

      <label>Cor personalizada</label>
      <input id="fx-cor-custom" type="color" value="#6366f1" style="height:46px;padding:4px;cursor:pointer;">

      <label>Parcelamento (opcional)</label>
      <p style="font-size:11px;color:var(--sub);margin-bottom:6px;">
        Preencha se for empréstimo, financiamento ou compra parcelada.
      </p>
      <input id="fx-parc-inicio" type="month">
      <input id="fx-parc-total" type="number" min="1" placeholder="Total de parcelas (ex: 12)" style="margin-top:6px;">

      <button class="btn-primario" id="btn-add-fixa">Adicionar fixa</button>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;">Cadastradas</h3>
      ${db.fixas.filter(f => f.ativa !== false).length === 0 ? '<p class="vazio" style="padding:10px;">Nenhuma ainda</p>' : ''}
      ${db.fixas.filter(f => f.ativa !== false).map(f => {
        const cat = db.categorias.find(c => c.id == f.categoriaId);
        const cor = f.cor || cat?.cor || '#334155';
        let infoParc = '';
        if (f.parcelas && f.parcelas.inicio && f.parcelas.total) {
          const info = calcularParcela(f.parcelas.inicio, f.parcelas.total, mesAtual());
          if (info) {
            const faltam = info.total - info.atual;
            infoParc = ` · Parcela ${info.atual}/${info.total}` + (faltam > 0 ? ` · faltam ${faltam}` : ' · ÚLTIMA!');
          } else {
            infoParc = ` · encerrado (${f.parcelas.total}/${f.parcelas.total})`;
          }
        }
        return `
          <div class="lanc">
            <span class="icone" style="background:${cor}33;box-shadow:inset 0 0 0 1.5px ${cor}66;">${f.icone}</span>
            <div class="info">
              <div class="desc">${escape(f.descricao)}</div>
              <div class="sub">${cat?.nome || ''} · todo dia ${f.diaVencimento}${infoParc}</div>
            </div>
            <div class="valor">${fmtMoney(f.valorPadrao)}</div>
            <button class="del" data-action="arq-fixa" data-id="${f.id}" title="Arquivar">🔕</button>
            <button class="del" data-action="del-fixa" data-id="${f.id}" title="Excluir tudo">🗑️</button>
          </div>
        `;
      }).join('')}
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;">💾 Backup</h3>
      <p style="font-size:12px;color:var(--sub);margin-bottom:12px;">
        Seus dados ficam salvos só neste aparelho. Faça backup de vez em quando.
      </p>
      <button class="btn-primario" id="btn-export" style="background:var(--verde);margin-top:0;">📤 Exportar JSON</button>
      <button class="btn-primario" id="btn-import" style="background:var(--card2);margin-top:8px;">📥 Importar JSON</button>
      <input type="file" id="file-import" accept=".json,application/json" style="display:none;">
    </div>

    <div class="card" style="border:1px solid #7f1d1d;">
      <h3 style="margin-bottom:8px;color:#fca5a5;">⚠️ Zona de perigo</h3>
      <p style="font-size:12px;color:var(--sub);margin-bottom:12px;">
        Apaga TODOS os dados do app. Não tem volta.
      </p>
      <button class="btn-primario" id="btn-reset" style="background:var(--vermelho);margin-top:0;">🗑️ Apagar tudo e começar do zero</button>
    </div>
  `;
}

// ============ TELA: CATEGORIAS ============
function renderCats() {
  return `
    <div class="card">
      <h2 style="margin-bottom:4px;">🏷️ Categorias</h2>
      <p style="font-size:12px;color:var(--sub);margin-bottom:14px;">
        Toque numa categoria pra mudar nome, ícone e cor.
      </p>

      ${db.categorias.map(c => `
        <div class="cat-linha" data-id="${c.id}" style="
          display:flex;align-items:center;gap:10px;
          padding:10px;border-radius:10px;margin-bottom:6px;
          background:${c.cor}22;cursor:pointer;
        ">
          <span style="
            width:36px;height:36px;border-radius:9px;
            display:flex;align-items:center;justify-content:center;
            font-size:18px;background:${c.cor}55;
          ">${c.icone}</span>
          <strong style="flex:1;">${escape(c.nome)}</strong>
          <span style="font-size:11px;color:var(--sub);">${c.cor}</span>
          <span style="color:var(--sub);">›</span>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCatEdit(id) {
  const c = db.categorias.find(x => x.id == id);
  if (!c) return '';

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2>Editar categoria</h2>
        <button id="cat-cancelar" style="background:none;border:none;color:var(--sub);font-size:14px;cursor:pointer;">Cancelar</button>
      </div>

      <label>Nome</label>
      <input id="cat-nome" type="text" value="${escape(c.nome)}">

      <label>Ícone</label>
      <div class="icones-grid" id="cat-icones">
        ${EMOJIS.map(e => `<button data-emoji="${e}" class="${c.icone === e ? 'sel' : ''}">${e}</button>`).join('')}
      </div>

      <label>Cor</label>
      <div id="cat-cores" style="display:grid;grid-template-columns:repeat(10,1fr);gap:6px;margin-top:6px;">
        ${PALETA.map(cor => `
          <button data-cor="${cor}" style="aspect-ratio:1;border-radius:50%;border:3px solid ${cor === c.cor ? '#fff' : 'transparent'};background:${cor};cursor:pointer;"></button>
        `).join('')}
      </div>

      <label style="margin-top:14px;">Cor personalizada</label>
      <input id="cat-cor-custom" type="color" value="${c.cor}" style="height:46px;padding:4px;cursor:pointer;">

      <div style="margin-top:16px;padding:14px;border-radius:12px;background:${c.cor}22;display:flex;align-items:center;gap:10px;">
        <span id="cat-preview-icone" style="
          width:44px;height:44px;border-radius:11px;
          display:flex;align-items:center;justify-content:center;
          font-size:22px;background:${c.cor}55;
        ">${c.icone}</span>
        <strong id="cat-preview-nome">${escape(c.nome)}</strong>
      </div>

      <button class="btn-primario" id="cat-salvar">Salvar</button>
    </div>
  `;
}

// ============ TELA: CONFIG (Ajustes) ============
function renderConfig() {
  const mes = state.mesRef || mesAtual();
  const rendaMes = db.rendasPorMes?.[mes];
  const temEspecifica = rendaMes !== undefined;

  return `
    <div class="card">
      <h2 style="margin-bottom:12px;">💰 Renda</h2>

      <label>Renda padrão (R$)</label>
      <p style="font-size:11px;color:var(--sub);margin-bottom:6px;">
        Usada em meses que você não cadastrar um valor específico.
      </p>
      <input id="cfg-renda-padrao" type="number" inputmode="decimal" step="0.01"
             value="${db.rendaPadrao || ''}" placeholder="Ex: 3500,00">
      <button class="btn-primario" id="cfg-salvar-padrao" style="margin-top:12px;">Salvar renda padrão</button>
    </div>

    <div class="card">
      <h2 style="margin-bottom:8px;">📅 Renda de um mês específico</h2>
      <p style="font-size:12px;color:var(--sub);margin-bottom:12px;">
        Útil pra autônomos ou meses com renda extra (13º, férias, etc.).
      </p>

      <label>Mês</label>
      <input type="month" id="cfg-mes" value="${mes}">

      <label>Valor (R$)</label>
      <input id="cfg-renda-mes" type="number" inputmode="decimal" step="0.01"
             value="${temEspecifica ? rendaMes : ''}"
             placeholder="${temEspecifica ? '' : 'Deixe vazio para usar a padrão'}">

      <button class="btn-primario" id="cfg-salvar-mes" style="margin-top:12px;">
        ${temEspecifica ? 'Atualizar este mês' : 'Definir para este mês'}
      </button>

      ${temEspecifica ? `
        <button class="btn-primario" id="cfg-remover-mes" style="background:var(--card2);margin-top:8px;">
          Usar renda padrão neste mês
        </button>
      ` : ''}

      ${Object.keys(db.rendasPorMes || {}).length > 0 ? `
        <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--card2);">
          <h3 style="font-size:13px;margin-bottom:10px;">Valores específicos cadastrados</h3>
          ${Object.entries(db.rendasPorMes).sort().map(([ym, v]) => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:13px;">
              <span>${formatMes(ym)}</span>
              <span style="color:var(--verde);font-weight:600;">${fmtMoney(v)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px;">💡 Sobre as dicas</h3>
      <p style="font-size:12px;color:var(--sub);line-height:1.6;">
        As dicas aparecem em 📊 Relatórios, baseadas em quanto você gasta por categoria comparado à sua renda do mês.
      </p>
    </div>
  `;
}

// ============ EVENTOS ============
function bindEventos() {
  // Navegação inferior
  document.querySelectorAll('#nav button').forEach(b => {
    b.onclick = () => {
      state.tab = b.dataset.tab;
      state.catEditId = null;
      render();
    };
  });

  // Navegação de mês na home
  document.querySelectorAll('[data-action="mes-ant"]').forEach(b => b.onclick = () => {
    state.mesRef = mudarMes(state.mesRef, -1); render();
  });
  document.querySelectorAll('[data-action="mes-prox"]').forEach(b => b.onclick = () => {
    state.mesRef = mudarMes(state.mesRef, +1); render();
  });

  document.querySelectorAll('[data-action="ir-config"]').forEach(el => el.onclick = (e) => {
    e.preventDefault();
    state.tab = 'config';
    render();
  });

  // Editar lançamento
  document.querySelectorAll('[data-action="edit-lanc"]').forEach(b => b.onclick = () => {
    state.editId = +b.dataset.id;
    const lanc = db.lancamentos.find(x => x.id == state.editId);
    state.editCor = lanc?.cor || null;
    state.tab = 'edit';
    render();
  });

  // Excluir lançamento
  document.querySelectorAll('[data-action="del-lanc"]').forEach(b => b.onclick = () => {
    if (!confirm('Excluir este gasto?')) return;
    db.lancamentos = db.lancamentos.filter(l => l.id != b.dataset.id);
    salvar(); toast('Excluído'); render();
  });

  // Excluir fixa (com todos os lançamentos)
  document.querySelectorAll('[data-action="del-fixa"]').forEach(b => b.onclick = () => {
    const id = +b.dataset.id;
    const fixa = db.fixas.find(f => f.id === id);
    if (!fixa) return;

    const qtd = db.lancamentos.filter(l => l.fixaId === id).length;
    const msg = qtd > 0
      ? `Excluir a fixa "${fixa.descricao}" e os ${qtd} lançamentos dela em TODOS os meses?\n\nOK = apaga tudo\nCancelar = não faz nada`
      : `Excluir a fixa "${fixa.descricao}"?`;
    if (!confirm(msg)) return;

    db.fixas = db.fixas.filter(f => f.id !== id);
    db.lancamentos = db.lancamentos.filter(l => l.fixaId !== id);
    salvar(); toast('Fixa e lançamentos excluídos'); render();
  });

  // Arquivar fixa
  document.querySelectorAll('[data-action="arq-fixa"]').forEach(b => b.onclick = () => {
    const id = +b.dataset.id;
    const fixa = db.fixas.find(f => f.id === id);
    if (!fixa) return;
    if (!confirm(`Arquivar "${fixa.descricao}"?\n\nEla para de ser lançada nos próximos meses,\nmas os lançamentos já criados continuam.`)) return;
    fixa.ativa = false;
    salvar(); toast('Fixa arquivada'); render();
  });

  // FORM ADICIONAR
  const t = document.getElementById('f-tipo');
  if (t) t.querySelectorAll('button').forEach(b => b.onclick = () => {
    state.form.tipo = b.dataset.tipo; render();
  });
  const ig = document.getElementById('f-icones');
  if (ig) ig.querySelectorAll('button').forEach(b => b.onclick = () => {
    state.form.icone = b.dataset.emoji; render();
  });
  const fc = document.getElementById('f-cores');
  if (fc) fc.querySelectorAll('button').forEach(b => b.onclick = () => {
    state.form.cor = b.dataset.cor || undefined;
    render();
  });
  const fCustom = document.getElementById('f-cor-custom');
  if (fCustom) fCustom.oninput = () => {
    state.form.cor = fCustom.value;
    if (fc) fc.querySelectorAll('button').forEach(x => x.style.borderColor = 'transparent');
  };
  const bt = document.getElementById('btn-salvar');
  if (bt) bt.onclick = salvarLancamento;

  // FORM EDITAR
  if (state.tab === 'edit') {
    const cancelar = document.getElementById('btn-cancelar');
    if (cancelar) cancelar.onclick = () => { state.tab = 'home'; render(); };

    const eTipo = document.getElementById('e-tipo');
    if (eTipo) eTipo.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      eTipo.querySelectorAll('button').forEach(x => x.classList.remove('ativo'));
      btn.classList.add('ativo');
    });

    const eIcones = document.getElementById('e-icones');
    if (eIcones) eIcones.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      eIcones.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
      btn.classList.add('sel');
    });

    const eCores = document.getElementById('e-cores');
    if (eCores) eCores.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      eCores.querySelectorAll('button').forEach(x => x.style.borderColor = 'transparent');
      btn.style.borderColor = '#fff';
      state.editCor = btn.dataset.cor || null;
    });
    const eCustom = document.getElementById('e-cor-custom');
    if (eCustom) eCustom.oninput = () => {
      state.editCor = eCustom.value;
      if (eCores) eCores.querySelectorAll('button').forEach(x => x.style.borderColor = 'transparent');
    };

    const btnSalvar = document.getElementById('btn-salvar-edit');
    if (btnSalvar) btnSalvar.onclick = salvarEdicao;
  }

  // FORM FIXAS
  const igf = document.getElementById('fx-icones');
  if (igf) igf.querySelectorAll('button').forEach(b => b.onclick = () => {
    igf.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
  });

  const fxCores = document.getElementById('fx-cores');
  if (fxCores) fxCores.querySelectorAll('button').forEach(b => b.onclick = () => {
    fxCores.querySelectorAll('button').forEach(x => x.style.borderColor = 'transparent');
    b.style.borderColor = '#fff';
    state.fxFixaCor = b.dataset.cor || null;
  });
  const fxCustom = document.getElementById('fx-cor-custom');
  if (fxCustom) fxCustom.oninput = () => {
    state.fxFixaCor = fxCustom.value;
    if (fxCores) fxCores.querySelectorAll('button').forEach(x => x.style.borderColor = 'transparent');
  };

  const bf = document.getElementById('btn-add-fixa');
  if (bf) bf.onclick = salvarFixa;

  // CATEGORIAS
  document.querySelectorAll('.cat-linha').forEach(el => el.onclick = () => {
    state.catEditId = +el.dataset.id;
    render();
  });

  if (state.tab === 'cats' && state.catEditId) {
    const cancelar = document.getElementById('cat-cancelar');
    if (cancelar) cancelar.onclick = () => { state.catEditId = null; render(); };

    const inputNome = document.getElementById('cat-nome');
    if (inputNome) inputNome.oninput = () => {
      const p = document.getElementById('cat-preview-nome');
      if (p) p.textContent = inputNome.value || '—';
    };

    const grid = document.getElementById('cat-icones');
    if (grid) grid.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      grid.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
      btn.classList.add('sel');
      const p = document.getElementById('cat-preview-icone');
      if (p) p.textContent = btn.dataset.emoji;
    });

    const cores = document.getElementById('cat-cores');
    if (cores) cores.querySelectorAll('button').forEach(btn => btn.onclick = () => {
      cores.querySelectorAll('button').forEach(x => x.style.borderColor = 'transparent');
      btn.style.borderColor = '#fff';
      aplicarCorPreview(btn.dataset.cor);
      const custom = document.getElementById('cat-cor-custom');
      if (custom) custom.value = btn.dataset.cor;
    });

    const custom = document.getElementById('cat-cor-custom');
    if (custom) custom.oninput = () => {
      aplicarCorPreview(custom.value);
      if (cores) cores.querySelectorAll('button').forEach(x => x.style.borderColor = 'transparent');
    };

    const btnSalvar = document.getElementById('cat-salvar');
    if (btnSalvar) btnSalvar.onclick = salvarCategoria;
  }

  // RELATÓRIOS
  const per = document.getElementById('r-periodo');
  if (per) per.querySelectorAll('button').forEach(b => b.onclick = () => {
    state.relPeriodo = b.dataset.periodo; render();
  });
  const rm = document.getElementById('r-mes');
  if (rm) rm.onchange = () => { state.relMesRef = rm.value; render(); };
  const ra = document.getElementById('r-ano');
  if (ra) ra.onchange = () => { state.relAno = +ra.value; render(); };
  const rc = document.getElementById('r-cat');
  if (rc) rc.onchange = () => { state.relCategoria = rc.value; render(); };
  const rt = document.getElementById('r-tipo');
  if (rt) rt.onchange = () => { state.relTipo = rt.value; render(); };

  // CONFIG
  const cfgPadrao = document.getElementById('cfg-salvar-padrao');
  if (cfgPadrao) cfgPadrao.onclick = () => {
    const v = parseFloat(document.getElementById('cfg-renda-padrao').value);
    if (isNaN(v) || v < 0) return alert('Digite um valor válido');
    db.rendaPadrao = v;
    salvar(); toast('Renda padrão salva!'); render();
  };

  const cfgMesInput = document.getElementById('cfg-mes');
  if (cfgMesInput) cfgMesInput.onchange = () => {
    state.mesRef = cfgMesInput.value;
    render();
  };

  const cfgSalvarMes = document.getElementById('cfg-salvar-mes');
  if (cfgSalvarMes) cfgSalvarMes.onclick = () => {
    const ym = document.getElementById('cfg-mes').value;
    const v = parseFloat(document.getElementById('cfg-renda-mes').value);
    if (!ym) return alert('Escolha um mês');
    if (isNaN(v) || v < 0) return alert('Digite um valor válido');
    db.rendasPorMes = db.rendasPorMes || {};
    db.rendasPorMes[ym] = v;
    salvar(); toast('Renda do mês salva!'); render();
  };

  const cfgRemoverMes = document.getElementById('cfg-remover-mes');
  if (cfgRemoverMes) cfgRemoverMes.onclick = () => {
    const ym = document.getElementById('cfg-mes').value;
    if (!db.rendasPorMes) return;
    if (!confirm(`Remover renda específica de ${formatMes(ym)}?\n\nEsse mês vai usar a renda padrão.`)) return;
    delete db.rendasPorMes[ym];
    salvar(); toast('Removido'); render();
  };

  // BACKUP
  const btnExport = document.getElementById('btn-export');
  if (btnExport) btnExport.onclick = exportarJSON;

  const btnImport = document.getElementById('btn-import');
  const fileInput = document.getElementById('file-import');
  if (btnImport && fileInput) {
    btnImport.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) importarJSON(file);
      e.target.value = '';
    };
  }

  const btnReset = document.getElementById('btn-reset');
  if (btnReset) btnReset.onclick = resetarTudo;
}

// ============ AÇÕES ============
function salvarLancamento() {
  const desc = document.getElementById('f-desc').value.trim();
  const valor = parseFloat(document.getElementById('f-valor').value);
  const data = document.getElementById('f-data').value;
  const catId = parseInt(document.getElementById('f-cat').value);

  if (!desc) return alert('Preencha a descrição');
  if (!valor || valor <= 0) return alert('Preencha um valor válido');
  if (!catId) return alert('Escolha uma categoria');

  db.lancamentos.push({
    id: novoId('lancamento'),
    descricao: desc,
    valor,
    data,
    tipo: state.form.tipo,
    categoriaId: catId,
    icone: state.form.icone,
    cor: state.form.cor || null,
    status: 'PAGO',
  });
  salvar();
  state.form = { icone: '📦', tipo: 'VARIAVEL', cor: undefined };
  state.tab = 'home';
  state.mesRef = data.slice(0, 7);
  toast('Salvo!');
  render();
}

function salvarEdicao() {
  const l = db.lancamentos.find(x => x.id == state.editId);
  if (!l) return;

  const desc = document.getElementById('e-desc').value.trim();
  const valor = parseFloat(document.getElementById('e-valor').value);
  const data = document.getElementById('e-data').value;
  const catId = parseInt(document.getElementById('e-cat').value);
  const tipo = document.querySelector('#e-tipo button.ativo')?.dataset.tipo || l.tipo;
  const icone = document.querySelector('#e-icones button.sel')?.dataset.emoji || l.icone;

  if (!desc) return alert('Preencha a descrição');
  if (!valor || valor <= 0) return alert('Preencha um valor válido');

  l.descricao = desc;
  l.valor = valor;
  l.data = data;
  l.categoriaId = catId;
  l.tipo = tipo;
  l.icone = icone;
  l.cor = state.editCor !== undefined ? state.editCor : l.cor;

  salvar();
  state.tab = 'home';
  state.mesRef = data.slice(0, 7);
  state.editCor = undefined;
  toast('Alterado!');
  render();
}

function salvarFixa() {
  const desc = document.getElementById('fx-desc').value.trim();
  const valor = parseFloat(document.getElementById('fx-valor').value);
  const dia = parseInt(document.getElementById('fx-dia').value);
  const catId = parseInt(document.getElementById('fx-cat').value);
  const icone = document.querySelector('#fx-icones button.sel')?.dataset.emoji || '🔁';

  const parcInicio = document.getElementById('fx-parc-inicio').value;
  const parcTotal = parseInt(document.getElementById('fx-parc-total').value);

  if (!desc || !valor || !dia) return alert('Preencha tudo');

  let parcelas = null;
  if (parcInicio || parcTotal) {
    if (!parcInicio || !parcTotal || parcTotal < 1) {
      return alert('Preencha o mês da 1ª parcela e o total (ou deixe os dois vazios).');
    }
    parcelas = { inicio: parcInicio, total: parcTotal };
  }

  db.fixas.push({
    id: novoId('fixa'),
    descricao: desc,
    valorPadrao: valor,
    diaVencimento: dia,
    categoriaId: catId,
    icone,
    cor: state.fxFixaCor || null,
    parcelas,
    ativa: true,
  });
  salvar();
  state.fxFixaCor = null;
  toast('Fixa adicionada!');
  render();
}

function aplicarCorPreview(cor) {
  const preview = document.getElementById('cat-preview-icone');
  const icones = document.getElementById('cat-icones');
  if (preview) {
    preview.style.background = cor + '55';
    preview.parentElement.style.background = cor + '22';
  }
  if (icones) {
    icones.querySelectorAll('button').forEach(b => {
      if (b.classList.contains('sel')) b.style.background = cor + '33';
      else b.style.background = '';
    });
  }
}

function salvarCategoria() {
  const c = db.categorias.find(x => x.id == state.catEditId);
  if (!c) return;

  const nome = document.getElementById('cat-nome').value.trim();
  const iconeBtn = document.querySelector('#cat-icones button.sel');
  const icone = iconeBtn?.dataset.emoji || c.icone;

  let cor = document.getElementById('cat-cor-custom').value;
  const paletaSel = document.querySelector('#cat-cores button[style*="border-color: rgb(255, 255, 255)"]');
  if (paletaSel) cor = paletaSel.dataset.cor;

  if (!nome) return alert('Preencha o nome');

  c.nome = nome;
  c.icone = icone;
  c.cor = cor;

  salvar();
  state.catEditId = null;
  toast('Categoria atualizada!');
  render();
}

// ============ BACKUP ============
function exportarJSON() {
  const dados = {
    app: 'meus-gastos',
    versao: 2,
    exportadoEm: new Date().toISOString(),
    categorias: db.categorias,
    fixas: db.fixas,
    lancamentos: db.lancamentos,
    rendaPadrao: db.rendaPadrao,
    rendasPorMes: db.rendasPorMes,
    nextId: db.nextId,
  };

  const json = JSON.stringify(dados, null, 2);
  const blob = new Blob([json], { type: 'application/json' });

  const hoje = new Date();
  const nome = `gastos-backup-${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}.json`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  toast('Backup baixado!');
}

function importarJSON(file) {
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const dados = JSON.parse(e.target.result);
      if (!dados || typeof dados !== 'object') throw new Error('Arquivo inválido.');
      if (!Array.isArray(dados.lancamentos) || !Array.isArray(dados.fixas) || !Array.isArray(dados.categorias)) {
        throw new Error('Estrutura do arquivo não reconhecida.');
      }

      const qtd = dados.lancamentos.length;
      const msg = `Importar ${qtd} lançamentos, ${dados.fixas.length} fixas e ${dados.categorias.length} categorias?\n\n⚠️ Isso SUBSTITUI todos os dados atuais.`;
      if (!confirm(msg)) return;

      db.categorias = dados.categorias;
      db.fixas = dados.fixas;
      db.lancamentos = dados.lancamentos;
      db.rendaPadrao = dados.rendaPadrao || 0;
      db.rendasPorMes = dados.rendasPorMes || {};
      db.nextId = dados.nextId || {
        fixa: Math.max(0, ...dados.fixas.map(f => f.id || 0)) + 1,
        lancamento: Math.max(0, ...dados.lancamentos.map(l => l.id || 0)) + 1,
      };

      salvar();
      state.tab = 'home';
      state.mesRef = mesAtual();
      toast('Dados importados!');
      render();
    } catch (err) {
      alert('❌ Erro ao importar:\n' + err.message);
    }
  };

  reader.onerror = () => alert('Não foi possível ler o arquivo.');
  reader.readAsText(file);
}

function resetarTudo() {
  const qtdLanc = db.lancamentos.length;
  const qtdFixas = db.fixas.length;

  if (!confirm(`⚠️ APAGAR TUDO?\n\n• ${qtdLanc} lançamentos\n• ${qtdFixas} fixas\n• Categorias personalizadas\n• Rendas cadastradas\n\nNão tem como desfazer!`)) return;
  if (!confirm('Tem CERTEZA?\n\nSe quiser guardar, clique em Cancelar e faça um Exportar JSON primeiro.')) return;
  if (!confirm('Confirmação final. Apagar tudo agora?')) return;

  localStorage.removeItem(KEY);
  location.reload();
}

// ============ INIT ============
render();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
