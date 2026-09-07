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
    isVip: false,
    isBanned: false
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
    req.on('end', () => {
      try { resolve(JSON.parse(chunks)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = url;

  const checkUid = searchParams.get('uid');
  if (checkUid) {
    const db = loadDB();
    if (db.users[checkUid] && db.users[checkUid].isBanned) {
      return sendJSON(res, 403, { error: 'banned', message: 'Вы заблокированы администратором!' });
    }
  }

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
    if (db.users[uid].isBanned) return sendJSON(res, 403, { error: 'banned' });
    db.users[uid] = { ...db.users[uid], ...update };
    saveDB(db);
    return sendJSON(res, 200, { ok: true, user: db.users[uid] });
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const db = loadDB();
    const list = [];
    Object.values(db.users).forEach(u => {
      list.push({ name: u.name, score: u.bills });
    });
    list.sort((a, b) => b.score - a.score);
    return sendJSON(res, 200, list.slice(0, 50));
  }

  if (pathname === '/api/room/create' && req.method === 'POST') {
    const { uid, maxPlayers, stake, mode } = await readBody(req);
    const db = loadDB();
    const user = db.users[uid];
    if (!user || user.bills < stake) return sendJSON(res, 400, { error: 'Недостаточно денег для ставки!' });

    let roomId;
    do { roomId = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms[roomId]);

    user.bills -= stake;
    saveDB(db);

    rooms[roomId] = {
      id: roomId,
      stake: parseInt(stake, 10),
      maxPlayers: parseInt(maxPlayers, 10),
      mode: mode || 'A',
      players: [{ uid, name: user.name, avatar: user.avatar, tickets: [] }],
      status: 'waiting',
      deck: Array.from({ length: 90 }, (_, i) => i + 1).sort(() => Math.random() - 0.5),
      drawn: [],
      bank: parseInt(stake, 10),
      lastTick: Date.now(),
      chat: []
    };

    return sendJSON(res, 200, { ok: true, roomId, room: rooms[roomId], userBalance: user.bills });
  }

  if (pathname === '/api/room/join' && req.method === 'POST') {
    const { uid, roomId } = await readBody(req);
    const db = loadDB();
    const user = db.users[uid];
    const room = rooms[roomId];

    if (!room) return sendJSON(res, 404, { error: 'Стол не найден!' });
    if (room.status !== 'waiting') return sendJSON(res, 400, { error: 'Игра уже началась!' });
    if (room.players.length >= room.maxPlayers) return sendJSON(res, 400, { error: 'Стол уже заполнен!' });
    if (room.players.some(p => p.uid === uid)) return sendJSON(res, 200, { ok: true, room });
    if (user.bills < room.stake) return sendJSON(res, 400, { error: 'Недостаточно 💵 для ставки!' });

    user.bills -= room.stake;
    room.bank += room.stake;
    saveDB(db);

    room.players.push({ uid, name: user.name, avatar: user.avatar, tickets: [] });

    if (room.players.length === room.maxPlayers) {
      room.status = 'playing';
    }

    return sendJSON(res, 200, { ok: true, room, userBalance: user.bills });
  }

  if (pathname === '/api/room/sync' && req.method === 'GET') {
    const roomId = searchParams.get('roomId');
    const room = rooms[roomId];
    if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });

    if (room.status === 'playing' && Date.now() - room.lastTick >= 4000) {
      if (room.deck.length > 0) {
        room.drawn.push(room.deck.pop());
        room.lastTick = Date.now();
      } else {
        room.status = 'finished';
      }
    }
    return sendJSON(res, 200, room);
  }

  if (pathname === '/api/admin/players' && req.method === 'POST') {
    const { adminPassword } = await readBody(req);
    if (adminPassword !== 'admin123') return sendJSON(res, 403, { error: 'Неверный пароль администратора!' });
    const db = loadDB();
    const playersList = Object.keys(db.users).map(id => ({
      uid: id,
      name: db.users[id].name,
      bills: db.users[id].bills,
      coins: db.users[id].coins,
      isVip: db.users[id].isVip || false,
      isBanned: db.users[id].isBanned || false
    }));
    return sendJSON(res, 200, playersList);
  }

  if (pathname === '/api/admin/control-player' && req.method === 'POST') {
    const { adminPassword, targetUid, action, value } = await readBody(req);
    if (adminPassword !== 'admin123') return sendJSON(res, 403, { error: 'Неверный пароль!' });
    
    const db = loadDB();
    if (!db.users[targetUid]) return sendJSON(res, 404, { error: 'Игрок не найден!' });

    const player = db.users[targetUid];

    if (action === 'give_resources') {
      const b = parseInt(value.bills || 0, 10);
      const c = parseInt(value.coins || 0, 10);
      player.bills += b;
      player.coins += c;
      if (!player.pendingGifts) player.pendingGifts = [];
      player.pendingGifts.push({ from: "SANI GROUP", bills: b, coins: c, time: Date.now() });
    } 
    else if (action === 'send_sms') {
      if (!player.pendingGifts) player.pendingGifts = [];
      player.pendingGifts.push({ from: "Администрация", bills: 0, coins: 0, message: value.text, time: Date.now() });
    } 
    else if (action === 'toggle_vip') {
      player.isVip = !player.isVip;
    } 
    else if (action === 'toggle_ban') {
      player.isBanned = !player.isBanned;
    }

    saveDB(db);
    return sendJSON(res, 200, { ok: true, player });
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
    if (!user || !text || text.trim() === '') return sendJSON(res, 400, { error: 'Ошибка отправки' });

    globalChat.push({ name: user.name, text: text.trim().substring(0, 150), time: Date.now() });
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/chat/room/send' && req.method === 'POST') {
    const { uid, roomId, text } = await readBody(req);
    const db = loadDB();
    const user = db.users[uid];
    const room = rooms[roomId];

    if (!room || !user || !text || text.trim() === '') return sendJSON(res, 400, { error: 'Ошибка' });
    if (!room.chat) room.chat = [];

    room.chat.push({ name: user.name, text: text.trim().substring(0, 150), time: Date.now() });
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

server.listen(PORT, () => console.log(`Лото Сервер работает на порту ${PORT}`));
