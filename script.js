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

async function loadUser() {
  const res = await fetch(`/api/state?uid=${uid || ''}`);
  const data = await res.json();
  uid = data.uid;
  localStorage.setItem('loto_uid', uid);
  user = data;

  if (user.isBanned) {
    showGiftNotifications([{ from: "СИСТЕМА БЕЗОПАСНОСТИ", bills: 0, coins: 0, msg: `Ваш аккаунт заблокирован администратором! Причина: ${user.banReason || 'Нарушение правил'}` }]);
    document.getElementById('app').style.opacity = "0.5";
    document.getElementById('app').style.pointerEvents = "none";
    return;
  }

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
  document.getElementById('menu-avatar-name').textContent = user.name;
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
    cell.addEventListener('click', () => { picked = i; document.getElementById('profile-current-avatar').textContent = emoji; });
    grid.appendChild(cell);
  });
  document.getElementById('profile-save').onclick = () => {
    if (!input.value.trim()) return alert('Ник не должен быть пустым!');
    saveUser({ name: input.value.trim(), avatar: picked });
    closeModal('profile');
  };
}

function generateTicket() {
  const ranges = [];
  for (let c = 0; c < 9; c++) ranges.push({ start: c === 0 ? 1 : c * 10, end: c === 8 ? 90 : c * 10 + 9 });
  const counts = new Array(9).fill(1);
  let remaining = 15 - 9;
  while (remaining > 0) { const idx = Math.floor(Math.random() * 9); if (counts[idx] < 3) { counts[idx]++; remaining--; } }
  
  const rowCap = [5, 5, 5];
  const colRows = [];
  for (let c = 0; c < 9; c++) {
    let avail = [0, 1, 2].filter(r => rowCap[r] > 0).sort(() => Math.random() - 0.5);
    const chosen = avail.slice(0, Math.min(counts[c], avail.length));
    chosen.forEach(r => rowCap[r]--); colRows.push(chosen);
  }
  if (colRows.reduce((s, a) => s + a.length, 0) !== 15) return generateTicket();
  const grid = [new Array(9).fill(null), new Array(9).fill(null), new Array(9).fill(null)];
  for (let c = 0; c < 9; c++) {
    const pool = []; for (let n = ranges[c].start; n <= ranges[c].end; n++) pool.push(n);
    const nums = pool.sort(() => Math.random() - 0.5).slice(0, counts[c]).sort((a, b) => a - b);
    colRows[c].sort((a, b) => a - b).forEach((r, i) => { grid[r][c] = nums[i]; });
  }
  return grid;
}

let gameState = null;
function logEvent(text) { document.getElementById('event-log').textContent = text; }

function startGame(mode, numCards) {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  document.getElementById('room-chat-container').classList.add('hidden');
  renderGameCurrency();
  
  document.getElementById('game-player-avatar').textContent = AVATARS[user.avatar];
  document.getElementById('game-player-name').textContent = user.name;
  
  const tickets = []; const marks = [];
  for (let i = 0; i < numCards; i++) { tickets.push(generateTicket()); marks.push(Array.from({ length: 3 }, () => new Array(9).fill(false))); }

  gameState = { mode, tickets, marks, bots: [], drawn: [], currentNumber: null, finished: false, timer: null };
  renderTickets();
  gameState.timer = setInterval(() => {
    if (gameState.drawn.length >= 90) return clearInterval(gameState.timer);
    let n; do { n = Math.floor(1 + Math.random() * 90); } while (gameState.drawn.includes(n));
    gameState.drawn.push(n); gameState.currentNumber = n;
    document.getElementById('drum-number').textContent = n;
    document.getElementById('drum-nickname').textContent = NICKNAMES[n] ? `«${NICKNAMES[n]}»` : '';
    renderTickets();
    if (gameState.tickets.some((t, ti) => ticketFullyMarked(t, gameState.marks[ti]))) {
      clearInterval(gameState.timer); 
      alert("Вы победили!");
    }
  }, DRAW_INTERVAL);
}

function renderTickets() {
  const container = document.getElementById('tickets-container'); container.innerHTML = '';
  const markerColor = MARKERS.find(m => m.id === user.marker).color;
  gameState.tickets.forEach((ticket, ti) => {
    const table = document.createElement('table'); table.className = 'ticket';
    ticket.forEach((row, ri) => {
      const tr = document.createElement('tr');
      row.forEach((val, ci) => {
        const td = document.createElement('td');
        if (val === null) td.className = 'empty';
        else {
          td.textContent = val;
          if (gameState.marks[ti][ri][ci]) { td.classList.add('marked'); td.style.background = markerColor; }
          else if (gameState.drawn.includes(val)) td.classList.add('drawn-not-marked');
          td.addEventListener('click', () => {
            if (!gameState.drawn.includes(val) || gameState.marks[ti][ri][ci]) return;
            gameState.marks[ti][ri][ci] = true; renderTickets();
          });
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    container.appendChild(table);
  });
}

function ticketFullyMarked(t, m) {
  for(let r=0; r<3; r++) { for(let c=0; c<9; c++) { if (t[r][c] !== null && !m[r][c]) return false; } }
  return true;
}

// Мультиплеер комнат
document.getElementById('btn-open-multiplayer').addEventListener('click', () => {
  document.getElementById('modal-multiplayer').classList.remove('hidden');
  document.getElementById('multi-create-block').classList.remove('hidden');
  document.getElementById('multi-join-block').classList.remove('hidden');
  document.getElementById('multi-waiting-block').classList.add('hidden');
});
document.getElementById('btn-close-multiplayer').addEventListener('click', () => {
  document.getElementById('modal-multiplayer').classList.add('hidden');
  if (multiSyncInterval) clearInterval(multiSyncInterval);
});
document.getElementById('btn-multi-create').addEventListener('click', async () => {
  const maxPlayers = document.getElementById('multi-max-players').value;
  const stake = document.getElementById('multi-stake').value;
  const res = await fetch('/api/room/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, maxPlayers, stake }) });
  const data = await res.json();
  if (data.error) return alert(data.error);
  user.bills = data.userBalance; renderMenu();
  startWaiting(data.roomId);
});
document.getElementById('btn-multi-join').addEventListener('click', async () => {
  const roomId = document.getElementById('multi-room-id').value.trim();
  const res = await fetch('/api/room/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, roomId }) });
  const data = await res.json();
  if (data.error) return alert(data.error);
  if (data.userBalance) { user.bills = data.userBalance; renderMenu(); }
  startWaiting(roomId);
});

function startWaiting(roomId) {
  currentRoomId = roomId;
  document.getElementById('multi-create-block').classList.add('hidden');
  document.getElementById('multi-join-block').classList.add('hidden');
  document.getElementById('multi-waiting-block').classList.remove('hidden');
  document.getElementById('txt-table-code').textContent = roomId;
  multiSyncInterval = setInterval(syncRoom, 1000);
}
async function syncRoom() {
  const res = await fetch(`/api/room/sync?roomId=${currentRoomId}`);
  if (!res.ok) return clearInterval(multiSyncInterval);
  const room = await res.json();
  document.getElementById('multi-players-list').innerHTML = room.players.map(p => `<div>🧑‍💻 ${p.name}</div>`).join('');
  if (room.status === 'playing') { clearInterval(multiSyncInterval); document.getElementById('modal-multiplayer').classList.add('hidden'); startMultiGame(room); }
}

function startMultiGame(room) {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  document.getElementById('room-chat-container').classList.remove('hidden');
  gameState = {
    mode: 'A',
    tickets: [generateTicket(), generateTicket(), generateTicket()],
    marks: [[new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)],
            [new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)],
            [new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)]],
    drawn: [],
    bank: room.bank
  };
  renderTickets();
  multiSyncInterval = setInterval(async () => {
    const res = await fetch(`/api/room/sync?roomId=${currentRoomId}`);
    const rState = await res.json();
    if (rState.drawn.length !== gameState.drawn.length) {
      gameState.drawn = rState.drawn;
      let last = gameState.drawn[gameState.drawn.length-1];
      document.getElementById('drum-number').textContent = last;
      renderTickets();
    }
    if (rState.chat) {
      document.getElementById('room-chat-messages').innerHTML = rState.chat.map(m=>`<div><b>${m.name}:</b> ${m.text}</div>`).join('');
    }
    if (gameState.tickets.some((t, ti) => ticketFullyMarked(t, gameState.marks[ti]))) {
      clearInterval(multiSyncInterval); saveUser({ bills: user.bills + gameState.bank });
      alert("🎉 Вы выиграли стол и забрали банк!"); location.reload();
    }
    if (rState.status === 'finished') { clearInterval(multiSyncInterval); alert("Игра завершена!"); location.reload(); }
  }, 1500);
}

// Чаты
document.getElementById('btn-open-global-chat').addEventListener('click', () => {
  document.getElementById('modal-global-chat').classList.remove('hidden');
  updateGlobalChat();
});
document.getElementById('btn-close-global-chat').addEventListener('click', () => {
  document.getElementById('modal-global-chat').classList.add('hidden');
});
document.getElementById('btn-room-chat-send').addEventListener('click', async () => {
  const input = document.getElementById('room-chat-input');
  if(!input.value.trim()) return;
  await fetch('/api/chat/room/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, roomId: currentRoomId, text: input.value.trim() }) });
  input.value = '';
});
document.getElementById('btn-global-chat-send').addEventListener('click', async () => {
  const input = document.getElementById('global-chat-input');
  if(!input.value.trim()) return;
  await fetch('/api/chat/global/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, text: input.value.trim() }) });
  input.value = ''; updateGlobalChat();
});

async function updateGlobalChat() {
  if (document.getElementById('modal-global-chat').classList.contains('hidden')) return;
  const res = await fetch('/api/chat/global'); const messages = await res.json();
  const chatBox = document.getElementById('global-chat-messages');
  chatBox.innerHTML = messages.map(m => `<div><b>${m.name}:</b> ${m.text}</div>`).join('');
  chatBox.scrollTop = chatBox.scrollHeight;
}
setInterval(updateGlobalChat, 2000);

// --- ЛОГИКА СУПЕР АДМИНКИ ---
document.getElementById('btn-admin-login').addEventListener('click', () => document.getElementById('modal-admin').classList.remove('hidden'));
document.getElementById('btn-close-admin').addEventListener('click', () => document.getElementById('modal-admin').classList.add('hidden'));
document.getElementById('btn-admin-auth').addEventListener('click', async () => {
  currentAdminPassword = document.getElementById('admin-password-input').value;
  const res = await fetch('/api/admin/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPassword: currentAdminPassword }) });
  if(!res.ok) return alert("Пароль неверный!");
  document.getElementById('admin-auth-block').classList.add('hidden');
  document.getElementById('admin-panel-block').classList.remove('hidden');
  refreshAdminPlayers();
});

async function refreshAdminPlayers() {
  const res = await fetch('/api/admin/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPassword: currentAdminPassword }) });
  const players = await res.json();
  document.getElementById('admin-players-list').innerHTML = players.map(p => `
    <div style="border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom:8px;">
      <b>${p.name}</b> ${p.isBanned ? '<span style="color:#e74c3c;">[ЗАБАНЕН]</span>' : ''}<br>
      Текущий баланс: ${p.bills}💵 | ${p.coins}🪙<br>
      <input type="number" id="bills-${p.uid}" placeholder="Баксы" style="width:70px; padding:2px; color:#000;">
      <input type="number" id="coins-${p.uid}" placeholder="Монеты" style="width:70px; padding:2px; color:#000;">
      <input type="text" id="msg-${p.uid}" placeholder="Сообщение" style="width:120px; padding:2px; color:#000;">
      <button class="btn" onclick="sendAdminReward('${p.uid}')" style="font-size:11px; padding:4px 8px; width:auto; display:inline-block;">Отправить</button><br>
      <input type="text" id="reason-${p.uid}" placeholder="Причина бана" style="width:140px; padding:2px; color:#000; margin-top:4px;">
      <button class="btn" onclick="togglePlayerBan('${p.uid}', 'ban')" style="font-size:11px; padding:4px 8px; background:#e74c3c; width:auto; display:inline-block;">Бан</button>
      <button class="btn" onclick="togglePlayerBan('${p.uid}', 'unban')" style="font-size:11px; padding:4px 8px; background:#2ecc71; width:auto; display:inline-block;">Разбан</button>
    </div>
  `).join('');
}

window.sendAdminReward = async (targetUid) => {
  const amountBills = document.getElementById(`bills-${targetUid}`).value || 0;
  const amountCoins = document.getElementById(`coins-${targetUid}`).value || 0;
  const adminMessage = document.getElementById(`msg-${targetUid}`).value || "";
  await fetch('/api/admin/give-reward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: currentAdminPassword, targetUid, amountBills, amountCoins, adminMessage })
  });
  alert("Операция выполнена успешно!");
  refreshAdminPlayers();
};

window.togglePlayerBan = async (targetUid, banAction) => {
  const reason = document.getElementById(`reason-${targetUid}`).value || "";
  await fetch('/api/admin/ban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: currentAdminPassword, targetUid, banAction, reason })
  });
  alert(banAction === 'ban' ? "Игрок заблокирован!" : "Игрок разблокирован!");
  refreshAdminPlayers();
};

document.getElementById('btn-admin-clear-top').addEventListener('click', async () => {
  if (!confirm("Вы уверены, что хотите обнулить балансы ВСЕХ игроков до стартовых 5000💵?")) return;
  await fetch('/api/admin/clear-top', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPassword: currentAdminPassword }) });
  alert("Лидерборд успешно сброшен!");
  refreshAdminPlayers();
});

function showGiftNotifications(gifts) {
  const first = gifts[0];
  const title = document.getElementById('gift-alert-title');
  const text = document.getElementById('gift-alert-text');
  const icon = document.getElementById('gift-alert-icon');
  const curBox = document.getElementById('gift-currency-show');
  if (user.isBanned || first.from === "СИСТЕМА БЕЗОПАСНОСТИ") {
    icon.textContent = "🛑";
    title.textContent = "ДОСТУП ОГРАНИЧЕН";
    text.textContent = first.msg;
    curBox.style.display = "none";
  } else {
    icon.textContent = "🎁";
    title.textContent = "Подарок от SANI GROUP";
    text.textContent = first.msg ? `Письмо разработчиков: "${first.msg}"` : "Вам начислен приятный игровой бонус от создателей игры!";
    document.getElementById('gift-alert-bills').textContent = `+${first.bills} 💵`;
    document.getElementById('gift-alert-coins').textContent = `+${first.coins} 🪙`;
    curBox.style.display = "flex";
  }
  document.getElementById('modal-gift-alert').classList.remove('hidden');
  document.getElementById('btn-close-gift-alert').onclick = () => {
    document.getElementById('modal-gift-alert').classList.add('hidden');
    if (user.isBanned) {
      location.reload();
    } else {
      saveUser({ pendingGifts: [] });
      loadUser();
    }
  }
}

document.getElementById('btn-play').addEventListener('click', () => openModal('setup'));
document.getElementById('setup-start').addEventListener('click', () => { closeModal('setup'); startGame('A', 3); });
document.getElementById('btn-exit-game').addEventListener('click', () => location.reload());
loadUser();
