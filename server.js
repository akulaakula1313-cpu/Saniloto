const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const DB_FILE = path.join(__dirname, 'db.json');
const PUBLIC_DIR = __dirname;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ROOM_TTL_MS = 30 * 60 * 1000;
const PLAYER_TIMEOUT_MS = 12 * 1000;
const DRAW_INTERVAL_MS = 4000;

const rooms = Object.create(null);
let globalChat = [];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initial = { users: {}, leaderboard: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.users || typeof db.users !== 'object') db.users = {};
    if (!Array.isArray(db.leaderboard)) db.leaderboard = [];
    for (const u of Object.values(db.users)) {
      if (!Array.isArray(u.unlockedBarrels)) u.unlockedBarrels = [0];
      if (!Array.isArray(u.unlockedCards)) u.unlockedCards = [0];
      if (!Number.isInteger(u.barrelDesign)) u.barrelDesign = 0;
      if (!Number.isInteger(u.cardDesign)) u.cardDesign = 0;
      if (typeof u.isVip !== 'boolean') u.isVip = false;
      if (!Number.isFinite(u.wins)) u.wins = 0;
      if (!Number.isFinite(u.totalWinnings)) u.totalWinnings = 0;
      if (!Number.isFinite(u.gamesPlayed)) u.gamesPlayed = 0;
      if (!Number.isFinite(u.lastVipWeeklyGift)) u.lastVipWeeklyGift = 0;
      if (typeof u.isBanned !== 'boolean') u.isBanned = false;
    }
    return db;
  } catch {
    return { users: {}, leaderboard: [] };
  }
}

function saveDB(db) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function defaultUser(name) {
  return {
    name: String(name || '').trim().slice(0, 24) || 'Игрок_' + Math.floor(1000 + Math.random() * 9000),
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
    wins: 0,
    totalWinnings: 0,
    gamesPlayed: 0,
    lastVipWeeklyGift: 0,
    isBanned: false,
    unlockedBarrels: [0],
    unlockedCards: [0],
    barrelDesign: 0,
    cardDesign: 0
  };
}

function sendJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function cleanText(value, max = 500) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
}

async function readBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 200000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); }
    });
  });
}

function requireUser(db, uid) {
  if (!uid || !db.users[uid]) return null;
  return db.users[uid];
}

function validateUserUpdate(update) {
  const out = {};
  if (typeof update.name === 'string') out.name = cleanText(update.name, 24) || 'Игрок';
  if (Number.isInteger(update.avatar) && update.avatar >= 0 && update.avatar <= 9) out.avatar = update.avatar;
  return out;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateTicket() {
  const ranges = Array.from({ length: 9 }, (_, c) => ({ start: c === 0 ? 1 : c * 10, end: c === 8 ? 90 : c * 10 + 9 }));
  let chosenRows = null;
  for (let attempt = 0; attempt < 20000 && !chosenRows; attempt++) {
    const rows = [[], [], []];
    for (let r = 0; r < 3; r++) rows[r] = shuffle(Array.from({ length: 9 }, (_, i) => i)).slice(0, 5);
    const counts = Array(9).fill(0);
    rows.forEach(cols => cols.forEach(c => counts[c]++));
    if (counts.every(n => n >= 1 && n <= 3)) chosenRows = rows;
  }
  if (!chosenRows) return generateTicket();

  const grid = Array.from({ length: 3 }, () => Array(9).fill(null));
  for (let c = 0; c < 9; c++) {
    const rows = chosenRows.map((cols, r) => cols.includes(c) ? r : -1).filter(r => r >= 0);
    const nums = [];
    for (let n = ranges[c].start; n <= ranges[c].end; n++) nums.push(n);
    shuffle(nums);
    nums.splice(rows.length).sort((a, b) => a - b);
    const selected = nums.slice(0, rows.length).sort((a, b) => a - b);
    rows.forEach((r, i) => { grid[r][c] = selected[i]; });
  }
  return grid;
}

function ticketNumbers(ticket) {
  return ticket.flat().filter(n => Number.isInteger(n));
}

function winByMarks(mode, ticket, markedSet) {
  if (mode === 'A') return ticketNumbers(ticket).every(n => markedSet.has(n));
  if (mode === 'B') {
    return ticket.some(row => {
      const nums = row.filter(Number.isInteger);
      return nums.length > 0 && nums.every(n => markedSet.has(n));
    });
  }
  if (mode === 'C') {
    const nums = ticket[2].filter(Number.isInteger);
    return nums.length > 0 && nums.every(n => markedSet.has(n));
  }
  return false;
}

function sanitizeRoom(room, uid) {
  return {
    id: room.id,
    stake: room.stake,
    maxPlayers: room.maxPlayers,
    mode: room.mode,
    vipOnly: !!room.vipOnly,
    status: room.status,
    drawn: room.drawn,
    bank: room.bank,
    lastTick: room.lastTick,
    chat: room.chat.slice(-20),
    players: room.players.filter(p => p.active).map(p => ({ uid: p.uid, name: p.name, avatar: p.avatar, online: Date.now() - p.lastSeen <= PLAYER_TIMEOUT_MS })),
    selfTicket: room.players.find(p => p.uid === uid)?.ticket || null,
    winnerUid: room.winnerUid || null,
    payout: room.payout || 0
  };
}

function refundWaitingRoom(room, db) {
  for (const p of room.players) {
    if (p.stakePaid && !p.refunded) {
      const u = db.users[p.uid];
      if (u) u.bills += p.contribution;
      p.refunded = true;
    }
  }
  room.bank = 0;
}

function refundAllPlayers(room, db) {
  for (const p of room.players) {
    if (p.stakePaid && !p.refunded) {
      const u = db.users[p.uid];
      if (u) u.bills += p.contribution;
      p.refunded = true;
    }
  }
  room.bank = 0;
}

function payoutWinner(room, db, uid) {
  if (room.paidOut || room.bank <= 0) return 0;
  const winner = db.users[uid];
  if (!winner) return 0;
  const amount = room.bank;
  winner.bills += amount;
  winner.wins = (winner.wins||0) + 1; winner.totalWinnings = (winner.totalWinnings||0) + amount;
  room.bank = 0;
  room.paidOut = true;
  room.status = 'finished';
  room.winnerUid = uid;
  room.payout = amount;
  saveDB(db);
  return amount;
}

function touchPlayer(room, uid) {
  const p = room.players.find(x => x.uid === uid);
  if (p) { p.lastSeen = Date.now(); p.active = true; }
  return p;
}

function maybeProgressRoom(room) {
  if (room.status !== 'playing') return;
  if (Date.now() - room.lastTick < DRAW_INTERVAL_MS) return;
  if (room.deck.length > 0) {
    room.drawn.push(room.deck.pop());
    room.lastTick = Date.now();
  } else {
    room.status = 'finished';
  }
}

function cleanupRooms() {
  const now = Date.now();
  const db = loadDB();
  for (const [id, room] of Object.entries(rooms)) {
    for (const p of room.players) {
      if (p.active && now - p.lastSeen > PLAYER_TIMEOUT_MS) p.active = false;
    }
    if (room.status === 'waiting' && room.players.every(p => !p.active)) {
      refundWaitingRoom(room, db);
      delete rooms[id];
      continue;
    }
    if (room.status === 'playing' && room.players.every(p => !p.active)) {
      refundAllPlayers(room, db);
      room.status = 'cancelled';
      room.cancelledAt = now;
    }
    if ((room.status === 'finished' || room.status === 'cancelled') && now - (room.finishedAt || room.cancelledAt || room.lastTick) > ROOM_TTL_MS) delete rooms[id];
  }
  saveDB(db);
}

setInterval(cleanupRooms, 5000);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const { pathname, searchParams } = url;

    if (pathname.startsWith('/api/')) {
      const uid = searchParams.get('uid');
      if (uid) {
        const db = loadDB();
        if (db.users[uid]?.isBanned) return sendJSON(res, 403, { error: 'banned', message: 'Вы заблокированы администратором!' });
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
      const db = loadDB();
      const user = requireUser(db, body.uid);
      if (!user) return sendJSON(res, 400, { error: 'bad_uid' });
      if (user.isBanned) return sendJSON(res, 403, { error: 'banned' });
      const patch = validateUserUpdate(body);
      Object.assign(user, patch);
      saveDB(db);
      return sendJSON(res, 200, { ok: true, user });
    }

    if (pathname === '/api/game/stat' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid);
      if (!user) return sendJSON(res,404,{error:'Пользователь не найден'});
      if (body.action === 'start') user.gamesPlayed=(user.gamesPlayed||0)+1;
      else if (body.action === 'win') { user.wins=(user.wins||0)+1; }
      else return sendJSON(res,400,{error:'Неизвестная статистика'});
      saveDB(db); return sendJSON(res,200,{ok:true,user});
    }

    if (pathname === '/api/dailyreward/claim' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid);
      if (!user) return sendJSON(res, 400, { error: 'Пользователь не найден' });
      const now = Date.now();
      if (now - Number(user.lastClaim || 0) < 24 * 60 * 60 * 1000) return sendJSON(res, 400, { error: 'Награда уже получена сегодня' });
      const rewards = [{ bills: 500 }, { bills: 1000 }, { coins: 10 }, { bills: 1500 }, { coins: 30 }, { bills: 3000 }, { coins: 45 }];
      const day = Number(user.dailyStreak || 0) % rewards.length;
      const reward = rewards[day];
      user.bills += reward.bills || 0; user.coins += reward.coins || 0;
      if (user.isVip) { user.coins += 500; user.pendingGifts.push({ type: 'vip_daily', bills: 0, coins: 500, message: 'VIP-бонус за вход 👑', at: now }); }
      user.dailyStreak = Number(user.dailyStreak || 0) + 1; user.lastClaim = now;
      saveDB(db);
      return sendJSON(res, 200, { ok: true, reward, user });
    }

    if (pathname === '/api/vip/weekly/claim' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid);
      if (!user) return sendJSON(res, 404, { error: 'Пользователь не найден' });
      if (!user.isVip) return sendJSON(res, 403, { error: 'Только для VIP' });
      const now = Date.now(); const week = 7 * 24 * 60 * 60 * 1000;
      if (now - Number(user.lastVipWeeklyGift || 0) < week) return sendJSON(res, 400, { error: 'VIP-подарок доступен раз в 7 дней' });
      user.bills += 5000; user.coins += 1000; user.lastVipWeeklyGift = now;
      const pool = ['barrel:1','barrel:2','barrel:3','barrel:4','barrel:5','card:1','card:2','card:3','card:4','card:5'];
      const gift = pool[crypto.randomInt(pool.length)]; const [type,idText] = gift.split(':'); const id = Number(idText);
      const key = type === 'barrel' ? 'unlockedBarrels' : 'unlockedCards'; if (!user[key].includes(id)) user[key].push(id);
      user.pendingGifts.push({ type:'vip_weekly', bills:5000, coins:1000, cosmetic:{type,id}, message:'Еженедельный VIP-подарок 👑', at:now });
      saveDB(db); return sendJSON(res,200,{ok:true,reward:{bills:5000,coins:1000,cosmetic:{type,id}},user});
    }

    if (pathname === '/api/cosmetic/buy' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid);
      if (!user) return sendJSON(res, 404, { error: 'Игрок не найден' }); if (user.isBanned) return sendJSON(res, 403, { error: 'Игрок заблокирован' });
      const type = String(body.type||''); const id = Number.parseInt(body.id,10);
      const catalog = type==='barrel' ? {1:2500,2:3500,3:5000,4:6500,5:8000} : type==='card' ? {1:2500,2:3500,3:5000,4:6500,5:8000} : null;
      const vipId = 6; if (!catalog || !Number.isInteger(id) || id<1 || id>6) return sendJSON(res,400,{error:'Неизвестный дизайн'});
      if (id===vipId) { if (!user.isVip) return sendJSON(res,403,{error:'Дизайн доступен только VIP'}); }
      else { const cost=catalog[id]; if (user.coins<cost) return sendJSON(res,400,{error:'Недостаточно 🪙 монет'}); user.coins-=cost; }
      const key=type==='barrel'?'unlockedBarrels':'unlockedCards'; if(!user[key].includes(id))user[key].push(id); if(type==='barrel')user.barrelDesign=id;else user.cardDesign=id;
      saveDB(db); return sendJSON(res,200,{ok:true,user:{uid:body.uid,...user}});
    }
    if (pathname === '/api/cosmetic/equip' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid);
      if (!user) return sendJSON(res,404,{error:'Игрок не найден'}); if(user.isBanned)return sendJSON(res,403,{error:'Игрок заблокирован'});
      const type=String(body.type||''); const id=Number.parseInt(body.id,10); const key=type==='barrel'?'unlockedBarrels':type==='card'?'unlockedCards':null;
      if(!key||!Number.isInteger(id)||!user[key].includes(id))return sendJSON(res,403,{error:'Дизайн не куплен'});
      if(id===4&&!user.isVip)return sendJSON(res,403,{error:'VIP-дизайн недоступен'}); if(type==='barrel')user.barrelDesign=id;else user.cardDesign=id; saveDB(db); return sendJSON(res,200,{ok:true,user:{uid:body.uid,...user}});
    }

    if (pathname === '/api/marker/buy' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid);
      const markerId = Number.parseInt(body.markerId, 10); const costs = { 0: 0, 1: 15000, 2: 15000, 3: 15000 }; const cost = costs[markerId];
      if (!user || cost === undefined) return sendJSON(res, 400, { error: 'Некорректный маркер' });
      user.unlockedMarkers = Array.isArray(user.unlockedMarkers) ? user.unlockedMarkers : [0];
      if (user.unlockedMarkers.includes(markerId)) { user.marker = markerId; saveDB(db); return sendJSON(res, 200, { ok: true, user }); }
      if (user.bills < cost) return sendJSON(res, 400, { error: 'Недостаточно денег' });
      user.bills -= cost; user.unlockedMarkers.push(markerId); user.marker = markerId; saveDB(db);
      return sendJSON(res, 200, { ok: true, user });
    }

    if (pathname === '/api/notifications/clear' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid);
      if (!user) return sendJSON(res, 400, { error: 'Пользователь не найден' });
      user.pendingGifts = []; saveDB(db); return sendJSON(res, 200, { ok: true, user });
    }

    if (pathname === '/api/leaderboard' && req.method === 'GET') {
      const db = loadDB();
      const list = Object.entries(db.users).map(([uid, u]) => ({ uid, name: u.name, avatar: u.avatar, isVip: !!u.isVip, score: Number(u.bills || 0), wins:Number(u.wins||0) }));
      list.sort((a, b) => b.score - a.score);
      return sendJSON(res, 200, list.slice(0, 50));
    }

    if (pathname === '/api/room/create' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid);
      const maxPlayers = Math.max(2, Math.min(6, Number.parseInt(body.maxPlayers, 10) || 2));
      const stake = Number.parseInt(body.stake, 10);
      const mode = ['A', 'B', 'C'].includes(body.mode) ? body.mode : 'A';
      const vipOnly = body.vipOnly === true;
      if (!user) return sendJSON(res, 400, { error: 'Пользователь не найден' });
      if (vipOnly && !user.isVip) return sendJSON(res, 403, { error: 'VIP-комната доступна только VIP-игрокам 👑' });
      if (!Number.isInteger(stake) || stake < 1 || stake > 1000000) return sendJSON(res, 400, { error: 'Некорректная ставка' });
      if (user.bills < stake) return sendJSON(res, 400, { error: 'Недостаточно денег для ставки!' });
      if (Object.values(rooms).some(r => r.players.some(p => p.uid === body.uid) && ['waiting', 'playing'].includes(r.status))) return sendJSON(res, 400, { error: 'Вы уже за другим столом' });
      let roomId; do roomId = String(crypto.randomInt(1000, 10000)); while (rooms[roomId]);
      user.bills -= stake;
      const player = { uid: body.uid, name: user.name, avatar: user.avatar, ticket: generateTicket(), contribution: stake, stakePaid: true, refunded: false, active: true, lastSeen: Date.now() };
      rooms[roomId] = { id: roomId, stake, maxPlayers, mode, vipOnly, players: [player], status: 'waiting', deck: shuffle(Array.from({ length: 90 }, (_, i) => i + 1)), drawn: [], bank: stake, lastTick: Date.now(), chat: [], createdAt: Date.now(), paidOut: false };
      saveDB(db);
      return sendJSON(res, 200, { ok: true, roomId, room: sanitizeRoom(rooms[roomId], body.uid), userBalance: user.bills });
    }

    if (pathname === '/api/room/join' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid); const room = rooms[String(body.roomId || '')];
      if (!user) return sendJSON(res, 400, { error: 'Пользователь не найден' });
      if (!room) return sendJSON(res, 404, { error: 'Стол не найден!' });
      if (room.status !== 'waiting') return sendJSON(res, 400, { error: 'Игра уже началась!' });
      if (room.vipOnly && !user.isVip) return sendJSON(res, 403, { error: 'VIP-комната доступна только VIP-игрокам 👑' });
      if (room.players.some(p => p.uid === body.uid && p.active)) return sendJSON(res, 200, { ok: true, room: sanitizeRoom(room, body.uid), userBalance: user.bills });
      if (room.players.filter(p => p.active).length >= room.maxPlayers) return sendJSON(res, 400, { error: 'Стол заполнен!' });
      if (user.bills < room.stake) return sendJSON(res, 400, { error: 'Недостаточно денег!' });
      user.bills -= room.stake;
      room.bank += room.stake;
      room.players.push({ uid: body.uid, name: user.name, avatar: user.avatar, ticket: generateTicket(), contribution: room.stake, stakePaid: true, refunded: false, active: true, lastSeen: Date.now() });
      if (room.players.filter(p => p.active).length >= room.maxPlayers) { room.status = 'playing'; room.lastTick = Date.now(); for (const p of room.players.filter(x=>x.active)) { const u=db.users[p.uid]; if(u) u.gamesPlayed=(u.gamesPlayed||0)+1; } }
      saveDB(db);
      return sendJSON(res, 200, { ok: true, room: sanitizeRoom(room, body.uid), userBalance: user.bills });
    }

    if (pathname === '/api/room/heartbeat' && req.method === 'POST') {
      const body = await readBody(req); const room = rooms[String(body.roomId || '')];
      if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });
      if (!touchPlayer(room, body.uid)) return sendJSON(res, 400, { error: 'Игрок не за столом' });
      maybeProgressRoom(room);
      return sendJSON(res, 200, { ok: true, room: sanitizeRoom(room, body.uid) });
    }

    if (pathname === '/api/room/leave' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const room = rooms[String(body.roomId || '')];
      if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });
      const player = room.players.find(p => p.uid === body.uid);
      if (!player) return sendJSON(res, 200, { ok: true });
      player.active = false; player.lastSeen = Date.now();
      if (room.status === 'waiting') {
        if (!player.refunded) { db.users[player.uid].bills += player.contribution; player.refunded = true; room.bank -= player.contribution; }
        room.players = room.players.filter(p => p.active);
        if (room.players.length === 0) delete rooms[room.id];
      } else if (room.status === 'playing' && room.players.every(p => !p.active)) {
        refundAllPlayers(room, db); room.status = 'cancelled'; room.cancelledAt = Date.now();
      }
      saveDB(db);
      return sendJSON(res, 200, { ok: true, userBalance: db.users[player.uid]?.bills ?? 0 });
    }

    if (pathname === '/api/room/sync' && req.method === 'GET') {
      const room = rooms[String(searchParams.get('roomId') || '')];
      const uid = searchParams.get('uid');
      if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });
      touchPlayer(room, uid); maybeProgressRoom(room);
      if (room.deck.length === 0 && room.status === 'playing') { room.status = 'finished'; room.finishedAt = Date.now(); }
      return sendJSON(res, 200, sanitizeRoom(room, uid));
    }

    if (pathname === '/api/room/win' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const room = rooms[String(body.roomId || '')];
      if (!room) return sendJSON(res, 404, { error: 'Комната не найдена' });
      if (room.status !== 'playing') return sendJSON(res, 400, { error: 'Игра уже завершена' });
      const player = room.players.find(p => p.uid === body.uid && p.active);
      if (!player) return sendJSON(res, 400, { error: 'Игрок не активен' });
      const marked = new Set(Array.isArray(body.marked) ? body.marked.filter(Number.isInteger) : []);
      const drawn = new Set(room.drawn);
      for (const n of marked) if (!drawn.has(n)) return sendJSON(res, 400, { error: 'Нельзя отметить не выпавший номер' });
      if (!winByMarks(room.mode, player.ticket, marked)) return sendJSON(res, 400, { error: 'Условие победы ещё не выполнено' });
      const payout = payoutWinner(room, db, player.uid);
      return sendJSON(res, 200, { ok: true, winnerUid: player.uid, payout, userBalance: db.users[player.uid].bills, room: sanitizeRoom(room, body.uid) });
    }

    if (pathname === '/api/chat/room/send' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const room = rooms[String(body.roomId || '')]; const user = requireUser(db, body.uid);
      if (!room || !user || !room.players.some(p => p.uid === body.uid && p.active)) return sendJSON(res, 400, { error: 'Комната или пользователь не найдены' });
      const text = cleanText(body.text, 300); if (!text) return sendJSON(res, 400, { error: 'Пустое сообщение' });
      room.chat.push({ uid: body.uid, name: user.name, isVip:!!user.isVip, text, at: Date.now() }); if (room.chat.length > 20) room.chat.shift();
      touchPlayer(room, body.uid); return sendJSON(res, 200, { ok: true });
    }

    if (pathname === '/api/chat/global' && req.method === 'GET') return sendJSON(res, 200, globalChat.slice(-30));
    if (pathname === '/api/chat/global/send' && req.method === 'POST') {
      const body = await readBody(req); const db = loadDB(); const user = requireUser(db, body.uid); if (!user) return sendJSON(res, 400, { error: 'Пользователь не найден' });
      const text = cleanText(body.text, 300); if (!text) return sendJSON(res, 400, { error: 'Пустое сообщение' });
      globalChat.push({ uid: body.uid, name: user.name, isVip:!!user.isVip, text, at: Date.now() }); if (globalChat.length > 30) globalChat.shift(); return sendJSON(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/players' && req.method === 'POST') {
      const body = await readBody(req); if (body.adminPassword !== ADMIN_PASSWORD) return sendJSON(res, 401, { error: 'Wrong password' });
      const db = loadDB(); return sendJSON(res, 200, Object.entries(db.users).map(([uid, v]) => ({ uid, ...v })));
    }

    if (pathname === '/api/admin/action' && req.method === 'POST') {
      const body = await readBody(req); if (body.adminPassword !== ADMIN_PASSWORD) return sendJSON(res, 401, { error: 'Wrong password' });
      const db = loadDB(); const user = db.users[body.uid]; const action = String(body.action || '');
      if (!user && action !== 'clear_database') return sendJSON(res, 404, { error: 'Игрок не найден' });
      if (action === 'clear_database') {
        for (const room of Object.values(rooms)) { room.status = 'cancelled'; refundAllPlayers(room, db); }
        db.users = {}; db.leaderboard = []; globalChat = []; for (const k of Object.keys(rooms)) delete rooms[k]; saveDB(db); return sendJSON(res, 200, { ok: true, cleared: true });
      }
      if (action === 'ban') user.isBanned = true;
      else if (action === 'unban') user.isBanned = false;
      else if (action === 'money') { const amount = Number.parseInt(body.amount, 10); if (!Number.isInteger(amount) || amount <= 0) return sendJSON(res, 400, { error: 'Некорректная сумма' }); user.bills += amount; user.pendingGifts.push({ type: 'money', bills: amount, coins: 0, message: '', at: Date.now() }); }
      else if (action === 'coins') { const amount = Number.parseInt(body.amount, 10); if (!Number.isInteger(amount) || amount <= 0) return sendJSON(res, 400, { error: 'Некорректная сумма' }); user.coins += amount; user.pendingGifts.push({ type: 'coins', bills: 0, coins: amount, message: '', at: Date.now() }); }
      else if (action === 'vip') { user.isVip = Boolean(body.enabled); user.pendingGifts.push({ type: 'vip', bills: 0, coins: 0, message: body.enabled ? 'Вам подарен VIP-статус SANI GROUP 👑' : 'VIP-статус отключён администратором SANI GROUP', at: Date.now() }); }
      else if (action === 'message') { const text = cleanText(body.message, 500); if (!text) return sendJSON(res, 400, { error: 'Пустое сообщение' }); user.pendingGifts.push({ type: 'message', bills: 0, coins: 0, message: text, at: Date.now() }); }
      else return sendJSON(res, 400, { error: 'Неизвестное действие' });
      if (user.pendingGifts.length > 50) user.pendingGifts = user.pendingGifts.slice(-50); saveDB(db); return sendJSON(res, 200, { ok: true, user: { uid: body.uid, ...user } });
    }

    const fileMap = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/client.js': 'client.js', '/sani-loto-banner.png': 'sani-loto-banner.png', '/favicon.svg': 'favicon.svg' };
    if (fileMap[pathname]) {
      const filePath = path.join(PUBLIC_DIR, fileMap[pathname]);
      if (fs.existsSync(filePath)) { res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/plain; charset=utf-8' }); return res.end(fs.readFileSync(filePath)); }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Not Found');
  } catch (err) {
    console.error(err); if (!res.headersSent) sendJSON(res, 500, { error: 'Ошибка сервера' });
  }
});

server.listen(PORT, () => console.log(`Сервер работает на порту ${PORT}`));
