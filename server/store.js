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

const USE_DB = !!process.env.DATABASE_URL;

let pgPool = null;

// Render free tier cannot reach IPv6 (ENETUNREACH). Supabase's host resolves
// to both A and AAAA records, and pg tends to pick the AAAA one. Resolve the
// hostname to a concrete IPv4 address at startup and inline it into the
// connection string so the socket never attempts IPv6. `family: 4` is kept as
// a belt-and-suspenders hint.
async function resolveIPv4(connStr) {
  try {
    const url = new URL(connStr);
    const { address } = await dns.promises.lookup(url.hostname, { family: 4 });
    console.log('[store] Resolved DB host', url.hostname, '->', address, '(IPv4)');
    return connStr.replace(url.hostname, address);
  } catch (e) {
    console.warn('[store] IPv4 resolve failed, falling back to original host:', e.message);
    return connStr;
  }
}

async function initDB() {
  if (!USE_DB) {
    console.log('[store] No DATABASE_URL — using local JSON file store (dev only).');
    load();
    return;
  }
  const { Pool } = require('pg');
  const connStr = await resolveIPv4(process.env.DATABASE_URL);
  pgPool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, family: 4 });
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

module.exports = { initDB, newId, genKey, getUserByKey, getUserById, createUser, totalBalance, debit, credit };
