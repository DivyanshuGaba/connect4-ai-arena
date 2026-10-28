(function () {
  'use strict';

  const { COLS, emptyGrid, dropRow, findWinCells, fallPosition, dropDuration, easeInOut, createBoard, motionQuery, darkQuery } = window.C4;

  const API = 'https://api.connect4ai.com';

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('board');
  const statusDisc = document.getElementById('status-disc');
  const statusTitle = document.getElementById('status-title');
  const statusDetail = document.getElementById('status-detail');
  const scoreYouEl = document.getElementById('score-you');
  const scoreAiEl = document.getElementById('score-ai');
  const btnNew = document.getElementById('btn-new');
  const btnWatch = document.getElementById('btn-watch');
  const btnRules = document.getElementById('btn-rules');
  const btnStart = document.getElementById('btn-start');
  const dialog = document.getElementById('rules');
  const moveLog = document.getElementById('move-log');
  const logEmpty = document.getElementById('log-empty');
  const replayLink = document.getElementById('replay-link');

  const board = createBoard(canvas);

  // Game state
  let gameId = null;
  let grid = emptyGrid();
  let gameOver = false;
  let watchMode = false;
  let busy = false;          // a human turn is in progress
  let started = false;
  let session = 0;           // bumped on every new game so stale async work is ignored
  let socket = null;
  let socketQueue = Promise.resolve();
  let scores = { you: 0, ai: 0 };
  let winCells = [];
  let lastMove = null;
  let moveCount = 0;

  // Input state
  let hoverCol = -1;
  let kbCol = -1;

  // Animation state
  let falling = [];
  let thinking = null;       // { start, x } while the AI is choosing
  let raf = 0;

  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  /* ---------- Rendering loop ---------- */

  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function isAnimating() {
    return falling.length > 0 || !!thinking || (winCells.length > 0 && !motionQuery.matches);
  }

  function canHumanMove() {
    return !!gameId && !gameOver && !watchMode && !busy && falling.length === 0;
  }

  function frame(now) {
    raf = 0;
    const g = board.geo;

    if (thinking) {
      thinking.x = board.colX(3) + Math.sin(((now - thinking.start) / 1700) * Math.PI * 2) * g.cell * 3;
    }

    for (let i = falling.length - 1; i >= 0; i--) {
      const p = falling[i];
      const toX = board.colX(p.col);
      const toY = board.rowY(p.row);
      const elapsed = now - p.start;
      if (motionQuery.matches || elapsed >= p.glide + p.fall) {
        falling.splice(i, 1);
        p.resolve();
        continue;
      }
      if (elapsed < p.glide) {
        const t = easeInOut(elapsed / p.glide);
        p.x = p.fromX + (toX - p.fromX) * t;
        p.y = g.stripY;
      } else {
        p.x = toX;
        p.y = fallPosition((elapsed - p.glide) / p.fall, g.stripY, toY, g.cell * 0.07);
      }
    }

    draw(now);
    if (isAnimating()) schedule();
  }

  function draw(now) {
    let preview = null;
    let ghost = null;
    let tintCol = -1;

    if (thinking) {
      preview = { x: thinking.x, y: board.geo.stripY, player: 2, alpha: 0.92 };
    } else if (canHumanMove()) {
      const col = hoverCol >= 0 ? hoverCol : kbCol;
      if (col >= 0) {
        const row = dropRow(col, grid);
        if (row >= 0) {
          tintCol = col;
          preview = { x: board.colX(col), y: board.geo.stripY, player: 1, alpha: 0.95 };
          ghost = { col, row, player: 1 };
        }
      }
    }

    const pulse = motionQuery.matches ? 1 : (Math.sin((now || 0) / 340) + 1) / 2;

    board.render({
      grid,
      skip: new Set(falling.map((p) => p.row + ',' + p.col)),
      falling,
      preview,
      ghost,
      hoverCol: tintCol,
      mark: falling.length ? null : lastMove,
      win: winCells.length ? { cells: winCells, pulse } : null,
    });
  }

  function drop(piece) {
    return new Promise((resolve) => {
      falling.push({
        col: piece.col,
        row: piece.row,
        player: piece.player,
        fromX: piece.fromX,
        glide: piece.fromX === undefined ? 0 : 220,
        fall: dropDuration(piece.row),
        start: performance.now(),
        x: board.colX(piece.col),
        y: board.geo.stripY,
        resolve,
      });
      schedule();
    });
  }

  function startThinking() {
    thinking = { start: performance.now(), x: board.colX(3) };
    schedule();
  }

  /* ---------- Interface helpers ---------- */

  function setStatus(kind, title, detail, pulse) {
    statusDisc.className = 'disc ' + kind + (pulse ? ' pulse' : '');
    statusTitle.textContent = title;
    statusDetail.textContent = detail || '';
  }

  function updateScores() {
    scoreYouEl.textContent = scores.you;
    scoreAiEl.textContent = scores.ai;
  }

  function setMode(mode) {
    btnWatch.setAttribute('aria-pressed', mode === 'watch' ? 'true' : 'false');
  }

  function addLog(player, col, seconds) {
    logEmpty.hidden = true;
    moveCount++;
    const li = document.createElement('li');
    li.className = 'log-item';

    const dot = document.createElement('span');
    dot.className = 'disc ' + (player === 1 ? 'you' : 'ai');

    const who = watchMode ? 'Player ' + player : (player === 1 ? 'You' : 'AI');
    const text = document.createElement('span');
    text.textContent = who + ', column ' + (col + 1);

    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = seconds === undefined ? '' : Number(seconds).toFixed(2) + 's';

    li.append(dot, text, time);
    moveLog.appendChild(li);
    moveLog.scrollTop = moveLog.scrollHeight;
  }

  function removeLastLog() {
    if (moveLog.lastElementChild) {
      moveLog.lastElementChild.remove();
      moveCount--;
    }
    if (moveCount <= 0) logEmpty.hidden = false;
  }

  function resetBoardState() {
    gameId = null;
    grid = emptyGrid();
    gameOver = false;
    busy = false;
    winCells = [];
    lastMove = null;
    falling = [];
    thinking = null;
    moveCount = 0;
    moveLog.textContent = '';
    logEmpty.hidden = false;
    replayLink.hidden = true;
  }

  function closeSocket() {
    if (socket) {
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(); } catch (e) { /* already closed */ }
      socket = null;
    }
  }

  /* ---------- Playing against the AI ---------- */

  async function newGame() {
    const mine = ++session;
    closeSocket();
    started = true;
    resetBoardState();
    watchMode = false;
    setMode('play');
    setStatus('idle', 'Getting ready', 'Setting up the board.');
    schedule();

    try {
      const res = await fetch(API + '/game/new', { method: 'POST' });
      if (!res.ok) throw new Error('Bad response');
      const data = await res.json();
      if (mine !== session) return;
      gameId = data.game_id;
      grid = data.grid;
      setStatus('you', 'Your move', 'Click or tap a column to drop a disc.');
    } catch (e) {
      if (mine !== session) return;
      gameId = null;
      setStatus('idle', "Can't reach the server", 'Check your connection, then choose New game.');
    }
    schedule();
  }

  function endGame(winner, isDraw) {
    gameOver = true;
    busy = false;
    thinking = null;
    winCells = winner ? findWinCells(grid) : [];

    if (winner === 1) {
      scores.you++;
      setStatus('gold', 'You win', 'Four in a row.');
    } else if (winner === 2) {
      scores.ai++;
      setStatus('ai', 'AI wins', 'It searches several moves ahead. Start a new game to try again.');
    } else if (isDraw) {
      setStatus('idle', 'Draw', 'The board is full.');
    }
    updateScores();
    if (gameId) {
      replayLink.href = 'replay.html?game=' + encodeURIComponent(gameId);
      replayLink.hidden = false;
    }
    schedule();
  }

  async function sendMove(col) {
    if (!canHumanMove()) return;
    const row = dropRow(col, grid);
    if (row < 0) {
      statusDetail.textContent = 'That column is full. Pick another.';
      return;
    }

    const mine = session;
    busy = true;
    grid[row][col] = 1;
    addLog(1, col);
    setStatus('ai', 'AI is thinking', 'Searching several moves ahead.', true);

    const request = fetch(API + '/game/' + gameId + '/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ col }),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    await drop({ col, row, player: 1 });
    if (mine !== session) return;
    lastMove = { row, col, player: 1 };

    startThinking();
    const thinkStart = performance.now();
    const data = await request;
    if (mine !== session) return;

    if (!data) {
      thinking = null;
      grid[row][col] = 0;
      lastMove = null;
      removeLastLog();
      busy = false;
      setStatus('you', 'Move not sent', 'The server did not respond. Try that column again.');
      schedule();
      return;
    }

    // The game ended on the human's move, so the AI does not reply.
    if (data.ai_move === undefined) {
      thinking = null;
      grid = data.grid;
      endGame(data.winner === 1 ? 1 : 0, !!data.is_draw && !data.winner);
      return;
    }

    // Keep the search animation on screen long enough to read.
    await sleep(Math.max(0, 520 - (performance.now() - thinkStart)));
    if (mine !== session) return;

    const aiCol = data.ai_move;
    const aiRow = dropRow(aiCol, grid);
    const fromX = thinking ? thinking.x : board.colX(3);
    thinking = null;

    if (aiRow >= 0) {
      grid[aiRow][aiCol] = 2;
      addLog(2, aiCol);
      await drop({ col: aiCol, row: aiRow, player: 2, fromX });
      if (mine !== session) return;
      lastMove = { row: aiRow, col: aiCol, player: 2 };
    }

    grid = data.grid;
    if (data.winner === 2) {
      endGame(2, false);
    } else if (data.is_draw && !data.winner) {
      endGame(0, true);
    } else {
      busy = false;
      setStatus('you', 'Your move', 'AI played column ' + (aiCol + 1) + '.');
      schedule();
    }
  }

  /* ---------- Watching AI vs AI ---------- */

  async function handleWatchEvent(data, mine) {
    if (mine !== session) return;

    if (data.event === 'start') {
      setStatus('idle', 'Watching AI vs AI', 'Two minimax players, live.');
    } else if (data.event === 'move') {
      const row = dropRow(data.col, grid);
      if (row < 0) { grid = data.grid; schedule(); return; }
      const seconds = Number(data.think_time_seconds);
      setStatus(
        data.player === 1 ? 'you' : 'ai',
        'Player ' + data.player + ' moves',
        'Column ' + (data.col + 1) + (isNaN(seconds) ? '.' : ', ' + seconds.toFixed(2) + 's of thinking.')
      );
      grid[row][data.col] = data.player;
      addLog(data.player, data.col, isNaN(seconds) ? undefined : seconds);
      await drop({ col: data.col, row, player: data.player });
      if (mine !== session) return;
      lastMove = { row, col: data.col, player: data.player };
      grid = data.grid;
      schedule();
    } else if (data.event === 'end') {
      await sleep(300);
      if (mine !== session) return;
      gameOver = true;
      winCells = findWinCells(grid);
      setStatus(data.winner ? 'gold' : 'idle', data.winner ? 'Player ' + data.winner + ' wins' : 'Draw', data.message || '');
      schedule();
    }
  }

  function watchAI() {
    const mine = ++session;
    closeSocket();
    started = true;
    resetBoardState();
    watchMode = true;
    socketQueue = Promise.resolve();
    setMode('watch');
    setStatus('idle', 'Connecting', 'Opening a live game between two AIs.');
    schedule();

    const wsUrl = API.replace('https', 'wss').replace('http', 'ws');
    let failed = false;
    let ws;
    try {
      ws = new WebSocket(wsUrl + '/game/live/watch');
    } catch (e) {
      setStatus('idle', "Can't reach the server", 'Check your connection, then try again.');
      return;
    }
    socket = ws;

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      socketQueue = socketQueue.then(() => handleWatchEvent(data, mine));
    };
    ws.onerror = () => {
      failed = true;
      if (mine === session) setStatus('idle', "Can't reach the server", 'Check your connection, then try again.');
    };
    ws.onclose = () => {
      if (mine === session && !gameOver && !failed) {
        setStatus('idle', 'Connection closed', 'The live game stopped before it finished.');
      }
    };
  }

  /* ---------- Input ---------- */

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const col = board.colFromClientX(e.clientX);
    if (col !== hoverCol) { hoverCol = col; schedule(); }
  });

  canvas.addEventListener('pointerleave', () => {
    if (hoverCol !== -1) { hoverCol = -1; schedule(); }
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    hoverCol = board.colFromClientX(e.clientX);
    schedule();
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    hoverCol = -1;
    schedule();
  });

  canvas.addEventListener('click', (e) => {
    sendMove(board.colFromClientX(e.clientX));
  });

  canvas.addEventListener('focus', () => {
    let viaKeyboard = false;
    try { viaKeyboard = canvas.matches(':focus-visible'); } catch (e) { /* unsupported */ }
    if (viaKeyboard && kbCol < 0) { kbCol = 3; schedule(); }
  });

  canvas.addEventListener('blur', () => {
    kbCol = -1;
    schedule();
  });

  canvas.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') {
      kbCol = Math.max(0, (kbCol < 0 ? 3 : kbCol) - 1);
    } else if (e.key === 'ArrowRight') {
      kbCol = Math.min(COLS - 1, (kbCol < 0 ? 3 : kbCol) + 1);
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      if (kbCol >= 0) sendMove(kbCol);
    } else if (/^[1-7]$/.test(e.key)) {
      kbCol = Number(e.key) - 1;
      sendMove(kbCol);
    } else {
      return;
    }
    e.preventDefault();
    schedule();
  });

  btnNew.addEventListener('click', newGame);
  btnWatch.addEventListener('click', watchAI);

  /* ---------- Rules dialog ---------- */

  const SEEN_KEY = 'c4-rules-seen';

  function rulesSeen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; }
  }

  function markRulesSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* storage unavailable */ }
  }

  btnRules.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
  });
  btnStart.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    markRulesSeen();
    if (!started) newGame();
  });

  /* ---------- Sizing and theme ---------- */

  function fit() {
    board.resize(Math.min(stage.clientWidth, 620));
    schedule();
  }

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(fit).observe(stage);
  } else {
    window.addEventListener('resize', fit);
  }

  function onThemeChange() {
    board.readTheme();
    schedule();
  }
  window.addEventListener('c4-theme', onThemeChange);

  /* ---------- Start ---------- */

  fit();
  updateScores();
  setStatus('idle', 'Getting ready', 'Read the rules, then start playing.');

  if (rulesSeen() || typeof dialog.showModal !== 'function') {
    newGame();
  } else {
    dialog.showModal();
  }
})();
