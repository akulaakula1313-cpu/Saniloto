// client.js — Полный клиентский код для онлайн-игры ЛОТО

// ==========================================
// 1. КОНСТАНТЫ И ИНИЦИАЛИЗАЦИЯ СОСТОЯНИЯ
// ==========================================
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
let gameState = null;

// Инициализация при загрузке документа
window.addEventListener('DOMContentLoaded', () => {
  loadUser();
  initEventListeners();
});

// Навешивание обработчиков событий для модальных окон
function initEventListeners() {
  document.querySelectorAll('[data-modal]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.modal));
  });
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });
  
  const dailyClaimBtn = document.getElementById('daily-claim');
  if (dailyClaimBtn) {
    dailyClaimBtn.addEventListener('click', claimDailyReward);
  }
}

// ==========================================
// 2. ОЗВУЧКА И АУДИОЭФФЕКТЫ
// ==========================================
function speakBall(n) {
  if (!soundOn || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  let text = NICKNAMES[n] ? NICKNAMES[n] : n.toString();
  let utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ru-RU';
  utterance.rate = 1.1;
  window.speechSynthesis.speak(utterance);
}

function playNotificationSound() {
  if (!soundOn) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
    gain1.gain.setValueAtTime(0.1, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.15);

    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime);
      gain2.gain.setValueAtTime(0.1, ctx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start();
      osc2.stop(ctx.currentTime + 0.2);
    }, 120);
  } catch (e) { console.log(e); }
}

// ==========================================
// 3. РАБОТА С API И СИНХРОНИЗАЦИЯ СЕРВЕРА
// ==========================================
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

async function claimDailyReward() {
  const res = await fetch('/api/dailyreward/claim', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid })
  });
  const data = await res.json();
  if (data.ok) { 
    user = { ...user, ...data.user };
    renderMenu();
    renderDaily();
  }
}

function showGiftNotifications(gifts) {
  console.log("Новые подарки:", gifts);
}

// ==========================================
// 4. УПРАВЛЕНИЕ МОДАЛЬНЫМИ ОКНАМИ И ОКНАМИ ИНТЕРФЕЙСА
// ==========================================
function openModal(name) {
  const modal = document.getElementById('modal-' + name);
  if (modal) modal.classList.remove('hidden');
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

// ==========================================
// 5. ОТРИСОВКА ИНТЕРФЕЙСА И РЕНДЕРИНГ КОМПОНЕНТОВ
// ==========================================
function renderMenu() {
  if (!user) return;
  const avatarEmojiEl = document.getElementById('menu-avatar-emoji');
  const avatarNameEl = document.getElementById('menu-avatar-name');
  const curBillsEl = document.getElementById('cur-bills');
  const curCoinsEl = document.getElementById('cur-coins');

  if (avatarEmojiEl) avatarEmojiEl.textContent = AVATARS[user.avatar] || AVATARS[0];
  
  if (avatarNameEl) {
    if (user.isVip) {
      avatarNameEl.innerHTML = `${user.name} <span class="vip-gold-text">👑 VIP</span>`;
    } else {
      avatarNameEl.textContent = user.name;
    }
  }
  
  if (curBillsEl) curBillsEl.textContent = user.bills;
  if (curCoinsEl) curCoinsEl.textContent = user.coins;
}

function renderGameCurrency() {
  const gameBillsEl = document.getElementById('game-cur-bills');
  const gameCoinsEl = document.getElementById('game-cur-coins');
  if (gameBillsEl) gameBillsEl.textContent = user.bills;
  if (gameCoinsEl) gameCoinsEl.textContent = user.coins;
}

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
  if (!input) return;
  input.value = user.name;
  
  const currentAvatarEl = document.getElementById('profile-current-avatar');
  if (currentAvatarEl) currentAvatarEl.textContent = AVATARS[user.avatar];
  
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
      if (currentAvatarEl) currentAvatarEl.textContent = emoji;
    });
    grid.appendChild(cell);
  });
  
  const saveProfileBtn = document.getElementById('profile-save');
  if (saveProfileBtn) {
    saveProfileBtn.onclick = () => {
      if (!input.value.trim()) return alert('Ник не пустой!');
      saveUser({ name: input.value.trim(), avatar: picked });
      closeModal('profile');
    };
  }
}

// ==========================================
// 6. ИГРОВАЯ ЛОГИКА И ГЕНЕРАЦИЯ БИЛЕТОВ
// ==========================================
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

function checkWinCondition(mode, tickets, marks) {
  if (mode === 'A') {
    return tickets.some((t, ti) => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 9; c++) {
          if (t[r][c] !== null && !marks[ti][r][c]) return false;
        }
      }
      return true;
    });
  }
  if (mode === 'B') {
    for (let ti = 0; ti < tickets.length; ti++) {
      for (let r = 0; r < 3; r++) {
        let rowWin = true;
        for (let c = 0; c < 9; c++) {
          if (tickets[ti][r][c] !== null && !marks[ti][r][c]) { rowWin = false; break; }
        }
        if (rowWin) return true;
      }
    }
    return false;
  }
  if (mode === 'C') {
    for (let ti = 0; ti < tickets.length; ti++) {
      let bottomWin = true;
      for (let c = 0; c < 9; c++) {
        if (tickets[ti][2][c] !== null && !marks[ti][2][c]) { bottomWin = false; break; }
      }
      if (bottomWin) return true;
    }
    return false;
  }
  return false;
}

function animateDrum() {
  let drumEl = document.getElementById('drum');
  if(!drumEl) return;
  drumEl.style.animation = 'none';
  drumEl.offsetHeight; 
  drumEl.style.animation = 'popDrum 0.4s ease-out';
}

function startGame(mode, numCards) {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  const chatContainer = document.getElementById('room-chat-container');
  if (chatContainer) chatContainer.classList.add('hidden');
  
  renderGameCurrency();
  
  const pAvatar = document.getElementById('game-player-avatar');
  const pName = document.getElementById('game-player-name');
  if (pAvatar) pAvatar.textContent = AVATARS[user.avatar];
  if (pName) pName.textContent = user.name;
  
  const tickets = []; const marks = [];
  for (let i = 0; i < numCards; i++) {
    tickets.push(generateTicket());
    marks.push(Array.from({ length: 3 }, () => new Array(9).fill(false)));
  }
  
  gameState = { mode, tickets, marks, bots: [], drawn: [], currentNumber: null, finished: false, timer: null };
  renderTickets();
  
  gameState.timer = setInterval(() => {
    if (gameState.drawn.length >= 90) return clearInterval(gameState.timer);
    let n; do { n = Math.floor(1 + Math.random() * 90); } while (gameState.drawn.includes(n));
    gameState.drawn.push(n);
    gameState.currentNumber = n;
    
    const drumNumEl = document.getElementById('drum-number');
    const drumNickEl = document.getElementById('drum-nickname');
    if (drumNumEl) drumNumEl.textContent = n;
    if (drumNickEl) drumNickEl.textContent = NICKNAMES[n] ? `${NICKNAMES[n]}` : '';
    
    animateDrum();
    speakBall(n);
    renderTickets();
    
    if (checkWinCondition(gameState.mode, gameState.tickets, gameState.marks)) {
      clearInterval(gameState.timer);
      if (window.confetti) confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
      alert(gameState.mode === 'B' ? "🎉 Короткое лото! Вы первыми закрыли строчку!" : (gameState.mode === 'C' ? "🎉 Три на три! Нижняя строка закрыта!" : "Вы победили!"));
    }
  }, DRAW_INTERVAL);
}

function renderTickets() {
  const container = document.getElementById('tickets-container');
  if (!container) return;
  container.innerHTML = '';
  const markerColor = MARKERS.find(m => m.id === user.marker).color;
  
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
          
          if (user.isVip && gameState.drawn.includes(val) && !gameState.marks[ti][ri][ci]) {
            gameState.marks[ti][ri][ci] = true;
          }
          
          if (gameState.marks[ti][ri][ci]) { 
            td.classList.add('marked');
            td.style.background = markerColor;
          } else if (gameState.drawn.includes(val)) {
            td.classList.add('drawn-not-marked');
          }
          
          td.addEventListener('click', () => {
            if (gameState.drawn.includes(val) && !gameState.marks[ti][ri][ci]) {
              gameState.marks[ti][ri][ci] = true;
              renderTickets();
            }
          });
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    container.appendChild(table);
  });
}
