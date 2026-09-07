// script.js — логика игры "Лото Онлайн"

// ---------- константы ----------
const AVATARS = ['🧑‍🦲', '👩‍🦰', '👩', '🧕', '👩🏻‍🦳', '👨🏽', '🧑‍🦱', '👱', '🧔', '🧑‍🦰'];
const MARKERS = [
  { id: 0, color: '#8e44ad', cost: 0 },
  { id: 1, color: '#c0392b', cost: 15000 },
  { id: 2, color: '#2980b9', cost: 15000 },
  { id: 3, color: '#27ae60', cost: 15000 }
];
const DAILY_REWARDS = [
  { icon: '💵', text: '500' },
  { icon: '💵', text: '1000' },
  { icon: '🪙', text: '10' },
  { icon: '💵', text: '1500' },
  { icon: '🪙', text: '30' },
  { icon: '💵', text: '3000' },
  { icon: '🪙', text: '45' }
];
const SHOP_ITEMS = [
  { bills: 500, coins: 10 },
  { bills: 1000, coins: 15 },
  { bills: 2000, coins: 29 },
  { bills: 4000, coins: 49 },
  { bills: 10000, coins: 79 }
];
const DRAW_INTERVAL = 4000;
const BOT_NAMES = ['NEON', 'Anti_Petuh'];
const STAKE = 300; // ставка за игрока в режиме "Три на три"

// традиционные прозвища бочонков
const NICKNAMES = {
  1: 'Кол', 3: 'Троечка', 11: 'Барабанные палочки', 12: 'Дюжина',
  13: 'Чёртова дюжина', 22: 'Гуси-лебеди', 25: 'Четвертак', 44: 'Стульчики',
  50: 'Полтинник', 66: 'Валенки', 77: 'Топорики', 89: 'Дедушкин сосед', 90: 'Дедушка'
};

// ---------- состояние игрока ----------
let uid = localStorage.getItem('loto_uid');
let user = null;

async function loadUser() {
  const res = await fetch(`/api/state?uid=${uid || ''}`);
  const data = await res.json();
  uid = data.uid;
  localStorage.setItem('loto_uid', uid);
  user = data;
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

// ---------- рендер меню ----------
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

// ---------- модалки ----------
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

document.querySelectorAll('[data-modal]').forEach(btn => {
  btn.addEventListener('click', () => openModal(btn.dataset.modal));
});
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

// ---------- ежедневные награды ----------
function renderDaily() {
  const grid = document.getElementById('daily-grid');
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
  claimBtn.disabled = !canClaim;
  claimBtn.textContent = canClaim ? 'Получить' : 'Уже получено сегодня';
}

document.getElementById('daily-claim').addEventListener('click', async () => {
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
});

// ---------- лидерборд ----------
async function renderLeaderboard() {
  const list = document.getElementById('leaderboard-list');
  list.innerHTML = 'Загрузка...';
  const res = await fetch('/api/leaderboard');
  const data = await res.json();
  list.innerHTML = '';
  data.forEach((row, i) => {
    const div = document.createElement('div');
    div.className = 'lb-row' + (row.name === user.name ? ' me' : '');
    div.innerHTML = `<div class="lb-rank">${i + 1}</div><div class="lb-emoji">🙂</div>
      <div class="lb-name">${row.name}</div><div class="lb-score">${row.score}</div>`;
    list.appendChild(div);
  });
}

// ---------- магазин ----------
function renderShop() {
  const list = document.getElementById('shop-list');
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

document.getElementById('shop-ad').addEventListener('click', (e) => {
  e.target.disabled = true;
  e.target.textContent = 'Показ рекламы...';
  setTimeout(() => {
    saveUser({ bills: user.bills + 200 });
    e.target.disabled = false;
    e.target.textContent = 'Получить 200 💵 (реклама)';
  }, 1500);
});

// ---------- маркеры ----------
function renderMarkers() {
  const grid = document.getElementById('marker-grid');
  grid.innerHTML = '';
  MARKERS.forEach(m => {
    const owned = user.unlockedMarkers.includes(m.id);
    const cell = document.createElement('div');
    cell.className = 'marker-cell' + (user.marker === m.id ? ' selected' : '') + (!owned ? ' locked' : '');
    cell.innerHTML = `<div class="m-dot" style="background:${m.color}"></div>
      <div class="m-cost">${owned ? (user.marker === m.id ? 'Выбран' : 'Выбрать') : m.cost + ' 💵 🔒'}</div>`;
    cell.addEventListener('click', () => {
      if (owned) {
        saveUser({ marker: m.id });
      } else if (user.bills >= m.cost) {
        saveUser({ bills: user.bills - m.cost, unlockedMarkers: [...user.unlockedMarkers, m.id], marker: m.id });
      } else {
        alert('Недостаточно 💵 для покупки');
      }
      renderMarkers();
    });
    grid.appendChild(cell);
  });
}

// ---------- профиль ----------
function renderProfile() {
  document.getElementById('profile-current-name').textContent = user.name;
  document.getElementById('profile-current-avatar').textContent = AVATARS[user.avatar];
  const grid = document.getElementById('avatar-grid');
  grid.innerHTML = '';
  let picked = user.avatar;
  AVATARS.forEach((emoji, i) => {
    const cell = document.createElement('div');
    cell.className = 'avatar-cell' + (i === picked ? ' selected' : '');
    cell.textContent = emoji;
    cell.addEventListener('click', () => {
      picked = i;
      document.getElementById('profile-current-avatar').textContent = emoji;
      grid.querySelectorAll('.avatar-cell').forEach(c => c.classList.remove('selected'));
      cell.classList.add('selected');
    });
    grid.appendChild(cell);
  });
  document.getElementById('profile-save').onclick = () => {
    saveUser({ avatar: picked });
    closeModal('profile');
  };
}

// ================= ИГРА =================

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
    let avail = [0, 1, 2].filter(r => rowCap[r] > 0);
    avail.sort(() => Math.random() - 0.5);
    avail.sort((a, b) => rowCap[b] - rowCap[a]);
    const chosen = avail.slice(0, Math.min(counts[c], avail.length));
    chosen.forEach(r => rowCap[r]--);
    colRows.push(chosen);
  }

  const total = colRows.reduce((s, a) => s + a.length, 0);
  if (total !== 15) return generateTicket(); // повторить, если не сошлось

  const grid = [
    new Array(9).fill(null),
    new Array(9).fill(null),
    new Array(9).fill(null)
  ];
  for (let c = 0; c < 9; c++) {
    const pool = [];
    for (let n = ranges[c].start; n <= ranges[c].end; n++) pool.push(n);
    pool.sort(() => Math.random() - 0.5);
    const nums = pool.slice(0, counts[c]).sort((a, b) => a - b);
    colRows[c].sort((a, b) => a - b).forEach((r, i) => { grid[r][c] = nums[i]; });
  }
  return grid;
}

let gameState = null; // { mode, tickets, marks, bots, deck, drawn, timer, currentNumber, finished, bank, stages }

function logEvent(text) {
  document.getElementById('event-log').textContent = text;
}

function startGame(mode, numCards) {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  renderGameCurrency();
  document.getElementById('game-player-avatar').textContent = AVATARS[user.avatar];
  document.getElementById('game-player-name').textContent = user.name;
  document.getElementById('drum-nickname').textContent = '';
  logEvent('');

  const deck = [];
  for (let n = 1; n <= 90; n++) deck.push(n);
  deck.sort(() => Math.random() - 0.5);

  const tickets = [];
  const marks = [];
  for (let i = 0; i < numCards; i++) {
    tickets.push(generateTicket());
    marks.push(Array.from({ length: 3 }, () => new Array(9).fill(false)));
  }

  const bots = BOT_NAMES.map(name => ({
    name,
    emoji: AVATARS[Math.floor(Math.random() * AVATARS.length)],
    ticket: generateTicket(),
    marks: Array.from({ length: 3 }, () => new Array(9).fill(false))
  }));

  const participants = 1 + bots.length;
  let bank = STAKE * participants;
  if (mode === 'C') {
    const paid = Math.min(STAKE, user.bills);
    saveUser({ bills: user.bills - paid });
  }

  gameState = {
    mode,
    tickets,
    marks,
    bots,
    deck,
    drawn: [],
    currentNumber: null,
    finished: false,
    timer: null,
    bank,
    stages: { top: { done: false }, middle: { done: false }, bottom: { done: false } }
  };

  document.getElementById('bank-box').classList.toggle('hidden', mode !== 'C');
  renderBank();
  renderBots();
  renderTickets();
  renderHistory();
  document.getElementById('drum-number').textContent = '-';

  gameState.timer = setInterval(() => drawNext(), DRAW_INTERVAL);
}

function renderBank() {
  if (!gameState) return;
  document.getElementById('bank-amount').textContent = gameState.bank;
}

function renderBots() {
  const row = document.getElementById('bots-row');
  row.innerHTML = '';
  gameState.bots.forEach(bot => {
    const marked = bot.marks.reduce((s, r) => s + r.filter(Boolean).length, 0);
    const box = document.createElement('div');
    box.className = 'bot-box';
    box.innerHTML = `<div class="avatar-emoji">${bot.emoji}</div><div>${bot.name}</div>
      <div class="bot-progress">${marked}/15</div>`;
    row.appendChild(box);
  });
}

function renderHistory() {
  const row = document.getElementById('history-row');
  row.innerHTML = '';
  gameState.drawn.slice(-15).forEach(n => {
    const span = document.createElement('span');
    span.textContent = n;
    row.appendChild(span);
  });
}

function renderTickets() {
  const container = document.getElementById('tickets-container');
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
          const isMarked = gameState.marks[ti][ri][ci];
          const isDrawn = gameState.drawn.includes(val);
          if (isMarked) {
            td.classList.add('marked');
            td.style.background = markerColor;
          } else if (isDrawn) {
            td.classList.add('drawn-not-marked');
          }
          td.addEventListener('click', () => markCell(ti, ri, ci, val));
        }
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    container.appendChild(table);
  });
}

// ---------- проверка заполненности ----------
function rowFullyMarked(ticket, marksTicket, ri) {
  for (let ci = 0; ci < 9; ci++) {
    if (ticket[ri][ci] !== null && !marksTicket[ri][ci]) return false;
  }
  return true;
}
function ticketFullyMarked(ticket, marksTicket) {
  return [0, 1, 2].every(ri => rowFullyMarked(ticket, marksTicket, ri));
}

function markCell(ti, ri, ci, val) {
  if (gameState.finished) return;
  if (!gameState.drawn.includes(val)) return; // число ещё не выпало
  if (gameState.marks[ti][ri][ci]) return;
  gameState.marks[ti][ri][ci] = true;
  renderTickets();
  checkWin();
}

// боты постепенно отмечают уже выпавшие числа (не мгновенно, с шансом на ход)
function botTick(bot) {
  bot.ticket.forEach((row, ri) => row.forEach((val, ci) => {
    if (val !== null && gameState.drawn.includes(val) && !bot.marks[ri][ci]) {
      if (Math.random() < 0.6) bot.marks[ri][ci] = true;
    }
  }));
}

function checkWin() {
  if (!gameState || gameState.finished) return;

  if (gameState.mode === 'A') {
    if (gameState.tickets.some((t, ti) => ticketFullyMarked(t, gameState.marks[ti]))) { endGame('player'); return; }
    const bot = gameState.bots.find(b => ticketFullyMarked(b.ticket, b.marks));
    if (bot) { endGame('bot', bot); return; }

  } else if (gameState.mode === 'B') {
    if (gameState.tickets.some((t, ti) => [0, 1, 2].some(ri => rowFullyMarked(t, gameState.marks[ti], ri)))) { endGame('player'); return; }
    const bot = gameState.bots.find(b => [0, 1, 2].some(ri => rowFullyMarked(b.ticket, b.marks, ri)));
    if (bot) { endGame('bot', bot); return; }

  } else if (gameState.mode === 'C') {
    checkThreeOnThree();
  }
}

// ---------- режим "Три на три" ----------
function checkThreeOnThree() {
  const order = [{ key: 'top', ri: 0, label: 'верхнюю' }, { key: 'middle', ri: 1, label: 'среднюю' }, { key: 'bottom', ri: 2, label: 'нижнюю' }];
  for (const stage of order) {
    if (gameState.stages[stage.key].done) continue;

    let who = null;
    if (gameState.tickets.some((t, ti) => rowFullyMarked(t, gameState.marks[ti], stage.ri))) who = 'player';
    if (!who) {
      const bot = gameState.bots.find(b => rowFullyMarked(b.ticket, b.marks, stage.ri));
      if (bot) who = bot;
    }
    if (!who) continue;

    gameState.stages[stage.key].done = true;
    gameState.stages[stage.key].who = who;
    const whoName = who === 'player' ? user.name : who.name;

    if (stage.key === 'top') {
      const add = STAKE * (gameState.bots.length + 1 - 1); // ставки остальных удваиваются
      gameState.bank += add;
      logEvent(`${whoName} закрыл(а) верхнюю строку — банк вырос до ${gameState.bank} 💵 (${whoName} ничего не получает)`);
    } else if (stage.key === 'middle') {
      const half = Math.floor(gameState.bank / 2);
      gameState.bank -= half;
      if (who === 'player') saveUser({ bills: user.bills + half });
      logEvent(`${whoName} закрыл(а) среднюю строку и забрал(а) половину банка: ${half} 💵`);
    } else if (stage.key === 'bottom') {
      const rest = gameState.bank;
      gameState.bank = 0;
      if (who === 'player') saveUser({ bills: user.bills + rest });
      renderBank();
      endGame('three', { who, amount: rest });
      return;
    }
    renderBank();
  }
}

function drawNext() {
  if (gameState.finished) return;
  if (gameState.deck.length === 0) { endGame('nobody'); return; }

  const num = gameState.deck.pop();
  gameState.currentNumber = num;
  gameState.drawn.push(num);
  document.getElementById('drum-number').textContent = num;
  document.getElementById('drum-nickname').textContent = NICKNAMES[num] ? `«${NICKNAMES[num]}»` : '';
  renderHistory();

  gameState.bots.forEach(botTick);
  renderBots();
  renderTickets();
  checkWin();
}

function endGame(result, payload) {
  if (gameState.finished) return;
  gameState.finished = true;
  clearInterval(gameState.timer);

  const title = document.getElementById('result-title');
  const text = document.getElementById('result-text');

  if (result === 'player') {
    const reward = 1000 + Math.floor(Math.random() * 4000);
    const coinReward = 5 + Math.floor(Math.random() * 10);
    saveUser({ bills: user.bills + reward, coins: user.coins + coinReward });
    title.textContent = '🎉 Победа!';
    text.textContent = `Вы первым закрыли карточку! Награда: ${reward} 💵 и ${coinReward} 🪙`;
  } else if (result === 'bot') {
    title.textContent = '😢 Поражение';
    text.textContent = `${payload.name} первым закрыл карточку. Попробуйте ещё раз!`;
  } else if (result === 'three') {
    const { who, amount } = payload;
    if (who === 'player') {
      title.textContent = '🎉 Банк ваш!';
      text.textContent = `Вы закрыли нижнюю строку первым и забрали весь банк: ${amount} 💵`;
    } else {
      title.textContent = '😢 Поражение';
      text.textContent = `${who.name} закрыл(а) нижнюю строку первым(ой) и забрал(а) банк (${amount} 💵).`;
    }
  } else {
    title.textContent = 'Ничья';
    text.textContent = 'Все числа разыграны, победитель не определён.';
  }

  document.getElementById('modal-result').classList.remove('hidden');
}

document.getElementById('result-close').addEventListener('click', () => {
  document.getElementById('modal-result').classList.add('hidden');
  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-menu').classList.add('active');
  renderMenu();
});

document.getElementById('btn-exit-game').addEventListener('click', () => {
  if (gameState && gameState.timer) clearInterval(gameState.timer);
  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-menu').classList.add('active');
});

document.getElementById('btn-play').addEventListener('click', () => openModal('setup'));

document.getElementById('setup-start').addEventListener('click', () => {
  const mode = document.querySelector('input[name="mode"]:checked').value;
  const cards = parseInt(document.querySelector('input[name="cards"]:checked').value, 10);
  closeModal('setup');
  startGame(mode, cards);
});

// ---------- усиления ----------
function spend(cost, currency) {
  if (user[currency] < cost) { alert('Недостаточно ' + (currency === 'coins' ? '🪙' : '💵')); return false; }
  user[currency] -= cost;
  saveUser({});
  renderGameCurrency();
  return true;
}

document.getElementById('pu-eye').addEventListener('click', () => {
  if (!gameState || gameState.finished || gameState.currentNumber === null) return;
  if (!spend(10, 'coins')) return;
  gameState.tickets.forEach((ticket, ti) => {
    ticket.forEach((row, ri) => row.forEach((val, ci) => {
      if (val === gameState.currentNumber) gameState.marks[ti][ri][ci] = true;
    }));
  });
  renderTickets();
  checkWin();
});

document.getElementById('pu-x').addEventListener('click', () => {
  if (!gameState || gameState.finished) return;
  if (!spend(30, 'coins')) return;
  gameState.tickets.forEach((ticket, ti) => {
    ticket.forEach((row, ri) => row.forEach((val, ci) => {
      if (val !== null && gameState.drawn.includes(val)) gameState.marks[ti][ri][ci] = true;
    }));
  });
  renderTickets();
  checkWin();
});

document.getElementById('pu-plus1').addEventListener('click', () => {
  if (!gameState || gameState.finished) return;
  if (!spend(1, 'coins')) return;
  drawNext();
});

document.getElementById('pu-plus5').addEventListener('click', () => {
  if (!gameState || gameState.finished) return;
  if (!spend(50, 'coins')) return;
  let i = 0;
  const step = setInterval(() => {
    drawNext();
    i++;
    if (i >= 5 || (gameState && gameState.finished)) clearInterval(step);
  }, 300);
});

// ---------- звук (заглушка вкл/выкл) ----------
let soundOn = true;
document.getElementById('btn-sound').addEventListener('click', (e) => {
  soundOn = !soundOn;
  e.target.textContent = soundOn ? '🔊' : '🔇';
});

// ---------- старт ----------
loadUser();
