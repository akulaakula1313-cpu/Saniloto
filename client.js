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
  { bills: 500, coins: 10 }, { bills: 1000, coins: 15 }, { bills: 2000, coins: 29 }, 
  { bills: 4000, coins: 49 }, { bills: 10000, coins: 79 }
];
const DRAW_INTERVAL = 4000;

const NICKNAMES = {
  1: 'Кол', 3: 'Троечка', 11: 'Барабанные палочки', 12: 'Дюжина', 13: 'Чёртова дюжина',
  22: 'Гуси-лебеди', 25: 'Четвертак', 44: 'Стульчики', 50: 'Полтинник', 66: 'Валенки',
  77: 'Топорики', 89: 'Дедушкин сосед', 90: 'Дедушка'
};

let uid = localStorage.getItem('loto_uid');
let sessionId = localStorage.getItem('loto_session');
let user = null;
let currentRoomId = null;
let multiSyncInterval = null;
let currentAdminPassword = "";
let soundOn = true;
let audioCtx = null;
let soundUnlocked = false;
let gameState = null;
let pendingAdminForm = null;

// ============ ЗВУК ============
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
    const notes = kind === 'vip' ? [659.25, 987.77, 1318.51] : 
                  kind === 'bills' ? [523.25, 659.25] : 
                  kind === 'coins' ? [783.99, 987.77] : [587.33, 880];
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator(); 
      const gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.12 + 0.18);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + i * 0.12); 
      osc.stop(audioCtx.currentTime + i * 0.12 + 0.2);
    });
  } catch (_) {}
}

// ============ ЗАГРУЗКА ПОЛЬЗОВАТЕЛЯ ============
async function loadUser() {
  try {
    const res = await fetch(`/api/state?uid=${uid || ''}`);
    if (res.status === 403) {
      const data = await res.json().catch(() => ({}));
      alert(data.message || "Доступ заблокирован администратором!");
      document.body.innerHTML = "<h1 style='text-align:center; color:white; margin-top:100px;'>Вы заблокированы 🚫</h1>";
      return;
    }
    const data = await res.json();
    uid = data.uid;
    sessionId = data.sessionId;
    localStorage.setItem('loto_uid', uid);
    localStorage.setItem('loto_session', sessionId);
    user = data;
    renderMenu();
    if (user.pendingGifts && user.pendingGifts.length > 0) {
      showGiftNotifications(user.pendingGifts);
    }
  } catch (err) {
    console.error('Ошибка загрузки:', err);
  }
}

function saveUser(patch) {
  if (!user) return;
  Object.assign(user, patch);
  fetch('/api/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, sessionId, ...user })
  }).catch((err) => console.error('Ошибка сохранения:', err));
  renderMenu();
  if (document.getElementById('screen-game').classList.contains('active')) {
    renderGameCurrency();
  }
}

// ============ ОТОБРАЖЕНИЕ МЕНЮ ============
function renderMenu() {
  if (!user) return;
  const avatarEl = document.getElementById('menu-avatar-emoji');
  if (avatarEl) avatarEl.textContent = AVATARS[user.avatar] || AVATARS[0];
  
  const nameEl = document.getElementById('menu-avatar-name');
  if (nameEl) {
    if (user.isVip) {
      nameEl.innerHTML = `${user.name} <span class="vip-gold-text">👑 VIP</span>`;
    } else {
      nameEl.textContent = user.name;
    }
  }
  
  const billsEl = document.getElementById('cur-bills');
  const coinsEl = document.getElementById('cur-coins');
  if (billsEl) billsEl.textContent = user.bills;
  if (coinsEl) coinsEl.textContent = user.coins;
}

function renderGameCurrency() {
  const billsEl = document.getElementById('game-cur-bills');
  const coinsEl = document.getElementById('game-cur-coins');
  if (billsEl) billsEl.textContent = user.bills;
  if (coinsEl) coinsEl.textContent = user.coins;
}

// ============ МОДАЛЬНЫЕ ОКНА ============
function openModal(name) {
  const modal = document.getElementById('modal-' + name);
  if (!modal) return;
  modal.classList.remove('hidden');
  if (name === 'daily') renderDaily();
  if (name === 'leaderboard') renderLeaderboard();
  if (name === 'shop') renderShop();
  if (name === 'marker') renderMarkers();
  if (name === 'profile') renderProfile();
}

function closeModal(name) {
  const modal = document.getElementById('modal-' + name);
  if (modal) modal.classList.add('hidden');
}

// ============ ЕЖЕДНЕВНЫЕ НАГРАДЫ ============
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
  const claimBtn = document.getElementById('daily-claim');
  if (claimBtn) claimBtn.disabled = !canClaim;
}

// ============ ЛИДЕРБОРД ============
async function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return;
  list.innerHTML = 'Загрузка...';
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    list.innerHTML = '';
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'lb-row' + (row.name === user.name ? ' me' : '');
      div.innerHTML = `<div class="lb-rank">${i + 1}</div><div class="lb-emoji">🙂</div><div class="lb-name">${row.name}</div><div class="lb-score">${row.score}</div>`;
      list.appendChild(div);
    });
  } catch (err) {
    list.innerHTML = 'Ошибка загрузки';
    console.error(err);
  }
}

// ============ МАГАЗИН ============
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

// ============ МАРКЕРЫ ============
function renderMarkers() {
  const grid = document.getElementById('marker-grid');
  if (!grid) return;
  grid.innerHTML = '';
  MARKERS.forEach(m => {
    const owned = user.unlockedMarkers.includes(m.id);
    const cell = document.createElement('div');
    cell.className = 'marker-cell' + (user.marker === m.id ? ' selected' : '') + (!owned ? ' locked' : '');
    cell.innerHTML = `<div class="m-dot" style="background:${m.color}"></div><div class="m-cost">${owned ? (user.marker === m.id ? '✅ Выбран' : 'Выбрать') : m.cost + ' 💵'}</div>`;
    cell.addEventListener('click', () => {
      if (owned) saveUser({ marker: m.id });
      else if (user.bills >= m.cost) saveUser({ bills: user.bills - m.cost, unlockedMarkers: [...user.unlockedMarkers, m.id], marker: m.id });
      renderMarkers();
    });
    grid.appendChild(cell);
  });
}

// ============ ПРОФИЛЬ ============
function renderProfile() {
  const input = document.getElementById('profile-name-input');
  if (input) input.value = user.name;
  
  const avatarEl = document.getElementById('profile-current-avatar');
  if (avatarEl) avatarEl.textContent = AVATARS[user.avatar];
  
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
      const currentAvatar = document.getElementById('profile-current-avatar');
      if (currentAvatar) currentAvatar.textContent = emoji; 
    });
    grid.appendChild(cell);
  });
  
  const saveBtn = document.getElementById('profile-save');
  if (saveBtn) {
    saveBtn.onclick = () => {
      const inputName = document.getElementById('profile-name-input');
      if (!inputName || !inputName.value.trim()) return alert('Ник не может быть пустым!');
      saveUser({ name: inputName.value.trim(), avatar: picked });
      closeModal('profile');
    };
  }
}

// ============ ГЕНЕРАЦИЯ БИЛЕТА ============
function generateTicket() {
  const ranges = [];
  for (let c = 0; c < 9; c++) {
    ranges.push({ start: c === 0 ? 1 : c * 10, end: c === 8 ? 90 : c * 10 + 9 });
  }
  
  let attempts = 0;
  const maxAttempts = 50;
  
  while (attempts < maxAttempts) {
    attempts++;
    const rowCap = [5, 5, 5];
    const counts = new Array(9).fill(1);
    let remaining = 15 - 9;
    
    while (remaining > 0) { 
      const idx = Math.floor(Math.random() * 9); 
      if (counts[idx] < 3) { counts[idx]++; remaining--; } 
    }
    
    const colRows = [];
    let valid = true;
    for (let c = 0; c < 9; c++) {
      let avail = [0, 1, 2].filter(r => rowCap[r] > 0);
      if (avail.length === 0) { valid = false; break; }
      avail.sort(() => Math.random() - 0.5);
      const count = Math.min(counts[c], avail.length);
      const chosen = avail.slice(0, count);
      chosen.forEach(r => rowCap[r]--);
      colRows.push(chosen);
    }
    
    if (!valid) continue;
    if (colRows.reduce((s, a) => s + a.length, 0) !== 15) continue;
    
    const grid = [new Array(9).fill(null), new Array(9).fill(null), new Array(9).fill(null)];
    for (let c = 0; c < 9; c++) {
      const pool = [];
      for (let n = ranges[c].start; n <= ranges[c].end; n++) pool.push(n);
      const nums = pool.sort(() => Math.random() - 0.5).slice(0, counts[c]).sort((a, b) => a - b);
      colRows[c].sort((a, b) => a - b).forEach((r, i) => {
        if (i < nums.length) grid[r][c] = nums[i];
      });
    }
    return grid;
  }
  
  // Fallback
  const grid = [new Array(9).fill(null), new Array(9).fill(null), new Array(9).fill(null)];
  for (let c = 0; c < 9; c++) {
    const nums = [];
    for (let n = ranges[c].start; n <= ranges[c].end; n++) nums.push(n);
    const shuffled = nums.sort(() => Math.random() - 0.5);
    for (let r = 0; r < 3; r++) {
      if (grid[r].every(v => v !== null)) continue;
      const idx = Math.floor(Math.random() * shuffled.length);
      grid[r][c] = shuffled.splice(idx, 1)[0] || null;
    }
  }
  return grid;
}

// ============ ПРОВЕРКА ПОБЕДЫ ============
function checkWinCondition(mode, tickets, marks) {
  if (mode === 'A') {
    return tickets.some((t, ti) => {
      let totalTicketNumbers = 0;
      let matchedTicketNumbers = 0;
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 9; c++) {
          if (t[r][c] !== null) {
            totalTicketNumbers++;
            if (marks[ti][r][c]) matchedTicketNumbers++;
          }
        }
      }
      return totalTicketNumbers > 0 && totalTicketNumbers === matchedTicketNumbers;
    });
  }
  if (mode === 'B') {
    for (let ti = 0; ti < tickets.length; ti++) {
      for (let r = 0; r < 3; r++) {
        let rowWin = true;
        let hasNumbers = false;
        for (let c = 0; c < 9; c++) {
          if (tickets[ti][r][c] !== null) {
            hasNumbers = true;
            if (!marks[ti][r][c]) { rowWin = false; break; }
          }
        }
        if (hasNumbers && rowWin) return true;
      }
    }
    return false;
  }
  if (mode === 'C') {
    for (let ti = 0; ti < tickets.length; ti++) {
      let bottomRowWin = true;
      let hasNumbers = false;
      for (let c = 0; c < 9; c++) {
        if (tickets[ti][2][c] !== null) {
          hasNumbers = true;
          if (!marks[ti][2][c]) { bottomRowWin = false; break; }
        }
      }
      if (hasNumbers && bottomRowWin) return true;
    }
    return false;
  }
  return false;
}

function triggerWinEffects(msg) {
  if (typeof confetti === 'function') {
    confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });
  }
  setTimeout(() => { alert(msg); }, 500);
}

function updateHistoryUI() {
  const historyEl = document.getElementById('history-numbers');
  if (!historyEl || !gameState) return;
  const lastFive = gameState.drawn.slice(-5).reverse();
  historyEl.innerHTML = lastFive.map(n => `<span class="history-item">${n}</span>`).join(' ');
}

// ============ ЗАПУСК ИГРЫ ============
function startGame(mode, numCards) {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  document.getElementById('room-chat-container').classList.add('hidden');
  renderGameCurrency();
  
  const avatarEl = document.getElementById('game-player-avatar');
  const nameEl = document.getElementById('game-player-name');
  if (avatarEl) avatarEl.textContent = AVATARS[user.avatar];
  if (nameEl) nameEl.textContent = user.name;
  
  const tickets = [];
  const marks = [];
  for (let i = 0; i < numCards; i++) {
    tickets.push(generateTicket());
    marks.push(Array.from({ length: 3 }, () => new Array(9).fill(false)));
  }
  
  gameState = { 
    mode, 
    tickets, 
    marks, 
    bots: [], 
    drawn: [], 
    currentNumber: null, 
    finished: false, 
    timer: null 
  };
  
  renderTickets();
  
  gameState.timer = setInterval(() => {
    if (gameState.drawn.length >= 90) return clearInterval(gameState.timer);
    
    let n;
    do { n = Math.floor(1 + Math.random() * 90); } while (gameState.drawn.includes(n));
    
    gameState.drawn.push(n);
    gameState.currentNumber = n;
    
    const drumEl = document.getElementById('drum-number');
    if (drumEl) {
      drumEl.textContent = n;
      drumEl.style.animation = 'none';
      drumEl.offsetHeight;
      drumEl.style.animation = 'popDrum 0.4s ease-out';
    }
    
    const nickEl = document.getElementById('drum-nickname');
    if (nickEl) nickEl.textContent = NICKNAMES[n] ? `${NICKNAMES[n]}` : '';
    
    speakDrumNumber(n);
    updateHistoryUI();
    renderTickets();
    
    if (checkWinCondition(gameState.mode, gameState.tickets, gameState.marks)) {
      clearInterval(gameState.timer);
      let winText = "🎉 Вы победили!";
      if (gameState.mode === 'B') winText = "🎉 Короткое Лото! Вы первыми закрыли строчку!";
      if (gameState.mode === 'C') winText = "🎉 Три на Три! Закрыта нижняя строчка!";
      triggerWinEffects(winText);
    }
  }, DRAW_INTERVAL);
}

function renderTickets() {
  const container = document.getElementById('tickets-container');
  if (!container) return;
  container.innerHTML = '';
  
  const marker = MARKERS.find(m => m.id === user.marker);
  const markerColor = marker ? marker.color : '#8e44ad';
  
  gameState.tickets.forEach((ticket, ti) => {
    const table = document.createElement('table');
    table.className = 'ticket';
    
    ticket.forEach((row, ri) => {
      const tr = document.createElement('tr');
      row.forEach((val, ci) => {
        const td = document.createElement('td');
        if (val === null) {
          td.className = 'empty';
        } else {
          td.textContent = val;
          if (gameState.drawn.includes(val) && user.isVip) {
            gameState.marks[ti][ri][ci] = true;
          }
          if (gameState.marks[ti][ri][ci]) {
            td.classList.add('marked');
            td.style.background = markerColor;
          } else if (gameState.drawn.includes(val)) {
            td.classList.add('drawn-not-marked');
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

// ============ УВЕДОМЛЕНИЯ ============
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
    bills: ['💵', 'Подарок: деньги', 'Вам начислены деньги от SANI GROUP'],
    coins: ['🪙', 'Подарок: монеты', 'Вам начислены монеты от SANI GROUP'],
    vip: ['👑', 'VIP-уведомление', 'Новое уведомление от SANI GROUP'],
    message: ['💬', 'SMS от SANI GROUP', 'Личное сообщение'],
    system: ['🔔', 'Уведомление', 'Сообщение от администратора']
  };
  const cfg = map[type] || map.message;
  if (icon) icon.textContent = cfg[0];
  if (title) title.textContent = cfg[1];
  if (sender) sender.innerHTML = `<div class="gift-message">${escapeHtml(g.message || cfg[2])}</div>`;
  if (bills) bills.textContent = g.bills ? `+${g.bills} 💵` : '';
  if (coins) coins.textContent = g.coins ? `+${g.coins} 🪙` : '';
  if (modal) modal.classList.remove('hidden');
  
  document.getElementById('btn-close-gift-alert').onclick = async () => {
    if (modal) modal.classList.add('hidden');
    notificationQueue.shift();
    notificationBusy = false;
    if (notificationQueue.length) { 
      setTimeout(showNextNotification, 180); 
    } else {
      try {
        await fetch('/api/state', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ uid, sessionId, pendingGifts: [] }) 
        });
        await loadUser();
      } catch (_) {}
    }
  };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

// ============ МУЛЬТИПЛЕЕР ============
function startWaiting(roomId) {
  currentRoomId = roomId;
  document.getElementById('multi-create-block').classList.add('hidden');
  document.getElementById('multi-join-block').classList.add('hidden');
  document.getElementById('multi-waiting-block').classList.remove('hidden');
  document.getElementById('txt-table-code').textContent = roomId;
  
  if (multiSyncInterval) clearInterval(multiSyncInterval);
  multiSyncInterval = setInterval(syncRoom, 1000);
}

async function syncRoom() {
  try {
    const res = await fetch(`/api/room/sync?roomId=${currentRoomId}&uid=${uid}`);
    if (!res.ok) {
      if (res.status === 403) {
        alert('Вы были удалены из комнаты');
        clearInterval(multiSyncInterval);
        location.reload();
      }
      return;
    }
    const room = await res.json();
    
    const playersList = document.getElementById('multi-players-list');
    if (playersList) {
      playersList.innerHTML = room.players.map(p => `<div>🧑 ${p.name}</div>`).join('');
    }
    
    if (room.status === 'playing') {
      clearInterval(multiSyncInterval);
      document.getElementById('modal-multiplayer').classList.add('hidden');
      startMultiGame(room);
    }
  } catch (err) {
    console.error('Sync error:', err);
  }
}

function startMultiGame(room) {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  document.getElementById('room-chat-container').classList.remove('hidden');
  
  gameState = {
    mode: room.mode || 'A',
    tickets: [generateTicket(), generateTicket(), generateTicket()],
    marks: [
      [new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)],
      [new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)],
      [new Array(9).fill(false), new Array(9).fill(false), new Array(9).fill(false)]
    ],
    drawn: room.drawn ||
