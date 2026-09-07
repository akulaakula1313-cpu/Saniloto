/* ================== ДАННЫЕ ================== */
const AVATARS = ['🧑‍🦲','👨','👩','🧔','👴','👵','🦸','🧙','🤖','👽','🐱','🐶','🦊','🐼','🦁'];
const MARKERS = [
  { color: '#e74c3c', cost: 0 },
  { color: '#3498db', cost: 20 },
  { color: '#2ecc71', cost: 20 },
  { color: '#f1c40f', cost: 30 },
  { color: '#9b59b6', cost: 30 },
  { color: '#1abc9c', cost: 50 },
  { color: '#e67e22', cost: 50 },
  { color: '#34495e', cost: 80 }
];
const DAILY_REWARDS = [
  { bills: 200, coins: 5 }, { bills: 300, coins: 5 }, { bills: 400, coins: 10 },
  { bills: 500, coins: 10 }, { bills: 600, coins: 15 }, { bills: 800, coins: 20 },
  { bills: 1500, coins: 50 }
];
const SHOP_ITEMS = [
  { label: '100 🪙', cost: 500, coins: 100 },
  { label: '300 🪙', cost: 1200, coins: 300 },
  { label: '1000 🪙', cost: 3500, coins: 1000 }
];
const BOT_NAMES = ['Иван', 'Оля', 'Дима', 'Света', 'Макс', 'Аня'];

let me = null;
let adminPassword = null;
let globalChatTimer = null;
let roomSyncTimer = null;
let currentRoom = null;
let game = null; // active bot/multiplayer game state

/* ================== ИНИЦИАЛИЗАЦИЯ ================== */
window.addEventListener('DOMContentLoaded', init);

async function init() {
  const savedUid = localStorage.getItem('lotoUid');
  const url = new URL('/api/state', location.origin);
  if (savedUid) url.searchParams.set('uid', savedUid);
  const res = await fetch(url).then(r => r.json());
  me = res;
  localStorage.setItem('lotoUid', me.uid);
  renderMenu();
  wireEvents();
  checkPendingGifts();
}

async function saveState(partial) {
  Object.assign(me, partial);
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: me.uid, ...partial })
  }).then(r => r.json());
  if (res.user) me = { uid: me.uid, ...res.user };
  renderMenu();
}

function renderMenu() {
  document.getElementById('cur-bills').textContent = me.bills;
  document.getElementById('cur-coins').textContent = me.coins;
  document.getElementById('menu-avatar-emoji').textContent = AVATARS[me.avatar] || AVATARS[0];
  document.getElementById('menu-avatar-name').textContent = me.name;
  const gb = document.getElementById('game-cur-bills');
  const gc = document.getElementById('game-cur-coins');
  if (gb) gb.textContent = me.bills;
  if (gc) gc.textContent = me.coins;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function openModal(name) { document.getElementById('modal-' + name).classList.remove('hidden'); }
function closeModal(name) { document.getElementById('modal-' + name).classList.add('hidden'); }

/* ================== СОБЫТИЯ ================== */
function wireEvents() {
  document.querySelectorAll('.btn[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.modal;
      openModal(name);
      if (name === 'daily') renderDaily();
      if (name === 'leaderboard') renderLeaderboard();
      if (name === 'shop') renderShop();
      if (name === 'marker') renderMarker();
      if (name === 'profile') renderProfile();
    });
  });

  document.getElementById('btn-close-daily').onclick = () => closeModal('daily');
  document.getElementById('btn-close-leaderboard').onclick = () => closeModal('leaderboard');
  document.getElementById('btn-close-shop').onclick = () => closeModal('shop');
  document.getElementById('btn-close-marker').onclick = () => closeModal('marker');
  document.getElementById('btn-close-profile').onclick = () => closeModal('profile');
  document.getElementById('btn-close-rules').onclick = () => closeModal('rules');

  document.getElementById('btn-watch-ad').onclick = () => {
    saveState({ coins: me.coins + 20 });
    renderShop();
  };

  document.getElementById('btn-profile-save').onclick = () => {
    const name = document.getElementById('profile-name-input').value.trim() || me.name;
    saveState({ name, avatar: me._tempAvatar ?? me.avatar });
    closeModal('profile');
  };

  document.getElementById('btn-play').onclick = () => openModal('setup');
  document.getElementById('btn-close-setup').onclick = () => closeModal('setup');
  document.getElementById('btn-setup-start').onclick = () => {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const count = parseInt(document.querySelector('input[name="count"]:checked').value, 10);
    closeModal('setup');
    startBotGame(mode, count);
  };

  document.getElementById('btn-exit-game').onclick = exitGame;
  document.getElementById('pu-eye').onclick = usePowerupEye;
  document.getElementById('pu-plus1').onclick = () => usePowerupMark(1, 1);
  document.getElementById('pu-plus5').onclick = () => usePowerupMark(5, 50);
  document.getElementById('pu-x').onclick = usePowerupUndo;

  // Глобальный чат
  document.getElementById('btn-open-global-chat').onclick = () => {
    openModal('global-chat');
    pollGlobalChat();
    globalChatTimer = setInterval(pollGlobalChat, 4000);
  };
  document.getElementById('btn-close-global-chat').onclick = () => {
    closeModal('global-chat');
    clearInterval(globalChatTimer);
  };
  document.getElementById('btn-global-chat-send').onclick = sendGlobalChat;
  document.getElementById('global-chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendGlobalChat();
  });

  // Стол друзей
  document.getElementById('btn-open-multiplayer').onclick = () => {
    openModal('multiplayer');
    document.getElementById('multi-create-block').classList.remove('hidden');
    document.getElementById('multi-join-block').classList.remove('hidden');
    document.getElementById('multi-waiting-block').classList.add('hidden');
  };
  document.getElementById('btn-close-multiplayer').onclick = () => {
    closeModal('multiplayer');
    clearInterval(roomSyncTimer);
  };
  document.getElementById('btn-multi-create').onclick = createRoom;
  document.getElementById('btn-multi-join').onclick = joinRoom;
  document.getElementById('btn-room-chat-send').onclick = sendRoomChat;
  document.getElementById('room-chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') sendRoomChat();
  });

  // Админ
  document.getElementById('btn-admin-login').onclick = () => openModal('admin');
  document.getElementById('btn-close-admin').onclick = () => closeModal('admin');
  document.getElementById('btn-admin-auth').onclick = adminAuth;
  document.getElementById('btn-admin-clear-top').onclick = adminClearTop;

  document.getElementById('btn-close-gift-alert').onclick = closeGiftAlert;
}

/* ================== ЕЖЕДНЕВНЫЕ НАГРАДЫ ================== */
function renderDaily() {
  const grid = document.getElementById('daily-grid');
  grid.innerHTML = '';
  const canClaim = !me.lastClaim || (Date.now() - me.lastClaim) > 20 * 60 * 60 * 1000;
  const dayIdx = (me.dailyStreak || 0) % 7;
  DAILY_REWARDS.forEach((r, i) => {
    const cell = document.createElement('div');
    let cls = 'daily-cell';
    if (i < dayIdx) cls += ' claimed';
    if (i === dayIdx && canClaim) cls += ' today';
    cell.className = cls;
    cell.innerHTML = `<div class="d-num">День ${i + 1}</div><div class="d-icon">🎁</div><div class="d-reward">${r.bills}💵 ${r.coins}🪙</div>`;
    if (i === dayIdx && canClaim) {
      cell.onclick = () => claimDaily(i);
    }
    grid.appendChild(cell);
  });
}
function claimDaily(i) {
  const r = DAILY_REWARDS[i];
  saveState({
    bills: me.bills + r.bills,
    coins: me.coins + r.coins,
    dailyStreak: ((me.dailyStreak || 0) + 1) % 7,
    lastClaim: Date.now()
  });
  renderDaily();
}

/* ================== ЛИДЕРБОРД ================== */
async function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = 'Загрузка...';
  const data = await fetch('/api/leaderboard').then(r => r.json());
  list.innerHTML = '';
  data.forEach((u, i) => {
    const row = document.createElement('div');
    row.className = 'lb-row' + (u.name === me.name ? ' me' : '');
    row.innerHTML = `<span class="lb-rank">${i + 1}</span><span class="lb-emoji">${AVATARS[u.avatar] || '🧑'}</span><span class="lb-name">${escapeHtml(u.name)}</span><span>${u.score} 💵</span>`;
    list.appendChild(row);
  });
}

/* ================== МАГАЗИН ================== */
function renderShop() {
  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  SHOP_ITEMS.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.innerHTML = `<span>${item.label}</span><span>${item.cost} 💵</span>`;
    const buyBtn = document.createElement('button');
    buyBtn.className = 'btn';
    buyBtn.textContent = 'Купить';
    buyBtn.disabled = me.bills < item.cost;
    buyBtn.onclick = () => {
      if (me.bills < item.cost) return;
      saveState({ bills: me.bills - item.cost, coins: me.coins + item.coins });
      renderShop();
    };
    row.appendChild(buyBtn);
    list.appendChild(row);
  });
}

/* ================== МАРКЕР ================== */
function renderMarker() {
  const grid = document.getElementById('marker-grid');
  grid.innerHTML = '';
  const unlocked = me.unlockedMarkers || [0];
  MARKERS.forEach((m, i) => {
    const cell = document.createElement('div');
    const isUnlocked = unlocked.includes(i);
    cell.className = 'marker-cell' + (me.marker === i ? ' selected' : '') + (!isUnlocked ? ' locked' : '');
    cell.innerHTML = `<div class="m-dot" style="background:${m.color}"></div><div class="m-cost">${isUnlocked ? 'Готово' : m.cost + ' 🪙'}</div>`;
    cell.onclick = () => {
      if (isUnlocked) {
        saveState({ marker: i });
        renderMarker();
      } else if (me.coins >= m.cost) {
        const newUnlocked = [...unlocked, i];
        saveState({ unlockedMarkers: newUnlocked, coins: me.coins - m.cost, marker: i });
        renderMarker();
      } else {
        alert('Недостаточно монет!');
      }
    };
    grid.appendChild(cell);
  });
}

/* ================== ПРОФИЛЬ ================== */
function renderProfile() {
  me._tempAvatar = me.avatar;
  document.getElementById('profile-avatar-preview').textContent = AVATARS[me.avatar];
  document.getElementById('profile-name-input').value = me.name;
  const grid = document.getElementById('profile-avatar-grid');
  grid.innerHTML = '';
  AVATARS.forEach((a, i) => {
    const cell = document.createElement('div');
    cell.className = 'avatar-cell' + (i === me.avatar ? ' selected' : '');
    cell.textContent = a;
    cell.onclick = () => {
      me._tempAvatar = i;
      document.getElementById('profile-avatar-preview').textContent = a;
      grid.querySelectorAll('.avatar-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
    };
    grid.appendChild(cell);
  });
}

/* ================== ГЕНЕРАЦИЯ КАРТОЧЕК ================== */
function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }

function modeConfig(mode) {
  if (mode === 'A') return { total: 90, cols: 9, rows: 3, filledPerRow: 5, rangeSize: 10 };
  if (mode === 'B') return { total: 36, cols: 6, rows: 3, filledPerRow: 4, rangeSize: 6 };
  return { total: 9, cols: 3, rows: 3, filledPerRow: 3, rangeSize: 3 };
}

function generateTicket(mode) {
  const cfg = modeConfig(mode);
  if (mode === 'C') {
    // полная карточка 3x3, числа 1-9 в случайном порядке
    const nums = shuffle([1,2,3,4,5,6,7,8,9]);
    const grid = [[],[],[]];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) grid[r][c] = nums[r * 3 + c];
    return { cols: 3, rows: 3, grid, total: 9 };
  }

  const { cols, rows, filledPerRow, rangeSize } = cfg;
  const totalFilled = filledPerRow * rows;
  // распределяем количество чисел по столбцам (1-3 на столбец)
  let colCounts;
  let attempts = 0;
  do {
    colCounts = new Array(cols).fill(1);
    let remaining = totalFilled - cols;
    while (remaining > 0) {
      const idx = Math.floor(Math.random() * cols);
      if (colCounts[idx] < Math.min(rows, 3)) { colCounts[idx]++; remaining--; }
    }
    attempts++;
  } while (colCounts.reduce((a, b) => a + b, 0) !== totalFilled && attempts < 50);

  // размещаем по строкам так, чтобы в каждой строке было ровно filledPerRow чисел
  let placement = null;
  for (let tries = 0; tries < 300 && !placement; tries++) {
    const rowCounts = new Array(rows).fill(0);
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(false));
    let ok = true;
    for (let c = 0; c < cols; c++) {
      const need = colCounts[c];
      const rowOrder = shuffle([...Array(rows).keys()]).sort((a, b) => rowCounts[a] - rowCounts[b]);
      const chosen = rowOrder.slice(0, need);
      chosen.forEach(r => { grid[r][c] = true; rowCounts[r]++; });
    }
    if (rowCounts.every(v => v === filledPerRow)) placement = grid;
  }
  if (!placement) {
    // запасной вариант: равномерно
    placement = Array.from({ length: rows }, () => new Array(cols).fill(false));
    for (let r = 0; r < rows; r++) {
      const cols_ = shuffle([...Array(cols).keys()]).slice(0, filledPerRow);
      cols_.forEach(c => placement[r][c] = true);
    }
  }

  // заполняем числами по возрастанию в каждом столбце
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
  for (let c = 0; c < cols; c++) {
    const rangeStart = c * rangeSize + 1;
    const rangeEnd = Math.min(cfg.total, rangeStart + rangeSize - 1);
    const pool = [];
    for (let n = rangeStart; n <= rangeEnd; n++) pool.push(n);
    const need = placement.reduce((s, row) => s + (row[c] ? 1 : 0), 0);
    const chosen = shuffle(pool).slice(0, need).sort((a, b) => a - b);
    let ci = 0;
    for (let r = 0; r < rows; r++) if (placement[r][c]) grid[r][c] = chosen[ci++];
  }
  return { cols, rows, grid, total: cfg.total };
}

function renderTicket(ticket, ticketIndex) {
  const table = document.createElement('table');
  table.className = 'ticket';
  table.dataset.ticketIndex = ticketIndex;
  ticket.grid.forEach((row, r) => {
    const tr = document.createElement('tr');
    row.forEach((num, c) => {
      const td = document.createElement('td');
      if (num === null) {
        td.className = 'empty';
      } else {
        td.textContent = num;
        td.dataset.num = num;
        td.onclick = () => tryMarkCell(ticketIndex, td);
      }
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  return table;
}

/* ================== ИГРА С БОТАМИ ================== */
function startBotGame(mode, count) {
  const cfg = modeConfig(mode);
  const deck = shuffle(Array.from({ length: cfg.total }, (_, i) => i + 1));
  const tickets = Array.from({ length: count }, () => generateTicket(mode));
  const bots = shuffle(BOT_NAMES).slice(0, 2).map(name => ({
    name,
    avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    progress: 0,
    target: cfg.total === 9 ? 9 : (mode === 'A' ? 15 : 12)
  }));

  game = { mode, deck, drawn: [], tickets, bots, interval: null, isMultiplayer: false };

  document.getElementById('bank-box').classList.add('hidden');
  document.getElementById('room-chat-container').classList.add('hidden');
  document.getElementById('game-player-avatar').textContent = AVATARS[me.avatar];
  document.getElementById('game-player-name').textContent = me.name;
  document.getElementById('drum-number').textContent = '-';
  document.getElementById('history-row').innerHTML = '';
  document.getElementById('event-log').textContent = 'Игра началась!';

  const container = document.getElementById('tickets-container');
  container.innerHTML = '';
  tickets.forEach((t, i) => container.appendChild(renderTicket(t, i)));

  const botsRow = document.getElementById('bots-row');
  botsRow.innerHTML = '';
  bots.forEach((b, i) => {
    const box = document.createElement('div');
    box.className = 'bot-box';
    box.innerHTML = `<div class="avatar-emoji">${b.avatar}</div><div>${b.name}</div><div class="bot-progress" id="bot-progress-${i}">0/${b.target}</div>`;
    botsRow.appendChild(box);
  });

  showScreen('screen-game');
  game.interval = setInterval(drawNumber, 3000);
}

function drawNumber() {
  if (!game.deck.length) {
    endGame('Числа закончились. Игра окончена.');
    return;
  }
  const num = game.deck.pop();
  game.drawn.push(num);
  document.getElementById('drum-number').textContent = num;

  const hist = document.getElementById('history-row');
  const span = document.createElement('span');
  span.textContent = num;
  hist.appendChild(span);
  while (hist.children.length > 15) hist.removeChild(hist.firstChild);

  // подсветить клетки
  document.querySelectorAll('#tickets-container td[data-num="' + num + '"]').forEach(td => {
    if (!td.classList.contains('marked')) td.classList.add('drawn-not-marked');
  });

  // прогресс ботов
  game.bots.forEach((b, i) => {
    if (Math.random() < 0.6 && b.progress < b.target) {
      b.progress++;
      const el = document.getElementById('bot-progress-' + i);
      if (el) el.textContent = `${b.progress}/${b.target}`;
      if (b.progress >= b.target) {
        endGame(`${b.name} выиграл(а) первым! Попробуйте ещё раз.`);
      }
    }
  });
}

function tryMarkCell(ticketIndex, td) {
  const num = parseInt(td.dataset.num, 10);
  if (!game.drawn.includes(num) || td.classList.contains('marked')) return;
  td.classList.remove('drawn-not-marked');
  td.classList.add('marked');
  td.style.background = MARKERS[me.marker || 0].color;
  checkWin(ticketIndex);
}

function checkWin(ticketIndex) {
  const ticket = game.tickets[ticketIndex];
  const table = document.querySelector(`.ticket[data-ticket-index="${ticketIndex}"]`);
  const rows = table.querySelectorAll('tr');
  let fullTicket = true;
  rows.forEach(tr => {
    const cells = [...tr.children].filter(td => !td.classList.contains('empty'));
    const allMarked = cells.every(td => td.classList.contains('marked'));
    if (!allMarked) fullTicket = false;
  });
  if (fullTicket) {
    const reward = game.mode === 'A' ? 500 : game.mode === 'B' ? 300 : 150;
    endGame(`Поздравляем! Вы собрали карточку и выиграли ${reward} 💵!`);
    saveState({ bills: me.bills + reward });
  }
}

function endGame(message) {
  clearInterval(game.interval);
  document.getElementById('event-log').textContent = message;
  setTimeout(() => {
    if (confirm(message + '\n\nВернуться в меню?')) exitGame();
  }, 300);
}

function exitGame() {
  if (game && game.interval) clearInterval(game.interval);
  if (roomSyncTimer) clearInterval(roomSyncTimer);
  game = null;
  currentRoom = null;
  showScreen('screen-menu');
  renderMenu();
}

/* ---------- усилители ---------- */
function usePowerupEye() {
  if (!game) return;
  if (me.coins < 10) return alert('Недостаточно монет!');
  saveState({ coins: me.coins - 10 });
  const next = game.deck[game.deck.length - 1];
  alert(next ? `Следующее число: ${next}` : 'Числа закончились');
}
function usePowerupMark(count, cost) {
  if (!game) return;
  if (me.coins < cost) return alert('Недостаточно монет!');
  const cells = [...document.querySelectorAll('#tickets-container td.drawn-not-marked')].slice(0, count);
  if (!cells.length) return alert('Нет доступных клеток для отметки.');
  saveState({ coins: me.coins - cost });
  cells.forEach(td => {
    const table = td.closest('.ticket');
    td.classList.remove('drawn-not-marked');
    td.classList.add('marked');
    td.style.background = MARKERS[me.marker || 0].color;
    checkWin(parseInt(table.dataset.ticketIndex, 10));
  });
}
function usePowerupUndo() {
  if (!game) return;
  if (me.coins < 30) return alert('Недостаточно монет!');
  const marked = [...document.querySelectorAll('#tickets-container td.marked')];
  if (!marked.length) return alert('Нечего отменять.');
  saveState({ coins: me.coins - 30 });
  const last = marked[marked.length - 1];
  last.classList.remove('marked');
  last.style.background = '';
  if (game.drawn.includes(parseInt(last.dataset.num, 10))) last.classList.add('drawn-not-marked');
}

/* ================== ГЛОБАЛЬНЫЙ ЧАТ ================== */
async function pollGlobalChat() {
  const msgs = await fetch('/api/chat/global').then(r => r.json());
  const box = document.getElementById('global-chat-messages');
  box.innerHTML = msgs.map(m => `<div><b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}</div>`).join('');
  box.scrollTop = box.scrollHeight;
}
async function sendGlobalChat() {
  const input = document.getElementById('global-chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  await fetch('/api/chat/global/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: me.uid, text })
  });
  pollGlobalChat();
}

/* ================== СТОЛ ДРУЗЕЙ (МУЛЬТИПЛЕЕР) ================== */
async function createRoom() {
  const maxPlayers = parseInt(document.getElementById('multi-max-players').value, 10);
  const stake = parseInt(document.getElementById('multi-stake').value, 10);
  const res = await fetch('/api/room/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: me.uid, maxPlayers, stake })
  }).then(r => r.json());
  if (res.error) return alert(res.error);
  me.bills = res.userBalance;
  renderMenu();
  enterWaitingRoom(res.roomId);
}
async function joinRoom() {
  const roomId = document.getElementById('multi-room-id').value.trim();
  const res = await fetch('/api/room/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: me.uid, roomId })
  }).then(r => r.json());
  if (res.error) return alert(res.error);
  if (res.userBalance !== undefined) { me.bills = res.userBalance; renderMenu(); }
  enterWaitingRoom(roomId);
}
function enterWaitingRoom(roomId) {
  currentRoom = roomId;
  document.getElementById('multi-create-block').classList.add('hidden');
  document.getElementById('multi-join-block').classList.add('hidden');
  document.getElementById('multi-waiting-block').classList.remove('hidden');
  document.getElementById('txt-table-code').textContent = roomId;
  roomSyncTimer = setInterval(syncRoom, 1500);
  syncRoom();
}
async function syncRoom() {
  if (!currentRoom) return;
  const room = await fetch('/api/room/sync?roomId=' + currentRoom).then(r => r.json());
  if (room.error) { clearInterval(roomSyncTimer); return; }

  const list = document.getElementById('multi-players-list');
  list.innerHTML = room.players.map(p => `<div>${AVATARS[p.avatar] || '🧑'} ${escapeHtml(p.name)}</div>`).join('');

  if (room.status === 'playing' && !game) {
    closeModal('multiplayer');
    startMultiplayerGame(room);
  }
  if (game && game.isMultiplayer) {
    updateMultiplayerGame(room);
  }
}

function startMultiplayerGame(room) {
  const tickets = [generateTicket('A')];
  game = { mode: 'A', drawn: [], tickets, bots: [], interval: null, isMultiplayer: true };

  document.getElementById('bank-box').classList.remove('hidden');
  document.getElementById('room-chat-container').classList.remove('hidden');
  document.getElementById('game-player-avatar').textContent = AVATARS[me.avatar];
  document.getElementById('game-player-name').textContent = me.name;
  document.getElementById('history-row').innerHTML = '';
  document.getElementById('event-log').textContent = 'Игра началась! Стол #' + room.id;

  const container = document.getElementById('tickets-container');
  container.innerHTML = '';
  tickets.forEach((t, i) => container.appendChild(renderTicket(t, i)));

  const botsRow = document.getElementById('bots-row');
  botsRow.innerHTML = '';
  room.players.filter(p => p.uid !== me.uid).forEach(p => {
    const box = document.createElement('div');
    box.className = 'bot-box';
    box.innerHTML = `<div class="avatar-emoji">${AVATARS[p.avatar] || '🧑'}</div><div>${escapeHtml(p.name)}</div>`;
    botsRow.appendChild(box);
  });

  showScreen('screen-game');
}

function updateMultiplayerGame(room) {
  document.getElementById('bank-amount').textContent = room.bank;
  const newNumbers = room.drawn.slice(game.drawn.length);
  newNumbers.forEach(num => {
    document.getElementById('drum-number').textContent = num;
    const hist = document.getElementById('history-row');
    const span = document.createElement('span');
    span.textContent = num;
    hist.appendChild(span);
    while (hist.children.length > 15) hist.removeChild(hist.firstChild);
    document.querySelectorAll('#tickets-container td[data-num="' + num + '"]').forEach(td => {
      if (!td.classList.contains('marked')) td.classList.add('drawn-not-marked');
    });
  });
  game.drawn = room.drawn.slice();

  if (room.chat) {
    const box = document.getElementById('room-chat-messages');
    box.innerHTML = room.chat.map(m => `<div><b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}</div>`).join('');
    box.scrollTop = box.scrollHeight;
  }

  if (room.status === 'finished') {
    document.getElementById('event-log').textContent = 'Игра завершена — числа закончились.';
    clearInterval(roomSyncTimer);
  }
}

async function sendRoomChat() {
  if (!currentRoom) return;
  const input = document.getElementById('room-chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  await fetch('/api/chat/room/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: me.uid, roomId: currentRoom, text })
  });
}

/* ================== ПОДАРКИ ================== */
function checkPendingGifts() {
  if (me.pendingGifts && me.pendingGifts.length) showGiftAlert(me.pendingGifts[0]);
}
function showGiftAlert(gift) {
  document.getElementById('gift-alert-text').textContent = gift.msg || 'Вам подарок от ' + gift.from + '!';
  document.getElementById('gift-alert-bills').textContent = gift.bills + ' 💵';
  document.getElementById('gift-alert-coins').textContent = gift.coins + ' 🪙';
  openModal('gift-alert');
}
function closeGiftAlert() {
  closeModal('gift-alert');
  const gift = me.pendingGifts.shift();
  saveState({
    bills: me.bills, // already includes reward from server admin action
    pendingGifts: me.pendingGifts
  });
  if (me.pendingGifts.length) setTimeout(() => showGiftAlert(me.pendingGifts[0]), 400);
}

/* ================== АДМИН-ПАНЕЛЬ ================== */
async function adminAuth() {
  const pass = document.getElementById('admin-password-input').value;
  const res = await fetch('/api/admin/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: pass })
  });
  if (res.status !== 200) return alert('Неверный пароль!');
  adminPassword = pass;
  document.getElementById('admin-auth-block').classList.add('hidden');
  document.getElementById('admin-panel-block').classList.remove('hidden');
  renderAdminPlayers(await res.json());
}
function renderAdminPlayers(players) {
  const list = document.getElementById('admin-players-list');
  list.innerHTML = '';
  players.forEach(p => {
    const row = document.createElement('div');
    row.style.cssText = 'background:rgba(255,255,255,.08); padding:8px; border-radius:6px;';
    row.innerHTML = `<div><b>${escapeHtml(p.name)}</b> (${p.uid.slice(0, 6)}...) — ${p.bills}💵 ${p.coins}🪙 ${p.isBanned ? '🚫 Забанен' : ''}</div>`;
    const giveBtn = document.createElement('button');
    giveBtn.className = 'btn';
    giveBtn.style.cssText = 'font-size:11px; padding:4px 8px; margin-top:4px; margin-right:6px;';
    giveBtn.textContent = 'Выдать награду';
    giveBtn.onclick = () => adminGiveReward(p.uid);
    const banBtn = document.createElement('button');
    banBtn.className = 'btn';
    banBtn.style.cssText = 'font-size:11px; padding:4px 8px; margin-top:4px; background:#e74c3c; border-color:#c0392b;';
    banBtn.textContent = p.isBanned ? 'Разбанить' : 'Забанить';
    banBtn.onclick = () => adminToggleBan(p.uid, !p.isBanned);
    row.appendChild(giveBtn);
    row.appendChild(banBtn);
    list.appendChild(row);
  });
}
async function adminGiveReward(targetUid) {
  const amountBills = parseInt(prompt('Сколько 💵 выдать?', '0') || '0', 10);
  const amountCoins = parseInt(prompt('Сколько 🪙 выдать?', '0') || '0', 10);
  const adminMessage = prompt('Сообщение игроку (необязательно):', '') || '';
  await fetch('/api/admin/give-reward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword, targetUid, amountBills, amountCoins, adminMessage })
  });
  refreshAdminList();
}
async function adminToggleBan(targetUid, ban) {
  const reason = ban ? (prompt('Причина бана:', 'Нарушение правил') || 'Нарушение правил') : '';
  await fetch('/api/admin/ban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword, targetUid, banAction: ban ? 'ban' : 'unban', reason })
  });
  refreshAdminList();
}
async function adminClearTop() {
  if (!confirm('Точно обнулить балансы ВСЕХ игроков?')) return;
  await fetch('/api/admin/clear-top', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword })
  });
  refreshAdminList();
}
async function refreshAdminList() {
  const res = await fetch('/api/admin/players', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword })
  }).then(r => r.json());
  renderAdminPlayers(res);
}

/* ================== УТИЛИТЫ ================== */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
