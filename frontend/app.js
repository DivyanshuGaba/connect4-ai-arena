const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const gameIdLabel = document.getElementById('game-id-label');

const COLS = 7;
const ROWS = 6;
const CELL = 80;
const RADIUS = 30;
const API = 'https://connect4-ai-arena.onrender.com';

const COLORS = {
  board:    '#1a1a2e',
  empty:    '#0d0d0d',
  player1:  '#c0392b',
  player2:  '#2980b9',
  hover:    'rgba(192, 57, 43, 0.2)',
  win:      '#f1c40f',
};

let gameId       = null;
let grid         = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let gameOver     = false;
let hoverCol     = -1;
let watchMode    = false;
let activeSocket = null;
let scores       = { player: 0, ai: 0 };
let winCells     = [];

// DRAWING

function drawBoard() {
  // Background
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Hover highlight
  if (hoverCol >= 0 && !gameOver && !watchMode && gameId) {
    ctx.fillStyle = COLORS.hover;
    ctx.fillRect(hoverCol * CELL, 0, CELL, canvas.height);
  }

  // Column numbers along the top
  ctx.fillStyle = '#333';
  ctx.font = '11px Courier New';
  ctx.textAlign = 'center';
  for (let c = 0; c < COLS; c++) {
    ctx.fillText(c, c * CELL + CELL / 2, 12);
  }

  // Pieces
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      const val = grid[r][c];
      const isWinCell = winCells.some(([wr, wc]) => wr === r && wc === c);

      ctx.beginPath();
      ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = isWinCell ? COLORS.win
                    : val === 1 ? COLORS.player1
                    : val === 2 ? COLORS.player2
                    : COLORS.empty;
      ctx.fill();

      if (val === 0) {
        ctx.strokeStyle = '#1e1e1e';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}

function updateScoreboard() {
  document.getElementById('score-player').textContent = scores.player;
  document.getElementById('score-ai').textContent = scores.ai;
}

function setStatus(msg, highlight = false) {
  statusEl.textContent = msg;
  statusEl.className = highlight ? 'highlight' : '';
}

function findWinCells(grid) {
  const directions = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const player = grid[r][c];
      if (!player) continue;
      for (const [dr, dc] of directions) {
        const cells = [];
        for (let i = 0; i < 4; i++) {
          const nr = r + i * dr;
          const nc = c + i * dc;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) break;
          if (grid[nr][nc] !== player) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return [];
}

// GAME LOGIC

async function newGame() {
  if (activeSocket) { activeSocket.close(); activeSocket = null; }

  watchMode = false;
  gameOver  = false;
  winCells  = [];

  document.getElementById('btn-new').classList.add('active');
  document.getElementById('btn-watch').classList.remove('active');
  document.getElementById('turn-indicator').style.background = COLORS.player1;
  document.getElementById('turn-label').textContent = 'Your turn';

  const res  = await fetch(`${API}/game/new`, { method: 'POST' });
  const data = await res.json();
  gameId = data.game_id;
  grid   = data.grid;
  gameIdLabel.textContent = `game: ${gameId.slice(0, 8)}...`;
  setStatus('Click a column to drop your piece');
  drawBoard();
}

async function sendMove(col) {
  if (gameOver || watchMode || !gameId) return;

  setStatus('AI is thinking...');
  document.getElementById('turn-indicator').style.background = COLORS.player2;
  document.getElementById('turn-label').textContent = 'AI thinking...';

  const res = await fetch(`${API}/game/${gameId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ col }),
  });

  if (!res.ok) {
    setStatus('Invalid move — try another column');
    document.getElementById('turn-indicator').style.background = COLORS.player1;
    document.getElementById('turn-label').textContent = 'Your turn';
    return;
  }

  const data = await res.json();
  grid = data.grid;

  if (data.winner === 1) {
    winCells = findWinCells(grid);
    drawBoard();
    setStatus('You win! 🎉', true);
    document.getElementById('turn-label').textContent = 'You won!';
    scores.player++;
    updateScoreboard();
    gameOver = true;
  } else if (data.winner === 2) {
    winCells = findWinCells(grid);
    drawBoard();
    setStatus('AI wins!', true);
    document.getElementById('turn-label').textContent = 'AI won!';
    scores.ai++;
    updateScoreboard();
    gameOver = true;
  } else if (data.is_draw) {
    drawBoard();
    setStatus("It's a draw!");
    document.getElementById('turn-label').textContent = 'Draw!';
    gameOver = true;
  } else {
    drawBoard();
    setStatus(`AI played column ${data.ai_move} — your turn`);
    document.getElementById('turn-indicator').style.background = COLORS.player1;
    document.getElementById('turn-label').textContent = 'Your turn';
  }
}

async function watchAIvsAI() {
  if (activeSocket) { activeSocket.close(); activeSocket = null; }

  watchMode = true;
  gameOver  = false;
  winCells  = [];
  grid      = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

  document.getElementById('btn-watch').classList.add('active');
  document.getElementById('btn-new').classList.remove('active');
  document.getElementById('turn-label').textContent = 'AI vs AI';
  gameIdLabel.textContent = 'mode: AI vs AI';
  drawBoard();

 activeSocket = new WebSocket(`wss://connect4-ai-arena.onrender.com/game/live/watch`);
  const ws = activeSocket;

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.event === 'start') {
      setStatus('Watching AI vs AI live...');
    } else if (data.event === 'move') {
      grid = data.grid;
      const color = data.player === 1 ? COLORS.player1 : COLORS.player2;
      document.getElementById('turn-indicator').style.background = color;
      document.getElementById('turn-label').textContent = `Player ${data.player}`;
      drawBoard();
      setStatus(`Player ${data.player} → col ${data.col}  (${data.think_time_seconds}s)`);
    } else if (data.event === 'end') {
      winCells = findWinCells(grid);
      drawBoard();
      setStatus(data.message, true);
      document.getElementById('turn-label').textContent = 'Game over';
      gameOver = true;
    }
  };

  ws.onerror = () => setStatus('WebSocket error — is the server running?');
}

// EVENTS 

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  hoverCol = Math.floor((e.clientX - rect.left) / CELL);
  drawBoard();
});

canvas.addEventListener('mouseleave', () => {
  hoverCol = -1;
  drawBoard();
});

canvas.addEventListener('click', (e) => {
  if (gameOver || watchMode || !gameId) return;
  const rect = canvas.getBoundingClientRect();
  const col  = Math.floor((e.clientX - rect.left) / CELL);
  sendMove(col);
});

document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-watch').addEventListener('click', watchAIvsAI);

drawBoard();