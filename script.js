const AVATARS = ['🧑‍🦲', '👩‍🦰', '👩', '🧕', '👩🏻‍🦳', '👨🏽', '🧑‍🦱', '👱', '🧔', '🧑‍🦰'];
const MARKERS = [
  { id: 0, color: '#e74c3c', cost: 0, name: "Рубин" },
  { id: 1, color: '#2ecc71', cost: 15000, name: "Изумруд" },
  { id: 2, color: '#3498db', cost: 15000, name: "Сапфир" },
  { id: 3, color: '#f1c40f', cost: 15000, name: "Янтарь" }
];
const DAILY_REWARDS = [
  { icon: '💵', text: '500' }, { icon: '💵', text: '1000' }, { icon: '🪙', text: '10' },
  { icon: '💵', text: '1500' }, { icon: '🪙', text: '30' }, { icon: '💵', text: '3000' }, { icon: '🪙', text: '45' }
];
const SHOP_ITEMS = [
  { bills: 500, coins: 10 }, { bills: 1000, coins: 15 }, { bills: 2000, coins: 29 }, { bills: 4000, coins: 49 }
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

// Голосовая озвучка чисел
function speakNumber(num) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const textToSpeak = NICKNAMES[num] ? `${num}. ${NICKNAMES[num]}.` : `${num}.`;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'ru-RU';
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
  }
}

async function loadUser() {
  const res = await fetch('/api/state?uid=' + (uid || ''));
  const data = await res.json();
  uid = data.uid;
  localStorage.setItem('loto_uid', uid);
  user = data;

  if (user.isBanned) {
    showGiftNotifications({ from: "СИСТЕМА БЕЗОПАСНОСТИ", bills: 0, coins: 0, msg: "Ваш профиль заблокирован! Причина: " + (user.banReason || 'Нарушение правил') });
    document.getElementById('app').style.opacity = "0.4";
    document.getElementById('app').style.pointerEvents = "none";
    return;
  }

  renderMenu();
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

document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => openModal(btn.dataset.modal));
});

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
    cell.innerHTML = `<div>День ${i + 1}</div><div style="font-size:24px; margin:5px 0;">${r.icon}</div><div>${r.text}</div>`;
    grid.appendChild(cell);
  });
  document.getElementById('daily-claim').disabled = !canClaim;
}

document.getElementById('daily-claim').addEventListener('click', async () => {
  const res = await fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, dailyStreak: user.dailyStreak + 1, lastClaim: Date.now(), bills: user.bills + 500 })
  });
  const data = await res.json();
  if (data.ok) { user = data.user; renderMenu(); renderDaily(); }
});

async function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = '<div style="color:#fff;">Загрузка топа...</div>';
  const res = await fetch('/api/leaderboard');
  const data = await res.json();
  list.innerHTML = '';
  data.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'leaderboard-row-item' + (row.name === user.name ? ' current-player-row' : '');
    div.innerHTML = `<span>${i + 1}. 👤 ${row.name}</span><b>${row.score} 💵</b>`;
    list.appendChild(div);
  });
}

function renderShop() {
  const list = document.getElementById('shop-list');
  if (!list) return;
  list.innerHTML = '';
  SHOP_ITEMS.forEach(item => {
    const row = document.createElement('div');
    row.className = 'shop-goods-card';
    row.innerHTML = `<span>${item.bills} 💵</span><button class="btn-submit">${item.coins} 🪙</button>`;
    row.querySelector('button').addEventListener('click', () => {
      if (user.bills < item.bills) { alert('Недостаточно валюты!'); return; }
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
    cell.className = 'marker-color-palette-node' + (user.marker === m.id ? ' marker-active-border' : '');
    cell.style.borderLeft = `8px solid ${m.color}`;
    cell.innerHTML = `<div><b>${m.name}</b></div><button class="btn-submit" style="font-size:12px; padding:4px 8px; margin-top:5px;">${owned ? (user.marker === m.id ? 'Выбран' : 'Взять') : m.cost + ' 💵'}</button>`;
    cell.querySelector('button').addEventListener('click', () => {
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
    cell.className = 'avatar-matrix-cell' + (i === picked ? ' avatar-active' : '');
    cell.textContent = emoji;
    cell.addEventListener('click', () => { 
      picked = i; 
      document.querySelectorAll('.avatar-matrix-cell').forEach(c => c.classList.remove('avatar-active'));
      cell.classList.add('avatar-active');
      document.getElementById('profile-current-avatar').textContent = emoji; 
    });
    grid.appendChild(cell);
  });
  document.getElementById('profile-save').onclick = () => {
    if (!input.value.trim()) return alert('Имя не должно быть пустым!');
    saveUser({ name: input.value.trim(), avatar: picked });
    document.getElementById('modal-profile').classList.add('hidden');
  };
}

function generateTicket() {
  const grid = Array.from({ length: 3 }, () => new Array(9).fill(null));
  for (let r = 0; r < 3; r++) {
    let placed = 0;
    while (placed < 5) {
      let c = Math.floor(Math.random() * 9);
      if (grid[r][c] === null) {
        let min = c === 0 ? 1 : c * 10;
        let max = c === 8 ? 90 : c * 10 + 9;
        let num = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!grid.some(row => row[c] === num)) {
          grid[r][c] = num;
          placed++;
        }
      }
    }
  }
  return grid;
}

let gameState = null;

function startGame(mode, numCards) {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  renderGameCurrency();
  document.getElementById('game-player-avatar').textContent = AVATARS[user.avatar];
  document.getElementById('game-player-name').textContent = user.name;

  const tickets = []; 
  const marks = [];
  for (let i = 0; i < numCards; i++) { 
    tickets.push(generateTicket()); 
    marks.push(Array.from({ length: 3 }, () => new Array(9).fill(false))); 
  }

  gameState = { mode, tickets, marks, drawn: [], currentNumber: null, timer: null };
  renderTickets();

  gameState.timer = setInterval(() => {
    if (gameState.drawn.length >= 90) return clearInterval(gameState.timer);
    let n; 
    do { n = Math.floor(1 + Math.random() * 90); } while (gameState.drawn.includes(n));
    gameState.drawn.push(n); 
    gameState.currentNumber = n;

    // Анимация перезапуска бочонка
    const drumEl = document.getElementById('drum-number');
    if (drumEl) {
      drumEl.textContent = n;
      drumEl.style.animation = 'none';
      drumEl.offsetHeight; 
      drumEl.style.animation = 'barrelRoll 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
    }

    document.getElementById('drum-nickname').textContent = NICKNAMES[n] ? `«${NICKNAMES[n]}»` : '';
    
    speakNumber(n); // Озвучка голосом
    renderTickets();

    if (gameState.tickets.some((t, ti) => ticketFullyMarked(t, gameState.marks[ti]))) {
      clearInterval(gameState.timer); 
      alert("🎉 Ура! Вы закрыли карточку лото!");
    }
  }, DRAW_INTERVAL);
}

function renderTickets() {
  const container = document.getElementById('tickets-container'); 
  container.innerHTML = '';
  const markerColor = MARKERS.find(m => m.id === user.marker)?.color || '#e74c3c';

  gameState.tickets.forEach((ticket, ti) => {
    const table = document.createElement('table'); 
    table.className = 'ticket-board';
    ticket.forEach((row, ri) => {
      const tr = document.createElement('tr');
      row.forEach((val, ci) => {
        const td = document.createElement('td');
        if (val === null) td.className = 'empty-slot';
        else {
          td.textContent = val;
          if (gameState.marks[ti][ri][ci]) {
            td.classList.add('chip-marked');
            td.style.background = markerColor;
          } else if (gameState.drawn.includes(val)) {
            td.classList.add('missed-number-alert');
          }
          td.addEventListener('click', () => {
            if (!gameState.drawn.includes(val) || gameState.marks[ti][ri][ci]) return;
            gameState.marks[ti][ri][ci] = true;
            renderTickets();
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
  for(let r=0; r<3; r++) {
    for(let c=0; c<9; c++) {
      if (t[r][c] !== null && !m[r][c]) return false;
    }
  }
  return true;
}

document.getElementById('btn-open-multiplayer').addEventListener('click', () => {
  document.getElementById('modal-multiplayer').classList.remove('hidden');
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
  user.bills = data.userBalance;
  renderMenu();
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
  const res = await fetch('/api/room/sync?roomId=' + currentRoomId);
  if (!res.ok) return clearInterval(multiSyncInterval);
  const room = await res.json();
  document.getElementById('multi-players-list').innerHTML = room.players.map(p => `<div style="padding:6px; background:rgba(255,255,255,0.1); margin-bottom:4px; border-radius:4px;">🧑‍💻 ${p.name}</div>`).join('');
  if (room.status === 'playing') {
    clearInterval(multiSyncInterval);
    document.getElementById('modal-multiplayer').classList.add('hidden');
    startMultiGame(room);
  }
}

function startMultiGame(room) {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  gameState = {
    mode: 'A',
    tickets: [generateTicket()],
    marks: [[new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)]],
    drawn: [],
    bank: room.bank
  };
  renderTickets();
  multiSyncInterval = setInterval(async () => {
    const res = await fetch('/api/room/sync?roomId=' + currentRoomId);
    const rState = await res.json();
    if (rState.drawn.length !== gameState.drawn.length) {
      gameState.drawn = rState.drawn;
      let last = gameState.drawn[gameState.drawn.length-1];
      
      const drumEl = document.getElementById('drum-number');
      if (drumEl) {
        drumEl.textContent = last;
        drumEl.style.animation = 'none';
        drumEl.offsetHeight;
        drumEl.style.animation = 'barrelRoll 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';
      }
      speakNumber(last);
      renderTickets();
    }
    if (gameState.tickets.some((t, ti) => ticketFullyMarked(t, gameState.marks[ti]))) {
      clearInterval(multiSyncInterval);
      saveUser({ bills: user.bills + gameState.bank });
      alert("🎉 Стол выигран! Вы забрали банк!");
      location.reload();
    }
    if (rState.status === 'finished') {
      clearInterval(multiSyncInterval);
      alert("Матч завершен!");
      location.reload();
    }
  }, 1500);
}

document.getElementById('btn-open-global-chat').addEventListener('click', () => {
  document.getElementById('modal-global-chat').classList.remove('hidden');
  updateGlobalChat();
});

document.getElementById('btn-close-global-chat').addEventListener('click', () => {
  document.getElementById('modal-global-chat').classList.add('hidden');
});

document.getElementById('btn-global-chat-send').addEventListener('click', async () => {
  const input = document.getElementById('global-chat-input');
  if(!input.value.trim()) return;
  await fetch('/api/chat/global/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, text: input.value.trim() }) });
  input.value = '';
  updateGlobalChat();
});

async function updateGlobalChat() {
  if (document.getElementById('modal-global-chat').classList.contains('hidden')) return;
  const res = await fetch('/api/chat/global');
  const messages = await res.json();
  const chatBox = document.getElementById('global-chat-messages');
  chatBox.innerHTML = messages.map(m => `<div style="margin-bottom:5px;"><b>${m.name}</b>: ${m.text}</div>`).join('');
  chatBox.scrollTop = chatBox.scrollHeight;
}

setInterval(updateGlobalChat, 2000);

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
  document.getElementById('admin-players-list').innerHTML = players.map(p => `<div class="admin-user-profile-card"> <div><b>Игрок:</b> ${p.name} ${p.isBanned ? '<span style="color:#e74c3c; font-weight:bold;">[ЗАБАНЕН]</span>' : ''}</div> <div style="font-size:13px; margin:4px 0;">Счёт: ${p.bills} 💵 | Монеты: ${p.coins} 🪙</div> <div style="margin-top:6px; display:flex; gap:5px;"> <button class="btn-danger-action" style="padding:4px 10px; font-size:12px;" onclick="togglePlayerBan('${p.uid}', 'ban')">Бан</button> <button class="btn-submit" style="padding:4px 10px; font-size:12px; background:#2ecc71;" onclick="togglePlayerBan('${p.uid}', 'unban')">Разбан</button> </div> </div>`).join('');
}

window.togglePlayerBan = async (targetUid, banAction) => {
  await fetch('/api/admin/ban', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: currentAdminPassword, targetUid, banAction, reason: "Нарушение внутренних правил" })
  });
  alert(banAction === 'ban' ? "Игрок успешно заблокирован!" : "Игрок разблокирован!");
  refreshAdminPlayers();
};

document.getElementById('btn-admin-clear-top').addEventListener('click', async () => {
  if (!confirm("Обнулить счета всех участников до 5000?")) return;
  await fetch('/api/admin/clear-top', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPassword: currentAdminPassword }) });
  alert("Таблица сброшена!");
  refreshAdminPlayers();
});

function showGiftNotifications(gift) {
  const title = document.getElementById('gift-alert-title');
  const text = document.getElementById('gift-alert-text');
  const icon = document.getElementById('gift-alert-icon');
  const curBox = document.getElementById('gift-currency-show');
  if (gift.from === "СИСТЕМА БЕЗОПАСНОСТИ") {
    icon.textContent = "🛑";
    title.textContent = "ДОСТУП ОГРАНИЧЕН";
    text.textContent = gift.msg;
    curBox.style.display = "none";
  } else {
    icon.textContent = "🎁";
    title.textContent = "Система наград";
    text.textContent = gift.msg || "Бонус зачислен на игровой аккаунт!";
    curBox.style.display = "flex";
  }
  document.getElementById('modal-gift-alert').classList.remove('hidden');
}

document.getElementById('btn-close-gift-alert').onclick = () => {
  document.getElementById('modal-gift-alert').classList.add('hidden');
  if (user && !user.isBanned) { saveUser({ pendingGifts: [] }); loadUser(); }
};

document.getElementById('btn-play').addEventListener('click', () => openModal('setup'));
document.getElementById('setup-start').addEventListener('click', () => {
  document.getElementById('modal-setup').classList.add('hidden');
  startGame('A', 1);
});

document.getElementById('btn-exit-game').addEventListener('click', () => location.reload());

loadUser();