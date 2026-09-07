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
let sessionId = localStorage.getItem('loto_session');
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
    if (user.pendingGifts && user.pendingGifts.length > 0) showGiftNotifications(user.pendingGifts);
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
  try {
    const res = await fetch('/api/dailyreward/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid, sessionId })
    });
    const data = await res.json();
    if (data.ok) { 
      user = { ...user, ...data.user }; 
      renderMenu(); 
      renderDaily(); 
    } else if (data.error) {
      alert(data.error);
    }
  } catch (err) {
    console.error('Ошибка получения награды:', err);
  }
});

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
  
  // Fallback билет
  const grid = [new Array(9).fill(null), new Array(9).fill(null), new Array(9).fill(null)];
  for (let c = 0; c < 9; c++) {
    const nums = [];
    for (let n = ranges[c].start; n <= ranges[c