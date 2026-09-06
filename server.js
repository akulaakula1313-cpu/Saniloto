const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

const rooms = {}; 
let globalChat = [];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: {}, leaderboard: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function defaultUser(name) {
  return {
    name: name || 'Игрок_' + Math.floor(1000 + Math.random() * 9000),
    avatar: 0,
    marker: 0,
    unlockedMarkers: [0],
    bills: 5000,
    coins: 50,
    dailyStreak: 0,
    lastClaim: 0,
    createdAt: Date.now(),
    pendingGifts: [],
    isBanned: false,
    isVip: false
  };
}

function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readBody(req) {
  return new Promise((resolve) => {
    let chunks = '';
    req.on('data', c => chunks += c);
    req.on('end', () => {
      try { resolve(JSON.parse(chunks)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = url;

  if (pathname === '/api/state' && req.method === 'GET') {
    const db = loadDB();
    let uid = searchParams.get('uid');
    if (!uid || !db.users[uid]) {
      uid = crypto.randomBytes(8).toString('hex');
      db.users[uid] = defaultUser(searchParams.get('name'));
      saveDB(db);
    }
    return sendJSON(res, 200, { uid, ...db.users[uid] });
  }

  if (pathname === '/api/state' && req.method === 'POST') {
    const body = await readBody(req);
    const { uid, ...update } = body;
    const db = loadDB();
    if (!uid || !db.users[uid]) return sendJSON(res, 400, { error: 'bad_uid' });
    
    if (db.users[uid].isBanned) {
      return sendJSON(res, 403, { error: 'banned', isBanned: true });
    }

    db.users[uid] = { ...db.users[uid], ...update };
    saveDB(db);
    return sendJSON(res, 200, { ok: true, user: db.users[uid] });
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const db = loadDB();
    const list = [];
    Object.values(db.users).forEach(u => {
      if (!u.isBanned) {
        list.push({ name: (u.isVip ? '👑 ' : '') + u.name, score: u.bills });
      }
    });
    list.sort((a, b) => b.score - a.score);
    return sendJSON(res, 200, list.slice(0, 50));
  }

  if (pathname === '/api/admin/players' && req.method === 'POST') {
    const { adminPassword } = await readBody(req);
    if (adminPassword !== 'admin123') {
      return sendJSON(res, 403, { error: 'Неверный пароль администратора!' });
    }
    const db = loadDB();
    const playersList = Object.keys(db.users).map(id => ({
      uid: id,
      name: db.users[id].name,
      bills: db.users[id].bills,
      coins: db.users[id].coins,
      isBanned: db.users[id].isBanned || false,
      isVip: db.users[id].isVip || false
    }));
    return sendJSON(res, 200, playersList);
  }

  if (pathname === '/api/admin/action' && req.method === 'POST') {
    const { adminPassword, targetUid, action, amountBills, amountCoins, fakeSms } = await readBody(req);
    if (adminPassword !== 'admin123') {
      return sendJSON(res, 403, { error: 'Неверный пароль!' });
    }
    const db = loadDB();
    if (!db.users[targetUid]) return sendJSON(res, 404, { error: 'Игрок не найден!' });

    const user = db.users[targetUid];

    if (action === 'give-reward') {
      const bills = parseInt(amountBills || 0, 10);
      const coins = parseInt(amountCoins || 0, 10);
      user.bills += bills;
      user.coins += coins;
      if (!user.pendingGifts) user.pendingGifts = [];
      user.pendingGifts.push({ from: "SANI GROUP", bills, coins, time: Date.now() });
    } 
    else if (action === 'ban') {
      user.isBanned = true;
    } 
    else if (action === 'unban') {
      user.isBanned = false;
    } 
    else if (action === 'toggle-vip') {
      user.isVip = !user.isVip;
    } 
    else if (action === 'reset') {
      user.bills = 1000;
      user.coins = 10;
      user.isVip = false;
      user.isBanned = false;
    }
    else if (action === 'fake-sms' && fakeSms && fakeSms.trim() !== '') {
      const prefix = user.isVip ? '👑 ' : '';
      globalChat.push({ name: prefix + user.name, text: fakeSms.trim().substring(0, 150), time: Date.now() });
    }

    saveDB(db);
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/chat/global' && req.method === 'GET') {
    const now = Date.now();
    globalChat = globalChat.filter(msg => (now - msg.time) < 24 * 60 * 60 * 1000);
    return sendJSON(res, 200, globalChat);
  }

  if (pathname === '/api/chat/global/send' && req.method === 'POST') {
    const { uid, text } = await readBody(req);
    const db = loadDB();
    const user = db.users[uid];
    if (!user || user.isBanned) return sendJSON(res, 403, { error: 'Вы заблокированы!' });
    if (!text || text.trim() === '') return sendJSON(res, 400, { error: 'Пустой текст' });

    const prefix = user.isVip ? '👑 ' : '';
    globalChat.push({ name: prefix + user.name, text: text.trim().substring(0, 150), time: Date.now() });
    return sendJSON(res, 200, { ok: true });
  }

  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, filePath);
  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Лото Сервер работает на http://localhost:${PORT}`));