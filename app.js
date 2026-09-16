// ============ ARMAZENAMENTO ============
const KEY = 'gastos-app-v1';

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
  nextId: { fixa: 1, lancamento: 1 }
};

let db = carregar();

function carregar() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT));
    const d = JSON.parse(raw);
    // mescla categorias novas se houver
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

// ============ UTILITÁRIOS ============
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
function toast(msg) {
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
  // filtros do relatório
  relPeriodo: 'mes',   // 'mes' | 'ano'
  relMesRef: mesAtual(),
  relAno: new Date().getFullYear(),
  relCategoria: '',
  relTipo: '',
  // form
  form: { icone: '📦', tipo: 'VARIAVEL' },
};

// ============ RECORRÊNCIA (gera fixas do mês) ============
function garantirFixasDoMes(ym) {
  // ym = "2025-09" (o mês que está sendo exibido)
  if (!ym) {
    const hoje = new Date();
    ym = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  }

  // Só cria para o mês atual ou meses FUTUROS.
  // Meses passados ficam intactos (pra não bagunçar histórico).
  const hoje = new Date();
  const mesAtualStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  if (ym < mesAtualStr) return;

  let adicionou = false;
  db.fixas.filter(f => f.ativa).forEach(f => {
    const jaTem = db.lancamentos.some(l => l.fixaId === f.id && l.data.startsWith(ym));
    if (!jaTem) {
      const dia = String(Math.min(f.diaVencimento, 28)).padStart(2, '0');
      db.lancamentos.push({
        id: novoId('lancamento'),
        descricao: f.descricao,
        valor: f.valorPadrao,
        data: `${ym}-${dia}`,
        tipo: 'FIXA',
        categoriaId: f.categoriaId,
        icone: f.icone,
        status: 'PENDENTE',
        fixaId: f.id,
      });
      adicionou = true;
    }
  });
  if (adicionou) salvar();
}

// ============ RENDER PRINCIPAL ============
function render() {
  garantirFixasDoMes(state.mesRef);
  const app = document.getElementById('app');
  if (state.tab === 'home') app.innerHTML = renderHome();
  else if (state.tab === 'add') app.innerHTML = renderAdd();
  else if (state.tab === 'edit') app.innerHTML = renderEdit(); 
  else if (state.tab === 'rel') app.innerHTML = renderRel();
  else if (state.tab === 'fixas') app.innerHTML = renderFixas();
  bindEventos();
  document.querySelectorAll('#nav button').forEach(b => {
    b.classList.toggle('ativo', b.dataset.tab === state.tab);
  });
}

// ============ TELA: INÍCIO ============
function renderHome() {
  const mes = state.mesRef;
  const lancs = db.lancamentos
    .filter(l => l.data.startsWith(mes))
    .sort((a, b) => b.data.localeCompare(a.data));

  const totalFixo = lancs.filter(l => l.tipo === 'FIXA').reduce((s, l) => s + l.valor, 0);
  const totalVar = lancs.filter(l => l.tipo === 'VARIAVEL').reduce((s, l) => s + l.valor, 0);
  const total = totalFixo + totalVar;

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
  return `
    <div class="lanc">
      <span class="icone" style="background:${cat?.cor || '#334155'}33">${l.icone}</span>
      <div class="info">
        <div class="desc">${escape(l.descricao)}</div>
        <div class="sub">${cat?.nome || ''} · ${l.tipo === 'FIXA' ? '🔁 Fixo' : '📊 Variável'}</div>
      </div>
      <div class="valor">${fmtMoney(l.valor)}</div>
      <button class="del" data-action="edit-lanc" data-id="${l.id}">✏️</button>
      <button class="del" data-action="del-lanc" data-id="${l.id}">🗑️</button>
    </div>
  `;
}

// ============ TELA: ADICIONAR ============
const EMOJIS = ['🏠','🍔','🚗','🏥','🎬','📺','📚','📦','💡','💧','📱','💊','🎵','✈️','🛒','🐶','👕','🎁','⛽','🚌','🏋️','☕','🍕','💳','🧾','🎮','🚿','🧹','💄','🛠️','🎓','💰'];

function renderAdd() {
  const c = state.form;
  return `
    <div class="card">
      <h2 style="margin-bottom:12px;font-size:16px;">Novo gasto</h2>

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

      <button class="btn-primario" id="btn-salvar">Salvar gasto</button>
    </div>
  `;
}
function renderEdit() {
  const l = db.lancamentos.find(x => x.id == state.editId);
  if (!l) { state.tab = 'home'; render(); return ''; }

  return `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <h2 style="font-size:16px;">Editar gasto</h2>
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

  // agrupa por categoria
  const porCat = {};
  filtrados.forEach(l => {
    porCat[l.categoriaId] = (porCat[l.categoriaId] || 0) + l.valor;
  });
  const catOrdenadas = Object.entries(porCat)
    .sort((a, b) => b[1] - a[1]);

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
      <div class="total" style="font-size:26px;font-weight:700;text-align:center;margin-bottom:8px;">
        ${fmtMoney(total)}
      </div>
      <div class="linha-2" style="display:flex;justify-content:space-around;font-size:13px;color:var(--sub);">
        <span>🔁 ${fmtMoney(totalFixo)}</span>
        <span>📊 ${fmtMoney(totalVar)}</span>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;font-size:14px;color:var(--sub);">Por categoria</h3>
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

// ============ TELA: DESPESAS FIXAS ============
function renderFixas() {
  return `
    <div class="card">
      <h2 style="margin-bottom:12px;font-size:16px;">Despesas fixas (recorrentes)</h2>
      <p style="font-size:13px;color:var(--sub);margin-bottom:12px;">
        Aqui você cadastra o "molde". Todo mês o app lança automaticamente.
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

      <button class="btn-primario" id="btn-add-fixa">Adicionar fixa</button>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px;font-size:14px;color:var(--sub);">Cadastradas</h3>
      ${db.fixas.length === 0 ? '<p class="vazio" style="padding:10px;">Nenhuma ainda</p>' : ''}
      ${db.fixas.map(f => {
        const cat = db.categorias.find(c => c.id == f.categoriaId);
        return `
          <div class="lanc">
            <span class="icone" style="background:${cat?.cor || '#334155'}33">${f.icone}</span>
            <div class="info">
              <div class="desc">${escape(f.descricao)}</div>
              <div class="sub">${cat?.nome || ''} · todo dia ${f.diaVencimento}</div>
            </div>
            <div class="valor">${fmtMoney(f.valorPadrao)}</div>
            <button class="del" data-action="del-fixa" data-id="${f.id}">🗑️</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ============ EVENTOS ============
function bindEventos() {
  // Nav
  document.querySelectorAll('#nav button').forEach(b => {
    b.onclick = () => { state.tab = b.dataset.tab; render(); };
  });

  // Navegação de mês na home
  document.querySelectorAll('[data-action="mes-ant"]').forEach(b => b.onclick = () => {
    state.mesRef = mudarMes(state.mesRef, -1); render();
  });
  document.querySelectorAll('[data-action="mes-prox"]').forEach(b => b.onclick = () => {
    state.mesRef = mudarMes(state.mesRef, +1); render();
  });

  // Excluir lançamento
  document.querySelectorAll('[data-action="del-lanc"]').forEach(b => b.onclick = () => {
    if (!confirm('Excluir este gasto?')) return;
    db.lancamentos = db.lancamentos.filter(l => l.id != b.dataset.id);
    salvar(); toast('Excluído'); render();
  });
    // Editar lançamento
  document.querySelectorAll('[data-action="edit-lanc"]').forEach(b => b.onclick = () => {
    state.editId = +b.dataset.id;
    state.tab = 'edit';
    render();
  });

  // Eventos da tela de edição
  if (state.tab === 'edit') {
    const cancelar = document.getElementById('btn-cancelar');
    if (cancelar) cancelar.onclick = () => { state.tab = 'home'; render(); };

    const eTipo = document.getElementById('e-tipo');
    if (eTipo) {
      eTipo.querySelectorAll('button').forEach(btn => btn.onclick = () => {
        eTipo.querySelectorAll('button').forEach(x => x.classList.remove('ativo'));
        btn.classList.add('ativo');
      });
    }

    const eIcones = document.getElementById('e-icones');
    if (eIcones) {
      eIcones.querySelectorAll('button').forEach(btn => btn.onclick = () => {
        eIcones.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
        btn.classList.add('sel');
      });
    }

    const btnSalvar = document.getElementById('btn-salvar-edit');
    if (btnSalvar) btnSalvar.onclick = salvarEdicao;
  }

  // Excluir fixa
  document.querySelectorAll('[data-action="del-fixa"]').forEach(b => b.onclick = () => {
    if (!confirm('Excluir esta fixa? Lançamentos já criados não serão apagados.')) return;
    db.fixas = db.fixas.filter(f => f.id != b.dataset.id);
    salvar(); toast('Fixa excluída'); render();
  });

  // Form adicionar
  const t = document.getElementById('f-tipo');
  if (t) t.querySelectorAll('button').forEach(b => b.onclick = () => {
    state.form.tipo = b.dataset.tipo; render();
  });
  const ig = document.getElementById('f-icones');
  if (ig) ig.querySelectorAll('button').forEach(b => b.onclick = () => {
    state.form.icone = b.dataset.emoji; render();
  });
  const bt = document.getElementById('btn-salvar');
  if (bt) bt.onclick = salvarLancamento;

  // Form fixas
  const igf = document.getElementById('fx-icones');
  if (igf) igf.querySelectorAll('button').forEach(b => b.onclick = () => {
    igf.querySelectorAll('button').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
  });
  const bf = document.getElementById('btn-add-fixa');
  if (bf) bf.onclick = salvarFixa;

  // Relatórios
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
}

function salvarLancamento() {
  const desc = document.getElementById('f-desc').value.trim();
  const valor = parseFloat(document.getElementById('f-valor').value);
  const data = document.getElementById('f-data').value;
  const catId = parseInt(document.getElementById('f-cat').value);

  if (!desc) return alert('Preencha a descrição');
  if (!valor || valor <= 0) return alert('Preencha um valor válido');
  if (!catId) return alert('Escolha uma categoria');

  const cat = db.categorias.find(c => c.id === catId);

  db.lancamentos.push({
    id: novoId('lancamento'),
    descricao: desc,
    valor,
    data,
    tipo: state.form.tipo,
    categoriaId: catId,
    icone: state.form.icone,
    status: 'PAGO',
  });
  salvar();
  state.form = { icone: '📦', tipo: 'VARIAVEL' };
  state.tab = 'home';
  state.mesRef = data.slice(0, 7);
  toast('Salvo!');
  render();
}

function salvarFixa() {
  const desc = document.getElementById('fx-desc').value.trim();
  const valor = parseFloat(document.getElementById('fx-valor').value);
  const dia = parseInt(document.getElementById('fx-dia').value);
  const catId = parseInt(document.getElementById('fx-cat').value);
  const icone = document.querySelector('#fx-icones button.sel')?.dataset.emoji || '🔁';

  if (!desc || !valor || !dia) return alert('Preencha tudo');

  db.fixas.push({
    id: novoId('fixa'),
    descricao: desc,
    valorPadrao: valor,
    diaVencimento: dia,
    categoriaId: catId,
    icone,
    ativa: true,
  });
  salvar();
  toast('Fixa adicionada!');
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

  salvar();
  state.tab = 'home';
  state.mesRef = data.slice(0, 7);
  toast('Alterado!');
  render();
}

// ============ HELPERS ============
function mudarMes(ym, delta) {
  const [a, m] = ym.split('-').map(Number);
  const d = new Date(a, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function escape(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ INICIALIZAÇÃO ============
render();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
