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
let gameState = null;
let currentAdminPassword = "";

async function loadUser() {
  const res = await fetch(`/api/state?uid=${uid || ''}`);
  const data = await res.json();
  
  if (data.isBanned) {
    document.getElementById('screen-banned').classList.remove('hidden');
    return;
  } else {
    document.getElementById('screen-banned').classList.add('hidden');
  }

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
  }).then(async (res) => {
    if (res.status === 403) {
      document.getElementById('screen-banned').classList.remove('hidden');
    }
  }).catch(() => {});
  renderMenu();
}

function renderMenu() {
  if (!user) return;
  document.getElementById('menu-avatar-emoji').textContent = AVATARS[user.avatar] || AVATARS[0];
  document.getElementById('menu-avatar-name').textContent = (user.isVip ? '👑 ' : '') + user.name;
  document.getElementById('cur-bills').textContent = user.bills;
  document.getElementById('cur-coins').textContent = user.coins;
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
  if (!grid) return; grid.innerHTML = '';
  const today = user.dailyStreak % 7;
  const now = Date.now();
  const canClaim = now - user.lastClaim >= 24 * 60 * 60 * 1000;

  DAILY_REWARDS.forEach((r, i) => {
    const cell = document.createElement('div');
    cell.className = "daily-reward-cell";
    if (i < today) cell.style.background = "rgba(46, 204, 113, 0.4)";
    if (i === today) cell.style.border = "2px solid #ffd23f";
    cell.innerHTML = `<div>${i + 1}</div><div>${r.icon}</div><div>${r.text}</div>`;
    grid.appendChild(cell);
  });
  document.getElementById('daily-claim').disabled = !canClaim;
}

document.getElementById('daily-claim').addEventListener('click', async () => {
  const res = await fetch('/api/dailyreward/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }) });
  const data = await res.json();
  if (data.ok) { user = { ...user, ...data.user }; renderMenu(); renderDaily(); }
});

async function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  if (!list) return; list.innerHTML = 'Загрузка...';
  const res = await fetch('/api/leaderboard');
  const data = await res.json();
  list.innerHTML = '';
  data.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = "leaderboard-item-row";
    div.style.display = "flex";
    div.style.justifyContent = "space-between";
    div.style.margin = "5px 0";
    div.innerHTML = `<span>${i + 1}. ${row.name}</span><span>${row.score} 💵</span>`;
    list.appendChild(div);
  });
}

function renderShop() {
  const list = document.getElementById('shop-list');
  if (!list) return; list.innerHTML = '';
  SHOP_ITEMS.forEach(item => {
    const row = document.createElement('div');
    row.className = "shop-item-card";
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.margin = "10px 0";
    row.innerHTML = `<span>Купить ${item.coins} 🪙 за ${item.bills} 💵</span><button class="btn">Обмен</button>`;
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
  if (!grid) return; grid.innerHTML = '';
  MARKERS.forEach(m => {
    const owned = user.unlockedMarkers.includes(m.id);
    const cell = document.createElement('div');
    cell.className = "marker-card-item";
    cell.style.borderColor = user.marker === m.id ? '#ffd23f' : 'transparent';
    cell.innerHTML = `<div class="marker-dot-preview" style="background:${m.color}"></div><div>${owned ? 'Выбрать' : m.cost + ' 💵'}</div>`;
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
  if (!grid) return; grid.innerHTML = '';
  let picked = user.avatar;
  AVATARS.forEach((emoji, i) => {
    const cell = document.createElement('div');
    cell.className = "avatar-grid-item";
    if (i === picked) cell.style.background = "rgba(255, 210, 63, 0.3)";
    cell.textContent = emoji;
    cell.addEventListener('click', () => { picked = i; document.getElementById('profile-current-avatar').textContent = emoji; renderProfile(); });
    grid.appendChild(cell);
  });
  document.getElementById('profile-save').onclick = () => {
    if (!input.value.trim()) return alert('Ник не может быть пустым!');
    saveUser({ name: input.value.trim(), avatar: picked });
    closeModal('profile');
  };
}

function generateTicket() {
  const ranges = [];
  for (let c = 0; c < 9; c++) {
    ranges.push({ start: c === 0 ? 1 : c * 10, end: c === 8 ? 90 : c * 10 + 9 });
  }
  const counts = new Array(9).fill(1);
  let remaining = 15 - 9;
  while (remaining > 0) { 
    const idx = Math.floor(Math.random() * 9); 
    if (counts[idx] < 3) { counts[idx]++; remaining--; } 
  }
  
  const rowCap = [5, 5, 5]; 
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
    for (let n = ranges[c].start; n <= ranges[c].end; n++) pool.push(n);
    const nums = pool.sort(() => Math.random() - 0.5).slice(0, counts[c]).sort((a, b) => a - b);
    colRows[c].sort((a, b) => a - b).forEach((r, i) => { grid[r][c] = nums[i]; });
  }
  return grid;
}

function startGame(mode, numCards) {
  document.getElementById('screen-menu').style.display = 'none';
  document.getElementById('screen-game').style.display = 'block';
  document.getElementById('game-cur-bills').textContent = user.bills;

  const tickets = []; const marks = [];
  for (let i = 0; i < numCards; i++) { 
    tickets.push(generateTicket()); 
    marks.push(Array.from({ length: 3 }, () => new Array(9).fill(false))); 
  }
  gameState = { mode, tickets, marks, drawn: [], currentNumber: null, timer: null };
  renderTickets();

  gameState.timer = setInterval(() => {
    if (gameState.drawn.length >= 90) return clearInterval(gameState.timer);
    let n; do { n = Math.floor(1 + Math.random() * 90); } while (gameState.drawn.includes(n));
    gameState.drawn.push(n); gameState.currentNumber = n;
    
    document.getElementById('drum-number').textContent = n;
    document.getElementById('drum-nickname').textContent = NICKNAMES[n] ? `"${NICKNAMES[n]}"` : '';
    renderTickets();

    if (gameState.tickets.some((t, ti) => ticketFullyMarked(t, gameState.marks[ti]))) {
      clearInterval(gameState.timer); 
      alert("🎉 Вы победили в лото!");
      location.reload();
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

function ticketFullyMarked(t, m) {
  for(let r=0; r<3; r++) { for(let c=0; c<9; c++) { if (t[r][c] !== null && !m[r][c]) return false; } }
  return true;
}

document.getElementById('btn-open-global-chat').addEventListener('click', () => { document.getElementById('modal-global-chat').classList.remove('hidden'); updateGlobalChat(); });
document.getElementById('btn-close-global-chat').addEventListener('click', () => { document.getElementById('modal-global-chat').classList.add('hidden'); });

document.getElementById('btn-global-chat-send').addEventListener('click', async () => {
  const input = document.getElementById('global-chat-input');
  if(!input.value.trim()) return;
  const res = await fetch('/api/chat/global/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, text: input.value.trim() }) });
  if (res.status === 403) { document.getElementById('screen-banned').classList.remove('hidden'); return; }
  input.value = ''; 
  updateGlobalChat();
});

async function updateGlobalChat() {
  if (document.getElementById('modal-global-chat').classList.contains('hidden')) return;
  const res = await fetch('/api/chat/global');
  if (res.status === 403) { document.getElementById('screen-banned').classList.remove('hidden'); return; }
  const messages = await res.json();
  const chatBox = document.getElementById('global-chat-messages');
  chatBox.innerHTML = messages.map(m => `<div><b>${m.name}:</b> ${m.text}</div>`).join('');
  chatBox.scrollTop = chatBox.scrollHeight;
}
setInterval(updateGlobalChat, 2000);

document.getElementById('btn-admin-login').addEventListener('click', () => document.getElementById('modal-admin').classList.remove('hidden'));
document.getElementById('btn-close-admin').addEventListener('click', () => document.getElementById('modal-admin').classList.add('hidden'));
document.getElementById('btn-admin-auth').addEventListener('click', async () => {
  currentAdminPassword = document.getElementById('admin-password-input').value;
  loadAdminPanel();
});

async function loadAdminPanel() {
  const res = await fetch('/api/admin/players', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ adminPassword: currentAdminPassword }) });
  if(!res.ok) return alert("Пароль неверный!");
  document.getElementById('admin-auth-block').classList.add('hidden');
  document.getElementById('admin-panel-block').classList.remove('hidden');
  const players = await res.json();
  const container = document.getElementById('admin-players-list');
  container.innerHTML = '';
  players.forEach(p => {
    const item = document.createElement('div');
    item.className = "admin-user-card-record";
    item.style.padding = "10px";
    item.style.margin = "10px 0";
    item.style.background = "rgba(255,255,255,0.05)";
    item.style.borderRadius = "6px";
    item.style.borderLeft = "4px solid " + (p.isBanned ? '#e74c3c' : '#2ecc71');
    item.innerHTML = `
      <div>\${p.isVip ? '👑 ' : ''}\${p.name} [UID: \${p.uid}]</div>
      <div>Баланс: \${p.bills} 💵 | \${p.coins} 🪙 | Статус: \${p.isBanned ? 'ЗАБАНЕН' : 'АКТИВЕН'}</div>
      <div style="margin-top:8px;">
        <input type="number" id="b-\${p.uid}" placeholder="+💵" style="width:60px; color:#000;">
        <input type="number" id="c-\${p.uid}" placeholder="+🪙" style="width:60px; color:#000;">
        <button class="btn" onclick="window.execAdminAction('\${p.uid}', 'give-reward')">Выдать</button>
      </div>
      <div style="margin-top:8px;">
        <input type="text" id="sms-\${p.uid}" placeholder="Фейк сообщение" style="width:120px; color:#000;">
        <button class="btn" onclick="window.execAdminAction('\${p.uid}', 'fake-sms')">Отправить</button>
      </div>
      <div style="margin-top:8px; display:flex; gap:5px;">
        <button class="btn" style="background:#e74c3c;" onclick="window.execAdminAction('\${p.uid}', '\${p.isBanned ? 'unban' : 'ban'}')">\${p.isBanned ? 'Разбанить' : 'Забанить'}</button>
        <button class="btn" style="background:#3498db;" onclick="window.execAdminAction('\${p.uid}', 'toggle-vip')">\${p.isVip ? 'Забрать VIP' : 'Дать VIP 👑'}</button>
        <button class="btn" style="background:#7f8c8d;" onclick="window.execAdminAction('\${p.uid}', 'reset')">Сбросить</button>
      </div>
    `;
    container.appendChild(item);
  });
}

window.execAdminAction = async (targetUid, action) => {
  const amountBills = document.getElementById(`b-\${targetUid}`) ? document.getElementById(`b-\${targetUid}`).value : 0;
  const amountCoins = document.getElementById(`c-\${targetUid}`) ? document.getElementById(`c-\${targetUid}`).value : 0;
  const fakeSms = document.getElementById(`sms-\${targetUid}`) ? document.getElementById(`sms-\${targetUid}`).value : "";
  await fetch('/api/admin/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminPassword: currentAdminPassword, targetUid, action, amountBills, amountCoins, fakeSms })
  });
  loadAdminPanel();
  loadUser();
};

function showGiftNotifications(gifts) {
  let b = 0; let c = 0;
  gifts.forEach(g => { b += (g.bills || 0); c += (g.coins || 0); });
  document.getElementById('gift-alert-bills').textContent = `+\${b} 💵`;
  document.getElementById('gift-alert-coins').textContent = `+\${c} 🪙`;
  document.getElementById('modal-gift-alert').classList.remove('hidden');
  document.getElementById('btn-close-gift-alert').onclick = () => {
    document.getElementById('modal-gift-alert').classList.add('hidden');
    saveUser({ pendingGifts: [] });
  };
}

document.getElementById('btn-play').addEventListener('click', () => openModal('setup'));
document.getElementById('setup-start').addEventListener('click', () => { closeModal('setup'); startGame('A', 3); });
document.getElementById('btn-exit-game').addEventListener('click', () => location.reload());

let soundOn = true;
document.getElementById('btn-sound').addEventListener('click', (e) => { soundOn = !soundOn; e.target.textContent = soundOn ? '🔊' : '🔇'; });

loadUser();