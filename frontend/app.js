const canvas   = document.getElementById('board');
const ctx      = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const gameIdEl = document.getElementById('game-id-label');
const turnDot  = document.getElementById('turn-dot');
const turnLbl  = document.getElementById('turn-label');

const COLS = 7;
const ROWS = 6;
const API  = 'https://connect4-ai-arena.onrender.com';

const C = {
  boardBg:  '#0e1628',
  hole:     '#07080f',
  p1:       '#e63946',
  p1light:  '#ff8fa3',
  p2:       '#2196f3',
  p2light:  '#64b5f6',
  win:      '#ffd60a',
  winlight: '#fff176',
  ghost:    'rgba(230,57,70,0.15)',
  ghostRing:'rgba(230,57,70,0.5)',
};

let CELL, RADIUS;
const pieceCache = {};

function getPieceImg(player) {
  const key = `${player}-${RADIUS}`;
  if (pieceCache[key]) return pieceCache[key];

  const off  = document.createElement('canvas');
  off.width  = off.height = (RADIUS + 4) * 2;
  const oc   = off.getContext('2d');
  const cx   = RADIUS + 4;

  const base  = player === 'win' ? C.win      : player === 1 ? C.p1      : C.p2;
  const light = player === 'win' ? C.winlight : player === 1 ? C.p1light : C.p2light;

  const g = oc.createRadialGradient(
    cx - RADIUS*0.38, cx - RADIUS*0.38, RADIUS*0.05,
    cx + RADIUS*0.1,  cx + RADIUS*0.1,  RADIUS*1.05
  );
  g.addColorStop(0,   light);
  g.addColorStop(0.5, base);
  g.addColorStop(1,   shadeHex(base, -45));

  oc.beginPath();
  oc.arc(cx, cx, RADIUS, 0, Math.PI*2);
  oc.fillStyle = g;
  oc.fill();

  oc.beginPath();
  oc.arc(cx - RADIUS*0.28, cx - RADIUS*0.28, RADIUS*0.2, 0, Math.PI*2);
  oc.fillStyle = 'rgba(255,255,255,0.28)';
  oc.fill();

  pieceCache[key] = off;
  return off;
}

function resize() {
  Object.keys(pieceCache).forEach(k => delete pieceCache[k]);
  const maxW = Math.min(window.innerWidth - 32, 560);
  CELL   = Math.floor(maxW / COLS);
  RADIUS = Math.floor(CELL * 0.37);
  canvas.width  = CELL * COLS;
  canvas.height = CELL * ROWS;
  drawBoard();
}

let gameId        = null;
let grid          = emptyGrid();
let gameOver      = false;
let hoverCol      = -1;
let watchMode     = false;
let activeSocket  = null;
let scores        = { p1: 0, p2: 0 };
let winCells      = [];
let winPulse      = 0;
let winAnimId     = null;
let fallingPieces = [];
let animRunning   = false;
let hoverRafId    = null;

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function findDropRow(col, g) {
  const b = g || grid;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r][col] === 0) return r;
  }
  return -1;
}

function findWinCells(g) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = g[r][c];
      if (!p) continue;
      for (const [dr, dc] of dirs) {
        const cells = [];
        for (let i = 0; i < 4; i++) {
          const nr = r + i*dr, nc = c + i*dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (g[nr][nc] !== p) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return [];
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function shadeHex(hex, amt) {
  const n = parseInt(hex.replace('#',''), 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + amt));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
  return '#' + ((1<<24)|(r<<16)|(g<<8)|b).toString(16).slice(1);
}

function drawPiece(x, y, player, alpha) {
  if (alpha === undefined) alpha = 1;
  const img = getPieceImg(player);
  const off = RADIUS + 4;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, Math.round(x - off), Math.round(y - off));
  ctx.restore();
}

function drawBoard() {
  if (!CELL) return;

  ctx.fillStyle = C.boardBg;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(0, 0, canvas.width, canvas.height, 10);
  } else {
    ctx.rect(0, 0, canvas.width, canvas.height);
  }
  ctx.fill();

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c*CELL + CELL/2;
      const y = r*CELL + CELL/2;

      ctx.beginPath();
      ctx.arc(x, y, RADIUS+3, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, RADIUS, 0, Math.PI*2);
      ctx.fillStyle = C.hole;
      ctx.fill();
    }
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const val = grid[r][c];
      if (!val) continue;
      if (fallingPieces.some(p => p.col===c && p.targetRow===r)) continue;

      const x = c*CELL + CELL/2;
      const y = r*CELL + CELL/2;
      const isWin = winCells.some(([wr,wc]) => wr===r && wc===c);
      drawPiece(x, y, isWin ? 'win' : val, isWin ? 0.6 + winPulse*0.4 : 1);
    }
  }

  fallingPieces.forEach(p => {
    drawPiece(p.col*CELL + CELL/2, p.y, p.player);
  });

  if (hoverCol >= 0 && !gameOver && !watchMode && gameId && !animRunning) {
    const dropRow = findDropRow(hoverCol);
    if (dropRow >= 0) {
      const x = hoverCol*CELL + CELL/2;
      const y = dropRow*CELL + CELL/2;
      ctx.beginPath();
      ctx.arc(x, y, RADIUS, 0, Math.PI*2);
      ctx.fillStyle = C.ghost;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, RADIUS, 0, Math.PI*2);
      ctx.strokeStyle = C.ghostRing;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function animateDrop(pieces, onDone) {
  const duration  = 320;
  const startTime = performance.now();

  pieces.forEach(p => {
    p.startY = CELL/2;
    p.endY   = p.targetRow*CELL + CELL/2;
    p.y      = p.startY;
  });

  fallingPieces = pieces;
  animRunning   = true;

  function step(now) {
    const t = Math.min((now - startTime) / duration, 1);
    const e = easeOutCubic(t);
    pieces.forEach(p => { p.y = p.startY + (p.endY - p.startY) * e; });
    drawBoard();
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      fallingPieces = [];
      animRunning   = false;
      drawBoard();
      if (onDone) onDone();
    }
  }

  requestAnimationFrame(step);
}

function startWinPulse() {
  const start = performance.now();
  function pulse(now) {
    winPulse  = (Math.sin((now - start) / 300) + 1) / 2;
    drawBoard();
    winAnimId = requestAnimationFrame(pulse);
  }
  winAnimId = requestAnimationFrame(pulse);
}

function stopWinPulse() {
  if (winAnimId) { cancelAnimationFrame(winAnimId); winAnimId = null; }
  winPulse = 0;
}

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className   = type || '';
}

function setTurn(player, thinking) {
  turnDot.className = thinking ? 'pulse' : '';
  if (player === 1) {
    turnDot.style.background = C.p1;
    turnLbl.textContent = thinking ? 'Thinking...' : 'Your turn';
  } else if (player === 2) {
    turnDot.style.background = C.p2;
    turnLbl.textContent = thinking ? 'Thinking...' : 'AI';
  } else {
    turnDot.style.background = '#3d5068';
    turnLbl.textContent = player || '—';
  }
}

function updateScores() {
  document.getElementById('score-p1').textContent = scores.p1;
  document.getElementById('score-p2').textContent = scores.p2;
}

async function newGame() {
  if (activeSocket) { activeSocket.close(); activeSocket = null; }
  stopWinPulse();

  gameOver  = false;
  winCells  = [];
  grid      = emptyGrid();
  watchMode = false;

  document.getElementById('btn-new').classList.add('active');
  document.getElementById('btn-watch').classList.remove('active');

  drawBoard();
  setStatus('Connecting to server...');
  setTurn(null, true);

  try {
    const res  = await fetch(`${API}/game/new`, { method: 'POST' });
    const data = await res.json();
    gameId = data.game_id;
    grid   = data.grid;
    gameIdEl.textContent = `id: ${gameId.slice(0,8)}…`;
    setTurn(1);
    setStatus('Your turn — tap a column to drop a piece');
    drawBoard();
  } catch {
    setStatus('Could not reach server — may be waking up, try again in 30s');
    setTurn(null);
    gameIdEl.textContent = '';
  }
}

async function sendMove(col) {
  if (gameOver || watchMode || !gameId || animRunning) return;
  const dropRow = findDropRow(col);
  if (dropRow < 0) { setStatus('That column is full — try another'); return; }

  setTurn(2, true);
  setStatus('AI is thinking...', 'thinking');

  animateDrop([{ col, targetRow: dropRow, player: 1 }], async () => {
    grid[dropRow][col] = 1;

    try {
      const res = await fetch(`${API}/game/${gameId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ col }),
      });

      if (!res.ok) {
        setStatus('Invalid move — try another column');
        grid[dropRow][col] = 0;
        drawBoard();
        setTurn(1);
        return;
      }

      const data = await res.json();

      if (data.winner === 1) {
        grid     = data.grid;
        winCells = findWinCells(grid);
        drawBoard();
        startWinPulse();
        setStatus('You win! 🎉', 'win');
        setTurn('You won!');
        scores.p1++;
        updateScores();
        gameOver = true;
        return;
      }

      if (data.is_draw && !data.winner) {
        grid = data.grid;
        drawBoard();
        setStatus("It's a draw!");
        setTurn('Draw');
        gameOver = true;
        return;
      }

      if (data.ai_move !== undefined) {
        const aiRow = findDropRow(data.ai_move, data.grid);
        animateDrop([{ col: data.ai_move, targetRow: aiRow, player: 2 }], () => {
          grid = data.grid;
          drawBoard();
          if (data.winner === 2) {
            winCells = findWinCells(grid);
            drawBoard();
            startWinPulse();
            setStatus('AI wins!', 'lose');
            setTurn('AI won');
            scores.p2++;
            updateScores();
            gameOver = true;
          } else {
            setTurn(1);
            setStatus(`AI played col ${data.ai_move} — your turn`);
          }
        });
      }

    } catch {
      setStatus('Network error — check your connection');
      grid[dropRow][col] = 0;
      drawBoard();
      setTurn(1);
    }
  });
}

async function watchAIvsAI() {
  if (activeSocket) { activeSocket.close(); activeSocket = null; }
  stopWinPulse();

  watchMode = true;
  gameOver  = false;
  winCells  = [];
  grid      = emptyGrid();

  document.getElementById('btn-watch').classList.add('active');
  document.getElementById('btn-new').classList.remove('active');

  gameIdEl.textContent = 'mode: AI vs AI';
  drawBoard();
  setStatus('Connecting...');
  setTurn(1);

  const wsUrl = API.replace('https','wss').replace('http','ws');
  const ws    = new WebSocket(`${wsUrl}/game/live/watch`);
  activeSocket = ws;

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.event === 'start') {
      setStatus('Watching live — AI vs AI');
    } else if (data.event === 'move') {
      const col    = data.col;
      const newRow = findDropRow(col, data.grid);
      setTurn(data.player);
      setStatus(`Player ${data.player} → col ${col}  (${data.think_time_seconds}s)`);
      animateDrop([{ col, targetRow: newRow, player: data.player }], () => {
        grid = data.grid;
        drawBoard();
      });
    } else if (data.event === 'end') {
      setTimeout(() => {
        winCells = findWinCells(grid);
        if (winCells.length) startWinPulse();
        setStatus(data.message, data.winner ? 'win' : '');
        setTurn('Game over');
        gameOver = true;
      }, 500);
    }
  };

  ws.onerror = () => setStatus('WebSocket error — is the server running?');
  ws.onclose = () => { if (!gameOver) setStatus('Connection closed'); };
}

function colFromEvent(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  return Math.floor((clientX - rect.left) * scaleX / CELL);
}

canvas.addEventListener('mousemove', (e) => {
  const col = colFromEvent(e);
  if (col === hoverCol) return;
  hoverCol = col;
  if (!animRunning && !hoverRafId) {
    hoverRafId = requestAnimationFrame(() => {
      hoverRafId = null;
      drawBoard();
    });
  }
});

canvas.addEventListener('mouseleave', () => {
  hoverCol = -1;
  if (!animRunning) drawBoard();
});

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const col = colFromEvent(e);
  if (col === hoverCol) return;
  hoverCol = col;
  if (!animRunning && !hoverRafId) {
    hoverRafId = requestAnimationFrame(() => {
      hoverRafId = null;
      drawBoard();
    });
  }
}, { passive: false });

canvas.addEventListener('click', (e) => {
  if (gameOver || watchMode || !gameId || animRunning) return;
  sendMove(colFromEvent(e));
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (gameOver || watchMode || !gameId || animRunning) return;
  sendMove(colFromEvent(e));
}, { passive: false });

document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-watch').addEventListener('click', watchAIvsAI);

document.getElementById('btn-start').addEventListener('click', () => {
  document.getElementById('modal').classList.add('hidden');
  newGame();
});

document.getElementById('btn-rules').addEventListener('click', () => {
  document.getElementById('modal').classList.remove('hidden');
});

const labelsEl = document.getElementById('col-labels');
for (let i = 0; i < COLS; i++) {
  const d = document.createElement('div');
  d.className = 'col-label';
  d.textContent = i;
  labelsEl.appendChild(d);
}

window.addEventListener('resize', resize);
resize();