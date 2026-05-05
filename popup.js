const SCREENS = ['s-disclosure', 's-login', 's-forgot', 's-loading', 's-active', 's-blocked'];

function show(id, loadingMsg) {
  SCREENS.forEach(s => {
    const el = document.getElementById(s);
    el.classList.toggle('visible', s === id);
  });
  if (id === 's-loading' && loadingMsg) {
    document.getElementById('loading-msg').textContent = loadingMsg;
  }
}

// ── Auth via background ──────────────────────────────────────
async function authSignIn(email, password) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'AUTH_SIGN_IN', email, password }, (resp) => {
      if (resp?.ok) resolve(resp.session);
      else reject(new Error(resp?.error || 'Email ou senha incorretos.'));
    });
  });
}

async function authRecover(email) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'AUTH_RECOVER', email, extensionId: chrome.runtime.id }, (resp) => {
      if (resp?.ok) resolve();
      else reject(new Error('Erro ao enviar o email. Verifique o endereço e tente novamente.'));
    });
  });
}

// ── Profile via background ───────────────────────────────────
async function fetchProfile() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'FETCH_PROFILE' }, (resp) => {
      resolve(resp?.profile || null);
    });
  });
}

// ── Session storage ──────────────────────────────────────────
function getSession() {
  return new Promise(res => chrome.storage.local.get(['auth_session'], r => res(r.auth_session || null)));
}

function clearSession() {
  return new Promise(res => chrome.storage.local.remove(
    ['auth_session', 'extensao_user_id', 'leads', 'classificacoes', 'leadTimestamps', 'leadSnoozed', 'leadQualificacoes'],
    res
  ));
}

// ── Subscription check ───────────────────────────────────────
function checkPlano(profile) {
  if (!profile || !profile.plano_expira_em) return 'pending';
  const expiry = new Date(profile.plano_expira_em);
  return expiry > new Date() ? 'ok' : 'expired';
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Show active screen ───────────────────────────────────────
function showActive(session, profile) {
  const status = checkPlano(profile);

  if (status === 'expired') {
    document.getElementById('block-msg').textContent =
      `Sua assinatura expirou em ${fmtDate(profile.plano_expira_em)}. Entre em contato para renovar.`;
    document.getElementById('block-badge').textContent = '⊘ Assinatura expirada';
    show('s-blocked');
    return;
  }

  if (status === 'pending') {
    document.getElementById('block-msg').textContent =
      'Sua conta está aguardando ativação. Entre em contato com a equipe Organiza.';
    document.getElementById('block-badge').textContent = '◌ Aguardando ativação';
    document.getElementById('block-badge').className = 'badge pending';
    show('s-blocked');
    return;
  }

  // Active — notifica o WhatsApp Web para inicializar sem precisar de F5
  chrome.runtime.sendMessage({ type: 'NOTIFY_CONTENT' });

  const badge = document.getElementById('plano-badge');
  badge.textContent = '● Ativo';
  badge.className   = 'badge ok';

  document.getElementById('active-expiry').textContent = profile ? fmtDate(profile.plano_expira_em) : '—';

  if (profile && profile.phone) {
    chrome.storage.local.set({ extensao_user_id: profile.phone });
    chrome.runtime.sendMessage({ type: 'SET_USER_ID', userId: profile.phone });
  }

  show('s-active');
}

// ── Session init ─────────────────────────────────────────────
async function initSession() {
  show('s-loading', 'Verificando sessão...');

  // GET_SESSION handles token refresh automatically via background
  const { session } = await new Promise(resolve =>
    chrome.runtime.sendMessage({ type: 'GET_SESSION' }, resolve)
  );

  if (!session) { show('s-login'); return; }

  try {
    const profile = await fetchProfile();
    showActive(session, profile);
  } catch {
    chrome.runtime.sendMessage({ type: 'NOTIFY_CONTENT' });
    show('s-active');
  }
}

// ── Login ────────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const pwd   = document.getElementById('login-pwd').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !pwd) { errEl.textContent = 'Preencha email e senha.'; return; }

  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Entrando...';

  try {
    show('s-loading', 'Entrando...');
    const session = await authSignIn(email, pwd);
    const profile = await fetchProfile();
    showActive(session, profile);
  } catch (e) {
    show('s-login');
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
});

// ── Navigation ───────────────────────────────────────────────
document.getElementById('btn-assinar').addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://splendid-fox-f0ee35.netlify.app' });
  window.close();
});
document.getElementById('btn-goto-forgot').addEventListener('click', () => {
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-success').textContent = '';
  document.getElementById('forgot-error').textContent = '';
  document.getElementById('forgot-success').textContent = '';
  show('s-forgot');
});
document.getElementById('btn-goto-login-from-forgot').addEventListener('click', () => {
  document.getElementById('forgot-error').textContent = '';
  document.getElementById('forgot-success').textContent = '';
  show('s-login');
});

document.getElementById('btn-forgot-send').addEventListener('click', async () => {
  const email  = document.getElementById('forgot-email').value.trim();
  const errEl  = document.getElementById('forgot-error');
  const sucEl  = document.getElementById('forgot-success');
  errEl.textContent = '';
  sucEl.textContent = '';

  if (!email) { errEl.textContent = 'Informe seu email.'; return; }

  const btn = document.getElementById('btn-forgot-send');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    await authRecover(email);
    sucEl.textContent = '✓ Link enviado! Verifique seu email e clique no link para redefinir sua senha.';
    document.getElementById('forgot-email').value = '';
  } catch (e) {
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'Enviar link';
  }
});

// ── Dashboard ────────────────────────────────────────────────
document.getElementById('btn-dashboard').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  window.close();
});

// ── Logout ───────────────────────────────────────────────────
async function logout() {
  await clearSession();
  chrome.runtime.sendMessage({ type: 'NOTIFY_CONTENT_LOGOUT' });
  show('s-login');
}
document.getElementById('btn-logout').addEventListener('click', logout);
document.getElementById('btn-logout-blocked').addEventListener('click', logout);

// ── Enter key ────────────────────────────────────────────────
document.getElementById('login-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-login').click(); });

// ── Disclosure (primeiro uso) ─────────────────────────────────
document.getElementById('btn-accept-disclosure').addEventListener('click', async () => {
  await new Promise(res => chrome.storage.local.set({ disclosure_accepted: true }, res));
  initSession();
});

document.getElementById('link-privacy').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://pedrocortee.github.io/Organiza/privacy' });
});

// ── Init ─────────────────────────────────────────────────────
(async function start() {
  const { disclosure_accepted } = await new Promise(res =>
    chrome.storage.local.get(['disclosure_accepted'], res)
  );
  if (!disclosure_accepted) { show('s-disclosure'); return; }
  initSession();
})();
