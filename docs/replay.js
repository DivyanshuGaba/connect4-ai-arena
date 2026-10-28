(function () {
  'use strict';

  const { emptyGrid, findWinCells, createBoard, darkQuery } = window.C4;

  const API = 'https://api.connect4ai.com';

  const stage = document.getElementById('stage');
  const canvas = document.getElementById('board');
  const statusDisc = document.getElementById('status-disc');
  const statusTitle = document.getElementById('status-title');
  const statusDetail = document.getElementById('status-detail');
  const counter = document.getElementById('move-counter');
  const scrubber = document.getElementById('scrubber');
  const idInput = document.getElementById('game-id-input');
  const gameList = document.getElementById('game-list');
  const leaderboardList = document.getElementById('leaderboard-list');
  const btnFirst = document.getElementById('btn-first');
  const btnPrev = document.getElementById('btn-prev');
  const btnPlay = document.getElementById('btn-play');
  const btnNext = document.getElementById('btn-next');
  const btnLast = document.getElementById('btn-last');

  const board = createBoard(canvas, { strip: false });

  let grids = [emptyGrid()];   // index 0 is the empty board, then one snapshot per move
  let moves = [];              // { move_number, player, column } aligned with grids[1..]
  let meta = null;             // { winner, finished_at }
  let cursor = 0;
  let loadedId = null;
  let playTimer = null;

  /* ---------- Drawing ---------- */

  function draw() {
    const g = grids[cursor] || emptyGrid();
    const atEnd = cursor === grids.length - 1;
    const decided = meta && (meta.winner === 1 || meta.winner === 2);
    const last = cursor > 0 ? moves[cursor - 1] : null;
    let mark = null;
    if (last) {
      for (let r = 0; r < g.length; r++) {
        // The marked disc is the highest one in the column that was just played.
        if (g[r][last.column]) { mark = { row: r, col: last.column, player: last.player }; break; }
      }
    }
    board.render({
      grid: g,
      mark,
      win: atEnd && decided ? { cells: findWinCells(g), pulse: 1 } : null,
    });
  }

  function setStatus(kind, title, detail) {
    statusDisc.className = 'disc ' + kind;
    statusTitle.textContent = title;
    statusDetail.textContent = detail || '';
  }

  function setPlaying(on) {
    btnPlay.dataset.playing = on ? 'true' : 'false';
    btnPlay.setAttribute('aria-label', on ? 'Pause' : 'Play');
  }

  function update() {
    const total = grids.length - 1;
    const loaded = loadedId !== null;

    counter.textContent = loaded ? 'Move ' + cursor + ' of ' + total : 'No game loaded';
    scrubber.max = String(total);
    scrubber.value = String(cursor);
    scrubber.disabled = !loaded || total === 0;

    btnFirst.disabled = !loaded || cursor === 0;
    btnPrev.disabled = !loaded || cursor === 0;
    btnNext.disabled = !loaded || cursor === total;
    btnLast.disabled = !loaded || cursor === total;
    btnPlay.disabled = !loaded || total === 0;

    if (!loaded) return;

    const mv = cursor > 0 ? moves[cursor - 1] : null;
    const moveText = mv ? 'Move ' + mv.move_number + ': Player ' + mv.player + ' played column ' + (mv.column + 1) + '.' : '';

    if (cursor === 0) {
      setStatus('idle', 'Start of game', total + (total === 1 ? ' move' : ' moves') + ' to step through.');
    } else if (cursor === total && meta && (meta.winner === 1 || meta.winner === 2)) {
      setStatus('gold', 'Player ' + meta.winner + ' wins', moveText);
    } else if (cursor === total && meta && meta.winner === 0) {
      setStatus('idle', 'Draw', moveText);
    } else if (cursor === total && meta && !meta.finished_at) {
      setStatus(mv.player === 1 ? 'you' : 'ai', 'Game in progress', moveText + ' This is the latest move so far.');
    } else {
      setStatus(mv.player === 1 ? 'you' : 'ai', 'Move ' + mv.move_number, 'Player ' + mv.player + ' played column ' + (mv.column + 1) + '.');
    }
  }

  function goTo(i) {
    cursor = Math.max(0, Math.min(grids.length - 1, i));
    draw();
    update();
  }

  function stopAutoplay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    setPlaying(false);
  }

  /* ---------- Loading data ---------- */

  async function loadGame(id) {
    stopAutoplay();
    setStatus('idle', 'Loading game', 'Fetching the moves.');
    try {
      const res = await fetch(API + '/game/' + encodeURIComponent(id) + '/moves');
      if (res.status === 404) {
        setStatus('idle', 'No game with that id', 'Check the id and try again.');
        return;
      }
      if (!res.ok) throw new Error('Bad response');
      const data = await res.json();

      loadedId = id;
      meta = { winner: data.winner, finished_at: data.finished_at };
      moves = data.moves.map((m) => ({ move_number: m.move_number, player: m.player, column: m.column }));
      grids = [emptyGrid()].concat(data.moves.map((m) => m.grid_after));
      cursor = grids.length - 1;
      idInput.value = id;
      markActiveRow(id);
      draw();
      update();
    } catch (e) {
      setStatus('idle', "Can't reach the server", 'Check your connection and try again.');
    }
  }

  function markActiveRow(id) {
    gameList.querySelectorAll('.row').forEach((row) => {
      if (row.dataset.id === id) row.setAttribute('aria-current', 'true');
      else row.removeAttribute('aria-current');
    });
  }

  function timeAgo(iso) {
    if (!iso) return '';
    // The server sends UTC times without a zone marker.
    const stamp = /[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z';
    const seconds = Math.max(0, Math.round((Date.now() - new Date(stamp).getTime()) / 1000));
    if (isNaN(seconds)) return '';
    if (seconds < 60) return 'Just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + ' min ago';
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    const days = Math.round(hours / 24);
    return days + (days === 1 ? ' day ago' : ' days ago');
  }

  function note(list, text) {
    list.textContent = '';
    const li = document.createElement('li');
    li.className = 'empty-note';
    li.textContent = text;
    list.appendChild(li);
  }

  async function loadRecentGames() {
    try {
      const res = await fetch(API + '/games?limit=20');
      if (!res.ok) throw new Error('Bad response');
      const games = await res.json();
      if (!games.length) { note(gameList, 'No games yet. Play one and it shows up here.'); return; }

      gameList.textContent = '';
      games.forEach((g) => {
        let kind = 'idle';
        let result = 'Draw';
        if (!g.finished_at) { result = 'In progress'; }
        else if (g.winner === 1) { kind = 'you'; result = 'Player 1 won'; }
        else if (g.winner === 2) { kind = 'ai'; result = 'Player 2 won'; }

        const li = document.createElement('li');
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'row';
        row.dataset.id = g.game_id;

        const dot = document.createElement('span');
        dot.className = 'disc ' + kind;

        const main = document.createElement('span');
        main.className = 'row-main';
        const title = document.createElement('span');
        title.textContent = result;
        const sub = document.createElement('span');
        sub.className = 'row-sub';
        sub.textContent = timeAgo(g.created_at);
        main.append(title, sub);

        const id = document.createElement('span');
        id.className = 'row-id';
        id.textContent = g.game_id.slice(0, 8);

        row.append(dot, main, id);
        row.addEventListener('click', () => loadGame(g.game_id));
        li.appendChild(row);
        gameList.appendChild(li);
      });
      if (loadedId) markActiveRow(loadedId);
    } catch (e) {
      note(gameList, "Can't reach the server.");
    }
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch(API + '/leaderboard');
      if (!res.ok) throw new Error('Bad response');
      const rows = await res.json();
      if (!rows.length) { note(leaderboardList, 'No rated players yet.'); return; }

      leaderboardList.textContent = '';
      rows.forEach((row, i) => {
        const li = document.createElement('li');
        li.className = 'rank-row';
        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = String(i + 1);
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = row.username;
        const elo = document.createElement('span');
        elo.className = 'elo';
        elo.textContent = row.elo;
        li.append(rank, name, elo);
        leaderboardList.appendChild(li);
      });
    } catch (e) {
      note(leaderboardList, "Can't reach the server.");
    }
  }

  /* ---------- Input ---------- */

  document.getElementById('btn-load').addEventListener('click', () => {
    const id = idInput.value.trim();
    if (id) loadGame(id);
  });
  idInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-load').click();
  });

  btnFirst.addEventListener('click', () => { stopAutoplay(); goTo(0); });
  btnPrev.addEventListener('click', () => { stopAutoplay(); goTo(cursor - 1); });
  btnNext.addEventListener('click', () => { stopAutoplay(); goTo(cursor + 1); });
  btnLast.addEventListener('click', () => { stopAutoplay(); goTo(grids.length - 1); });
  scrubber.addEventListener('input', () => { stopAutoplay(); goTo(Number(scrubber.value)); });

  btnPlay.addEventListener('click', () => {
    if (playTimer) { stopAutoplay(); return; }
    if (cursor >= grids.length - 1) goTo(0);
    setPlaying(true);
    playTimer = setInterval(() => {
      if (cursor >= grids.length - 1) { stopAutoplay(); return; }
      goTo(cursor + 1);
    }, 700);
  });

  document.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (loadedId === null) return;
    if (e.key === 'ArrowLeft') { stopAutoplay(); goTo(cursor - 1); }
    else if (e.key === 'ArrowRight') { stopAutoplay(); goTo(cursor + 1); }
    else if (e.key === 'Home') { stopAutoplay(); goTo(0); }
    else if (e.key === 'End') { stopAutoplay(); goTo(grids.length - 1); }
    else return;
    e.preventDefault();
  });

  /* ---------- Sizing, theme, start ---------- */

  function fit() {
    board.resize(Math.min(stage.clientWidth, 620));
    draw();
  }

  if (typeof ResizeObserver === 'function') new ResizeObserver(fit).observe(stage);
  else window.addEventListener('resize', fit);

  function onThemeChange() { board.readTheme(); draw(); }
  window.addEventListener('c4-theme', onThemeChange);

  fit();
  update();
  loadRecentGames();
  loadLeaderboard();

  const requested = new URLSearchParams(window.location.search).get('game');
  if (requested) loadGame(requested);
})();