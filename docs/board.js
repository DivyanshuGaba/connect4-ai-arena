/*
 * Shared board renderer for the game page and the replay page.
 *
 * The board is drawn like the real thing: discs sit behind a front panel and
 * show through the holes. Colours come from the CSS custom properties in
 * style.css, so light and dark themes both work.
 */
(function () {
  'use strict';

  const COLS = 7;
  const ROWS = 6;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function emptyGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  }

  // Lowest empty row in a column, or -1 if the column is full. Row 0 is the top.
  function dropRow(col, grid) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[r][col] === 0) return r;
    }
    return -1;
  }

  function findWinCells(g) {
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = g[r][c];
        if (!p) continue;
        for (const [dr, dc] of dirs) {
          const cells = [];
          for (let i = 0; i < 4; i++) {
            const nr = r + i * dr;
            const nc = c + i * dc;
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

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // Disc falls with gravity, then rebounds slightly and settles.
  function fallPosition(t, y0, y1, bounce) {
    if (t >= 1) return y1;
    const split = 0.78;
    if (t < split) {
      const s = t / split;
      return y0 + (y1 - y0) * s * s;
    }
    const u = (t - split) / (1 - split);
    return y1 - bounce * Math.sin(u * Math.PI) * (1 - u);
  }

  function dropDuration(row) {
    return 240 + (row + 1) * 55;
  }

  function roundRectPath(path, x, y, w, h, r) {
    path.moveTo(x + r, y);
    path.arcTo(x + w, y, x + w, y + h, r);
    path.arcTo(x + w, y + h, x, y + h, r);
    path.arcTo(x, y + h, x, y, r);
    path.arcTo(x, y, x + w, y, r);
    path.closePath();
  }

  function createBoard(canvas, options) {
    const hasStrip = !(options && options.strip === false);
    const ctx = canvas.getContext('2d');
    const geo = {
      cell: 0, pad: 0, top: 0, w: 0, h: 0, dpr: 1,
      hole: 0, disc: 0, stripY: 0, radius: 0,
    };
    const discCache = new Map();
    let theme = null;

    function readTheme() {
      const s = getComputedStyle(document.documentElement);
      const v = (name) => s.getPropertyValue(name).trim();
      theme = {
        face: v('--board-face'),
        faceHi: v('--board-face-hi'),
        back: v('--board-back'),
        p1: [v('--you-hi'), v('--you'), v('--you-lo')],
        p2: [v('--ai-hi'), v('--ai'), v('--ai-lo')],
        gold: v('--gold'),
      };
      discCache.clear();
    }

    function resize(widthCss) {
      if (!(widthCss > 40)) return;   // not laid out yet
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const cell = widthCss / (COLS + 0.36);
      geo.dpr = dpr;
      geo.cell = cell;
      geo.pad = cell * 0.18;
      geo.top = hasStrip ? cell * 0.95 : 0;
      geo.w = cell * COLS + 2 * geo.pad;
      geo.h = geo.top + 2 * geo.pad + cell * ROWS;
      geo.hole = cell * 0.4;
      geo.disc = cell * 0.42;
      geo.stripY = geo.top * 0.5;
      geo.radius = cell * 0.22;

      canvas.style.width = geo.w + 'px';
      canvas.style.height = geo.h + 'px';
      canvas.width = Math.round(geo.w * dpr);
      canvas.height = Math.round(geo.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      discCache.clear();
    }

    function colX(c) { return geo.pad + c * geo.cell + geo.cell / 2; }
    function rowY(r) { return geo.top + geo.pad + r * geo.cell + geo.cell / 2; }

    function colFromClientX(clientX) {
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const c = Math.floor((x - geo.pad) / geo.cell);
      return Math.max(0, Math.min(COLS - 1, c));
    }

    function discImage(player) {
      const key = player + ':' + Math.round(geo.disc * 10) + ':' + geo.dpr;
      let img = discCache.get(key);
      if (img) return img;

      const r = geo.disc;
      const margin = 2;
      const size = (r + margin) * 2;
      const off = document.createElement('canvas');
      off.width = Math.ceil(size * geo.dpr);
      off.height = off.width;
      const oc = off.getContext('2d');
      oc.scale(geo.dpr, geo.dpr);
      const c = r + margin;
      const [hi, mid, lo] = player === 1 ? theme.p1 : theme.p2;

      let g = oc.createRadialGradient(c - r * 0.35, c - r * 0.4, r * 0.05, c, c, r);
      g.addColorStop(0, hi);
      g.addColorStop(0.55, mid);
      g.addColorStop(1, lo);
      oc.fillStyle = g;
      oc.beginPath();
      oc.arc(c, c, r, 0, Math.PI * 2);
      oc.fill();

      // Stamped ring, like the real discs have.
      oc.lineWidth = Math.max(1, r * 0.07);
      oc.strokeStyle = lo;
      oc.globalAlpha = 0.45;
      oc.beginPath();
      oc.arc(c, c, r * 0.64, 0, Math.PI * 2);
      oc.stroke();

      g = oc.createLinearGradient(c, c - r * 0.6, c, c + r * 0.6);
      g.addColorStop(0, 'rgba(0,0,0,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0.10)');
      oc.globalAlpha = 1;
      oc.fillStyle = g;
      oc.beginPath();
      oc.arc(c, c, r * 0.6, 0, Math.PI * 2);
      oc.fill();

      img = { canvas: off, size };
      discCache.set(key, img);
      return img;
    }

    function drawDisc(x, y, player, alpha) {
      const img = discImage(player);
      ctx.globalAlpha = alpha === undefined ? 1 : alpha;
      ctx.drawImage(img.canvas, x - img.size / 2, y - img.size / 2, img.size, img.size);
      ctx.globalAlpha = 1;
    }

    /*
     * s = {
     *   grid,                       // ROWS x COLS array of 0/1/2
     *   skip: Set('row,col'),       // cells whose disc is still falling
     *   falling: [{x, y, player}],
     *   preview: {x, y, player, alpha},   // disc hovering above the board
     *   ghost: {col, row, player},        // where the hovered disc would land
     *   hoverCol,                         // column to tint, or -1
     *   mark: {row, col, player},         // last move marker
     *   win: {cells, pulse},              // winning four
     * }
     */
    function render(s) {
      if (!theme) readTheme();
      if (geo.cell < 8) return;       // board has not been sized yet
      const { cell, pad, top, w, h, hole, radius } = geo;
      ctx.clearRect(0, 0, w, h);

      // Back panel, seen through the holes.
      const back = new Path2D();
      roundRectPath(back, 0, top, w, h - top, radius);
      ctx.fillStyle = theme.back;
      ctx.fill(back);

      if (s.ghost) drawDisc(colX(s.ghost.col), rowY(s.ghost.row), s.ghost.player, 0.3);

      const grid = s.grid;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const v = grid[r][c];
          if (!v) continue;
          if (s.skip && s.skip.has(r + ',' + c)) continue;
          drawDisc(colX(c), rowY(r), v, 1);
        }
      }
      if (s.falling) s.falling.forEach((p) => drawDisc(p.x, p.y, p.player, 1));

      // Front panel with 42 holes cut out.
      const face = new Path2D();
      roundRectPath(face, 0, top, w, h - top, radius);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = colX(c);
          const y = rowY(r);
          face.moveTo(x + hole, y);
          face.arc(x, y, hole, 0, Math.PI * 2);
        }
      }
      const fg = ctx.createLinearGradient(0, top, 0, h);
      fg.addColorStop(0, theme.faceHi);
      fg.addColorStop(1, theme.face);
      ctx.fillStyle = fg;
      ctx.fill(face, 'evenodd');

      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = 1;
      const edge = new Path2D();
      roundRectPath(edge, 0.5, top + 0.5, w - 1, h - top - 1, radius);
      ctx.stroke(edge);

      // Recessed look for each hole: shadow on top, light on the bottom lip.
      const rim = Math.max(1.5, cell * 0.05);
      ctx.lineWidth = rim;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = colX(c);
          const y = rowY(r);
          ctx.strokeStyle = 'rgba(0,0,0,0.30)';
          ctx.beginPath();
          ctx.arc(x, y, hole - rim / 2, Math.PI * 1.05, Math.PI * 1.95);
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.12)';
          ctx.beginPath();
          ctx.arc(x, y, hole - rim / 2, Math.PI * 0.05, Math.PI * 0.95);
          ctx.stroke();
        }
      }

      if (s.hoverCol !== undefined && s.hoverCol >= 0) {
        const p = new Path2D();
        roundRectPath(p, pad + s.hoverCol * cell + cell * 0.04, top + pad * 0.6, cell * 0.92, cell * ROWS + pad * 0.8, cell * 0.2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fill(p);
      }

      if (s.mark) {
        ctx.beginPath();
        ctx.arc(colX(s.mark.col), rowY(s.mark.row), Math.max(2, cell * 0.07), 0, Math.PI * 2);
        ctx.fillStyle = s.mark.player === 1 ? 'rgba(255,255,255,0.9)' : theme.p2[2];
        ctx.fill();
      }

      if (s.win && s.win.cells.length) {
        const cells = s.win.cells;
        const first = cells[0];
        const last = cells[cells.length - 1];
        ctx.save();
        ctx.shadowColor = theme.gold;
        ctx.shadowBlur = cell * (0.12 + 0.18 * s.win.pulse);
        ctx.strokeStyle = theme.gold;
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = cell * 0.08;
        ctx.beginPath();
        ctx.moveTo(colX(first[1]), rowY(first[0]));
        ctx.lineTo(colX(last[1]), rowY(last[0]));
        ctx.stroke();
        ctx.globalAlpha = 0.55 + 0.45 * s.win.pulse;
        ctx.lineWidth = cell * 0.06;
        cells.forEach(([r, c]) => {
          ctx.beginPath();
          ctx.arc(colX(c), rowY(r), hole + cell * 0.03, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.restore();
      }

      if (s.preview) drawDisc(s.preview.x, s.preview.y, s.preview.player, s.preview.alpha);
    }

    readTheme();

    return { geo, resize, render, readTheme, colX, rowY, colFromClientX };
  }

  window.C4 = {
    COLS, ROWS, emptyGrid, dropRow, findWinCells,
    easeInOut, fallPosition, dropDuration, createBoard,
    motionQuery, darkQuery,
  };
})();
