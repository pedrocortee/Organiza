let periodoDias = 7;
let chartPizza = null;
let chartLinha = null;
let todosLeads = [];

// ── Navegação entre páginas ────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');
}
window.showPage = showPage;

// ── Utilitários ────────────────────────────────────────────────
function setLoading(on) {
  document.getElementById('loading-bar').classList.toggle('on', on);
}

async function resolveAuth() {
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await new Promise(resolve =>
        chrome.storage.local.get(['auth_session'], r => resolve(r))
      );
      if (result.auth_session?.user_id) {
        return { profileId: result.auth_session.user_id };
      }
    }
  } catch(e) {}
  return { profileId: null };
}

async function fetchLeads() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'FETCH_LEADS' }, (resp) => {
      if (resp?.ok) resolve(resp.data);
      else reject(new Error('Erro ao carregar leads'));
    });
  });
}

function filtrar(leads, dias) {
  if (!dias) return leads;
  const lim = new Date(); lim.setDate(lim.getDate() - dias);
  return leads.filter(l => new Date(l.criado_em) >= lim);
}

function tempo(dataStr) {
  const diff = Date.now() - new Date(dataStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'agora';
  if (h < 24) return h + 'h';
  const d = Math.floor(h / 24);
  return d < 30 ? d + ' dias' : Math.floor(d/30) + ' meses';
}

// ── Renderização ───────────────────────────────────────────────
const WA_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.117 1.528 5.845L.057 23.882a.5.5 0 0 0 .61.61l6.037-1.471A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.808 9.808 0 0 1-5.006-1.37l-.358-.214-3.724.907.923-3.612-.234-.373A9.818 9.818 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>`;

function renderLeadRow(l, lista) {
  const refContato = l.ultimo_contato || l.criado_em;
  const diff = Date.now() - new Date(refContato).getTime();
  const dias = Math.floor(diff / 86400000);
  const bc = dias > 7 ? 'urgente' : dias > 2 ? 'atencao' : 'ok';
  const bt = dias > 7 ? 'urgente' : dias > 2 ? 'atenção' : 'ok';
  const dc = l.classificacao === 'quente' ? 'q' : l.classificacao === 'morno' ? 'm' : l.classificacao === 'frio' ? 'f' : 'nc';

  const telWa = (l.telefone || '').replace(/\D/g, '');

  const statusLabel  = { busca: 'Em busca', negociacao: 'Em negociação', vendido: 'Vendido' };
  const momentoLabel = { pronto: 'Pronto pra morar', obra: 'Em obra / Lançamento', indefinido: 'Sem definição' };
  const ticketFmt = l.ticket ? 'R$ ' + Number(l.ticket).toLocaleString('pt-BR') : null;

  const detalhes = [
    l.status_negociacao ? { label: 'Status',      value: statusLabel[l.status_negociacao]  || l.status_negociacao } : null,
    ticketFmt           ? { label: 'Ticket',      value: ticketFmt } : null,
    l.localizacao       ? { label: 'Localização', value: l.localizacao } : null,
    l.momento_compra    ? { label: 'Momento',     value: momentoLabel[l.momento_compra]    || l.momento_compra } : null,
  ].filter(Boolean);

  const temDados = detalhes.length > 0 || l.observacoes;

  const row = document.createElement('div');
  row.className = 'fu-row';
  row.innerHTML = `
    <div class="fu-row-header">
      <div>
        <div class="fu-nome"><span class="dot ${dc}"></span>${l.nome}<span class="fu-chevron">▼</span></div>
        <div class="fu-tel">${l.telefone || 'sem telefone'}</div>
      </div>
      <div class="fu-right">
        <span class="fu-tempo">${tempo(refContato)}</span>
        <span class="badge ${bc}">${bt}</span>
      </div>
    </div>
    <div class="fu-expand">
      ${temDados ? `
        ${detalhes.length > 0 ? `<div class="fu-detail-grid">${detalhes.map(d => `
          <div class="fu-detail-item">
            <span class="fu-detail-label">${d.label}</span>
            <span class="fu-detail-value">${d.value}</span>
          </div>`).join('')}
        </div>` : ''}
        <div class="fu-obs-block">
          <span class="fu-detail-label">Observações</span>
          ${l.observacoes
            ? `<div class="fu-obs-text">${l.observacoes.replace(/</g, '&lt;')}</div>`
            : `<span class="fu-empty-qual">Nenhuma observação registrada.</span>`}
        </div>
      ` : '<span class="fu-empty-qual">Nenhuma qualificação registrada ainda.</span>'}
    </div>`;

  if (telWa.length >= 8) {
    const btn = document.createElement('button');
    btn.className = 'btn-wa';
    btn.title = 'Abrir no WhatsApp Web';
    btn.innerHTML = WA_SVG;
    btn.addEventListener('click', (e) => { e.stopPropagation(); window.open(`https://web.whatsapp.com/send?phone=${telWa}`, '_blank'); });
    row.querySelector('.fu-right').appendChild(btn);
  }

  row.addEventListener('click', (e) => {
    if (e.target.closest('.btn-wa')) return;
    row.classList.toggle('open');
  });

  lista.appendChild(row);
}

function renderDados(leads) {
  const agora = new Date();
  const hoje  = new Date(agora); hoje.setHours(0,0,0,0);
  const sem7  = new Date(agora); sem7.setDate(agora.getDate()-7);
  const mes1  = new Date(agora); mes1.setDate(1); mes1.setHours(0,0,0,0);

  // Visão geral — sempre todos os leads
  const total = leads.length;
  const pHoje = leads.filter(l => new Date(l.criado_em) >= hoje).length;
  const pSem  = leads.filter(l => new Date(l.criado_em) >= sem7).length;
  const pMes  = leads.filter(l => new Date(l.criado_em) >= mes1).length;

  document.getElementById('total-leads').textContent  = total;
  document.getElementById('leads-hoje').textContent   = pHoje;
  document.getElementById('leads-semana').textContent = pSem;
  document.getElementById('leads-mes').textContent    = pMes;
  document.getElementById('sub-hoje').innerHTML   = pHoje > 0 ? `<span class="up">↑ ${pHoje} lead${pHoje>1?'s':''}</span>` : 'nenhum hoje';
  document.getElementById('sub-semana').innerHTML = pSem  > 0 ? `<span class="up">↑ ${pSem} leads</span>` : 'nenhum';
  document.getElementById('sub-mes').innerHTML    = pMes  > 0 ? `<span class="up">↑ ${pMes} leads</span>` : 'nenhum';

  // Classificação — filtrada pelo período
  const lf = filtrar(leads, periodoDias);
  const q  = lf.filter(l => l.classificacao === 'quente').length;
  const m  = lf.filter(l => l.classificacao === 'morno').length;
  const f  = lf.filter(l => l.classificacao === 'frio').length;
  const ct = q + m + f;
  const pct = n => ct > 0 ? Math.round(n/ct*100)+'% dos classificados' : 'nenhum classificado';

  document.getElementById('total-quente').textContent = q;
  document.getElementById('total-morno').textContent  = m;
  document.getElementById('total-frio').textContent   = f;
  document.getElementById('pct-quente').textContent   = pct(q);
  document.getElementById('pct-morno').textContent    = pct(m);
  document.getElementById('pct-frio').textContent     = pct(f);
  document.getElementById('total-classificado').textContent = ct;
  document.getElementById('total-periodo').textContent = lf.length;

  // Label do período
  const pl = document.getElementById('periodo-label');
  if (pl) pl.textContent = periodoDias ? `(últimos ${periodoDias} dias)` : '(todos os períodos)';

  // Follow-up
  const refTs = l => new Date(l.ultimo_contato || l.criado_em).getTime();
  const f24 = leads.filter(l => l.status_negociacao !== 'vendido' && Date.now()-refTs(l) > 86400000).length;
  const f7d = leads.filter(l => l.status_negociacao !== 'vendido' && Date.now()-refTs(l) > 7*86400000).length;
  const fsc = leads.filter(l => !l.classificacao).length;
  document.getElementById('f-24h').textContent    = f24;
  document.getElementById('f-7d').textContent     = f7d;
  document.getElementById('sem-class').textContent = fsc;

  // Lista follow-up
  const lista = document.getElementById('fu-lista');
  const sorted = [...leads]
    .filter(l => l.status_negociacao !== 'vendido')
    .sort((a,b) => new Date(a.ultimo_contato || a.criado_em) - new Date(b.ultimo_contato || b.criado_em))
    .slice(0, 10);
  lista.innerHTML = '';
  if (!sorted.length) {
    lista.innerHTML = '<div class="empty">Nenhum lead cadastrado ainda</div>';
  } else {
    sorted.forEach(l => renderLeadRow(l, lista));
  }

  // Gráficos
  renderPizza(q, m, f, Math.max(0, lf.length - ct));
  renderLinha(leads, periodoDias || 30);
}

function renderPizza(q, m, f, sc) {
  const canvas = document.getElementById('chart-pizza');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartPizza) chartPizza.destroy();
  chartPizza = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Quente','Morno','Frio','Sem class.'],
      datasets: [{
        data: [q,m,f,sc],
        backgroundColor: ['#FF4D4D','#FF9500','#4D9EFF','rgba(255,255,255,0.08)'],
        borderWidth: 0, hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.45)', font:{size:11}, padding:14, boxWidth:8, boxHeight:8 } }
      }
    }
  });
}

function renderLinha(leads, dias) {
  const canvas = document.getElementById('chart-linha');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (chartLinha) chartLinha.destroy();
  const labels = [], vals = [];
  for (let i = dias-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
    const fim = new Date(d); fim.setHours(23,59,59,999);
    labels.push(d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}));
    vals.push(leads.filter(l => { const dt=new Date(l.criado_em); return dt>=d&&dt<=fim; }).length);
  }
  chartLinha = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label:'Leads', data:vals, borderColor:'#69CD5A', backgroundColor:'rgba(105,205,90,0.07)', fill:true, tension:0.4, pointRadius:3, pointBackgroundColor:'#69CD5A', borderWidth:2 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},maxTicksLimit:8}, grid:{color:'rgba(255,255,255,0.03)'} },
        y: { ticks:{color:'rgba(255,255,255,0.3)',font:{size:10},stepSize:1}, grid:{color:'rgba(255,255,255,0.05)'}, beginAtZero:true }
      }
    }
  });
}

// ── Filtro de período ──────────────────────────────────────────
function setPeriodo(dias, btn) {
  periodoDias = dias;
  document.querySelectorAll('.period-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (todosLeads.length > 0) renderDados(todosLeads);
}
window.setPeriodo = setPeriodo;

// ── Carregamento ───────────────────────────────────────────────
async function carregarDados() {
  setLoading(true);
  document.getElementById('status-text').textContent = 'Sincronizando...';
  try {
    const { profileId } = await resolveAuth();
    if (!profileId) {
      document.getElementById('status-text').textContent = 'Não autenticado';
      document.getElementById('sub-texto').textContent = 'Faça login na extensão para visualizar seus leads';
      setLoading(false);
      return;
    }
    todosLeads = await fetchLeads();
    renderDados(todosLeads);
    document.getElementById('sub-texto').textContent = `${todosLeads.length} leads · atualizado às ${new Date().toLocaleTimeString('pt-BR')}`;
    document.getElementById('status-text').textContent = 'Conectado';
  } catch(e) {
    document.getElementById('status-text').textContent = 'Erro ao carregar';
    document.getElementById('sub-texto').textContent = 'Não foi possível atualizar os dados';
  }
  setLoading(false);
}
window.carregarDados = carregarDados;

window.onload = carregarDados;

// ── Logout ─────────────────────────────────────────────────────
function dashLogout() {
  chrome.runtime.sendMessage({ type: 'SIGN_OUT' });
  chrome.storage.local.remove(['auth_session', 'extensao_user_id', 'leads', 'classificacoes', 'leadTimestamps', 'leadSnoozed', 'leadQualificacoes']);
}
window.dashLogout = dashLogout;