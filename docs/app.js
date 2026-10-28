(function () {
  'use strict';

  const { COLS, emptyGrid, dropRow, findWinCells, fallPosition, dropDuration, easeInOut, createBoard, motionQuery, darkQuery } = window.C4;

  const API = 'https://api.connect4ai.com';
  const WS_BASE = API.replace(/^http/, 'ws');

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
  const scoreYouDisc = document.getElementById('score-you-disc');
  const scoreYouName = document.getElementById('score-you-name');
  const scoreAiDisc = document.getElementById('score-ai-disc');
  const scoreAiName = document.getElementById('score-ai-name');
  const btnOnline = document.getElementById('btn-online');
  const inviteBox = document.getElementById('invite');
  const inviteLink = document.getElementById('invite-link');
  const btnCopy = document.getElementById('btn-copy');
  const onlineDialog = document.getElementById('online');
  const onlineTitle = document.getElementById('online-title');
  const onlineLead = document.getElementById('online-lead');
  const nameSaved = document.getElementById('name-saved');
  const nameShown = document.getElementById('name-shown');
  const nameEdit = document.getElementById('name-edit');
  const nameInput = document.getElementById('name-input');
  const nameError = document.getElementById('name-error');
  const btnChangeName = document.getElementById('btn-change-name');
  const btnQuick = document.getElementById('btn-quick');
  const btnFriend = document.getElementById('btn-friend');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const btnOnlineClose = document.getElementById('btn-online-close');

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
  let aiScores = { you: 0, ai: 0 };
  let onlineScores = { you: 0, ai: 0 };   // you = me, ai = my online opponent
  let scores = aiScores;

  // Online play. null when playing the AI or watching.
  let online = null;   // { phase, name, seat, token, friend, everConnected, oppName, myElo, retries, room }
  let turn = 1;        // whose turn it is in an online game
  let oppPresent = false;
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

  function mySeat() { return online && online.seat ? online.seat : 1; }

  function canHumanMove() {
    if (online) {
      return !!gameId && online.phase === 'game' && !gameOver && oppPresent && turn === mySeat() && !busy && falling.length === 0;
    }
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
          preview = { x: board.colX(col), y: board.geo.stripY, player: mySeat(), alpha: 0.95 };
          ghost = { col, row, player: mySeat() };
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

  function kindFor(seat) { return seat === 1 ? 'you' : 'ai'; }

  function applyScoreLabels() {
    if (online && online.seat) {
      scoreYouDisc.className = 'disc ' + kindFor(online.seat);
      scoreAiDisc.className = 'disc ' + kindFor(online.seat === 1 ? 2 : 1);
      scoreYouName.textContent = 'You' + (online.myElo ? ' (' + online.myElo + ')' : '');
      scoreAiName.textContent = online.oppName;
    } else {
      scoreYouDisc.className = 'disc you';
      scoreAiDisc.className = 'disc ai';
      scoreYouName.textContent = 'You';
      scoreAiName.textContent = 'AI';
    }
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

    let who;
    if (online) who = player === mySeat() ? 'You' : online.oppName;
    else who = watchMode ? 'Player ' + player : (player === 1 ? 'You' : 'AI');
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
    turn = 1;
    oppPresent = false;
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
    if (!leaveOnline(true)) return;
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
    if (online) { sendOnlineMove(col); return; }
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

  /* ---------- Playing another person online ---------- */

  const NAME_KEY = 'c4-name';
  const RECONNECT_TRIES = 8;
  let pendingRoom = null;   // game id from an invite link, until it is joined

  function savedName() {
    try { return (localStorage.getItem(NAME_KEY) || '').trim().slice(0, 20); } catch (e) { return ''; }
  }

  function saveName(name) {
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* storage unavailable */ }
  }

  function showNameError(message) {
    nameError.textContent = message || '';
    nameError.hidden = !message;
  }

  function showNameEditor(on) {
    nameEdit.hidden = !on;
    nameSaved.hidden = on || !nameShown.textContent;
    if (on) nameInput.focus();
  }

  function openOnlineDialog(room) {
    pendingRoom = room || null;
    const name = savedName();
    nameInput.value = name;
    nameShown.textContent = name;
    showNameError('');
    showNameEditor(!name);

    onlineTitle.textContent = room ? "Join a friend's game" : 'Play online';
    onlineLead.textContent = room
      ? 'A friend invited you to a game. Pick a name to join.'
      : 'Play another person in real time. Winning raises your rating, and the ratings are on the Replays and leaderboard page.';
    btnQuick.hidden = !!room;
    btnFriend.hidden = !!room;
    btnJoinRoom.hidden = !room;

    if (typeof onlineDialog.showModal === 'function') {
      if (!onlineDialog.open) onlineDialog.showModal();
      if (name) (room ? btnJoinRoom : btnQuick).focus();
    }
  }

  // Returns a valid name, or null after showing why not.
  function readName() {
    let name = nameEdit.hidden ? savedName() : nameInput.value.trim();
    name = name.replace(/\s+/g, ' ');
    if (!name) { showNameError('Enter a name to play online.'); showNameEditor(true); return null; }
    if (name.length > 20) { showNameError('Names can be up to 20 characters.'); return null; }
    saveName(name);
    return name;
  }

  function setOnlineButton() {
    btnOnline.textContent = !online ? 'Play online' : (online.phase === 'game' && !gameOver ? 'Leave game' : (online.phase === 'game' ? 'Play online' : 'Cancel'));
  }

  // Leaves any online session. Returns false if the player chose to stay.
  function leaveOnline(ask) {
    if (!online) return true;
    if (ask && online.phase === 'game' && !gameOver) {
      const ok = window.confirm('Leave this game? If you do not come back, your opponent wins.');
      if (!ok) return false;
    }
    closeSocket();
    online = null;
    scores = aiScores;
    updateScores();
    applyScoreLabels();
    inviteBox.hidden = true;
    setOnlineButton();
    return true;
  }

  function beginOnline(name, friend) {
    const mine = ++session;
    closeSocket();
    started = true;
    resetBoardState();
    watchMode = false;
    setMode('play');
    online = { phase: 'queue', name, seat: 0, token: '', friend: !!friend, everConnected: false, oppName: friend ? 'Friend' : 'Opponent', myElo: 0, retries: 0 };
    onlineScores = { you: 0, ai: 0 };
    scores = onlineScores;
    updateScores();
    applyScoreLabels();
    inviteBox.hidden = true;
    setOnlineButton();
    schedule();
    return mine;
  }

  function onlineFailed(mine, title, detail) {
    if (mine !== session) return;
    closeSocket();
    if (online) online.phase = 'failed';
    setStatus('idle', title, detail);
    setOnlineButton();
    schedule();
  }

  function startQuickMatch(name) {
    const mine = beginOnline(name, false);
    setStatus('idle', 'Looking for an opponent', 'Waiting for another player. Press Cancel to stop looking.', true);

    let ws;
    try {
      ws = new WebSocket(WS_BASE + '/matchmaking/queue?username=' + encodeURIComponent(name));
    } catch (e) {
      onlineFailed(mine, "Can't reach the server", 'Check your connection, then try again.');
      return;
    }
    socket = ws;
    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      if (mine !== session || data.event !== 'matched') return;
      ws.onclose = null;
      ws.onerror = null;
      startPlay(data, mine);
    };
    ws.onerror = () => onlineFailed(mine, "Can't reach the server", 'Check your connection, then try again.');
    ws.onclose = () => {
      if (mine === session && online && online.phase === 'queue') {
        onlineFailed(mine, 'Connection closed', 'The search stopped. Choose Play online to try again.');
      }
    };
  }

  async function postJson(path, body) {
    const res = await fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    return { ok: res.ok, status: res.status, data };
  }

  async function createRoom(name) {
    const mine = beginOnline(name, true);
    setStatus('idle', 'Creating a game', 'One moment.', true);
    try {
      const r = await postJson('/game/new/pvp', { username: name });
      if (mine !== session) return;
      if (!r.ok) throw new Error('Bad response');
      const link = window.location.origin + window.location.pathname + '?room=' + encodeURIComponent(r.data.game_id);
      inviteLink.value = link;
      inviteBox.hidden = false;
      startPlay(r.data, mine);
    } catch (e) {
      onlineFailed(mine, "Can't reach the server", 'Check your connection, then try again.');
    }
  }

  async function joinRoom(name, room) {
    const mine = beginOnline(name, true);
    setStatus('idle', 'Joining the game', 'One moment.', true);
    try {
      const r = await postJson('/game/' + encodeURIComponent(room) + '/join', { username: name });
      if (mine !== session) return;
      if (r.status === 404) { onlineFailed(mine, 'Game not found', 'The invite link is old or the game already ended. Ask your friend for a new one.'); return; }
      if (r.status === 400) { onlineFailed(mine, 'Game is full', 'Two players are already in this game.'); return; }
      if (!r.ok) throw new Error('Bad response');
      startPlay(r.data, mine);
    } catch (e) {
      onlineFailed(mine, "Can't reach the server", 'Check your connection, then try again.');
    }
  }

  function startPlay(info, mine) {
    if (mine !== session || !online) return;
    online.phase = 'game';
    online.seat = info.seat;
    online.token = info.token;
    online.myElo = info.elo || 0;
    online.retries = 0;
    gameId = info.game_id;
    applyScoreLabels();
    setOnlineButton();
    connectPlay(mine);
  }

  function connectPlay(mine) {
    let ws;
    try {
      ws = new WebSocket(WS_BASE + '/game/' + encodeURIComponent(gameId) + '/play?token=' + encodeURIComponent(online.token));
    } catch (e) {
      onlineFailed(mine, "Can't reach the server", 'Check your connection, then try again.');
      return;
    }
    socket = ws;
    oppPresent = false;
    socketQueue = Promise.resolve();

    ws.onmessage = (event) => {
      let data;
      try { data = JSON.parse(event.data); } catch (e) { return; }
      socketQueue = socketQueue.then(() => handlePlayEvent(data, mine)).catch(() => {});
    };
    ws.onclose = (event) => {
      if (mine !== session || !online || gameOver) return;
      if (event.code === 4404) { onlineFailed(mine, 'Game ended', 'This game is no longer running.'); return; }
      if (event.code === 4401) { onlineFailed(mine, "Can't rejoin", 'Your seat in this game could not be verified.'); return; }
      if (online.retries >= RECONNECT_TRIES) {
        onlineFailed(mine, 'Connection lost', 'Could not reconnect. Choose Play online to start a new game.');
        return;
      }
      online.retries++;
      oppPresent = false;
      setStatus('idle', 'Connection lost', 'Trying to reconnect.', true);
      schedule();
      setTimeout(() => { if (mine === session && online && !gameOver) connectPlay(mine); }, 1500);
    };
  }

  function updateTurnStatus() {
    if (!online || gameOver) return;
    const me = mySeat();
    if (!oppPresent) {
      if (online.friend && !online.everConnected) {
        setStatus(kindFor(me), 'Waiting for your friend', 'Send them the link below. The game starts when they join.', true);
      } else {
        setStatus('idle', online.oppName + ' is not connected', 'Waiting for them to come back.', true);
      }
    } else if (turn === me) {
      setStatus(kindFor(me), 'Your move', 'Click or tap a column to drop a disc.');
    } else {
      setStatus(kindFor(me === 1 ? 2 : 1), online.oppName + ' is thinking', 'Waiting for their move.', true);
    }
    schedule();
  }

  function finishOnline(data) {
    gameOver = true;
    busy = false;
    const me = mySeat();
    const winner = data.winner || 0;
    winCells = winner && !data.reason ? findWinCells(grid) : [];

    let eloText = '';
    if (data.elo && data.elo[String(me)] !== undefined) {
      const next = data.elo[String(me)];
      const diff = next - online.myElo;
      eloText = ' Your rating is now ' + next + ' (' + (diff >= 0 ? '+' : '') + diff + ').';
      online.myElo = next;
      applyScoreLabels();
    }

    if (winner === me) {
      scores.you++;
      setStatus('gold', 'You win', (data.reason === 'forfeit' ? 'Your opponent left the game.' : 'Four in a row.') + eloText);
    } else if (winner) {
      scores.ai++;
      setStatus(kindFor(winner), online.oppName + ' wins', 'Better luck next time.' + eloText);
    } else {
      setStatus('idle', 'Draw', 'The board is full.' + eloText);
    }
    updateScores();
    setOnlineButton();
    if (gameId) {
      replayLink.href = 'replay.html?game=' + encodeURIComponent(gameId);
      replayLink.hidden = false;
    }
    schedule();
  }

  async function handlePlayEvent(data, mine) {
    if (mine !== session || !online) return;

    if (data.event === 'sync') {
      online.seat = data.seat;
      falling.forEach((p) => p.resolve());
      falling = [];
      grid = data.grid;
      turn = data.current_player;
      busy = false;
      applyScoreLabels();
      updateTurnStatus();
    } else if (data.event === 'opponent_connected') {
      oppPresent = true;
      online.everConnected = true;
      inviteBox.hidden = true;
      updateTurnStatus();
    } else if (data.event === 'opponent_disconnected') {
      oppPresent = false;
      const secs = data.reconnect_window_seconds;
      setStatus('idle', online.oppName + ' disconnected', 'If they do not come back' + (secs ? ' within ' + secs + ' seconds' : '') + ', you win.', true);
      schedule();
    } else if (data.event === 'move') {
      const row = dropRow(data.col, grid);
      busy = false;
      if (row >= 0) {
        grid[row][data.col] = data.player;
        addLog(data.player, data.col);
        await drop({ col: data.col, row, player: data.player });
        if (mine !== session) return;
        lastMove = { row, col: data.col, player: data.player };
      }
      grid = data.grid;
      turn = data.current_player;
      if (!data.winner && !data.is_draw) updateTurnStatus();
      schedule();
    } else if (data.event === 'end') {
      await sleep(300);
      if (mine !== session) return;
      finishOnline(data);
    } else if (data.event === 'error') {
      busy = false;
      statusDetail.textContent = data.message || 'Something went wrong.';
    }
  }

  function sendOnlineMove(col) {
    const row = dropRow(col, grid);
    if (row < 0) {
      statusDetail.textContent = 'That column is full. Pick another.';
      return;
    }
    if (!socket || socket.readyState !== 1) return;
    busy = true;
    socket.send(JSON.stringify({ action: 'move', col }));
    const mine = session;
    setTimeout(() => { if (mine === session && busy) { busy = false; schedule(); } }, 4000);
  }

  function copyInvite() {
    const done = () => {
      btnCopy.textContent = 'Copied';
      setTimeout(() => { btnCopy.textContent = 'Copy link'; }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inviteLink.value).then(done, () => { inviteLink.select(); });
    } else {
      inviteLink.select();
      try { document.execCommand('copy'); done(); } catch (e) { /* user can copy by hand */ }
    }
  }

  btnOnline.addEventListener('click', () => {
    if (!online || online.phase === 'failed' || (online.phase === 'game' && gameOver)) {
      openOnlineDialog(null);
      return;
    }
    // Searching, waiting, or mid-game: go back to playing the AI.
    newGame();
  });

  btnChangeName.addEventListener('click', () => { showNameError(''); showNameEditor(true); });
  btnOnlineClose.addEventListener('click', () => onlineDialog.close());
  btnCopy.addEventListener('click', copyInvite);

  btnQuick.addEventListener('click', () => {
    const name = readName();
    if (!name) return;
    if (!leaveOnline(true)) return;
    onlineDialog.close('go');
    startQuickMatch(name);
  });
  btnFriend.addEventListener('click', () => {
    const name = readName();
    if (!name) return;
    if (!leaveOnline(true)) return;
    onlineDialog.close('go');
    createRoom(name);
  });
  btnJoinRoom.addEventListener('click', () => {
    const name = readName();
    if (!name || !pendingRoom) return;
    const room = pendingRoom;
    pendingRoom = null;
    onlineDialog.close('go');
    joinRoom(name, room);
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    (btnJoinRoom.hidden ? btnQuick : btnJoinRoom).click();
  });
  onlineDialog.addEventListener('click', (e) => { if (e.target === onlineDialog) onlineDialog.close(); });
  onlineDialog.addEventListener('close', () => {
    // Cancelled without starting anything: fall back to a normal game.
    if (!started && onlineDialog.returnValue !== 'go') newGame();
    onlineDialog.returnValue = '';
  });

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
    if (!leaveOnline(true)) return;
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

  const inviteRoom = new URLSearchParams(window.location.search).get('room');

  if (inviteRoom && typeof onlineDialog.showModal === 'function') {
    setStatus('idle', "Join a friend's game", 'Pick a name to join.');
    openOnlineDialog(inviteRoom);
  } else if (rulesSeen() || typeof dialog.showModal !== 'function') {
    newGame();
  } else {
    dialog.showModal();
  }
})();
