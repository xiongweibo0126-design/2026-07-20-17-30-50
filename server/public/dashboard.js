/* TokenBase dashboard logic with Paddle.js overlay checkout */
const $ = (id) => document.getElementById(id);
const KEY = 'tb_api_key';

function show(view) {
  $('view-register').classList.toggle('hidden', view !== 'register');
  $('view-dash').classList.toggle('hidden', view !== 'dash');
}

/* ---- Paddle.js integration (items-based overlay — official recommended way) ---- */
let paddleReady = false;
/** Price-ID map: packageId → paddlePriceId, populated by loadPackages(). */
const priceIdMap = {};

async function initPaddle() {
  try {
    const r = await fetch('/api/paddle-config');
    if (!r.ok) return;
    const cfg = await r.json();
    if (!cfg.token) return;
    if (cfg.environment === 'production') Paddle.Environment.set('production');
    Paddle.Initialize({
      token: cfg.token,
      eventCallback: function(data) {
        if (data.name === 'checkout.completed') {
          $('payErr').textContent = '';
          $('payErr').style.color = '#047857';
          $('payErr').textContent = '✓ Payment received! Refreshing balance...';
          setTimeout(() => { refreshMe(); $('payErr').textContent = ''; }, 3000);
        }
        if (data.name === 'checkout.closed') {
          // User closed checkout without completing — do nothing
        }
      },
    });
    paddleReady = true;
  } catch (e) { console.warn('Paddle.js init failed:', e.message); }
}

/**
 * Open Paddle overlay checkout using the official items-based approach.
 * This is more reliable than passing a pre-created transaction ID and
 * is the method shown in Paddle's own docs.
 */
function openPaddleCheckout(priceId, userId, packageId) {
  if (!paddleReady || !window.Paddle) {
    $('payErr').textContent = 'Payment system loading… please try again in a few seconds.';
    return;
  }
  try {
    Paddle.Checkout.open({
      items: [{ priceId: priceId, quantity: 1 }],
      customData: { userId: userId, packageId: packageId },
    });
  } catch (e) {
    $('payErr').textContent = 'Checkout error: ' + e.message;
  }
}

/* ---- Dashboard logic ---- */

async function refreshMe() {
  const key = localStorage.getItem(KEY);
  if (!key) return show('register');
  try {
    const r = await fetch('/api/me?key=' + encodeURIComponent(key));
    if (!r.ok) throw new Error();
    const u = await r.json();
    $('userEmail').textContent = u.email || 'No email';
    $('apiKey').textContent = u.apiKey || key;
    $('balTotal').textContent = '$' + u.totalBalance.toFixed(2);
    $('balBonus').textContent = '$' + u.bonusBalance.toFixed(2);
    $('balPaid').textContent = '$' + u.balance.toFixed(2);
    show('dash');
  } catch { show('register'); }
}

async function loadPackages() {
  const r = await fetch('/api/packages');
  const { packages } = await r.json();
  const list = $('pkgList');
  list.innerHTML = '';
  packages.forEach((p) => {
    // Remember Paddle price ID for items-based checkout
    if (p.paddlePriceId) priceIdMap[p.id] = p.paddlePriceId;
    const el = document.createElement('div');
    el.className = 'pkg';
    el.innerHTML = `<b>${p.name}</b><span>Add $${p.credit.toFixed(2)} to your balance</span>
      <button class="btn btn--primary" data-id="${p.id}">Buy ${p.name.split(' ')[0]} →</button>`;
    el.querySelector('button').addEventListener('click', () => buy(p.id));
    list.appendChild(el);
  });
}

async function buy(packageId) {
  $('payErr').textContent = '';
  $('payErr').style.color = '#c2410c';
  const key = localStorage.getItem(KEY);
  const priceId = priceIdMap[packageId];
  if (!priceId) {
    $('payErr').textContent = 'Package not configured. Contact support.';
    return;
  }
  // Get current user ID for customData (webhook needs it to credit the right account)
  let userId = '';
  try {
    const mr = await fetch('/api/me?key=' + encodeURIComponent(key));
    if (mr.ok) { const u = await mr.json(); userId = u.id || ''; }
  } catch {}
  openPaddleCheckout(priceId, userId, packageId);
}

$('regForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('regErr').textContent = '';
  try {
    const r = await fetch('/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: $('email').value }),
    });
    const u = await r.json();
    if (!r.ok) throw new Error(u.error?.message || 'Registration failed');
    localStorage.setItem(KEY, u.apiKey);
    await refreshMe();
  } catch (e) { $('regErr').textContent = e.message; }
});

$('copyKey').addEventListener('click', () => {
  navigator.clipboard.writeText($('apiKey').textContent).then(() => {
    $('copyKey').textContent = 'Copied!';
    setTimeout(() => ($('copyKey').textContent = 'Copy'), 1500);
  });
});

$('logout').addEventListener('click', () => { localStorage.removeItem(KEY); show('register'); });

// init
$('host').textContent = location.host;
initPaddle();
loadPackages();
refreshMe();
