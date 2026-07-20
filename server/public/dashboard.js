/* TokenBase dashboard logic (no framework) */
const $ = (id) => document.getElementById(id);
const KEY = 'tb_api_key';

function show(view) {
  $('view-register').classList.toggle('hidden', view !== 'register');
  $('view-dash').classList.toggle('hidden', view !== 'dash');
}

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
  const key = localStorage.getItem(KEY);
  try {
    const r = await fetch('/api/checkout', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, packageId }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error?.message || 'Checkout failed');
    window.location.href = d.url;
  } catch (e) { $('payErr').textContent = e.message; }
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
loadPackages();
refreshMe();
