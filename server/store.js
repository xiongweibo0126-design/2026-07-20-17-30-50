/**
 * Tiny JSON-file data store (no database dependency).
 * Fine for an MVP / low traffic. Swap for Postgres later.
 */
const fs = require('fs');
const path = require('path');

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

function newId() { return 'u_' + (db.seq++).toString(36) + Date.now().toString(36).slice(-4); }
function genKey() {
  const c = require('crypto');
  return 'sk-tb-' + c.randomBytes(24).toString('hex');
}

function getUserByKey(apiKey) {
  const id = db.keyIndex[apiKey];
  return id ? db.users[id] : null;
}
function getUserById(id) { return db.users[id] || null; }

function createUser(email) {
  const id = newId();
  const apiKey = genKey();
  const user = {
    id,
    email: email || null,
    apiKey,
    balance: 0,          // purchased balance
    bonusBalance: 0,     // free / promotional balance
    createdAt: new Date().toISOString(),
  };
  db.users[id] = user;
  db.keyIndex[apiKey] = id;
  save();
  return user;
}

function totalBalance(user) { return (user.balance || 0) + (user.bonusBalance || 0); }

// Deduct cost (USD). Spend bonus first, then purchased.
function debit(user, cost) {
  let remaining = cost;
  if (user.bonusBalance > 0) {
    const fromBonus = Math.min(user.bonusBalance, remaining);
    user.bonusBalance -= fromBonus;
    remaining -= fromBonus;
  }
  if (remaining > 0) user.balance -= remaining;
  save();
}

function credit(user, amount, note) {
  user.balance += amount;
  db.transactions.push({ userId: user.id, type: 'credit', amount, note: note || '', at: new Date().toISOString() });
  save();
}

load();

module.exports = { db, save, newId, genKey, getUserByKey, getUserById, createUser, totalBalance, debit, credit };
