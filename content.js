// ── Organiza ────────────────────────────────────────
// Versão otimizada: zero setInterval, cache em memória,
// observer cirúrgico apenas em childList (sem subtree pesado)

// ── Cache de grupos confirmados (evita reprocessar) ─────────
const gruposConfirmados = new Set();

// ── Cache em memória (evita I/O constante ao storage) ─────────
const cache = { leads: [], classificacoes: {}, timestamps: {}, snoozed: {}, qualificacoes: {}, telefones: {}, pronto: false };

function carregarCache(cb) {
  chrome.storage.local.get(['leads','classificacoes','leadTimestamps','leadSnoozed','leadQualificacoes'], (r) => {
    cache.leads          = r.leads             || [];
    cache.classificacoes = r.classificacoes    || {};
    cache.timestamps     = r.leadTimestamps    || {};
    cache.snoozed        = r.leadSnoozed       || {};
    cache.qualificacoes  = r.leadQualificacoes || {};
    cache.pronto         = true;

    // Sincroniza leads e classificacoes do Supabase (fonte autoritativa por conta)
    chrome.runtime.sendMessage({ type: 'BUSCAR_LEADS' }, (resp) => {
      if (resp && resp.ok && resp.data) {
        resp.data.forEach(({ nome, classificacao, telefone }) => {
          if (!nome) return;
          if (!cache.leads.includes(nome)) cache.leads.push(nome);
          if (classificacao) cache.classificacoes[nome] = classificacao;
          if (telefone) cache.telefones[nome] = telefone;
        });
        salvarLeads();
        salvarClassificacoes();
      }
    });

    // Sincroniza qualificacoes do Supabase (não-bloqueante)
    chrome.runtime.sendMessage({ type: 'BUSCAR_QUALIFICACOES' }, (resp) => {
      if (resp && resp.ok && resp.data) {
        resp.data.forEach(({ nome, ticket, localizacao, momento_compra, status_negociacao }) => {
          if (!nome) return;
          cache.qualificacoes[nome] = cache.qualificacoes[nome] || {};
          if (ticket != null) cache.qualificacoes[nome].ticket = ticket;
          if (localizacao) cache.qualificacoes[nome].localizacao = localizacao;
          if (momento_compra) cache.qualificacoes[nome].momento = momento_compra;
          if (status_negociacao) cache.qualificacoes[nome].status = status_negociacao;
        });
        salvarQualificacoes();
      }
    });

    // Sincroniza ultimo_contato do Supabase por cima do cache local
    chrome.runtime.sendMessage({ type: 'BUSCAR_TIMESTAMPS' }, (resp) => {
      if (!resp || !resp.ok || !resp.data) { if (cb) cb(); return; }
      let atualizado = false;
      resp.data.forEach(({ nome, ultimo_contato }) => {
        if (!ultimo_contato) return;
        const tsRemoto = new Date(ultimo_contato).getTime();
        if (!cache.timestamps[nome] || tsRemoto > cache.timestamps[nome]) {
          cache.timestamps[nome] = tsRemoto;
          atualizado = true;
        }
      });
      if (atualizado) salvarTimestamps();
      if (cb) cb();
    });
  });
}

function salvarLeads()          { chrome.storage.local.set({ leads: cache.leads }); }
function salvarClassificacoes() { chrome.storage.local.set({ classificacoes: cache.classificacoes }); }
function salvarTimestamps()     { chrome.storage.local.set({ leadTimestamps: cache.timestamps }); }
function salvarSnoozed()        { chrome.storage.local.set({ leadSnoozed: cache.snoozed }); }
function salvarQualificacoes()  { chrome.storage.local.set({ leadQualificacoes: cache.qualificacoes }); }

function isLeadSnoozed(nome) {
  const ate = cache.snoozed[nome];
  return ate && Date.now() < ate;
}

function snoozeAte(nome, timestamp) {
  cache.snoozed[nome] = timestamp;
  salvarSnoozed();
}

function removerSnooze(nome) {
  delete cache.snoozed[nome];
  salvarSnoozed();
}

// ── Contexto válido ───────────────────────────────────────────
function isContextValid() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

// ── CSS (tudo num único elemento) ─────────────────────────────
const style = document.createElement('style');
style.textContent = `
:root {
  --org-bg: #1a2332;
  --org-bg-deep: #151C24;
  --org-border: rgba(105,205,90,0.15);
  --org-border-faint: rgba(105,205,90,0.12);
  --org-border-dim: rgba(105,205,90,0.08);
  --org-text: #ffffff;
  --org-muted: rgba(255,255,255,0.45);
  --org-muted2: rgba(255,255,255,0.35);
  --org-muted3: rgba(255,255,255,0.18);
  --org-muted4: rgba(255,255,255,0.55);
  --org-muted5: rgba(255,255,255,0.5);
  --org-muted6: rgba(255,255,255,0.8);
  --org-hover: rgba(105,205,90,0.08);
  --org-nav-hover: rgba(255,255,255,0.12);
  --org-shadow: rgba(0,0,0,0.5);
  --org-shadow2: rgba(0,0,0,0.6);
}
@media (prefers-color-scheme: light) {
  :root {
    --org-bg: #ffffff;
    --org-bg-deep: #f3f4f6;
    --org-border: rgba(0,0,0,0.12);
    --org-border-faint: rgba(0,0,0,0.1);
    --org-border-dim: rgba(0,0,0,0.07);
    --org-text: #111827;
    --org-muted: rgba(0,0,0,0.5);
    --org-muted2: rgba(0,0,0,0.38);
    --org-muted3: rgba(0,0,0,0.25);
    --org-muted4: rgba(0,0,0,0.5);
    --org-muted5: rgba(0,0,0,0.45);
    --org-muted6: rgba(0,0,0,0.8);
    --org-hover: rgba(0,0,0,0.05);
    --org-nav-hover: rgba(0,0,0,0.08);
    --org-shadow: rgba(0,0,0,0.15);
    --org-shadow2: rgba(0,0,0,0.2);
  }
}
.lead-button {
  display: inline-flex; align-items: center;
  background: #25D366; color: white; border: none;
  padding: 2px 7px; border-radius: 5px;
  font-size: 11px; font-weight: 600; cursor: pointer;
  z-index: 9999; white-space: nowrap; line-height: 1.4;
}
.lead-button.adicionado { background: #1d4ed8; cursor: default; }
.classificar-button {
  display: inline-flex; align-items: center;
  background: #16a34a; color: white; border: none;
  padding: 2px 7px; border-radius: 5px;
  font-size: 11px; font-weight: 600; cursor: pointer;
  z-index: 9999; white-space: nowrap; line-height: 1.4;
}
.classificar-button.quente { background: #dc2626; }
.classificar-button.morno  { background: #ea580c; }
.classificar-button.frio   { background: #2563eb; }
.lead-dropdown {
  position: fixed; background: var(--org-bg); border-radius: 7px;
  overflow: hidden; box-shadow: 0 4px 16px var(--org-shadow);
  z-index: 999999; min-width: 110px; display: flex; flex-direction: column;
}
.lead-dropdown button {
  border: none; padding: 8px 14px; font-size: 12px;
  font-weight: 600; cursor: pointer; color: white; text-align: left;
}
.lead-dropdown button.opt-quente { background: #dc2626; }
.lead-dropdown button.opt-quente:hover { background: #b91c1c; }
.lead-dropdown button.opt-morno  { background: #ea580c; }
.lead-dropdown button.opt-morno:hover  { background: #c2410c; }
.lead-dropdown button.opt-frio   { background: #2563eb; }
.lead-dropdown button.opt-frio:hover   { background: #1d4ed8; }
.lead-date-wrapper { display: inline-flex; align-items: center; gap: 6px; }
#organiza-nav-btn {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 50%; border: none;
  background: transparent; cursor: pointer; position: relative;
  transition: background 0.15s; flex-shrink: 0; margin: 2px 0;
}
#organiza-nav-btn:hover { background: var(--org-nav-hover); }
#organiza-nav-btn .organiza-badge {
  background: #ef4444; color: white; border-radius: 50%;
  min-width: 16px; height: 16px; font-size: 10px; display: none;
  align-items: center; justify-content: center; font-weight: 800;
  padding: 0 3px; position: absolute; top: 1px; right: 1px;
  pointer-events: none;
}
#organiza-mini-menu {
  position: fixed; background: var(--org-bg); border-radius: 10px;
  box-shadow: 0 6px 24px var(--org-shadow); z-index: 999999;
  font-family: Arial, sans-serif; display: none; flex-direction: column;
  overflow: hidden; min-width: 190px; border: 1px solid var(--org-border);
}
#organiza-mini-menu.open { display: flex; }
.organiza-menu-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 16px; border: none; background: transparent;
  color: var(--org-text); font-size: 13px; font-weight: 600;
  font-family: Arial, sans-serif; cursor: pointer; text-align: left;
  transition: background 0.12s; white-space: nowrap;
}
.organiza-menu-item:hover { background: var(--org-hover); }
.organiza-menu-item + .organiza-menu-item { border-top: 1px solid var(--org-border-faint); }
.organiza-menu-item .menu-badge {
  background: #ef4444; color: white; border-radius: 10px;
  padding: 1px 6px; font-size: 10px; font-weight: 800; margin-left: auto;
}
#lead-followup-panel {
  position: fixed; background: var(--org-bg);
  border-radius: 14px; width: 320px; max-height: 480px; overflow-y: auto;
  box-shadow: 0 8px 40px var(--org-shadow); z-index: 999997;
  font-family: Arial, sans-serif; display: none; flex-direction: column;
  border: 1px solid var(--org-border);
}
#lead-followup-panel.open { display: flex; }
#lead-followup-panel .panel-header { padding: 16px 18px 12px; border-bottom: 1px solid var(--org-border-faint); }
#lead-followup-panel .panel-header h3 { margin: 0 0 2px; font-size: 15px; color: var(--org-text); }
#lead-followup-panel .panel-header p  { margin: 0; font-size: 12px; color: var(--org-muted); }
#lead-followup-panel .panel-empty { padding: 32px 18px; text-align: center; color: var(--org-muted2); font-size: 13px; }
.followup-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; border-bottom: 1px solid var(--org-border-dim); gap: 8px;
}
.followup-row:last-child { border-bottom: none; }
.followup-row .info { flex: 1; min-width: 0; }
.followup-row .info strong {
  font-size: 13px; color: var(--org-text); display: block;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.followup-row .info span { font-size: 11px; color: var(--org-muted); }
.followup-row .send-btn {
  background: #69CD5A; color: white; border: none;
  padding: 5px 12px; border-radius: 6px; font-size: 12px;
  font-weight: 700; cursor: pointer; white-space: nowrap; flex-shrink: 0;
}
.followup-row .send-btn:hover { background: #5ab84c; }
.followup-row .snooze-btn {
  background: transparent; color: var(--org-muted); border: 1px solid rgba(105,205,90,0.2);
  padding: 5px 8px; border-radius: 6px; font-size: 12px;
  cursor: pointer; white-space: nowrap; flex-shrink: 0; line-height: 1;
}
.followup-row .snooze-btn:hover { background: rgba(105,205,90,0.1); color: var(--org-text); }
.snooze-popup {
  position: fixed; background: var(--org-bg-deep); border: 1px solid var(--org-border);
  border-radius: 10px; box-shadow: 0 6px 24px var(--org-shadow2);
  z-index: 9999999; min-width: 220px; padding: 6px 0; font-family: Arial, sans-serif;
}
.snooze-popup button {
  display: block; width: 100%; text-align: left;
  padding: 9px 16px; border: none; background: transparent;
  color: var(--org-text); font-size: 13px; cursor: pointer; white-space: nowrap;
}
.snooze-popup button:hover { background: var(--org-hover); }
.snooze-popup hr { border: none; border-top: 1px solid var(--org-border-faint); margin: 4px 0; }
.followup-section-title {
  font-size: 11px; font-weight: 700; color: var(--org-muted); text-transform: uppercase;
  letter-spacing: 0.05em; padding: 10px 14px 4px; display: flex;
  align-items: center; justify-content: space-between; cursor: pointer;
  user-select: none;
}
.followup-section-title:hover { color: var(--org-muted6); }
.followup-snoozed-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 14px; border-bottom: 1px solid var(--org-border-dim); gap: 8px;
  opacity: 0.75;
}
.followup-snoozed-row:last-child { border-bottom: none; }
.followup-snoozed-row .info strong { font-size: 13px; color: var(--org-muted6); display: block;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.followup-snoozed-row .info span { font-size: 11px; color: var(--org-muted2); }
.followup-snoozed-row .reativar-btn {
  background: transparent; border: 1px solid rgba(105,205,90,0.2); color: var(--org-muted5);
  padding: 4px 10px; border-radius: 6px; font-size: 11px; cursor: pointer;
  white-space: nowrap; flex-shrink: 0;
}
.followup-snoozed-row .reativar-btn:hover { background: rgba(105,205,90,0.1); color: var(--org-text); }
.snooze-cal { padding: 8px 12px 10px; border-top: 1px solid var(--org-border-faint); }
.snooze-cal-header {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
}
.snooze-cal-nav {
  background: transparent; border: none; color: var(--org-muted4);
  font-size: 18px; cursor: pointer; padding: 1px 7px; border-radius: 5px;
  line-height: 1; width: auto;
}
.snooze-cal-nav:hover { background: rgba(105,205,90,0.12); color: var(--org-text); }
.snooze-cal-title { font-size: 13px; font-weight: 700; color: var(--org-text); white-space: nowrap; }
.snooze-cal-week {
  display: grid; grid-template-columns: repeat(7, 1fr);
  text-align: center; margin-bottom: 3px;
}
.snooze-cal-week span { font-size: 10px; color: var(--org-muted2); font-weight: 700; padding: 2px 0; }
.snooze-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.snooze-cal-day {
  text-align: center; font-size: 12px; padding: 5px 2px; border-radius: 5px;
  cursor: pointer; color: var(--org-text); line-height: 1.3;
}
.snooze-cal-day:hover:not(.scd-disabled):not(.scd-empty) { background: rgba(105,205,90,0.15); }
.snooze-cal-day.scd-disabled { color: var(--org-muted3); cursor: default; }
.snooze-cal-day.scd-empty { cursor: default; }
.snooze-cal-day.scd-today { border: 1px solid rgba(105,205,90,0.45); color: #69CD5A; }
.snooze-cal-day.scd-selected { background: #69CD5A !important; color: #151C24; font-weight: 700; border: none; }
.lead-button.qualificar { background: #1d4ed8; cursor: pointer; }
.lead-button.qualificar:hover { background: #1e40af; }
#lead-qualificacao-panel {
  position: fixed; background: var(--org-bg); border-radius: 12px; width: 280px;
  box-shadow: 0 8px 32px var(--org-shadow); z-index: 999998;
  font-family: Arial, sans-serif; border: 1px solid var(--org-border); overflow: hidden;
}
.qual-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 14px; border-bottom: 1px solid var(--org-border-faint);
}
.qual-nome {
  font-size: 13px; font-weight: 700; color: var(--org-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 210px;
}
.qual-close {
  background: transparent; border: none; color: var(--org-muted);
  font-size: 12px; cursor: pointer; padding: 2px 5px; border-radius: 4px; flex-shrink: 0;
}
.qual-close:hover { color: var(--org-text); }
.qual-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 11px; }
.qual-label {
  display: block; font-size: 10px; font-weight: 700; color: var(--org-muted);
  text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 5px;
}
.qual-radio-group { display: flex; flex-direction: column; gap: 4px; }
.qual-radio {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; color: var(--org-text); cursor: pointer;
}
.qual-radio input[type="radio"] { accent-color: #69CD5A; cursor: pointer; }
.qual-input {
  width: 100%; box-sizing: border-box; background: var(--org-bg-deep);
  border: 1px solid var(--org-border-faint); border-radius: 6px;
  padding: 6px 10px; font-size: 12px; color: var(--org-text);
  outline: none; font-family: Arial, sans-serif;
}
.qual-input:focus { border-color: rgba(105,205,90,0.5); }
.qual-textarea {
  width: 100%; box-sizing: border-box; background: var(--org-bg-deep);
  border: 1px solid var(--org-border-faint); border-radius: 6px;
  padding: 6px 10px; font-size: 12px; color: var(--org-text);
  outline: none; font-family: Arial, sans-serif;
  resize: vertical; min-height: 60px; max-height: 120px; line-height: 1.4;
}
.qual-textarea:focus { border-color: rgba(105,205,90,0.5); }
.qual-footer { padding: 10px 14px 14px; border-top: 1px solid var(--org-border-faint); }
.qual-save {
  width: 100%; background: #69CD5A; color: #151C24; border: none;
  border-radius: 7px; padding: 8px; font-size: 13px; font-weight: 700;
  cursor: pointer; font-family: Arial, sans-serif;
}
.qual-save:hover { background: #5ab84c; }
`;
try { document.head.appendChild(style); } catch(e) {}

// ── Supabase via background ───────────────────────────────────
const leadsJaEnviados = new Set();

function salvarLeadSupabase(nome, telefone) {
  if (leadsJaEnviados.has(nome)) return;
  leadsJaEnviados.add(nome);
  const classificacao = cache.classificacoes[nome] || null;
  const telFinal = (telefone && telefone.trim().length >= 8) ? telefone.trim() : '';
  chrome.runtime.sendMessage(
    { type: 'INSERT_LEAD', nome, telefone: telFinal, classificacao },
    (resp) => {
      if (!resp || !resp.ok) leadsJaEnviados.delete(nome);
    }
  );
}

function atualizarClassificacaoSupabase(nome, classificacao) {
  chrome.runtime.sendMessage({ type: 'UPDATE_CLASSIFICACAO', nome, classificacao });
}

function atualizarQualificacaoSupabase(nome, dados) {
  chrome.runtime.sendMessage({ type: 'UPDATE_QUALIFICACAO', nome, ...dados });
}

// ── Storage helpers (usando cache) ────────────────────────────
function saveLead(name) {
  if (cache.leads.includes(name)) return;
  cache.leads.push(name);
  cache.timestamps[name] = cache.timestamps[name] || Date.now();
  salvarLeads();
  salvarTimestamps();
}

function saveClassificacao(name, tipo) {
  cache.classificacoes[name] = tipo;
  salvarClassificacoes();
  atualizarClassificacaoSupabase(name, tipo);
}

// ── Dropdown classificar ──────────────────────────────────────
function closeAllDropdowns() {
  document.querySelectorAll('.lead-dropdown').forEach(d => d.remove());
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.lead-dropdown') && !e.target.closest('.classificar-button')) {
    closeAllDropdowns();
  }
}, { passive: true });

function abrirDropdown(btn, contactName) {
  if (document.querySelector('.lead-dropdown')) { closeAllDropdowns(); return; }
  const rect = btn.getBoundingClientRect();
  const dropdown = document.createElement('div');
  dropdown.className = 'lead-dropdown';
  dropdown.style.top  = (rect.bottom + 4) + 'px';
  dropdown.style.left = rect.left + 'px';

  [['Quente','opt-quente','quente'],['Morno','opt-morno','morno'],['Frio','opt-frio','frio']]
    .forEach(([label, cls, tipo]) => {
      const opt = document.createElement('button');
      opt.textContent = label;
      opt.className = cls;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        saveClassificacao(contactName, tipo);
        btn.textContent = label;
        btn.className = 'classificar-button ' + tipo;
        closeAllDropdowns();
      });
      dropdown.appendChild(opt);
    });
  document.body.appendChild(dropdown);
}

// ── Regex de data (compilado uma vez) ────────────────────────
const DATA_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$|^\d{2}:\d{2}$|^(Ontem|Hoje|Yesterday|Today|seg|ter|qua|qui|sex|sáb|dom|segunda|segunda-feira|terça|terça-feira|quarta|quarta-feira|quinta|quinta-feira|sexta|sexta-feira|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\.?$/i;
const LABELMAP = { quente: 'Quente', morno: 'Morno', frio: 'Frio' };

// ── Regex de telefone ─────────────────────────────────────────
const TEL_RE = /(\+?\d[\d\s\-\(\)]{9,17}\d)/;

function extrairTelefone(texto) {
  const linhas = texto.split('\n').map(l => l.trim()).filter(l => l);
  for (const linha of linhas) {
    if (/^\+\d[\d\s\-\(\)]{7,}$/.test(linha)) {
      return linha.replace(/[\s\-\(\)]/g, '');
    }
    const soDigitos = linha.replace(/[\s\-\(\)]/g, '');
    if (/^\d{10,13}$/.test(soDigitos)) {
      return soDigitos;
    }
  }
  const match = texto.match(TEL_RE);
  if (match) {
    const limpo = match[1].replace(/[\s\-\(\)]/g, '');
    if (/^\d{10,13}$/.test(limpo) || /^\+\d{10,13}$/.test(limpo)) return limpo;
  }
  return '';
}

// ── Captura o número do próprio corretor logado no WhatsApp Web ──
// Usado para EXCLUIR esse número ao buscar telefone do lead
function getNumeroCorretorLogado() {
  try {
    // Seletor do perfil do usuário logado (avatar/menu superior esquerdo)
    const perfilBtn = document.querySelector('[data-testid="default-user"]')
      || document.querySelector('header [data-testid="menu"]')
      || document.querySelector('#app header');

    if (perfilBtn) {
      const txt = perfilBtn.innerText || '';
      const tel = extrairTelefone(txt);
      if (tel) return tel.replace(/\D/g, '');
    }

    // Fallback: tenta pegar do título da aba ou meta
    const title = document.title || '';
    const match = title.match(/\+?\d[\d\s\-]{9,}/);
    if (match) return match[0].replace(/\D/g, '');
  } catch(e) {}
  return '';
}

// ── Busca telefone abrindo dados do contato ──────────────────
function buscarTelefoneNoDrawer(nomeContato, callback) {
  observer.disconnect();

  // Captura o número do próprio corretor ANTES de abrir qualquer painel
  // para poder excluí-lo dos resultados
  const numeroProprioCorretor = getNumeroCorretorLogado();

  // 1. Clica na conversa pelo nome
  const sidebar = document.querySelector('#pane-side');
  if (sidebar) {
    sidebar.querySelectorAll('span[title]').forEach(s => {
      if (s.title === nomeContato) {
        let el = s;
        while (el) {
          if (el.getAttribute('role') === 'gridcell') {
            el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('mouseup',   { bubbles: true, cancelable: true, view: window }));
            el.dispatchEvent(new MouseEvent('click',     { bubbles: true, cancelable: true, view: window }));
            break;
          }
          el = el.parentElement;
        }
      }
    });
  }

  // 2. Aguarda o chat abrir e clica no header
  let tentativasHeader = 0;
  const esperarHeader = setInterval(() => {
    tentativasHeader++;
    const header = document.querySelector('#main header');
    if (header || tentativasHeader >= 10) {
      clearInterval(esperarHeader);
      if (!header) { callback(''); startObserver(); return; }

      const btns = [...header.querySelectorAll('[role="button"]')];
      const btnComNome = btns.find(b =>
        b.getAttribute('tabindex') === '0' && (b.innerText?.trim().length || 0) > 0
      );
      (btnComNome || header).click();

      // 3. Aguarda o painel "Dados do contato" aparecer
      let tentativasPainel = 0;
      const esperarPainel = setInterval(() => {
        tentativasPainel++;

        // ── Estratégia 1: painel oficial pelo data-testid ──────────
        const drawerOficial = document.querySelector('[data-testid="contact-info-drawer"]');

        // ── Estratégia 2: div com texto "Dados do contato" / "Contact info" ──
        const divsCandidatos = drawerOficial ? [drawerOficial] :
          [...document.querySelectorAll('div')].filter(d => {
            const txt = d.innerText?.trim() || '';
            return (txt.startsWith('Dados do contato') || txt.startsWith('Contact info'))
              && d.children.length <= 4;
          });

        let telefone = '';

        for (const d of divsCandidatos) {
          const candidato = extrairTelefone(d.innerText || '');
          // Rejeita se for o número do próprio corretor
          if (candidato && candidato.replace(/\D/g,'') !== numeroProprioCorretor) {
            telefone = candidato;
            break;
          }
        }

        // ── Estratégia 3 (fallback SEGURO): busca APENAS dentro do drawer ──
        // NUNCA mais varre toda a página — isso causava captura do número do corretor
        if (!telefone && drawerOficial) {
          const candidato = extrairTelefone(drawerOficial.innerText || '');
          if (candidato && candidato.replace(/\D/g,'') !== numeroProprioCorretor) {
            telefone = candidato;
          }
        }

        // ── Estratégia 4: busca spans dentro do drawer por padrão numérico ──
        if (!telefone) {
          const drawer = drawerOficial
            || document.querySelector('div[class*="drawer"]')
            || document.querySelector('#app > div > div > div:last-child');

          if (drawer) {
            drawer.querySelectorAll('span, div').forEach(el => {
              if (telefone) return;
              // Só elementos sem filhos (texto puro) para evitar pegar containers
              if (el.children.length > 0) return;
              const txt = (el.innerText || '').trim();
              if (!txt) return;
              const candidato = extrairTelefone(txt);
              if (candidato && candidato.replace(/\D/g,'') !== numeroProprioCorretor) {
                telefone = candidato;
              }
            });
          }
        }

        const panelAberto = divsCandidatos.length > 0 || drawerOficial || tentativasPainel >= 5;
        const timeoutAtingido = tentativasPainel >= 20;

        if ((panelAberto && telefone) || timeoutAtingido) {
          clearInterval(esperarPainel);

          // Fecha o painel
          const btnFechar = document.querySelector('[data-icon="x"]')?.closest('button, [role="button"]')
            || document.querySelector('button[aria-label="Fechar"], button[aria-label="Close"]');
          if (btnFechar) btnFechar.click();

          callback(telefone);
          startObserver();
        }
      }, 300);
    }
  }, 300);
}

// ── Injeção dos botões ────────────────────────────────────────
const processados = new WeakSet();

function injectButtons() {
  if (!isContextValid() || !cache.pronto) return;
  const sidebar = document.querySelector('#pane-side');
  if (!sidebar) return;

  sidebar.querySelectorAll('span[title][dir="auto"]').forEach(span => {
    let container = span;
    for (let i = 0; i < 5; i++) {
      if (!container) return;
      container = container.parentElement;
    }
    if (!container) return;

    const nome = span.title || '';
    if (gruposConfirmados.has(nome)) return;

    const icones = [...container.querySelectorAll('span[data-icon]')]
      .map(s => s.getAttribute('data-icon'));
    if (icones.includes('default-group-refreshed') || icones.includes('status-ciphertext')) {
      gruposConfirmados.add(nome); return;
    }

    const linhas = (container.innerText || '').split('\n').map(l => l.trim()).filter(l => l.length > 0);

    if (linhas.includes(':')) { gruposConfirmados.add(nome); return; }

    for (const linha of linhas) {
      if (/^~?[A-ZÀ-ÿa-z][^\n:]{0,30}:\s\S/.test(linha)) {
        gruposConfirmados.add(nome); return;
      }
    }

    const textoCompleto = linhas.join(' ');
    if (/entrou usando|removeu você|adicionou você|saiu do grupo|foi adicionado|foi removido/i.test(textoCompleto)) {
      gruposConfirmados.add(nome); return;
    }

    for (const linha of linhas) {
      if (/^~\s?[A-ZÀ-ÿa-z]/.test(linha)) {
        gruposConfirmados.add(nome); return;
      }
    }

    const existingLead = container.querySelector('.lead-button');
    if (existingLead) {
      if (cache.leads.includes(span.title) && !existingLead.classList.contains('qualificar')) {
        const nomeCont = span.title;
        existingLead.classList.remove('adicionado');
        existingLead.classList.add('qualificar');
        existingLead.textContent = '✏';
        existingLead.style.pointerEvents = '';
        existingLead.onclick = (e) => { e.stopPropagation(); abrirPainelQualificacao(nomeCont, existingLead); };
      }
      return;
    }

    if (processados.has(container)) return;

    let targetSpan = null;
    container.querySelectorAll('span').forEach(s => {
      const txt = s.innerText?.trim();
      if (txt && DATA_RE.test(txt)) targetSpan = s;
    });

    if (!targetSpan) { processados.add(container); return; }

    const parent = targetSpan.parentElement;
    if (!parent || parent.querySelector('.lead-button')) return;

    const wrapper = document.createElement('span');
    wrapper.className = 'lead-date-wrapper';
    parent.insertBefore(wrapper, targetSpan);

    const classificacao = cache.classificacoes[span.title];
    const btnClass = document.createElement('button');
    btnClass.className = 'classificar-button' + (classificacao ? ' ' + classificacao : '');
    btnClass.textContent = classificacao ? LABELMAP[classificacao] : 'Classificar';
    btnClass.addEventListener('click', (e) => { e.stopPropagation(); abrirDropdown(btnClass, span.title); });

    const nomeContato = span.title || '';
    const jaAdicionado = cache.leads.includes(nomeContato);
    const btnLead = document.createElement('button');
    btnLead.className = 'lead-button' + (jaAdicionado ? ' qualificar' : '');
    const SVG_FORM = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`;
    btnLead.innerHTML = jaAdicionado ? SVG_FORM : '+Lead';

    if (jaAdicionado) {
      btnLead.onclick = (e) => { e.stopPropagation(); abrirPainelQualificacao(nomeContato, btnLead); };
    } else {
      btnLead.onclick = (e) => {
        e.stopPropagation();
        btnLead.innerHTML = SVG_FORM;
        btnLead.classList.add('qualificar');
        btnLead.onclick = (e2) => { e2.stopPropagation(); abrirPainelQualificacao(nomeContato, btnLead); };
        saveLead(nomeContato);
        buscarTelefoneNoDrawer(nomeContato, (tel) => salvarLeadSupabase(nomeContato, tel));
      };
    }

    wrapper.appendChild(btnClass);
    wrapper.appendChild(btnLead);
    wrapper.appendChild(targetSpan);
  });
}

// ── Observer cirúrgico ────────────────────────────────────────
let debounceTimer = null;

const observer = new MutationObserver(() => {
  if (!isContextValid()) { observer.disconnect(); return; }
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(injectButtons, 150);
});

function startObserver() {
  const sidebar = document.querySelector('#pane-side');
  if (!sidebar) { setTimeout(startObserver, 1000); return; }
  observer.observe(sidebar, { childList: true, subtree: true });
}

// ── Rastreio de mensagens enviadas (reseta timer do follow-up) ──
let chatObserver = null;
let chatEl = null;

function detectarNomeConversaAberta() {
  return document.querySelector('#main header [dir="auto"][title]')?.title || null;
}

function resolverDataRelativa(texto) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const t = texto.toLowerCase().trim();
  if (t === 'hoje') return hoje;
  if (t === 'ontem') { const d = new Date(hoje); d.setDate(d.getDate() - 1); return d; }
  // DD/MM/AAAA
  const full = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (full) return new Date(`${full[3]}-${full[2]}-${full[1]}T00:00:00`);
  // nome do dia (última ocorrência dentro de 7 dias)
  const dias = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const idx = dias.findIndex(d => t.startsWith(d));
  if (idx !== -1) {
    const diff = ((hoje.getDay() - idx) + 7) % 7 || 7;
    const d = new Date(hoje);
    d.setDate(d.getDate() - diff);
    return d;
  }
  return null;
}

function lerUltimaMensagemEnviada() {
  // Tenta primeiro pelo data-pre-plain-text (mensagens de texto)
  const comAttr = [...document.querySelectorAll('[data-pre-plain-text]')]
    .filter(el => el.closest('.message-out'));
  if (comAttr.length > 0) {
    const raw = comAttr[comAttr.length - 1].getAttribute('data-pre-plain-text');
    const match = raw.match(/\[(\d{2}:\d{2}), (\d{2}\/\d{2}\/\d{4})\]/);
    if (match) {
      const [, hora, data] = match;
      const [dia, mes, ano] = data.split('/');
      return new Date(`${ano}-${mes}-${dia}T${hora}:00`).getTime();
    }
  }

  // Fallback: última .message-out com horário no msg-meta + separador de data anterior
  const msgsOut = [...document.querySelectorAll('.message-out')];
  if (msgsOut.length === 0) return null;

  const ultima = msgsOut[msgsOut.length - 1];
  const metaEl = ultima.querySelector('[data-testid="msg-meta"]');
  const horaMatch = metaEl?.innerText?.trim().match(/^(\d{2}:\d{2})/);
  if (!horaMatch) return null;
  const hora = horaMatch[1];

  // Caminha para cima no DOM para achar o separador de data mais próximo
  const separadorClass = 'x140p0ai'; // classe identificada nos testes
  let el = ultima.closest('[role="row"], [data-testid]') || ultima;
  while (el) {
    el = el.previousElementSibling;
    if (!el) break;
    const span = el.querySelector(`span.${separadorClass}`);
    if (span) {
      const data = resolverDataRelativa(span.innerText?.trim());
      if (data) {
        const [h, m] = hora.split(':');
        data.setHours(parseInt(h), parseInt(m), 0, 0);
        return data.getTime();
      }
    }
  }
  return null;
}

function atualizarUltimoContato(nome, ts) {
  cache.timestamps[nome] = ts;
  salvarTimestamps();
  atualizarBadges();
  chrome.runtime.sendMessage({
    type: 'UPDATE_ULTIMO_CONTATO',
    nome,
    ultimo_contato: new Date(ts).toISOString()
  });
}

function registrarMensagemEnviada() {
  if (!isContextValid()) return;
  const nome = detectarNomeConversaAberta();
  if (!nome || !cache.leads.includes(nome)) return;
  const ts = lerUltimaMensagemEnviada() || Date.now();
  atualizarUltimoContato(nome, ts);
}

function sincronizarAoAbrirConversa(nome) {
  if (!nome || !cache.leads.includes(nome)) return;
  let tentativas = 0;
  const intervalo = setInterval(() => {
    tentativas++;
    const ts = lerUltimaMensagemEnviada();
    if (ts) {
      clearInterval(intervalo);
      atualizarUltimoContato(nome, ts);
    } else if (tentativas > 10) {
      clearInterval(intervalo);
      console.warn(`[Organiza] não conseguiu capturar timestamp para "${nome}"`);
    }
  }, 500);
}

function anexarChatObserver() {
  const chat = document.querySelector('#main [data-tab="8"], #main .copyable-area > div > div:nth-child(3)') ||
               document.querySelector('#main div[role="application"]') ||
               document.querySelector('#main');
  if (!chat || chat === chatEl) return;
  if (chatObserver) chatObserver.disconnect();
  chatEl = chat;
  chatObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const isMsgOut = node.querySelector?.('[data-pre-plain-text][class*="message-out"]') ||
                         node.classList?.contains('message-out') ||
                         node.querySelector?.('div[class*="message-out"]');
        if (isMsgOut) {
          registrarMensagemEnviada();
          return;
        }
      }
    }
  });
  chatObserver.observe(chat, { childList: true, subtree: true });
}

function resolverDataSidebar(texto) {
  const t = texto.trim();
  // HH:MM → hoje com esse horário
  if (/^\d{2}:\d{2}$/.test(t)) {
    const d = new Date();
    const [h, m] = t.split(':');
    d.setHours(parseInt(h), parseInt(m), 0, 0);
    return d.getTime();
  }
  const data = resolverDataRelativa(t);
  return data ? data.getTime() : null;
}

function sincronizarSidebar() {
  const sidebar = document.querySelector('#pane-side');
  if (!sidebar || !cache.pronto) return;
  let atualizado = false;
  sidebar.querySelectorAll('[role="gridcell"]').forEach(item => {
    const nameEl = item.querySelector('span[title][dir="auto"]');
    if (!nameEl || !cache.leads.includes(nameEl.title)) return;
    const nome = nameEl.title;

    const timeEl = [...item.querySelectorAll('span.x140p0ai')].find(s =>
      /^\d{2}:\d{2}$|^\d{2}\/\d{2}\/\d{4}$|^hoje$|^ontem$|^segunda|^terça|^quarta|^quinta|^sexta|^sábado|^domingo/i.test(s.innerText?.trim())
    );

    if (!timeEl) return;
    const ts = resolverDataSidebar(timeEl.innerText.trim());

    if (!ts) return;
    cache.timestamps[nome] = ts;
    atualizado = true;
    chrome.runtime.sendMessage({
      type: 'UPDATE_ULTIMO_CONTATO',
      nome,
      ultimo_contato: new Date(ts).toISOString()
    });
  });
  if (atualizado) { salvarTimestamps(); atualizarBadges(); }
}

function iniciarRastreioEnvios() {
  const pane = document.querySelector('#pane-side');
  if (!pane) { setTimeout(iniciarRastreioEnvios, 1000); return; }
  // Sincroniza ao clicar (nova conversa aberta) e ao enviar mensagem
  pane.addEventListener('click', () => {
    setTimeout(() => {
      sincronizarSidebar();
      anexarChatObserver();
    }, 1000);
  }, { passive: true });
  anexarChatObserver();
  // Sincroniza sidebar ao iniciar e quando novos itens carregam
  setTimeout(sincronizarSidebar, 2000);
  new MutationObserver(sincronizarSidebar)
    .observe(pane, { childList: true, subtree: true });
}

// ── Follow-up 24h ─────────────────────────────────────────────
const FOLLOWUP_MSG = (nome) =>
  `Oi ${nome}, tudo bem? Queria saber se você teve a chance de pensar na nossa conversa 😊`;

function tempoDecorrido(ts) {
  const h = Math.floor((Date.now() - ts) / 3600000);
  return h < 48 ? `${h}h sem resposta` : `${Math.floor(h/24)} dias sem resposta`;
}

function enviarFollowUp(nome) {
  const msg = FOLLOWUP_MSG(nome);

  function abrirComTelefone(tel) {
    window.location.href = `https://web.whatsapp.com/send?phone=${encodeURIComponent(tel)}&text=${encodeURIComponent(msg)}`;
  }

  const telefone = cache.telefones[nome];
  if (telefone) {
    abrirComTelefone(telefone);
    return;
  }

  // Não está no cache — busca direto no banco
  chrome.runtime.sendMessage({ type: 'BUSCAR_TELEFONE_LEAD', nome }, (resp) => {
    const tel = resp?.telefone;
    if (tel) {
      cache.telefones[nome] = tel;
      abrirComTelefone(tel);
    } else {
      // Lead sem telefone cadastrado — abre caixa de busca como fallback
      window.location.href = `https://web.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    }
  });
}

// SVG placeholder da logo Organiza — substituir pelo arquivo real quando disponível
const ORGANIZA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
  <defs>
    <linearGradient id="og" x1="12" y1="1" x2="12" y2="23" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#D6F04F"/>
      <stop offset="100%" stop-color="#69CD5A"/>
    </linearGradient>
  </defs>
  <circle cx="12" cy="12" r="9.5" stroke="url(#og)" stroke-width="2"
    stroke-dasharray="11.5 3.4" stroke-dashoffset="5.74"
    transform="rotate(45 12 12)"/>
  <circle cx="12" cy="12" r="5.5" stroke="url(#og)" stroke-width="2"
    stroke-dasharray="6.64 2.0" stroke-dashoffset="3.32"
    transform="rotate(45 12 12)"/>
  <line x1="12" y1="2" x2="12" y2="6.5" stroke="url(#og)" stroke-width="2" stroke-linecap="round"/>
  <line x1="12" y1="17.5" x2="12" y2="22" stroke="url(#og)" stroke-width="2" stroke-linecap="round"/>
  <line x1="2" y1="12" x2="6.5" y2="12" stroke="url(#og)" stroke-width="2" stroke-linecap="round"/>
  <line x1="17.5" y1="12" x2="22" y2="12" stroke="url(#og)" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="12" r="1.5" fill="url(#og)"/>
</svg>`;

function contarPendentes() {
  const agora = Date.now();
  const UMA_DIA = 86400000;
  return cache.leads.filter(nome => {
    const ts = cache.timestamps[nome];
    return ts && agora - ts >= UMA_DIA && !isLeadSnoozed(nome);
  }).length;
}

function atualizarBadges() {
  const n = contarPendentes();
  const navBadge = document.querySelector('#organiza-nav-btn .organiza-badge');
  if (navBadge) {
    navBadge.style.display = n > 0 ? 'flex' : 'none';
    navBadge.textContent = n;
  }
  const menuBadge = document.querySelector('#organiza-item-followup .menu-badge');
  if (menuBadge) {
    menuBadge.style.display = n > 0 ? 'inline' : 'none';
    menuBadge.textContent = n;
  }
}

function fecharSnoozePopup() {
  document.querySelectorAll('.snooze-popup').forEach(p => p.remove());
}

function criarCalendarioSnooze(onConfirm) {
  const hoje = new Date();
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  let viewYear = amanha.getFullYear();
  let viewMonth = amanha.getMonth();
  let selectedDate = null;

  const wrapper = document.createElement('div');
  wrapper.className = 'snooze-cal';

  function render() {
    wrapper.innerHTML = '';

    // Header: nav + título
    const header = document.createElement('div');
    header.className = 'snooze-cal-header';

    const btnPrev = document.createElement('button');
    btnPrev.textContent = '‹';
    btnPrev.className = 'snooze-cal-nav';
    btnPrev.addEventListener('click', e => {
      e.stopPropagation();
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render();
    });

    const title = document.createElement('span');
    title.className = 'snooze-cal-title';
    title.textContent = MESES[viewMonth] + ' de ' + viewYear;

    const btnNext = document.createElement('button');
    btnNext.textContent = '›';
    btnNext.className = 'snooze-cal-nav';
    btnNext.addEventListener('click', e => {
      e.stopPropagation();
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render();
    });

    header.appendChild(btnPrev);
    header.appendChild(title);
    header.appendChild(btnNext);
    wrapper.appendChild(header);

    // Cabeçalho dos dias da semana
    const weekRow = document.createElement('div');
    weekRow.className = 'snooze-cal-week';
    ['D','S','T','Q','Q','S','S'].forEach(d => {
      const s = document.createElement('span');
      s.textContent = d;
      weekRow.appendChild(s);
    });
    wrapper.appendChild(weekRow);

    // Grid de dias
    const grid = document.createElement('div');
    grid.className = 'snooze-cal-grid';

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstWeekday; i++) {
      const empty = document.createElement('span');
      empty.className = 'snooze-cal-day scd-empty';
      grid.appendChild(empty);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dayDate = new Date(viewYear, viewMonth, d);
      const dayEl = document.createElement('span');
      dayEl.className = 'snooze-cal-day';
      dayEl.textContent = d;

      const isDisabled = dayDate < amanha;
      const isToday = dayDate.toDateString() === hoje.toDateString();
      const isSelected = selectedDate && dayDate.toDateString() === selectedDate.toDateString();

      if (isDisabled) {
        dayEl.classList.add('scd-disabled');
      } else {
        if (isSelected) dayEl.classList.add('scd-selected');
        else if (isToday) dayEl.classList.add('scd-today');
        dayEl.addEventListener('click', e => {
          e.stopPropagation();
          onConfirm(new Date(viewYear, viewMonth, d, 23, 59, 59).getTime());
        });
      }

      grid.appendChild(dayEl);
    }

    wrapper.appendChild(grid);
  }

  render();
  return wrapper;
}

function abrirSnoozePopup(btn, nome) {
  fecharSnoozePopup();

  const popup = document.createElement('div');
  popup.className = 'snooze-popup';

  const opcoes = [
    { label: '1 semana', dias: 7 },
    { label: '2 semanas', dias: 14 },
    { label: '1 mês', dias: 30 },
  ];

  function confirmarSnooze(ts) {
    document.removeEventListener('click', outsideHandler, true);
    snoozeAte(nome, ts);
    fecharSnoozePopup();
    renderizarPainel();
  }

  opcoes.forEach(({ label, dias }) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', () => confirmarSnooze(Date.now() + dias * 86400000));
    popup.appendChild(b);
  });

  const hr = document.createElement('hr');
  popup.appendChild(hr);

  // Calendário custom no padrão Organiza
  const cal = criarCalendarioSnooze(confirmarSnooze);
  popup.appendChild(cal);

  const rect = btn.getBoundingClientRect();
  popup.style.top  = (rect.bottom + 4) + 'px';
  popup.style.left = Math.max(8, rect.right - 180) + 'px';
  document.body.appendChild(popup);

  function outsideHandler(e) {
    if (!popup.contains(e.target) && e.target !== btn) {
      fecharSnoozePopup();
      document.removeEventListener('click', outsideHandler, true);
    }
  }
  setTimeout(() => document.addEventListener('click', outsideHandler, true), 0);
}

function formatarDataSnooze(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderizarPainel() {
  if (!isContextValid()) return;
  const agora = Date.now();
  const UMA_DIA = 86400000;

  const pendentes = cache.leads
    .filter(nome => { const ts = cache.timestamps[nome]; return ts && agora - ts >= UMA_DIA && !isLeadSnoozed(nome); })
    .map(nome => ({ nome, criado_em: cache.timestamps[nome] }))
    .sort((a, b) => a.criado_em - b.criado_em);

  const pausados = cache.leads
    .filter(nome => { const ts = cache.timestamps[nome]; return ts && agora - ts >= UMA_DIA && isLeadSnoozed(nome); })
    .map(nome => ({ nome, ate: cache.snoozed[nome] }))
    .sort((a, b) => a.ate - b.ate);

  const panel = document.getElementById('lead-followup-panel');
  if (!panel) return;

  atualizarBadges();

  panel.innerHTML = `
    <div class="panel-header">
      <h3>Lembretes</h3>
      <p>${pendentes.length} lead${pendentes.length !== 1 ? 's' : ''} sem resposta</p>
    </div>
  `;

  if (pendentes.length === 0 && pausados.length === 0) {
    panel.innerHTML += `<div class="panel-empty">Nenhum lead pendente no momento.</div>`;
    return;
  }

  if (pendentes.length === 0) {
    panel.innerHTML += `<div class="panel-empty" style="padding:16px 18px;">Todos os leads estão pausados.</div>`;
  }

  pendentes.forEach(lead => {
    const row = document.createElement('div');
    row.className = 'followup-row';
    row.innerHTML = `
      <div class="info">
        <strong>${lead.nome}</strong>
        <span>${tempoDecorrido(lead.criado_em)}</span>
      </div>
      <button class="snooze-btn" data-nome="${lead.nome}" title="Pausar follow-up">⏸</button>
      <button class="send-btn" data-nome="${lead.nome}">Enviar</button>
    `;
    panel.appendChild(row);
  });

  if (pausados.length > 0) {
    const titulo = document.createElement('div');
    titulo.className = 'followup-section-title';
    titulo.dataset.collapsed = 'false';
    titulo.innerHTML = `<span>Em pausa (${pausados.length})</span><span>▲</span>`;
    panel.appendChild(titulo);

    const snoozedList = document.createElement('div');
    snoozedList.id = 'followup-snoozed-list';

    pausados.forEach(lead => {
      const row = document.createElement('div');
      row.className = 'followup-snoozed-row';
      row.innerHTML = `
        <div class="info" style="flex:1;min-width:0;">
          <strong>${lead.nome}</strong>
          <span>Pausado até ${formatarDataSnooze(lead.ate)}</span>
        </div>
        <button class="reativar-btn" data-nome="${lead.nome}">Reativar</button>
      `;
      snoozedList.appendChild(row);
    });

    panel.appendChild(snoozedList);
  }
}

function fecharPainel() {
  document.getElementById('lead-followup-panel')?.classList.remove('open');
}

let outsideQualHandler = null;

function fecharPainelQualificacao() {
  document.getElementById('lead-qualificacao-panel')?.remove();
  if (outsideQualHandler) {
    document.removeEventListener('click', outsideQualHandler, true);
    outsideQualHandler = null;
  }
}

function abrirPainelQualificacao(nome, btn) {
  fecharPainelQualificacao();
  fecharMiniMenu();

  const q = cache.qualificacoes[nome] || {};

  const panel = document.createElement('div');
  panel.id = 'lead-qualificacao-panel';

  const ticketFormatado = q.ticket ? Number(q.ticket).toLocaleString('pt-BR') : '';

  panel.innerHTML = `
    <div class="qual-header">
      <span class="qual-nome">${nome}</span>
      <button class="qual-close">✕</button>
    </div>
    <div class="qual-body">
      <div>
        <span class="qual-label">Status do negócio</span>
        <div class="qual-radio-group">
          <label class="qual-radio"><input type="radio" name="qual-status" value="busca" ${q.status==='busca'?'checked':''}>Em busca</label>
          <label class="qual-radio"><input type="radio" name="qual-status" value="negociacao" ${q.status==='negociacao'?'checked':''}>Em negociação</label>
          <label class="qual-radio"><input type="radio" name="qual-status" value="vendido" ${q.status==='vendido'?'checked':''}>Vendido</label>
        </div>
      </div>
      <div>
        <span class="qual-label">Ticket (R$)</span>
        <input class="qual-input" id="qual-ticket" type="text" placeholder="Ex: 850.000" value="${ticketFormatado}">
      </div>
      <div>
        <span class="qual-label">Localização de interesse</span>
        <input class="qual-input" id="qual-local" type="text" placeholder="Ex: Pinheiros, Moema..." value="${q.localizacao || ''}">
      </div>
      <div>
        <span class="qual-label">Momento de compra</span>
        <div class="qual-radio-group">
          <label class="qual-radio"><input type="radio" name="qual-momento" value="pronto" ${q.momento==='pronto'?'checked':''}>Pronto pra morar</label>
          <label class="qual-radio"><input type="radio" name="qual-momento" value="obra" ${q.momento==='obra'?'checked':''}>Em obra / Lançamento</label>
          <label class="qual-radio"><input type="radio" name="qual-momento" value="indefinido" ${q.momento==='indefinido'?'checked':''}>Sem definição</label>
        </div>
      </div>
      <div>
        <span class="qual-label">Observações</span>
        <textarea class="qual-textarea" id="qual-obs" placeholder="Anote detalhes, objeções, próximos passos...">${q.observacoes || ''}</textarea>
      </div>
    </div>
    <div class="qual-footer">
      <button class="qual-save">Salvar</button>
    </div>
  `;

  // Formata ticket enquanto digita
  panel.querySelector('#qual-ticket').addEventListener('input', function() {
    const nums = this.value.replace(/\D/g, '');
    this.value = nums ? Number(nums).toLocaleString('pt-BR') : '';
  });

  panel.querySelector('.qual-close').addEventListener('click', fecharPainelQualificacao);

  panel.querySelector('.qual-save').addEventListener('click', () => {
    const status     = panel.querySelector('input[name="qual-status"]:checked')?.value   || null;
    const ticket     = (() => { const n = panel.querySelector('#qual-ticket').value.replace(/\D/g,''); return n ? parseInt(n, 10) : null; })();
    const localizacao = panel.querySelector('#qual-local').value.trim() || null;
    const momento    = panel.querySelector('input[name="qual-momento"]:checked')?.value  || null;
    const observacoes = panel.querySelector('#qual-obs').value.trim() || null;

    cache.qualificacoes[nome] = { status, ticket, localizacao, momento, observacoes };
    salvarQualificacoes();
    atualizarQualificacaoSupabase(nome, { ticket, localizacao, momento_compra: momento, status_negociacao: status, observacoes });
    fecharPainelQualificacao();
  });

  // Posicionamento
  const rect = btn.getBoundingClientRect();
  let top  = rect.bottom + 6;
  let left = rect.left;
  if (top + 420 > window.innerHeight) top = Math.max(8, window.innerHeight - 426);
  if (left + 280 > window.innerWidth)  left = window.innerWidth - 288;
  panel.style.top  = top  + 'px';
  panel.style.left = left + 'px';

  document.body.appendChild(panel);

  setTimeout(() => {
    outsideQualHandler = function(e) {
      if (!panel.contains(e.target) && e.target !== btn) {
        fecharPainelQualificacao();
      }
    };
    document.addEventListener('click', outsideQualHandler, true);
  }, 0);
}

function fecharMiniMenu() {
  document.getElementById('organiza-mini-menu')?.classList.remove('open');
}

function posicionarMiniMenu() {
  const btn = document.getElementById('organiza-nav-btn');
  const menu = document.getElementById('organiza-mini-menu');
  if (!btn || !menu) return;
  const rect = btn.getBoundingClientRect();
  menu.style.top  = rect.top + 'px';
  menu.style.left = (rect.right + 8) + 'px';
}

function toggleMiniMenu() {
  const menu = document.getElementById('organiza-mini-menu');
  if (!menu) return;
  if (menu.classList.contains('open')) {
    fecharMiniMenu();
  } else {
    fecharPainel();
    posicionarMiniMenu();
    menu.classList.add('open');
  }
}

function abrirFollowUpPainel() {
  fecharMiniMenu();
  const panel = document.getElementById('lead-followup-panel');
  if (!panel) return;
  const btn = document.getElementById('organiza-nav-btn');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    panel.style.top  = rect.top + 'px';
    panel.style.left = (rect.right + 8) + 'px';
  }
  renderizarPainel();
  panel.classList.add('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#organiza-mini-menu') && !e.target.closest('#organiza-nav-btn')) {
    fecharMiniMenu();
  }
  if (!e.target.closest('#lead-followup-panel') && !e.target.closest('#organiza-item-followup') && !e.target.closest('.snooze-popup')) {
    fecharPainel();
  }
}, { passive: true });

function criarBotaoOrganiza() {
  if (document.getElementById('organiza-nav-btn')) return;

  // Painel de follow-up — listener único (event delegation)
  const panel = document.createElement('div');
  panel.id = 'lead-followup-panel';
  panel.addEventListener('click', (e) => {
    const snoozeBtn   = e.target.closest('.snooze-btn');
    const sendBtn     = e.target.closest('.send-btn');
    const reativarBtn = e.target.closest('.reativar-btn');
    const titulo      = e.target.closest('.followup-section-title');
    if (snoozeBtn) {
      e.stopPropagation();
      abrirSnoozePopup(snoozeBtn, snoozeBtn.dataset.nome);
    } else if (sendBtn) {
      enviarFollowUp(sendBtn.dataset.nome);
    } else if (reativarBtn) {
      removerSnooze(reativarBtn.dataset.nome);
      renderizarPainel();
    } else if (titulo) {
      const isColl = titulo.dataset.collapsed === 'true';
      titulo.dataset.collapsed = isColl ? 'false' : 'true';
      const icon = titulo.querySelector('span:last-child');
      const list = document.getElementById('followup-snoozed-list');
      if (isColl) { if (list) list.style.display = ''; if (icon) icon.textContent = '▲'; }
      else         { if (list) list.style.display = 'none'; if (icon) icon.textContent = '▼'; }
    }
  });
  document.body.appendChild(panel);

  // Mini-menu
  const miniMenu = document.createElement('div');
  miniMenu.id = 'organiza-mini-menu';

  const itemPainel = document.createElement('button');
  itemPainel.className = 'organiza-menu-item';
  itemPainel.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#69CD5A" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>Acessar Painel`;
  itemPainel.addEventListener('click', () => {
    fecharMiniMenu();
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  });

  const itemFollowup = document.createElement('button');
  itemFollowup.className = 'organiza-menu-item';
  itemFollowup.id = 'organiza-item-followup';
  itemFollowup.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#69CD5A" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>Lembretes<span class="menu-badge" style="display:none">0</span>`;
  itemFollowup.addEventListener('click', abrirFollowUpPainel);

  miniMenu.appendChild(itemPainel);
  miniMenu.appendChild(itemFollowup);
  document.body.appendChild(miniMenu);

  // Botão no nav lateral
  const navBtn = document.createElement('button');
  navBtn.id = 'organiza-nav-btn';
  navBtn.title = 'Organiza';
  navBtn.innerHTML = `${ORGANIZA_LOGO_SVG}<span class="organiza-badge">0</span>`;
  navBtn.addEventListener('click', toggleMiniMenu);

  function inserirNoNavLateral() {
    const qualquerItem = document.querySelector('[data-navbar-item="true"]');
    if (!qualquerItem) { setTimeout(inserirNoNavLateral, 1000); return; }
    if (document.getElementById('organiza-nav-btn')) return;

    // Sobe: button → span.html-span → div-item → container-nav
    const containerNav = qualquerItem.parentElement?.parentElement?.parentElement;
    if (!containerNav) { setTimeout(inserirNoNavLateral, 500); return; }

    // Cria wrapper que imita a estrutura dos outros itens do nav
    const wrapperDiv = document.createElement('div');
    wrapperDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;';

    const wrapperSpan = document.createElement('span');
    wrapperSpan.appendChild(navBtn);
    wrapperDiv.appendChild(wrapperSpan);
    containerNav.appendChild(wrapperDiv);
  }
  inserirNoNavLateral();
  renderizarPainel();
}

// ── Inicialização ─────────────────────────────────────────────
let initialized = false;

function initExtension() {
  if (initialized) return;
  initialized = true;
  carregarCache(() => {
    injectButtons();
    startObserver();
    iniciarRastreioEnvios();
    setTimeout(criarBotaoOrganiza, 4000);
  });
}

// Inicializa ao carregar a página se já houver sessão
chrome.runtime.sendMessage({ type: 'GET_SESSION' }, (resp) => {
  if (resp && resp.session) initExtension();
});

function destroyExtension() {
  if (!initialized) return;
  initialized = false;

  observer.disconnect();
  if (chatObserver) { chatObserver.disconnect(); chatObserver = null; chatEl = null; }

  document.querySelectorAll('.lead-button, .classificar-button, .lead-date-wrapper').forEach(el => {
    // restaura o span de data que estava dentro do wrapper
    const target = el.querySelector && el.querySelector('span');
    if (el.classList.contains('lead-date-wrapper') && target && el.parentElement) {
      el.parentElement.insertBefore(target, el);
    }
    el.remove();
  });

  document.getElementById('organiza-nav-btn')?.closest('div')?.remove();
  document.getElementById('organiza-mini-menu')?.remove();
  document.getElementById('lead-followup-panel')?.remove();
  document.getElementById('lead-qualificacao-panel')?.remove();
  document.querySelectorAll('.lead-dropdown, .snooze-popup').forEach(el => el.remove());

  gruposConfirmados.clear();
  cache.pronto = false;
  leadsJaEnviados.clear();
}

// Inicializa quando o popup faz login (sem precisar dar F5)
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SESSION_READY')  initExtension();
  if (msg.type === 'SESSION_LOGOUT') destroyExtension();
});
