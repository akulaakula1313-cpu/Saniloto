// server.js — сервер игры "Лото Онлайн"
// Написан на чистом Node.js (без express и без npm install) —
// достаточно "node server.js".
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const DAY = 24 * 60 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// ---------- простое файловое "хранилище" ----------
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = {
      users: {},
      // стартовый лидерборд, как на скриншоте
      leaderboard: [
        { name: 'Татьяна Прибыткова', score: 31759400 },
        { name: 'ЕленаФалкова', score: 28000700 },
        { name: 'МихаилМака1785474285', score: 26615300 },
        { name: 'Рустам Файзулин', score: 5500 },
        { name: 'Дарья', score: 5500 },
        { name: 'Надежда О.', score: 5500 },
        { name: 'Kiki', score: 5500 },
        { name: 'Дмитрий Пирогов', score: 5500 },
        { name: 'Анастасия Шалфеева', score: 5500 },
        { name: 'сергей п.', score: 5400 },
        { name: 'Сергей М.', score: 5400 }
      ]
    };
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
    name: name || 'Sani2025 Sani Park',
    avatar: 0,
    marker: 0,
    unlockedMarkers: [0],
    bills: 5000,
    coins: 20,
    dailyStreak: 0,
    lastClaim: 0,
    createdAt: Date.now()
  };
}

// ---------- вспомогательные функции ----------
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', c => { chunks += c; if (chunks.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!chunks) return resolve({});
      try { resolve(JSON.parse(chunks)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, '');
  const fullPath = path.join(__dirname, filePath);

  // защита от выхода за пределы папки проекта
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- API-обработчики ----------
async function handleApi(req, res, url) {
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
    const body = await readBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { error: 'bad_json' });
    const { uid, ...update } = body;
    const db = loadDB();
    if (!uid || !db.users[uid]) return sendJSON(res, 400, { error: 'bad_uid' });
    db.users[uid] = { ...db.users[uid], ...update };
    saveDB(db);
    return sendJSON(res, 200, { ok: true, user: db.users[uid] });
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const db = loadDB();
    const list = [...db.leaderboard];
    Object.values(db.users).forEach(u => list.push({ name: u.name, score: u.bills }));
    list.sort((a, b) => b.score - a.score);
    return sendJSON(res, 200, list.slice(0, 50));
  }

  if (pathname === '/api/dailyreward/claim' && req.method === 'POST') {
    const body = await readBody(req).catch(() => null);
    if (!body) return sendJSON(res, 400, { error: 'bad_json' });
    const db = loadDB();
    const user = db.users[body.uid];
    if (!user) return sendJSON(res, 400, { error: 'bad_uid' });

    const now = Date.now();
    if (now - user.lastClaim < DAY) {
      return sendJSON(res, 400, { error: 'already_claimed' });
    }

    const rewards = [
      { bills: 500 }, { bills: 1000 }, { coins: 10 },
      { bills: 1500 }, { coins: 30 }, { bills: 3000 }, { coins: 45 }
    ];
    const dayIndex = user.dailyStreak % 7;
    const reward = rewards[dayIndex];

    user.bills += reward.bills || 0;
    user.coins += reward.coins || 0;
    user.dailyStreak += 1;
    user.lastClaim = now;

    saveDB(db);
    return sendJSON(res, 200, { ok: true, reward, dayIndex, user });
  }

  sendJSON(res, 404, { error: 'not_found' });
}

// ---------- главный обработчик ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(err => {
      console.error(err);
      sendJSON(res, 500, { error: 'server_error' });
    });
  } else {
    serveStatic(req, res, url.pathname);
  }
});

server.listen(PORT, () => {
  console.log(`Лото сервер запущен: http://localhost:${PORT}`);
});
