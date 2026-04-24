const SUPABASE_URL = 'https://tkxvbuzykfnoxiyeoams.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRreHZidXp5a2Zub3hpeWVvYW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjczMzMsImV4cCI6MjA5MDc0MzMzM30.eUpA1ZR-h-4j0XOXhoHYXC98ESPtekWDsON5HYCtq30';

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
  // 1. Contexto da extensão — chrome.storage
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const result = await new Promise(resolve =>
        chrome.storage.local.get(['auth_session'], r => resolve(r))
      );
      if (result.auth_session?.user_id) {
        return { profileId: result.auth_session.user_id, jwt: result.auth_session.access_token };
      }
    }
  } catch(e) {}

  // 2. URL params — ?token= (JWT enviado pela extensão ao abrir o dashboard)
  const token = new URLSearchParams(window.location.search).get('token');
  if (token) {
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
      });
      if (r.ok) {
        const user = await r.json();
        return { profileId: user.id, jwt: token };
      }
    } catch(e) {}
  }

  return { profileId: null, jwt: null };
}

async function fetchLeads(profileId, jwt) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&order=criado_em.desc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${jwt}` } }
  );
  if (!res.ok) throw new Error('Erro ' + res.status);
  return res.json();
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
  const f24 = leads.filter(l => Date.now()-new Date(l.criado_em).getTime() > 86400000).length;
  const f7d = leads.filter(l => Date.now()-new Date(l.criado_em).getTime() > 7*86400000).length;
  const fsc = leads.filter(l => !l.classificacao).length;
  document.getElementById('f-24h').textContent    = f24;
  document.getElementById('f-7d').textContent     = f7d;
  document.getElementById('sem-class').textContent = fsc;

  // Lista follow-up
  const lista = document.getElementById('fu-lista');
  const sorted = [...leads].sort((a,b) => new Date(a.criado_em)-new Date(b.criado_em)).slice(0,7);
  if (!sorted.length) {
    lista.innerHTML = '<div class="empty">Nenhum lead cadastrado ainda</div>';
  } else {
    lista.innerHTML = sorted.map(l => {
      const diff = Date.now()-new Date(l.criado_em).getTime();
      const dias = Math.floor(diff/86400000);
      const bc = dias > 7 ? 'urgente' : dias > 2 ? 'atencao' : 'ok';
      const bt = dias > 7 ? 'urgente' : dias > 2 ? 'atenção' : 'ok';
      const dc = l.classificacao === 'quente' ? 'q' : l.classificacao === 'morno' ? 'm' : l.classificacao === 'frio' ? 'f' : 'g';
      return `<div class="fu-row">
        <div>
          <div class="fu-nome"><span class="dot ${dc}"></span>${l.nome}</div>
          <div class="fu-tel">${l.telefone || 'sem telefone'}</div>
        </div>
        <div class="fu-right">
          <span class="fu-tempo">${tempo(l.criado_em)}</span>
          <span class="badge ${bc}">${bt}</span>
        </div>
      </div>`;
    }).join('');
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
    const { profileId, jwt } = await resolveAuth();
    if (!profileId) {
      document.getElementById('status-text').textContent = 'Não autenticado';
      document.getElementById('sub-texto').textContent = 'Faça login na extensão para visualizar seus leads';
      setLoading(false);
      return;
    }
    todosLeads = await fetchLeads(profileId, jwt);
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