/**
 * Data store for TokenBase.
 * Uses Postgres (Supabase/Neon) when DATABASE_URL is set; otherwise falls
 * back to a local JSON file so local dev still works.
 *
 * Why a DB: the server runs on Render's free tier where the filesystem is
 * ephemeral (resets on every deploy / cold start). A JSON file there would
 * lose all users on each restart, so we persist to Postgres instead.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns');

// Render free tier cannot reach IPv6 (ENETUNREACH). Node 17+ resolves DNS in
// "verbatim" order, so Supabase's AAAA (IPv6) record is often returned first
// and pg connects over IPv6 -> ENETUNREACH. Force the whole process to prefer
// IPv4 for every lookup (including pg's internal host resolution).
try { dns.setDefaultResultOrder('ipv4first'); } catch (e) { /* older node */ }

const USE_DB = !!process.env.DATABASE_URL;

let pgPool = null;
let lastDnsError = '';

// Supabase's DIRECT Postgres host (db.<ref>.supabase.co) only publishes an
// IPv6 (AAAA) record, which Render's free tier cannot reach (ENETUNREACH).
// The CONNECTION-POOLER (PgBouncer) host publishes IPv4 and IS reachable.
// Auto-rewrite the direct host -> pooler host so it "just works" regardless
// of which host the user pasted into DATABASE_URL (direct OR pooler).
// We also re-encode the credentials so special chars like '!' in the
// password don't break the Postgres connection-string parser.
function safeEncode(s) {
  try { return encodeURIComponent(decodeURIComponent(s)); }
  catch (e) { return encodeURIComponent(s); }
}
function supabasePooler(connStr) {
  try {
    const url = new URL(connStr);
    if (!/\.supabase\.co$/.test(url.hostname)) return connStr; // not Supabase; leave as-is
    if (url.username) url.username = safeEncode(url.username);
    if (url.password) url.password = safeEncode(url.password);
    // Direct host -> pooler host (IPv4 reachable from Render).
    if (/^db\..+\.supabase\.co$/.test(url.hostname)) {
      const ref = url.hostname.match(/^db\.(.+)\.supabase\.co$/)[1];
      const region = 'ap-southeast-1'; // Supabase project region (Singapore)
      url.hostname = `aws-0-${region}.pooler.supabase.com`;
      if (!url.port || url.port === '5432') url.port = '6543';
      // The pooler identifies the tenant via the username suffix "<role>.<ref>"
      // (the direct host encodes the ref in the hostname instead). The direct
      // connection uses just "postgres", so append the project ref here.
      if (url.username && !url.username.includes('.')) url.username = url.username + '.' + ref;
    }
    url.searchParams.set('pgbouncer', 'true');
    console.log('[store] Rewrote Supabase host -> pooler (IPv4):', url.hostname + ':' + url.port);
    return url.toString();
  } catch (e) {
    console.warn('[store] supabasePooler rewrite failed:', e.message);
    return connStr;
  }
}

// Belt-and-suspenders: also try to resolve the host to a concrete IPv4 address
// and inline it into the connection string. If the lookup fails we record the
// reason (exposed via getDiagnostics) and fall back to the original host —
// the ipv4first default above still steers pg away from IPv6 in that case.
async function resolveIPv4(connStr) {
  try {
    const url = new URL(connStr);
    const records = await dns.promises.lookup(url.hostname, { all: true });
    const v4 = records.find((r) => r.family === 4);
    if (v4) {
      console.log('[store] Resolved DB host', url.hostname, '->', v4.address, '(IPv4)');
      return connStr.replace(url.hostname, v4.address);
    }
    lastDnsError = 'no A record for ' + url.hostname + ' (records: ' + JSON.stringify(records) + ')';
    console.warn('[store] ' + lastDnsError);
  } catch (e) {
    lastDnsError = e.message;
    console.warn('[store] IPv4 resolve failed:', e.message);
  }
  return connStr;
}

function getDiagnostics() {
  return { lastDnsError };
}

async function initDB() {
  if (!USE_DB) {
    console.log('[store] No DATABASE_URL — using local JSON file store (dev only).');
    load();
    return;
  }
  const { Pool } = require('pg');
  let connStr = supabasePooler(process.env.DATABASE_URL);
  connStr = await resolveIPv4(connStr);
  // prepare:false is required behind PgBouncer (transaction pooling) — otherwise
  // prepared statements break across connections with "prepared statement does not exist".
  pgPool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, family: 4, prepare: false });
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      api_key TEXT UNIQUE NOT NULL,
      balance NUMERIC NOT NULL DEFAULT 0,
      bonus_balance NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pgPool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount NUMERIC NOT NULL,
      note TEXT,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  console.log('[store] Connected to Postgres and ensured tables exist.');
}

/* ---------------- JSON fallback (local dev) ---------------- */
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
let db = { users: {}, keyIndex: {}, transactions: [], seq: 1 };

function load() {
  if (fs.existsSync(DATA_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
    catch (e) { console.error('Failed to parse data.json, starting fresh.'); }
  }
}
function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

/* ---------------- helpers ---------------- */
function newId() { return 'u_' + (db.seq++).toString(36) + Date.now().toString(36).slice(-4); }
function genKey() { return 'sk-tb-' + crypto.randomBytes(24).toString('hex'); }
function rowToUser(r) {
  return { id: r.id, email: r.email, apiKey: r.api_key, balance: Number(r.balance), bonusBalance: Number(r.bonus_balance), createdAt: r.created_at };
}

/* ---------------- users ---------------- */
async function getUserByKey(apiKey) {
  if (USE_DB) {
    const { rows } = await pgPool.query('SELECT * FROM users WHERE api_key=$1', [apiKey]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  const id = db.keyIndex[apiKey];
  return id ? db.users[id] : null;
}

async function getUserById(id) {
  if (USE_DB) {
    const { rows } = await pgPool.query('SELECT * FROM users WHERE id=$1', [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  }
  return db.users[id] || null;
}

async function createUser(email) {
  const id = newId();
  const apiKey = genKey();
  if (USE_DB) {
    await pgPool.query(
      'INSERT INTO users (id, email, api_key, balance, bonus_balance) VALUES ($1,$2,$3,$4,$5)',
      [id, email || null, apiKey, 0, 0]);
  } else {
    db.users[id] = { id, email: email || null, apiKey, balance: 0, bonusBalance: 0, createdAt: new Date().toISOString() };
    db.keyIndex[apiKey] = id;
    save();
  }
  return { id, email: email || null, apiKey, balance: 0, bonusBalance: 0, createdAt: new Date().toISOString() };
}

/* ---------------- balance ---------------- */
function totalBalance(user) { return (Number(user.balance) || 0) + (Number(user.bonusBalance) || 0); }

// Add purchased/bonus balance (USD).
async function credit(user, amount, note) {
  amount = Number(amount);
  if (USE_DB) {
    await pgPool.query('UPDATE users SET balance = balance + $1 WHERE id=$2', [amount, user.id]);
    await pgPool.query('INSERT INTO transactions (user_id, type, amount, note) VALUES ($1,$2,$3,$4)',
      [user.id, 'credit', amount, note || '']);
    user.balance = (Number(user.balance) || 0) + amount;
  } else {
    user.balance = (Number(user.balance) || 0) + amount;
    db.transactions.push({ userId: user.id, type: 'credit', amount, note: note || '', at: new Date().toISOString() });
    save();
  }
}

// Deduct cost (USD). Spend bonus first, then purchased.
async function debit(user, cost) {
  cost = Number(cost);
  if (USE_DB) {
    let remaining = cost;
    if (user.bonusBalance > 0) {
      const fromBonus = Math.min(user.bonusBalance, remaining);
      await pgPool.query('UPDATE users SET bonus_balance = bonus_balance - $1 WHERE id=$2', [fromBonus, user.id]);
      user.bonusBalance -= fromBonus;
      remaining -= fromBonus;
    }
    if (remaining > 0) {
      await pgPool.query('UPDATE users SET balance = balance - $1 WHERE id=$2', [remaining, user.id]);
      user.balance -= remaining;
    }
    await pgPool.query('INSERT INTO transactions (user_id, type, amount, note) VALUES ($1,$2,$3,$4)',
      [user.id, 'debit', cost, 'api usage']);
  } else {
    let remaining = cost;
    if (user.bonusBalance > 0) {
      const fromBonus = Math.min(user.bonusBalance, remaining);
      user.bonusBalance -= fromBonus;
      remaining -= fromBonus;
    }
    if (remaining > 0) user.balance -= remaining;
    db.transactions.push({ userId: user.id, type: 'debit', amount: cost, note: 'api usage', at: new Date().toISOString() });
    save();
  }
}

module.exports = { initDB, newId, genKey, getUserByKey, getUserById, createUser, totalBalance, debit, credit, getDiagnostics };
