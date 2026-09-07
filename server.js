const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

const activeSessions = new Map();
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
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: {}, leaderboard: [] };
  }
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

function validateUser(uid, db) {
  if (!uid || !db.users[uid]) return { error: 'Пользователь не найден' };
  if (db.users[uid].isBanned) return { error: 'banned', message: 'Вы заблокированы администратором!' };
  return { user: db.users[uid] };
}

function getSessionId(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/sessionId=([^;]+)/);
  return match ? match[1] : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname, searchParams } = url;

  if (req.method === 'GET') {
    const checkUid = searchParams.get('uid');
    if (checkUid) {
      const db = loadDB();
      if (db.users[checkUid] && db.users[checkUid].isBanned) {
        return sendJSON(res, 403, { error: 'banned', message: 'Вы заблокированы администратором!' });
      }
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
    
    const sessionId = crypto.randomBytes(16).toString('hex');
    activeSessions.set(uid, sessionId);
    
    res.setHeader('Set-Cookie', `sessionId=${sessionId}; HttpOnly; Path=/; Max-Age=86400`);
    return sendJSON(res, 200, { 
      uid, 
      sessionId,
      ...db.users[uid] 
    });
  }

  if (pathname === '/api/state' && req.method === 'POST') {
    const body = await readBody(req);
    const { uid, sessionId, ...update } = body;
    const db = loadDB();
    
    if (!uid || !db.users[uid]) return sendJSON(res, 400, { error: 'bad_uid' });
    if (activeSessions.get(uid) !== sessionId) return sendJSON(res, 401, { error: 'Неверная сессия' });
    if (db.users[uid].isBanned) return sendJSON(res, 403, { error: 'banned' });
    
    db.users[uid] = { ...db.users[uid], ...update };
    saveDB(db);
    return sendJSON(res, 200, { ok: true, user: db.users[uid] });
  }

  if (pathname === '/api/dailyreward/claim' && req.method === 'POST') {
    const body = await readBody(req);
    const { uid, sessionId } = body;
    const db = loadDB();
    
    const validation = validateUser(uid, db);
    if (validation.error) return sendJSON(res, validation.error === 'banned' ? 403 : 400, { error: validation.error });
    if (activeSessions.get(uid) !== sessionId) return sendJSON(res, 401, { error: 'Неверная сессия' });
    
    const user = validation.user;
    const now = Date.now();
    if (now - user.lastClaim < 24 * 60 * 60 * 1000) {
      return sendJSON(res, 400, { error: 'Награда уже получена сегодня' });
    }
    
    const rewards = [
      { bills: 500, coins: 0 }, { bills: 1000, coins: 0 }, { bills: 0, coins: 10 },
      { bills: 1500, coins: 0 }, { bills: 0, coins: 30 }, { bills: 3000, coins: 0 }, { bills: 0, coins: 45 }
    ];
    const day = user.dailyStreak % 7;
    const reward = rewards[day];
    user.bills += reward.bills;
    user.coins += reward.coins;
    user.dailyStreak += 1;
    user.lastClaim = now;
    saveDB(db);
    return sendJSON(res, 200, { ok: true, user });
  }

  if (pathname === '/api/leaderboard' && req.method === 'GET') {
    const db = loadDB();
    const list = Object.values(db.users).map(u => ({ name: u.name, score: u.bills }));
    list.sort((a, b) => b.score - a.score);
    return sendJSON(res, 200, list.slice(0, 50));
  }

  if (pathname === '/api/room/create' && req.method === 'POST') {
    const body = await readBody(req);
    const { uid, sessionId, maxPlayers, stake, mode } = body;
    const db = loadDB();
    
    const validation = validateUser(uid, db);
    if (validation.error) return sendJSON(res, validation.error === 'banned' ? 403 : 400, { error: validation.error });
    if (activeSessions.get(uid) !== sessionId) return sendJSON(res, 401, { error: 'Неверная сессия' });
    
    const user = validation.user;
    const stakeNum = parseInt(stake, 10);
    if (!stakeNum || stakeNum <= 0 || user.bills < stakeNum) {
      return sendJSON(res, 400, { error: 'Недостаточно денег для ставки!' });
    }

    let roomId; 
    do { roomId = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms[roomId]);
    
    user.bills -= stakeNum;
    saveDB(db);

    rooms[roomId] = {
      id: roomId,
      stake: stakeNum,
      maxPlayers: Math.min(6, Math.max(2, parseInt(maxPlayers, 10) || 2)),
      mode: mode || 'A',
      players: [{ uid, name: user.name, avatar: user.avatar }],
      status: 'waiting',
      deck: Array.from({ length: 90 }, (_, i) => i + 1).sort(() => Math.random() - 0.5),
      drawn: [],
      bank: stakeNum,
      lastTick: Date.now(),
      chat: []
    };
    return sendJSON(res, 200, { ok: true, roomId, room: rooms[roomId], userBalance: user.bills });
  }

  if (pathname === '/api/room/join' && req.method === 'POST') {
    const body = await readBody(req);
    const { uid, sessionId, roomId } = body;
    const db = loadDB();
    
    const validation = validateUser(uid, db);
    if (validation.error) return sendJSON(res, validation.error === 'banned' ? 403 : 400, { error: validation.error });
    if (activeSessions.get(uid) !== sessionId) return sendJSON(res, 401, { error: 'Неверная сессия' });
    
    const user = validation.user;
    const room = rooms[roomId];
    
    if (!room) return sendJSON(res, 404, { error: 'Стол не найден!' });
    if (room.status !== 'waiting') return sendJSON(res, 400, { error: 'Игра уже началась!' });
    if (room.players.length >= room.maxPlayers) return sendJSON(res, 400, { error: 'Стол заполнен!' });
    if (room.players.some(p => p.uid === uid)) return sendJSON(res, 200, { ok: true, room });
    if (user.bills < room.stake) return sendJSON(res, 400, { error: 'Недостаточно денег!' });

    user.bills -= room.stake;
    room.bank += room.stake;
    saveDB(db);
    room.players.push({ uid, name: user.name, avatar: user.avatar });
    if (room.players.length === room.maxPlayers) room.status = 'playing';
    return sendJSON(res, 200, { ok: true, room, userBalance: user.bills });
  }

  if (pathname === '/api/room/sync' && req.method === 'GET') {
    const roomId = searchParams.get('roomId');
    const uid = searchParams.get('uid');
    const room = rooms[roomId];
    
    if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });
    
    if (uid && !room.players.some(p => p.uid === uid)) {
      return sendJSON(res, 403, { error: 'Вы не в этой комнате' });
    }
    
    if (room.status === 'playing' && Date.now() - room.lastTick >= 4000) {
      if (room.deck.length > 0) {
        const nextNum = room.deck.pop();
        room.drawn.push(nextNum);
        room.lastTick = Date.now();
      } else {
        room.status = 'finished';
      }
    }
    return sendJSON(res, 200, room);
  }

  if (pathname === '/api/room/leave' && req.method === 'POST') {
    const body = await readBody(req);
    const { uid, sessionId, roomId } = body;
    const db = loadDB();
    
    const validation = validateUser(uid, db);
    if (validation.error) return sendJSON(res, validation.error === 'banned' ? 403 : 400, { error: validation.error });
    if (activeSessions.get(uid) !== sessionId) return sendJSON(res, 401, { error: 'Неверная сессия' });
    
    const room = rooms[roomId];
    if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });
    
    room.players = room.players.filter(p => p.uid !== uid);
    if (room.players.length === 0) {
      delete rooms[roomId];
    }
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/chat/room/send' && req.method === 'POST') {
    const body = await readBody(req);
    const { uid, sessionId, roomId, text } = body;
    const db = loadDB();
    
    const validation = validateUser(uid, db);
    if (validation.error) return sendJSON(res, validation.error === 'banned' ? 403 : 400, { error: validation.error });
    if (activeSessions.get(uid) !== sessionId) return sendJSON(res, 401, { error: 'Неверная сессия' });
    
    const room = rooms[roomId];
    if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });
    if (!room.players.some(p => p.uid === uid)) {
      return sendJSON(res, 403, { error: 'Вы не в этой комнате' });
    }
    
    const cleanText = String(text || '').trim().slice(0, 200);
    if (cleanText) {
      room.chat.push({ name: db.users[uid].name, text: cleanText, time: Date.now() });
      if (room.chat.length > 50) room.chat = room.chat.slice(-50);
    }
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/chat/global' && req.method === 'GET') {
    return sendJSON(res, 200, globalChat.slice(-30));
  }

  if (pathname === '/api/chat/global/send' && req.method === 'POST') {
    const body = await readBody(req);
    const { uid, sessionId, text } = body;
    const db = loadDB();
    
    const validation = validateUser(uid, db);
    if (validation.error) return sendJSON(res, validation.error === 'banned' ? 403 : 400, { error: validation.error });
    if (activeSessions.get(uid) !== sessionId) return sendJSON(res, 401, { error: 'Неверная сессия' });
    
    const cleanText = String(text || '').trim().slice(0, 200);
    if (cleanText) {
      globalChat.push({ name: db.users[uid].name, text: cleanText, time: Date.now() });
      if (globalChat.length > 50) globalChat = globalChat.slice(-50);
    }
    return sendJSON(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/players' && req.method === 'POST') {
    const { adminPassword } = await readBody(req);
    const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (adminPassword !== validPassword) {
      return sendJSON(res, 401, { error: 'Wrong password' });
    }
    const db = loadDB();
    return sendJSON(res, 200, Object.entries(db.users).map(([k, v]) => ({ uid: k, ...v })));
  }

  if (pathname === '/api/admin/action' && req.method === 'POST') {
    const body = await readBody(req);
    const { adminPassword, action, uid, amount, message } = body;
    
    const validPassword = process.env.ADMIN_PASSWORD || 'admin123';
    if (adminPassword !== validPassword) {
      return sendJSON(res, 401, { error: 'Wrong password' });
    }
    
    const db = loadDB();
    const target = db.users[uid];
    if (!target) return sendJSON(res, 404, { error: 'Игрок не найден' });
    if (!Array.isArray(target.pendingGifts)) target.pendingGifts = [];

    const num = Math.max(0, Math.floor(Number(amount) || 0));
    const pushNotice = (type, text, extra = {}) => {
      target.pendingGifts.push({ type, message: text || '', createdAt: Date.now(), ...extra });
      if (target.pendingGifts.length > 30) target.pendingGifts = target.pendingGifts.slice(-30);
    };

    if (action === 'ban') {
      if (target.isBanned) return sendJSON(res, 400, { error: 'Игрок уже заблокирован' });
      target.isBanned = true;
      pushNotice('system', 'Ваш аккаунт заблокирован администратором.');
    } else if (action === 'unban') {
      if (!target.isBanned) return sendJSON(res, 400, { error: 'Игрок не заблокирован' });
      target.isBanned = false;
      pushNotice('system', 'Ваш аккаунт разблокирован. Добро пожаловать обратно!');
    } else if (action === 'vip_on') {
      if (target.isVip) return sendJSON(res, 400, { error: 'Игрок уже VIP' });
      target.isVip = true;
      pushNotice('vip', 'Администратор SANI GROUP подарил вам VIP-статус! 👑');
    } else if (action === 'vip_off') {
      if (!target.isVip) return sendJSON(res, 400, { error: 'Игрок не VIP' });
      target.isVip = false;
      pushNotice('vip', 'VIP-статус отключён администратором SANI GROUP.');
    } else if (action === 'give_bills') {
      if (!num || num <= 0) return sendJSON(res, 400, { error: 'Укажите положительное количество денег' });
      if (num > 1000000) return sendJSON(res, 400, { error: 'Слишком большая сумма' });
      target.bills = Math.max(0, (target.bills || 0) + num);
      pushNotice('bills', `Вам начислено ${num} 💵`, { bills: num, coins: 0 });
    } else if (action === 'give_coins') {
      if (!num || num <= 0) return sendJSON(res, 400, { error: 'Укажите положительное количество монет' });
      if (num > 100000) return sendJSON(res, 400, { error: 'Слишком много монет' });
      target.coins = Math.max(0, (target.coins || 0) + num);
      pushNotice('coins', `Вам начислено ${num} 🪙`, { bills: 0, coins: num });
    } else if (action === 'message') {
      const text = String(message || '').trim().slice(0, 500);
      if (!text) return sendJSON(res, 400, { error: 'Введите сообщение' });
      pushNotice('message', text);
    } else {
      return sendJSON(res, 400, { error: 'Неизвестное действие' });
    }

    saveDB(db);
    return sendJSON(res, 200, { ok: true, user: { uid, ...target } });
  }

  const fileMap = {
    '/': 'index.html',
    '/index.html': 'index.html',
    '/style.css': 'style.css',
    '/client.js': 'client.js'
  };
  const targetFile = fileMap[pathname];
  if (targetFile) {
    const candidates = [
      path.join(__dirname, targetFile),
      path.join(__dirname, 'generated', targetFile)
    ];
    const fPath = candidates.find(p => fs.existsSync(p));
    if (fPath) {
      const ext = path.extname(fPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      return res.end(fs.readFileSync(fPath));
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`🚀 Сервер работает на порту ${PORT}`);
  console.log(`🔑 Пароль админа: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
});