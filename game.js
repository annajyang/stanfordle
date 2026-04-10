// =============================================================
//  Stanfordle — Game Logic
// =============================================================

const WORD_LENGTH  = 5;
const MAX_GUESSES  = 6;
const COOKIE_STATE = () => `stanfordle_state_${dayNumber()}`;

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

function getPuzzleNum() {
  const { puzzle } = getParams();
  return (puzzle !== null && !isNaN(puzzle)) ? puzzle : dayNumber();
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

// ---- Game state ---------------------------------------------
let targetWord       = '';
let currentRow       = 0;
let currentCol       = 0;
let currentGuess     = [];
let gameOver         = false;
let wonGame          = false;
let revealInProgress = false;
let tileEls          = [];   // tileEls[row][col]

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

  setTimeout(() => openShareModal(true, guessCount + 1), 1600);
}

function handleLoss() {
  gameOver = true;
  showToast(targetWord, 2500);
  setTimeout(() => openShareModal(false, null), 2000);
}

// ---- Share modal --------------------------------------------
function buildEmojiGrid() {
  const rows = [];
  for (let r = 0; r < currentRow; r++) {
    const line = tileEls[r].map(tile => {
      const s = tile.dataset.state;
      return s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛';
    }).join('');
    rows.push(line);
  }
  return rows.join('\n');
}

function buildShareText(guessCount) {
  const score = guessCount !== null ? `${guessCount}/${MAX_GUESSES}` : 'X';
  return `Stanfordle #${getPuzzleNum()} ${score}\n\n${buildEmojiGrid()}`;
}

let countdownInterval = null;

function startCountdown() {
  const el = document.getElementById('share-countdown');
  function tick() {
    const now  = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const diff = next - now;
    const h = String(Math.floor(diff / 3600000)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
    el.textContent = `${h}:${m}:${s}`;
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

function openShareModal(won, guessCount) {
  // Result line
  const resultLine = document.getElementById('share-result-line');
  if (won) {
    const msgs = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
    resultLine.innerHTML =
      `${msgs[Math.min(guessCount - 1, msgs.length - 1)]}<span class="result-sub">${guessCount} / ${MAX_GUESSES} guesses</span>`;
  } else {
    resultLine.innerHTML =
      `Better luck tomorrow<span class="result-answer">The word was ${targetWord}</span>`;
  }

  // Emoji grid (visual squares)
  const grid = document.getElementById('share-emoji-grid');
  grid.innerHTML = '';
  for (let r = 0; r < currentRow; r++) {
    const rowEl = document.createElement('div');
    rowEl.classList.add('share-row');
    tileEls[r].forEach(tile => {
      const cell = document.createElement('div');
      cell.classList.add('share-cell');
      const s = tile.dataset.state;
      if (s === 'correct' || s === 'present') cell.classList.add(s);
      rowEl.appendChild(cell);
    });
    grid.appendChild(rowEl);
  }

  // Reset copy button
  const btn = document.getElementById('btn-share');
  btn.textContent = 'Share Results';
  btn.classList.remove('copied');

  startCountdown();
  openModal('share');
}

document.getElementById('btn-share').addEventListener('click', () => {
  const btn = document.getElementById('btn-share');
  const text = buildShareText(wonGame ? currentRow : null);

  function onCopied() {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Share Results';
      btn.classList.remove('copied');
    }, 2500);
  }

  function fallbackCopy() {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    Object.assign(el.style, { position: 'fixed', opacity: '0' });
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, el.value.length);
    document.execCommand('copy');
    el.remove();
    onCopied();
  }

  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(onCopied).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
});


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
  document.getElementById(`modal-${name}`).classList.remove('hidden');
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

document.getElementById('btn-help').addEventListener('click', () => openModal('help'));
document.getElementById('btn-start-over').addEventListener('click', () => {
  document.cookie = `${COOKIE_STATE()}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
  location.reload();
});

function closeModal(name) {
  if (name === 'share' && countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  document.getElementById(`modal-${name}`).classList.add('hidden');
}

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

  const saved = loadGameState();
  if (saved) restoreGameState(saved);
}

init();
