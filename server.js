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

function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function defaultUser(name) {
  return {
    name: name || 'Премиум_Игрок_' + Math.floor(1000 + Math.random() * 9000),
    avatar: 0, 
    marker: 0, 
    unlockedMarkers:, // ОШИБКА ИСПРАВЛЕНА ТУТ
    bills: 5000, 
    coins: 50, 
    dailyStreak: 0, 
    lastClaim: 0,
    createdAt: Date.now(), 
    pendingGifts: [], 
    isBanned: false, 
    banReason: ""
  };
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  return new Promise((resolve) => {
    let chunks = '';
    req.on('data', c => chunks += c);
    req.on('end', () => { try { resolve(JSON.parse(chunks)); } catch { resolve({}); } });
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
    if (db.users[uid].isBanned) return sendJSON(res, 200, { ok: false, user: db.users[uid], banned: true });

    db.users[uid] = { ...db.users[uid], ...update };
    saveDB(db);
    return sendJSON(res, 200, { ok: true, user: db.users[uid] });
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const db = loadDB();
    const list = Object.values(db.users).filter(u => !u.isBanned).map(u => ({ name: u.name, score: u.bills }));
    return sendJSON(res, 200, list.sort((a,b) => b.score - a.score).slice(0, 50));
  }

  if (pathname === '/api/room/create' && req.method === 'POST') {
    const { uid, maxPlayers, stake } = await readBody(req);
    const db = loadDB(); const user = db.users[uid];
    if (!user || user.isBanned || user.bills < stake) return sendJSON(res, 400, { error: 'Ошибка баланса' });

    let roomId = Math.floor(1000 + Math.random() * 9000).toString();
    user.bills -= stake; saveDB(db);

    rooms[roomId] = {
      id: roomId, stake: parseInt(stake), maxPlayers: parseInt(maxPlayers),
      players: [{ uid, name: user.name, avatar: user.avatar }], status: 'waiting',
      deck: Array.from({ length: 90 }, (_, i) => i + 1).sort(() => Math.random() - 0.5),
      drawn: [], bank: parseInt(stake), lastTick: Date.now()
    };
    return sendJSON(res, 200, { ok: true, roomId, userBalance: user.bills });
  }

  if (pathname === '/api/room/join' && req.method === 'POST') {
    const { uid, roomId } = await readBody(req);
    const db = loadDB(); const user = db.users[uid]; const room = rooms[roomId];
    if (!room || room.status !== 'waiting' || room.players.length >= room.maxPlayers || user.bills < room.stake) {
      return sendJSON(res, 400, { error: 'Невозможно войти за стол' });
    }
    user.bills -= room.stake; room.bank += room.stake; saveDB(db);
    room.players.push({ uid, name: user.name, avatar: user.avatar });
    if (room.players.length === room.maxPlayers) room.status = 'playing';
    return sendJSON(res, 200, { ok: true, userBalance: user.bills });
  }

  if (pathname === '/api/room/sync' && req.method === 'GET') {
    const room = rooms[searchParams.get('roomId')];
    if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });
    if (room.status === 'playing' && Date.now() - room.lastTick >= 4000) {
      if (room.deck.length > 0) { room.drawn.push(room.deck.pop()); room.lastTick = Date.now(); } 
      else { room.status = 'finished'; }
    }
    return sendJSON(res, 200, room);
  }

  if (pathname === '/api/admin/players' && req.method === 'POST') {
    const { adminPassword } = await readBody(req);
    if (adminPassword !== 'admin123') return sendJSON(res, 403, { error: 'Запрещено' });
    const db = loadDB();
    return sendJSON(res, 200, Object.keys(db.users).map(id => ({ uid: id, name: db.users[id].name, bills: db.users[id].bills, isBanned: db.users[id].isBanned })));
  }

  if (pathname === '/api/chat/global' && req.method === 'GET') return sendJSON(res, 200, globalChat);
  if (pathname === '/api/chat/global/send' && req.method === 'POST') {
    const { uid, text } = await readBody(req); const db = loadDB();
    if (db.users[uid] && !db.users[uid].isBanned && text) {
      globalChat.push({ name: db.users[uid].name, text: text.substring(0, 100) });
    }
    return sendJSON(res, 200, { ok: true });
  }

  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, filePath);
  fs.readFile(fullPath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fullPath)] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => console.log(`Премиум Лото сервер запущен: http://localhost:${PORT}`));
