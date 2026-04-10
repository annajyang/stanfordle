// =============================================================
//  Stanfordle — Game Logic
// =============================================================

const WORD_LENGTH  = 5;
const MAX_GUESSES  = 6;
const COOKIE_STATE = () => `stanfordle_state_${getPuzzleNum()}`;
const COOKIE_STATS = 'stanfordle_stats';

// ---- Cookie helpers -----------------------------------------
function setCookie(name, value, days) {
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie =
    `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${exp};path=/;SameSite=Lax`;
}

function getCookie(name) {
  const re = new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)');
  const m  = document.cookie.match(re);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(m[1])); }
  catch { return null; }
}

// ---- URL params (used when embedded via iframe) -------------
// ?w=<base64word>  overrides the daily word
// ?p=<number>      overrides the puzzle number
function getParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    word:   p.get('w') ? atob(p.get('w')).toUpperCase() : null,
    puzzle: p.get('p') ? parseInt(p.get('p'), 10)       : null,
  };
}

// ---- Date helpers -------------------------------------------
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayNumber() {
  return Math.floor((Date.now() - new Date(2024, 0, 1)) / 86400000);
}

// ---- Daily answer -------------------------------------------
function getDailyAnswer() {
  const { word } = getParams();
  if (word && word.length === 5 && /^[A-Z]+$/.test(word)) return word;
  return FINAL_ANSWERS[dayNumber() % FINAL_ANSWERS.length];
}

function getPuzzleNum() {
  const { puzzle } = getParams();
  return (puzzle !== null && !isNaN(puzzle)) ? puzzle : dayNumber();
}

// ---- Game state ---------------------------------------------
let targetWord       = '';
let currentRow       = 0;
let currentCol       = 0;
let currentGuess     = [];
let gameOver         = false;
let wonGame          = false;
let revealInProgress = false;
let tileEls          = [];   // tileEls[row][col]

// ---- Stats --------------------------------------------------
const STATS_DEFAULTS = { played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0,0,0,0,0,0] };

function loadStats() {
  const saved = getCookie(COOKIE_STATS);
  return saved ? { ...STATS_DEFAULTS, ...saved } : { ...STATS_DEFAULTS };
}

function saveStats(stats) {
  setCookie(COOKIE_STATS, stats, 365);
}

// ---- Persisted game state -----------------------------------
function loadGameState() {
  const saved = getCookie(COOKIE_STATE());
  if (saved && saved.date === todayKey()) return saved;
  return null;
}

function saveGameState() {
  const rows = tileEls.map(row =>
    row.map(t => ({ letter: t.textContent, state: t.dataset.state || '' }))
  );
  setCookie(COOKIE_STATE(), { date: todayKey(), currentRow, currentCol, gameOver, wonGame, rows }, 2);
}

// ---- Build board --------------------------------------------
function buildBoard() {
  const board = document.getElementById('board');
  board.innerHTML = '';
  tileEls = [];

  for (let r = 0; r < MAX_GUESSES; r++) {
    const rowEl = document.createElement('div');
    rowEl.classList.add('row');
    rowEl.dataset.row = r;

    const rowTiles = [];
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement('div');
      tile.classList.add('tile');
      tile.dataset.row = r;
      tile.dataset.col = c;
      rowEl.appendChild(tile);
      rowTiles.push(tile);
    }

    board.appendChild(rowEl);
    tileEls.push(rowTiles);
  }
}

function getRowEl(r) {
  return document.querySelector(`.row[data-row="${r}"]`);
}

// ---- Input --------------------------------------------------
function addLetter(letter) {
  if (gameOver || revealInProgress || currentCol >= WORD_LENGTH) return;
  const tile = tileEls[currentRow][currentCol];
  tile.textContent = letter;
  tile.dataset.letter = letter;
  // Restart pop animation
  tile.classList.remove('pop');
  void tile.offsetWidth;
  tile.classList.add('pop');
  currentGuess.push(letter);
  currentCol++;
  saveGameState();
}

function deleteLetter() {
  if (gameOver || revealInProgress || currentCol === 0) return;
  currentCol--;
  currentGuess.pop();
  const tile = tileEls[currentRow][currentCol];
  tile.textContent = '';
  delete tile.dataset.letter;
  saveGameState();
}

function submitGuess() {
  if (gameOver || revealInProgress) return;
  if (currentCol < WORD_LENGTH) { shakeRow(); showToast('Not enough letters'); return; }

  const guess = currentGuess.join('');
  if (!ALL_VALID_WORDS.has(guess)) { shakeRow(); showToast('Not in word list'); return; }

  revealRow(evaluateGuess(guess), guess);
}

// ---- Evaluate -----------------------------------------------
function evaluateGuess(guess) {
  const result   = Array(WORD_LENGTH).fill('absent');
  const target   = targetWord.split('');
  const guessArr = guess.split('');
  const used     = Array(WORD_LENGTH).fill(false);

  // Pass 1: correct positions
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guessArr[i] === target[i]) {
      result[i] = 'correct';
      used[i]   = true;
    }
  }
  // Pass 2: present elsewhere
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    for (let j = 0; j < WORD_LENGTH; j++) {
      if (!used[j] && guessArr[i] === target[j]) {
        result[i] = 'present';
        used[j]   = true;
        break;
      }
    }
  }
  return result;
}

// ---- Reveal row with flip animation -------------------------
function revealRow(result, guess) {
  revealInProgress = true;
  const FLIP_MS = 300;

  result.forEach((state, i) => {
    const tile = tileEls[currentRow][i];
    setTimeout(() => {
      tile.classList.add('flip');
      setTimeout(() => {
        tile.dataset.state = state;
        tile.classList.add(state);
      }, FLIP_MS / 2);
    }, i * FLIP_MS);
  });

  setTimeout(() => {
    result.forEach((state, i) => updateKey(guess[i], state));

    const won = result.every(s => s === 'correct');
    currentRow++;
    currentCol    = 0;
    currentGuess  = [];
    revealInProgress = false;

    if (won) {
      wonGame = true;
      handleWin(currentRow - 1);
    } else if (currentRow >= MAX_GUESSES) {
      handleLoss();
    }
    saveGameState();
  }, WORD_LENGTH * FLIP_MS + FLIP_MS / 2);
}

// ---- Win / Loss ---------------------------------------------
function handleWin(guessCount) {
  gameOver = true;
  const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
  showToast(msgs[Math.min(guessCount, msgs.length - 1)], 2500);

  // Bounce the winning row
  setTimeout(() => {
    tileEls[currentRow - 1].forEach((tile, i) => {
      setTimeout(() => tile.classList.add('bounce'), i * 100);
    });
  }, 250);

  const stats = loadStats();
  stats.played++;
  stats.wins++;
  stats.streak++;
  stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
  stats.dist[guessCount] = (stats.dist[guessCount] || 0) + 1;
  saveStats(stats);

  setTimeout(() => openModal('stats'), 2900);
}

function handleLoss() {
  gameOver = true;
  showToast(targetWord, 4000);

  const stats = loadStats();
  stats.played++;
  stats.streak = 0;
  saveStats(stats);

  setTimeout(() => openModal('stats'), 4300);
}

// ---- Keyboard state -----------------------------------------
function updateKey(letter, newState) {
  const key = document.querySelector(`.key[data-key="${letter}"]`);
  if (!key) return;
  const priority = { correct: 3, present: 2, absent: 1 };
  const cur = key.dataset.state || '';
  if ((priority[newState] || 0) > (priority[cur] || 0)) {
    if (cur) key.classList.remove(cur);
    key.classList.add(newState);
    key.dataset.state = newState;
  }
}

// ---- Animations ---------------------------------------------
function shakeRow() {
  const row = getRowEl(currentRow);
  row.classList.remove('shake');
  void row.offsetWidth;
  row.classList.add('shake');
  row.addEventListener('animationend', () => row.classList.remove('shake'), { once: true });
}

// ---- Toast --------------------------------------------------
function showToast(message, duration = 1800) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.classList.add('toast');
  toast.textContent = message;
  toast.style.animationDuration = `${duration / 1000}s`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ---- Modals -------------------------------------------------
function openModal(name) {
  if (name === 'stats') renderStats();
  document.getElementById(`modal-${name}`).classList.remove('hidden');
}
function closeModal(name) {
  document.getElementById(`modal-${name}`).classList.add('hidden');
}

function renderStats() {
  const stats = loadStats();
  document.getElementById('stat-played').textContent    = stats.played;
  document.getElementById('stat-win-pct').textContent   =
    stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;

  const streakEl = document.getElementById('stat-streak');
  streakEl.textContent = stats.streak + (stats.streak >= 3 ? ' 🔥' : '');

  document.getElementById('stat-max-streak').textContent = stats.maxStreak;

  // Distribution bars
  const maxCount  = Math.max(...stats.dist, 1);
  const lastGuess = currentRow - 1;  // 0-based index of last submitted row
  const container = document.getElementById('guess-distribution');
  container.innerHTML = '';

  stats.dist.forEach((count, i) => {
    const pct       = Math.max(7, Math.round((count / maxCount) * 100));
    const highlight = gameOver && wonGame && lastGuess === i;
    const row       = document.createElement('div');
    row.classList.add('dist-row');
    row.innerHTML = `
      <div class="dist-label">${i + 1}</div>
      <div class="dist-bar-wrap">
        <div class="dist-bar${highlight ? ' highlight' : ''}" style="width:${pct}%">${count}</div>
      </div>`;
    container.appendChild(row);
  });

  document.getElementById('share-section').classList.toggle('hidden', !gameOver);
}

// ---- Share --------------------------------------------------
function buildShareText() {
  const score  = (gameOver && wonGame) ? currentRow : 'X';
  const header = `Stanfordle #${getPuzzleNum()} ${score}/${MAX_GUESSES}`;

  const emojiRows = [];
  const revealedRows = gameOver ? currentRow : currentRow;
  for (let r = 0; r < Math.min(revealedRows, MAX_GUESSES); r++) {
    const emojis = tileEls[r].map(tile => {
      const s = tile.dataset.state;
      return s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛';
    }).join('');
    emojiRows.push(emojis);
  }
  return [header, ...emojiRows].join('\n');
}

function shareResult() {
  const text = buildShareText();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Copied to clipboard!'))
      .catch(() => fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  const el = document.createElement('textarea');
  el.value = text;
  Object.assign(el.style, { position: 'fixed', opacity: '0' });
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  el.remove();
  showToast('Copied to clipboard!');
}

// ---- Restore saved game state ------------------------------
function restoreGameState(saved) {
  currentRow = saved.currentRow;
  gameOver   = saved.gameOver;
  wonGame    = saved.wonGame || false;

  for (let r = 0; r < saved.currentRow; r++) {
    saved.rows[r].forEach((cell, c) => {
      const tile = tileEls[r][c];
      tile.textContent = cell.letter;
      if (cell.letter) tile.dataset.letter = cell.letter;
      if (cell.state) {
        tile.dataset.state = cell.state;
        tile.classList.add(cell.state);
        if (cell.letter) updateKey(cell.letter, cell.state);
      }
    });
  }

  currentCol   = 0;
  currentGuess = [];
}

// ---- Event listeners ----------------------------------------
function handleKey(key) {
  if      (key === 'ENTER')     submitGuess();
  else if (key === 'BACKSPACE') deleteLetter();
  else if (/^[A-Z]$/.test(key)) addLetter(key);
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  handleKey(e.key.toUpperCase());
});

document.getElementById('keyboard').addEventListener('click', e => {
  const key = e.target.closest('.key');
  if (key) handleKey(key.dataset.key);
});

document.getElementById('btn-help').addEventListener('click',  () => openModal('help'));
document.getElementById('btn-stats').addEventListener('click', () => openModal('stats'));
document.getElementById('btn-share').addEventListener('click', shareResult);

document.querySelectorAll('.modal-close').forEach(btn =>
  btn.addEventListener('click', () => closeModal(btn.dataset.modal))
);
document.querySelectorAll('.modal').forEach(modal =>
  modal.addEventListener('click', e => {
    if (e.target === modal) closeModal(modal.id.replace('modal-', ''));
  })
);

// ---- Init ---------------------------------------------------
function init() {
  targetWord = getDailyAnswer();
  buildBoard();

  const label = document.getElementById('puzzle-label');
  if (label) label.textContent = `Puzzle #${getPuzzleNum()}`;

  const saved = loadGameState();
  if (saved) restoreGameState(saved);
}

init();
