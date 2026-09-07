const AVATARS = ['🧑‍🦲', '👩‍🦰', '👩', '🧕', '👩🏻‍🦳', '👨🏽', '🧑‍🦱', '👱', '🧔', '🧑‍🦰'];
const MARKERS = [
  { id: 0, color: '#8e44ad', cost: 0 },
  { id: 1, color: '#c0392b', cost: 15000 },
  { id: 2, color: '#2980b9', cost: 15000 },
  { id: 3, color: '#27ae60', cost: 15000 }
];
const DAILY_REWARDS = [
  { icon: '💵', text: '500' }, { icon: '💵', text: '1000' }, { icon: '🪙', text: '10' },
  { icon: '💵', text: '1500' }, { icon: '🪙', text: '30' }, { icon: '💵', text: '3000' }, { icon: '🪙', text: '45' }
];
const SHOP_ITEMS = [
  { bills: 500, coins: 10 }, { bills: 1000, coins: 15 }, { bills: 2000, coins: 29 }, { bills: 4000, coins: 49 }, { bills: 10000, coins: 79 }
];
const DRAW_INTERVAL = 4000;

const NICKNAMES = {
  1: 'Кол', 3: 'Троечка', 11: 'Барабанные палочки', 12: 'Дюжина', 13: 'Чёртова дюжина',
  22: 'Гуси-лебеди', 25: 'Четвертак', 44: 'Стульчики', 50: 'Полтинник', 66: 'Валенки',
  77: 'Топорики', 89: 'Дедушкин сосед', 90: 'Дедушка'
};

let uid = localStorage.getItem('loto_uid');
let user = null;
let currentRoomId = null;
let multiSyncInterval = null;
let currentAdminPassword = "";
let soundOn = true;
let audioCtx = null;
let soundUnlocked = false;
let gameState = null;

function unlockSound() {
  if (soundUnlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) {
      audioCtx = audioCtx || new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      g.gain.value = 0.0001; o.frequency.value = 440;
      o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + 0.02);
    }
    if (window.speechSynthesis) window.speechSynthesis.resume();
    soundUnlocked = true;
  } catch (_) {}
}

document.addEventListener("pointerdown", unlockSound, { once: false });
document.addEventListener("keydown", unlockSound, { once: false });

function speakDrumNumber(n) {
  if (!soundOn || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  let text = n.toString();
  if (NICKNAMES[n]) text = NICKNAMES[n];
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = 1.1;
  window.speechSynthesis.speak(utterance);
}

function playNotificationSound(kind = 'message') {
  if (!soundOn) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const notes = kind === 'vip' ? [659.25, 987.77, 1318.51] : kind === 'bills' ? [523.25, 659.25] : kind === 'coins' ? [783.99, 987.77] : [587.33, 880];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.12 + 0.18);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + i * 0.12); osc.stop(audioCtx.currentTime + i * 0.12 + 0.2);
    });
  } catch (_) {}
}

async function loadUser() {
  const res = await fetch(`/api/state?uid=${uid || ''}`);
  if (res.status === 403) {
    alert("Доступ заблокирован администратором!");
    document.body.innerHTML = "<h1 style='text-align:center; color:white; margin-top:100px;'>Вы заблокированы 🚫</h1>";
    return;
  }
  const data = await res.json();
  uid = data.uid;
  localStorage.setItem('loto_uid', uid);
  user = data;
  renderMenu();
  if (user.pendingGifts && user.pendingGifts.length > 0) showGiftNotifications(user.pendingGifts);
}

function saveUser(patch) {
  Object.assign(user, patch);
  fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, ...user })
  }).catch(() => {});
  renderMenu();
  if (document.getElementById('screen-game').classList.contains('active')) renderGameCurrency();
}

function renderMenu() {
  if (!user) return;
  document.getElementById('menu-avatar-emoji').textContent = AVATARS[user.avatar] || AVATARS[0];
  
  if (user.isVip) {
    document.getElementById('menu-avatar-name').innerHTML = `${user.name} <span class="vip-gold-text">👑 VIP</span>`;
  } else {
    document.getElementById('menu-avatar-name').textContent = user.name;
  }
  
  document.getElementById('cur-bills').textContent = user.bills;
  document.getElementById('cur-coins').textContent = user.coins;
}

function renderGameCurrency() {
  document.getElementById('game-cur-bills').textContent = user.bills;
  document.getElementById('game-cur-coins').textContent = user.coins;
}

function openModal(name) {
  document.getElementById('modal-' + name).classList.remove('hidden');
  if (name === 'daily') renderDaily();
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'shop') renderShop();
  if (name === 'marker') renderMarkers();
  if (name === 'profile') renderProfile();
}
function closeModal(name) {
  document.getElementById('modal-' + name).classList.add('hidden');
}

document.querySelectorAll('[data-modal]').forEach(btn => btn.addEventListener('click', () => openModal(btn.dataset.modal)));
document.querySelectorAll('[data-close]').forEach(btn => btn.addEventListener('click', () => closeModal(btn.dataset.close)));

function renderDaily() {
  const grid = document.getElementById('daily-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const today = user.dailyStreak % 7;
  const now = Date.now();
  const canClaim = now - user.lastClaim >= 24 * 60 * 60 * 1000;

  DAILY_REWARDS.forEach((r, i) => {
    const cell = document.createElement('div');
    cell.className = 'daily-cell';
    if (i < today) cell.classList.add('claimed');
    if (i === today) cell.classList.add('today');
    cell.innerHTML = `<div class="d-num">${i + 1}</div><div class="d-icon">${r.icon}</div><div>${r.text}</div>`;
    grid.appendChild(cell);
  });
  document.getElementById('daily-claim').disabled = !canClaim;
}

document.getElementById('daily-claim').addEventListener('click', async () => {
  const res = await fetch('/api/dailyreward/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid })
  });
  const data = await res.json();
  if (data.ok) { user = { ...user, ...data.user }; renderMenu(); renderDaily(); }
});

async function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = 'Загрузка...';
  const res = await fetch('/api/leaderboard');
  const data = await res.json();
  list.innerHTML = '';
  data.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'lb-row' + (row.name === user.name ? ' me' : '');
    div.innerHTML = `<div class="lb-rank">${i + 1}</div><div class="lb-emoji">🙂</div><div class="lb-name">${row.name}</div><div class="lb-score">${row.score}</div>`;
    list.appendChild(div);
  });
}

function renderShop() {
  const list = document.getElementById('shop-list');
  if (!list) return;
  list.innerHTML = '';
  SHOP_ITEMS.forEach(item => {
    const row = document.createElement('div');
    row.className = 'shop-row';
    row.innerHTML = `<span>${item.bills} 💵</span><button class="btn small-buy">${item.coins} 🪙</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if (user.bills < item.bills) { alert('Недостаточно 💵'); return; }
      saveUser({ bills: user.bills - item.bills, coins: user.coins + item.coins });
      renderShop();
    });
    list.appendChild(row);
  });
}

function renderMarkers() {
  const grid = document.getElementById('marker-grid');
  if (!grid) return;
  grid.innerHTML = '';
  MARKERS.forEach(m => {
    const owned = user.unlockedMarkers.includes(m.id);
    const cell = document.createElement('div');
    cell.className = 'marker-cell' + (user.marker === m.id ? ' selected' : '') + (!owned ? ' locked' : '');
    cell.innerHTML = `<div class="m-dot" style="background:${m.color}"></div><div class="m-cost">${owned ? (user.marker === m.id ? 'Выбран' : 'Выбрать') : m.cost + ' 💵 🔒'}</div>`;
    cell.addEventListener('click', () => {
      if (owned) saveUser({ marker: m.id });
      else if (user.bills >= m.cost) saveUser({ bills: user.bills - m.cost, unlockedMarkers: [...user.unlockedMarkers, m.id], marker: m.id });
      renderMarkers();
    });
    grid.appendChild(cell);
  });
}

function renderProfile() {
  const input = document.getElementById('profile-name-input');
  input.value = user.name;
  document.getElementById('profile-current-avatar').textContent = AVATARS[user.avatar];
  const grid = document.getElementById('avatar-grid');
  if (!grid) return;
  grid.innerHTML = '';
  let picked = user.avatar;
  AVATARS.forEach((emoji, i) => {
    const cell = document.createElement('div');
    cell.className = 'avatar-cell' + (i === picked ? ' selected' : '');
    cell.textContent = emoji;
    cell.addEventListener('click', () => { 
      picked = i; 
      document.querySelectorAll('.avatar-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
      document.getElementById('profile-current-avatar').textContent = emoji; 
    });
    grid.appendChild(cell);
  });
  document.getElementById('profile-save').onclick = () => {
    if (!input.value.trim()) return alert('Ник не пустой!');
    saveUser({ name: input.value.trim(), avatar: picked });
    closeModal('profile');
  };
}

function generateTicket() {
  const ranges = [];
  for (let c = 0; c < 9; c++) {
    ranges.push({ start: c === 0 ? 1 : c * 10, end: c === 8 ? 90 : c * 10 + 9 });
  }
  
  const rowCap = [5, 5, 5];
  const counts = new Array(9).fill(1);
  let remaining = 15 - 9;
  
  while (remaining > 0) { 
    const idx = Math.floor(Math.random() * 9); 
    if (counts[idx] < 3) { counts[idx]++; remaining--; } 
  }
  
  const colRows = [];
  for (let c = 0; c < 9; c++) {
    let avail = [0, 1, 2].filter(r => rowCap[r] > 0).sort(() => Math.random() - 0.5);
    const chosen = avail.slice(0, Math.min(counts[c], avail.length));
    chosen.forEach(r => rowCap[r]--); 
    colRows.push(chosen);
  }
  
  if (colRows.reduce((s, a) => s + a.length, 0) !== 15) return generateTicket();
  
  const grid = [new Array(9).fill(null), new Array(9).fill(null), new Array(9).fill(null)];
  for (let c = 0; c < 9; c++) {
    const pool = []; 
for (let n = ranges[c].start; n <= ranges[c].end; n++) pool.push(n);const nums = pool.sort(() => Math.random() - 0.5).slice(0, counts[c]).sort((a, b) => a - b);colRows[c].sort((a, b) => a - b).forEach((r, i) => { grid[r][c] = nums[i]; });}return grid;}function checkWinCondition(mode, tickets, marks) {if (mode === 'A') {return tickets.some((t, ti) => {let totalTicketNumbers = 0;let matchedTicketNumbers = 0;for (let r = 0; r < 3; r++) {for (let c = 0; c < 9; c++) {if (t[r][c] !== null) {totalTicketNumbers++;if (marks[ti][r][c]) matchedTicketNumbers++;}}}return totalTicketNumbers > 0 && totalTicketNumbers === matchedTicketNumbers;});}if (mode === 'B') {for (let ti = 0; ti < tickets.length; ti++) {for (let r = 0; r < 3; r++) {let rowWin = true;let hasNumbers = false;for (let c = 0; c < 9; c++) {if (tickets[ti][r][c] !== null) {hasNumbers = true;if (!marks[ti][r][c]) { rowWin = false; break; }}}if (hasNumbers && rowWin) return true;}}return false;}if (mode === 'C') {for (let ti = 0; ti < tickets.length; ti++) {let bottomRowWin = true;let hasNumbers = false;for (let c = 0; c < 9; c++) {if (tickets[ti][2][c] !== null) {hasNumbers = true;if (!marks[ti][2][c]) { bottomRowWin = false; break; }}}if (hasNumbers && bottomRowWin) return true;}return false;}return false;}function triggerWinEffects(msg) {if (typeof confetti === 'function') {confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });}setTimeout(() => { alert(msg); }, 500);}function updateHistoryUI() {const historyEl = document.getElementById('history-numbers');if (!historyEl || !gameState) return;const lastFive = gameState.drawn.slice(-5).reverse();historyEl.innerHTML = lastFive.map(n => `<span class="history-item">${n}</span>`).join(' ');}function startGame(mode, numCards) {document.getElementById('screen-menu').classList.remove('active');document.getElementById('screen-game').classList.add('active');document.getElementById('room-chat-container').classList.add('hidden');renderGameCurrency();document.getElementById('game-player-avatar').textContent = AVATARS[user.avatar];document.getElementById('game-player-name').textContent = user.name;const tickets = []; const marks = [];for (let i = 0; i < numCards; i++) {tickets.push(generateTicket());marks.push(Array.from({ length: 3 }, () => new Array(9).fill(false)));}gameState = { mode, tickets, marks, bots: [], drawn: [], currentNumber: null, finished: false, timer: null };renderTickets();gameState.timer = setInterval(() => {if (gameState.drawn.length >= 90) return clearInterval(gameState.timer);let n; do { n = Math.floor(1 + Math.random() * 90); } while (gameState.drawn.includes(n));gameState.drawn.push(n); gameState.currentNumber = n;const drumEl = document.getElementById('drum-number');drumEl.textContent = n;drumEl.style.animation = 'none';drumEl.offsetHeight;drumEl.style.animation = 'popDrum 0.4s ease-out';document.getElementById('drum-nickname').textContent = NICKNAMES[n] ? `${NICKNAMES[n]}` : '';speakDrumNumber(n);updateHistoryUI();renderTickets();if (checkWinCondition(gameState.mode, gameState.tickets, gameState.marks)) {clearInterval(gameState.timer);let winText = "Вы победили!";if(gameState.mode === 'B') winText = "🎉 Короткое Лото! Вы первыми закрыли строчку!";if(gameState.mode === 'C') winText = "🎉 Три на Три! Закрыта нижняя строчка карточки!";triggerWinEffects(winText);}}, DRAW_INTERVAL);}function renderTickets() {const container = document.getElementById('tickets-container'); container.innerHTML = '';const markerColor = MARKERS.find(m => m.id === user.marker).color;gameState.tickets.forEach((ticket, ti) => {const table = document.createElement('table'); table.className = 'ticket';ticket.forEach((row, ri) => {const tr = document.createElement('tr');row.forEach((val, ci) => {const td = document.createElement('td');if (val === null) td.className = 'empty';else {td.textContent = val;if (gameState.drawn.includes(val) && user.isVip) {gameState.marks[ti][ri][ci] = true;}if (gameState.marks[ti][ri][ci]) {td.classList.add('marked');td.style.background = markerColor;}else if (gameState.drawn.includes(val)) td.classList.add('drawn-not-marked');td.addEventListener('click', () => {if (!gameState.drawn.includes(val) || gameState.marks[ti][ri][ci]) return;gameState.marks[ti][ri][ci] = true; renderTickets();});}tr.appendChild(td);});table.appendChild(tr);});container.appendChild(table);});}document.getElementById('btn-open-multiplayer').addEventListener('click', () => {document.getElementById('modal-multiplayer').classList.remove('hidden');document.getElementById('multi-create-block').classList.remove('hidden');document.getElementById('multi-join-block').classList.remove('hidden');document.getElementById('multi-waiting-block').classList.add('hidden');});document.getElementById('btn-close-multiplayer').addEventListener('click', () => {document.getElementById('modal-multiplayer').classList.add('hidden');if (multiSyncInterval) clearInterval(multiSyncInterval);});document.getElementById('btn-multi-create').addEventListener('click', async () => {if (multiSyncInterval) clearInterval(multiSyncInterval);const maxPlayers = document.getElementById('multi-max-players').value;const stake = document.getElementById('multi-stake').value;const selectedMode = document.querySelector('input[name="game-mode"]:checked').value;const res = await fetch('/api/room/create', {method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ uid, maxPlayers, stake, mode: selectedMode })});const data = await res.json();if (data.error) return alert(data.error);user.bills = data.userBalance; renderMenu();startWaiting(data.roomId);});document.getElementById('btn-multi-join').addEventListener('click', async () => {if (multiSyncInterval) clearInterval(multiSyncInterval);const roomId = document.getElementById('multi-room-id').value.trim();const res = await fetch('/api/room/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, roomId }) });const data = await res.json();if (data.error) return alert(data.error);if (data.userBalance) { user.bills = data.userBalance; renderMenu(); }startWaiting(roomId);});function startWaiting(roomId) {currentRoomId = roomId;document.getElementById('multi-create-block').classList.add('hidden');document.getElementById('multi-join-block').classList.add('hidden');document.getElementById('multi-waiting-block').classList.remove('hidden');document.getElementById('txt-table-code').textContent = roomId;multiSyncInterval = setInterval(syncRoom, 1000);}async function syncRoom() {const res = await fetch(`/api/room/sync?roomId=${currentRoomId}`);if (!res.ok) return clearInterval(multiSyncInterval);const room = await res.json();document.getElementById('multi-players-list').innerHTML = room.players.map(p => `<div>🧑‍💻 ${p.name}</div>`).join('');if (room.status === 'playing') {clearInterval(multiSyncInterval);document.getElementById('modal-multiplayer').classList.add('hidden');startMultiGame(room);}}function startMultiGame(room) {document.getElementById('screen-menu').classList.remove('active');document.getElementById('screen-game').classList.add('active');document.getElementById('room-chat-container').classList.remove('hidden');gameState = {mode: room.mode || 'A',tickets: [generateTicket(), generateTicket(), generateTicket()],marks: [[new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)],[new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)],[new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)]],drawn: [],bank: room.bank};renderTickets();multiSyncInterval = setInterval(async () => {const res = await fetch(`/api/room/sync?roomId=${currentRoomId}`);if (!res.ok) return;const rState = await res.json();if (rState.drawn.length !== gameState.drawn.length) {gameState.drawn = rState.drawn;let last = gameState.drawn[gameState.drawn.length-1];document.getElementById('drum-number').textContent = last || '-';if (last) {speakDrumNumber(last);document.getElementById('drum-nickname').textContent = NICKNAMES[last] ? `${NICKNAMES[last]}` : '';}updateHistoryUI();renderTickets();}if (rState.chat) {document.getElementById('room-chat-messages').innerHTML = rState.chat.map(m => `<div><b>${m.name}:</b> ${m.text}</div>`).join('');}if (checkWinCondition(gameState.mode, gameState.tickets, gameState.marks)) {clearInterval(multiSyncInterval);saveUser({ bills: user.bills + gameState.bank });triggerWinEffects("🎉 Вы выиграли стол и забрали весь банк!");setTimeout(() => { location.reload(); }, 2000);}if (rState.status === 'finished') {clearInterval(multiSyncInterval);alert("Игра завершена!");location.reload();}}, 1500);}document.getElementById('btn-open-global-chat').addEventListener('click', () => {document.getElementById('modal-global-chat').classList.remove('hidden');updateGlobalChat();});document.getElementById('btn-close-global-chat').addEventListener('click', () => {document.getElementById('modal-global-chat').classList.add('hidden');});document.getElementById('btn-room-chat-send').addEventListener('click', async () => {const input = document.getElementById('room-chat-input');if(!input.value.trim()) return;await fetch('/api/chat/room/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, roomId: currentRoomId, text: input.value.trim() }) });input.value = '';});document.getElementById('btn-global-chat-send').addEventListener('click', async () => {const input = document.getElementById('global-chat-input');if(!input.value.trim()) return;await fetch('/api/chat/global/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, text: input.value.trim() }) });input.value = '';updateGlobalChat();});async function updateGlobalChat() {if (document.getElementById('modal-global-chat').classList.contains('hidden')) return;const res = await fetch('/api/chat/global');const messages = await res.json();const chatBox = document.getElementById('global-chat-messages');chatBox.innerHTML = messages.map(m => `<div><b>${m.name}:</b> ${m.text}</div>`).join('');chatBox.scrollTop = chatBox.scrollHeight;}setInterval(updateGlobalChat, 2000);document.getElementById('btn-admin-login').addEventListener('click', () => {
  document.getElementById('modal-admin').classList.remove('hidden');
  document.getElementById('admin-auth-block').classList.remove('hidden');
  document.getElementById('admin-panel-block').classList.add('hidden');
  document.getElementById('admin-password-input').focus();
});
document.getElementById('btn-close-admin').addEventListener('click', () => document.getElementById('modal-admin').classList.add('hidden'));

document.getElementById('btn-admin-auth').addEventListener('click', async () => {
  currentAdminPassword = document.getElementById('admin-password-input').value.trim();
  await refreshAdminPanel();
});

document.getElementById('admin-password-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-admin-auth').click();
});

async function adminRequest(action, playerUid, extra = {}) {
  const res = await fetch('/api/admin/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: currentAdminPassword, action, uid: playerUid, ...extra })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { alert(data.error || 'Ошибка администратора'); return null; }
  return data;
}

let pendingAdminForm = null;

function openAdminForm(kind, p) {
  pendingAdminForm = { kind, uid: p.uid, name: p.name };
  const modal = document.getElementById('modal-admin-action');
  const icon = document.getElementById('admin-action-icon');
  const title = document.getElementById('admin-action-title');
  const player = document.getElementById('admin-action-player');
  const amountWrap = document.getElementById('admin-action-amount-wrap');
  const messageWrap = document.getElementById('admin-action-message-wrap');
  const amount = document.getElementById('admin-action-amount');
  const message = document.getElementById('admin-action-message');
  player.textContent = p.name;
  amount.value = '';
  message.value = '';
  amountWrap.classList.toggle('hidden', kind === 'message');
  messageWrap.classList.toggle('hidden', kind !== 'message');
  if (kind === 'bills') { icon.textContent='💵'; title.textContent='Подарить деньги'; document.getElementById('admin-action-label').textContent='Сколько денег начислить?'; amount.placeholder='1000'; }
  if (kind === 'coins') { icon.textContent='🪙'; title.textContent='Подарить монеты'; document.getElementById('admin-action-label').textContent='Сколько монет начислить?'; amount.placeholder='10'; }
  if (kind === 'message') { icon.textContent='💬'; title.textContent='Отправить SMS'; }
  modal.classList.remove('hidden');
}

function playerAdminCard(p) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-player-card';
  const status = p.isBanned ? '<span class="admin-badge danger">ЗАБЛОКИРОВАН</span>' : '<span class="admin-badge success">АКТИВЕН</span>';
  const vip = p.isVip ? '<span class="admin-badge vip">👑 VIP</span>' : '';
  wrap.innerHTML = `
    <div class="admin-player-head">
      <div class="admin-player-avatar">${AVATARS[p.avatar] || '🙂'}</div>
      <div class="admin-player-info">
        <div class="admin-player-name">${escapeHtml(p.name)} ${vip}</div>
        <div class="admin-player-meta">${status}<span>ID: ${escapeHtml(p.uid)}</span></div>
        <div class="admin-balances"><span>💵 ${p.bills || 0}</span><span>🪙 ${p.coins || 0}</span></div>
      </div>
    </div>
    <div class="admin-actions">
      <button class="admin-action-btn money" data-act="bills">💵 ДЕНЬГИ</button>
      <button class="admin-action-btn coins" data-act="coins">🪙 МОНЕТЫ</button>
      <button class="admin-action-btn message" data-act="message">💬 SMS</button>
      <button class="admin-action-btn vip" data-act="vip">${p.isVip ? '👑 УБРАТЬ VIP' : '👑 ДАТЬ VIP'}</button>
      <button class="admin-action-btn ${p.isBanned ? 'unban' : 'ban'}" data-act="ban">${p.isBanned ? '🔓 РАЗБЛОКИРОВАТЬ' : '🔒 ЗАБЛОКИРОВАТЬ'}</button>
    </div>`;

  wrap.querySelector('[data-act="bills"]').onclick = () => openAdminForm('bills', p);
  wrap.querySelector('[data-act="coins"]').onclick = () => openAdminForm('coins', p);
  wrap.querySelector('[data-act="message"]').onclick = () => openAdminForm('message', p);
  wrap.querySelector('[data-act="vip"]').onclick = async () => {
    if (await adminRequest(p.isVip ? 'vip_off' : 'vip_on', p.uid)) refreshAdminPanel();
  };
  wrap.querySelector('[data-act="ban"]').onclick = async () => {
    if (await adminRequest(p.isBanned ? 'unban' : 'ban', p.uid)) refreshAdminPanel();
  };
  return wrap;
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

document.getElementById('btn-close-admin-action').addEventListener('click', () => {
  document.getElementById('modal-admin-action').classList.add('hidden');
  pendingAdminForm = null;
});

document.getElementById('btn-admin-action-confirm').addEventListener('click', async () => {
  if (!pendingAdminForm) return;
  const { kind, uid: playerUid } = pendingAdminForm;
  let ok = false;
  if (kind === 'message') {
    const message = document.getElementById('admin-action-message').value.trim();
    if (!message) return alert('Введите сообщение');
    ok = !!(await adminRequest('message', playerUid, { message }));
  } else {
    const amount = document.getElementById('admin-action-amount').value;
    if (!amount || Number(amount) <= 0) return alert('Введите количество');
    ok = !!(await adminRequest(kind === 'bills' ? 'give_bills' : 'give_coins', playerUid, { amount }));
  }
  if (ok) {
    document.getElementById('modal-admin-action').classList.add('hidden');
    pendingAdminForm = null;
    refreshAdminPanel();
  }
});

document.getElementById('admin-refresh').addEventListener('click', refreshAdminPanel);

async function refreshAdminPanel() {
  const res = await fetch('/api/admin/players', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: currentAdminPassword })
  });
  if (!res.ok) return alert('Пароль неверный!');
  document.getElementById('admin-auth-block').classList.add('hidden');
  document.getElementById('admin-panel-block').classList.remove('hidden');
  const players = await res.json();
  const list = document.getElementById('admin-players-list');
  list.innerHTML = '';
  const top = document.createElement('div');
  top.className = 'admin-summary';
  top.innerHTML = `<span>👥 Игроков: <b>${players.length}</b></span><span>🟢 Активных: <b>${players.filter(p => !p.isBanned).length}</b></span><span>🚫 Блоков: <b>${players.filter(p => p.isBanned).length}</b></span>`;
  list.appendChild(top);
  players.forEach(p => list.appendChild(playerAdminCard(p)));
}

let notificationQueue = [];
let notificationBusy = false;

function showGiftNotifications(gifts) {
  notificationQueue = Array.isArray(gifts) ? gifts.slice() : [];
  notificationBusy = false;
  showNextNotification();
}

function showNextNotification() {
  if (notificationBusy || notificationQueue.length === 0) return;
  notificationBusy = true;
  const g = notificationQueue[0] || {};
  const type = g.type || (g.bills ? 'bills' : g.coins ? 'coins' : 'message');
  playNotificationSound(type);
  const modal = document.getElementById('modal-gift-alert');
  const icon = document.getElementById('gift-icon');
  const title = document.getElementById('gift-title');
  const sender = document.getElementById('gift-sender');
  const bills = document.getElementById('gift-alert-bills');
  const coins = document.getElementById('gift-alert-coins');
  const map = {
    bills: ['💵','Подарок: деньги','Вам начислены деньги от SANI GROUP'],
    coins: ['🪙','Подарок: монеты','Вам начислены монеты от SANI GROUP'],
    vip: ['👑','VIP-уведомление','Новое уведомление от SANI GROUP'],
    message: ['💬','SMS от SANI GROUP','Личное сообщение'],
    system: ['🔔','Уведомление','Сообщение от администратора']
  };
  const cfg = map[type] || map.message;
  icon.textContent = cfg[0]; title.textContent = cfg[1]; sender.innerHTML = `<div class="gift-message">${escapeHtml(g.message || cfg[2])}</div>`;
  bills.textContent = g.bills ? `+${g.bills} 💵` : '';
  coins.textContent = g.coins ? `+${g.coins} 🪙` : '';
  modal.classList.remove('hidden');
  document.getElementById('btn-close-gift-alert').onclick = async () => {
    modal.classList.add('hidden');
    notificationQueue.shift(); notificationBusy = false;
    if (notificationQueue.length) { setTimeout(showNextNotification, 180); }
    else {
      await fetch('/api/state', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ uid, pendingGifts:[] }) });
      await loadUser();
    }
  };
}

document.getElementById('btn-play').addEventListener('click', () => openModal('setup'));
document.getElementById('setup-start').addEventListener('click', () => { closeModal('setup'); const selectedMode = document.querySelector('input[name="game-mode"]:checked').value; startGame(selectedMode, 3); });
document.getElementById('btn-exit-game').addEventListener('click', () => location.reload());
document.getElementById('btn-sound').addEventListener('click', (e) => { unlockSound(); soundOn = !soundOn; e.target.textContent = soundOn ? '🔊' : '🔇'; });
loadUser(); setInterval(loadUser, 5000);