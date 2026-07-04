const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const gameIdLabel = document.getElementById('game-id-label');

const COLS = 7;
const ROWS = 6;
const CELL = 80;
const RADIUS = 30;
const API = 'http://127.0.0.1:8000';

const COLORS = {
  board:   '#1a1a2e',
  empty:   '#0d0d0d',
  player1: '#c0392b',
  player2: '#2980b9',
  hover:   'rgba(192, 57, 43, 0.2)',
};

let gameId = null;
let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let gameOver = false;
let hoverCol = -1;
let watchMode = false;
let activeSocket = null;

function drawBoard() {
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (hoverCol >= 0 && !gameOver && !watchMode) {
    ctx.fillStyle = COLORS.hover;
    ctx.fillRect(hoverCol * CELL, 0, CELL, canvas.height);
  }

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL + CELL / 2;
      const y = r * CELL + CELL / 2;
      const val = grid[r][c];

      ctx.beginPath();
      ctx.arc(x, y, RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = val === 1 ? COLORS.player1
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

function setStatus(msg, highlight = false) {
  statusEl.textContent = msg;
  statusEl.className = highlight ? 'highlight' : '';
}

async function newGame() {
    if (activeSocket) {
    activeSocket.close();
    activeSocket = null;
  }
  watchMode = false;
  gameOver = false;
  document.getElementById('btn-new').classList.add('active');
  document.getElementById('btn-watch').classList.remove('active');

  const res = await fetch(`${API}/game/new`, { method: 'POST' });
  const data = await res.json();
  gameId = data.game_id;
  grid = data.grid;
  gameIdLabel.textContent = `game: ${gameId.slice(0, 8)}...`;
  setStatus('Your turn — click a column to drop a piece');
  drawBoard();
}

async function sendMove(col) {
  if (gameOver || watchMode) return;
  setStatus('AI is thinking...');

  const res = await fetch(`${API}/game/${gameId}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ col }),
  });

  if (!res.ok) {
    setStatus('Invalid move — try another column');
    return;
  }

  const data = await res.json();
  grid = data.grid;
  drawBoard();

  if (data.winner === 1) {
    setStatus('You win! 🎉', true); gameOver = true;
  } else if (data.winner === 2) {
    setStatus('AI wins!', true); gameOver = true;
  } else if (data.is_draw) {
    setStatus("It's a draw!"); gameOver = true;
  } else {
    setStatus(`AI played column ${data.ai_move} — your turn`);
  }
}

async function watchAIvsAI() {
  watchMode = true;
  gameOver = false;
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  document.getElementById('btn-watch').classList.add('active');
  document.getElementById('btn-new').classList.remove('active');
  gameIdLabel.textContent = 'mode: AI vs AI';
  drawBoard();

  activeSocket = new WebSocket(`ws://127.0.0.1:8000/game/live/watch`);
  const ws = activeSocket;

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.event === 'start') {
      setStatus('AI vs AI — watching live...');
    } else if (data.event === 'move') {
      grid = data.grid;
      drawBoard();
      setStatus(`Player ${data.player} → col ${data.col}  (${data.think_time_seconds}s)`);
    } else if (data.event === 'end') {
      setStatus(data.message, true);
      gameOver = true;
    }
  };

  ws.onerror = () => setStatus('WebSocket error — is the server running?');
}

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
  const col = Math.floor((e.clientX - rect.left) / CELL);
  sendMove(col);
});

document.getElementById('btn-new').addEventListener('click', newGame);
document.getElementById('btn-watch').addEventListener('click', watchAIvsAI);

drawBoard();