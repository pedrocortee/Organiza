const SUPABASE_URL = 'https://tkxvbuzykfnoxiyeoams.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRreHZidXp5a2Zub3hpeWVvYW1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNjczMzMsImV4cCI6MjA5MDc0MzMzM30.eUpA1ZR-h-4j0XOXhoHYXC98ESPtekWDsON5HYCtq30';

let currentUserId = null;
let currentJwt    = null;

function getHeaders(jwt) {
  const token = jwt || currentJwt;
  return {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token || ''}`,
    'Prefer': 'return=minimal'
  };
}

// ── Auth helpers ─────────────────────────────────────────────
async function refreshJwt(refresh_token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
    body: JSON.stringify({ refresh_token })
  });
  if (!r.ok) return null;
  return r.json();
}

async function getValidSession() {
  return new Promise(resolve => {
    chrome.storage.local.get(['auth_session'], async (r) => {
      const session = r.auth_session;
      if (!session) { resolve(null); return; }

      if (session.expires_at > Date.now() + 60000) {
        resolve(session); return;
      }

      // Token expired — try refresh
      const refreshed = await refreshJwt(session.refresh_token).catch(() => null);
      if (!refreshed) { resolve(null); return; }

      const newSession = {
        access_token:  refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        user_id:       refreshed.user.id,
        email:         refreshed.user.email,
        expires_at:    Date.now() + (refreshed.expires_in || 3600) * 1000
      };
      chrome.storage.local.set({ auth_session: newSession });
      resolve(newSession);
    });
  });
}

async function getAuthContext() {
  const session = await getValidSession();
  if (!session) return { profileId: null, phone: '' };
  currentJwt = session.access_token;
  return new Promise(resolve => {
    chrome.storage.local.get(['extensao_user_id'], r => {
      resolve({ profileId: session.user_id, phone: r.extensao_user_id || '' });
    });
  });
}

// Valida se o telefone é um número real de contato (não o user_id do corretor)
// Rejeita: vazio, muito curto, igual ao userId, ou claramente inválido
function telefoneValido(tel, userId) {
  if (!tel || tel.trim() === '') return false;
  const limpo = tel.trim().replace(/[\s\-\(\)]/g, '');
  if (limpo.length < 8) return false;
  // Rejeita se for igual ao userId do corretor (bug de versões anteriores)
  const userIdLimpo = (userId || '').replace(/[\s\-\(\)]/g, '');
  if (limpo === userIdLimpo) return false;
  // Rejeita se não tiver ao menos 8 dígitos
  if (!/\d{8,}/.test(limpo)) return false;
  return true;
}

// Listener para mensagens EXTERNAS (vindas do GitHub Pages / Netlify)
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  const allowedOrigins = ['https://pedrocortee.github.io', 'https://splendid-fox-f0ee35.netlify.app'];
  if (!allowedOrigins.includes(sender.origin)) return;

  if (msg.type === 'OPEN_WHATSAPP') {
    const url = msg.url;
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { url, active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url });
      }
    });
    return true;
  }

  if (msg.type === 'SET_SESSION' && msg.session) {
    currentJwt = msg.session.access_token;
    chrome.storage.local.set({ auth_session: msg.session });
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'SESSION_READY' }).catch(() => {}));
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'GET_SESSION') {
    getValidSession().then(session => sendResponse({ session }));
    return true;
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'SET_SESSION' && msg.session) {
    currentJwt = msg.session.access_token;
    chrome.storage.local.set({ auth_session: msg.session });
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'SESSION_READY' }).catch(() => {}));
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: `https://pedrocortee.github.io/Organiza/?ext_id=${chrome.runtime.id}` });
    return true;
  }

  if (msg.type === 'SET_USER_ID' && msg.userId) {
    currentUserId = msg.userId;
    chrome.storage.local.set({ extensao_user_id: msg.userId });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'GET_SESSION') {
    getValidSession().then(session => sendResponse({ session }));
    return true;
  }

  if (msg.type === 'SIGN_OUT') {
    currentUserId = null;
    currentJwt    = null;
    chrome.storage.local.remove(['auth_session', 'extensao_user_id']);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'NOTIFY_CONTENT') {
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'SESSION_READY' }).catch(() => {}));
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'NOTIFY_CONTENT_LOGOUT') {
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, { type: 'SESSION_LOGOUT' }).catch(() => {}));
    });
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'OPEN_WHATSAPP') {
    const url = msg.url;
    chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.update(tabs[0].id, { url, active: true });
        chrome.windows.update(tabs[0].windowId, { focused: true });
      } else {
        chrome.tabs.create({ url });
      }
    });
    return true;
  }

  if (msg.type === 'INSERT_LEAD') {
    getAuthContext().then(({ profileId, phone }) => {
      if (!profileId) {
        sendResponse({ ok: false, error: 'not_authenticated' });
        return;
      }
      // Garante que nunca salva o telefone do próprio corretor como lead
      const telFinal = telefoneValido(msg.telefone, phone) ? msg.telefone.trim() : null;
      fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          profile_id: profileId,
          nome: msg.nome,
          telefone: telFinal,
          classificacao: msg.classificacao || null,
          criado_em: new Date().toISOString()
        })
      })
      .then(r => { sendResponse({ ok: r.ok, status: r.status }); })
      .catch(e => { sendResponse({ ok: false, error: e.message }); });
    });
    return true;
  }

  if (msg.type === 'UPDATE_CLASSIFICACAO') {
    getAuthContext().then(({ profileId }) => {
      if (!profileId) { sendResponse({ ok: false, error: 'not_authenticated' }); return; }
      const url = `${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&nome=eq.${encodeURIComponent(msg.nome)}`;
      fetch(url, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify({ classificacao: msg.classificacao })
      })
      .then(r => r.text().then(t => {
        sendResponse({ ok: r.ok, status: r.status, body: t });
      }))
      .catch(e => { sendResponse({ ok: false, error: e.message }); });
    });
    return true;
  }

  if (msg.type === 'UPDATE_ULTIMO_CONTATO') {
    getAuthContext().then(({ profileId }) => {
      if (!profileId) { sendResponse({ ok: false, error: 'not_authenticated' }); return; }
      const url = `${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&nome=eq.${encodeURIComponent(msg.nome)}`;
      fetch(url, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ ultimo_contato: msg.ultimo_contato })
      })
      .then(r => sendResponse({ ok: r.ok }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    });
    return true;
  }

  if (msg.type === 'BUSCAR_TIMESTAMPS') {
    getAuthContext().then(({ profileId }) => {
      if (!profileId) { sendResponse({ ok: true, data: [] }); return; }
      const url = `${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&select=nome,ultimo_contato&ultimo_contato=not.is.null`;
      fetch(url, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    });
    return true;
  }

  if (msg.type === 'BUSCAR_QUALIFICACOES') {
    getAuthContext().then(({ profileId }) => {
      if (!profileId) { sendResponse({ ok: true, data: [] }); return; }
      const url = `${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&select=nome,ticket,localizacao,momento_compra,status_negociacao`;
      fetch(url, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    });
    return true;
  }

  if (msg.type === 'BUSCAR_LEADS') {
    getAuthContext().then(({ profileId }) => {
      if (!profileId) { sendResponse({ ok: true, data: [] }); return; }
      const url = `${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&select=nome,classificacao,telefone`;
      fetch(url, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    });
    return true;
  }

  if (msg.type === 'BUSCAR_TELEFONE_LEAD') {
    getAuthContext().then(({ profileId }) => {
      if (!profileId) { sendResponse({ ok: false, telefone: '' }); return; }
      const url = `${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&nome=eq.${encodeURIComponent(msg.nome)}&select=telefone&limit=1`;
      fetch(url, { headers: getHeaders() })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, telefone: (data[0]?.telefone) || '' }))
      .catch(e => sendResponse({ ok: false, telefone: '' }));
    });
    return true;
  }

  if (msg.type === 'AUTH_SIGN_IN') {
    const { email, password } = msg;
    fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ email, password })
    })
    .then(async r => {
      const data = await r.json();
      if (!r.ok) { sendResponse({ ok: false, error: data.error_description || 'Email ou senha incorretos.' }); return; }
      const session = {
        access_token:  data.access_token,
        refresh_token: data.refresh_token,
        user_id:       data.user.id,
        email:         data.user.email,
        expires_at:    Date.now() + (data.expires_in || 3600) * 1000
      };
      chrome.storage.local.set({ auth_session: session });
      currentJwt = session.access_token;
      sendResponse({ ok: true, session });
    })
    .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'AUTH_RECOVER') {
    const { email, extensionId } = msg;
    fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ email, redirect_to: `https://pedrocortee.github.io/Organiza/?ext_id=${extensionId}` })
    })
    .then(r => sendResponse({ ok: r.ok }))
    .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (msg.type === 'FETCH_PROFILE') {
    getValidSession().then(session => {
      if (!session) { sendResponse({ ok: false, profile: null }); return; }
      fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${session.user_id}&select=phone,plano_expira_em`, {
        headers: getHeaders(session.access_token)
      })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, profile: data[0] || null }))
      .catch(e => sendResponse({ ok: false, error: e.message, profile: null }));
    });
    return true;
  }

  if (msg.type === 'FETCH_LEADS') {
    getAuthContext().then(({ profileId }) => {
      if (!profileId) { sendResponse({ ok: false, data: [] }); return; }
      fetch(`${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&order=criado_em.desc`, {
        headers: getHeaders()
      })
      .then(r => r.json())
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message, data: [] }));
    });
    return true;
  }

  if (msg.type === 'UPDATE_QUALIFICACAO') {
    getAuthContext().then(({ profileId }) => {
      if (!profileId) { sendResponse({ ok: false, error: 'not_authenticated' }); return; }
      const url = `${SUPABASE_URL}/rest/v1/leads?profile_id=eq.${encodeURIComponent(profileId)}&nome=eq.${encodeURIComponent(msg.nome)}`;
      fetch(url, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          ticket:            msg.ticket            ?? null,
          localizacao:       msg.localizacao        ?? null,
          momento_compra:    msg.momento_compra     ?? null,
          status_negociacao: msg.status_negociacao  ?? null,
          observacoes:       msg.observacoes        ?? null
        })
      })
      .then(r => sendResponse({ ok: r.ok }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    });
    return true;
  }
});