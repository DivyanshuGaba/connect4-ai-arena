# Connect 4 AI Arena

> 🎮 **Play the game:** https://divyanshugaba.github.io/connect4-ai-arena
> 
> 📡 **Live API docs:** https://connect4-ai-arena.onrender.com/docs
> 
> *(Free tier backend — may take ~50 seconds to wake up on first request)*

A game-playing AI built from scratch in Python. Implements two approaches to the same problem — Minimax with alpha-beta pruning and Monte Carlo Tree Search (MCTS) — served through a FastAPI backend with real-time WebSocket streaming so you can watch the AI think move by move.

---

## Demo

- Click **New Game** to play against the Minimax AI
- Click **Watch AI vs AI** to watch two AIs compete live over WebSocket
- Winning pieces highlight in yellow when the game ends
- Score tracker updates across multiple games

---

## What this project demonstrates

- **Algorithms** — Minimax + alpha-beta pruning, MCTS with UCB1 selection, custom heuristic evaluation
- **API design** — FastAPI REST endpoints + WebSocket live streaming
- **Software engineering** — clean separation of engine / AI / API layers, pytest test suite, feature-branch git workflow with verified commits
- **Deployment** — Dockerized, CI via GitHub Actions, backend on Render, frontend on GitHub Pages

---

## Benchmark Results

All benchmarks run over 20 games on an M1 MacBook Pro.

| Matchup | P1 Wins | P2 Wins | Draws | P1 Avg Time/Game |
|---|---|---|---|---|
| Minimax (depth 4) vs Random | 20 | 0 | 0 | 0.111s |
| MCTS (500 iter) vs Random | 20 | 0 | 0 | 0.679s |
| Minimax (depth 4) vs MCTS (500 iter) | 20 | 0 | 0 | 0.193s |

**Key insight:** Minimax with a well-tuned heuristic outperforms MCTS at 500 iterations — both in win rate and speed (6x faster). MCTS needs significantly more iterations (5000+) to compete, at which point it becomes slower but more general since it requires no hand-crafted heuristic.

---

## Project Structure

```
connect4-ai-arena/
├── engine/                      # Game rules
│   ├── board.py                 # Board state, move logic, win/draw detection
│   └── __init__.py
├── ai/                          # AI algorithms
│   ├── heuristics.py            # Position evaluation function
│   ├── minimax.py               # Minimax + alpha-beta pruning
│   ├── mcts.py                  # Monte Carlo Tree Search with UCB1
│   └── __init__.py
├── api/                         # FastAPI backend
│   ├── main.py                  # REST endpoints + WebSocket streaming
│   └── __init__.py
├── frontend/                    # Web UI
│   ├── index.html               # Canvas board
│   └── app.js                   # Game logic, API calls, WebSocket client
├── tests/
│   └── test_board.py            # 9 pytest unit tests
├── benchmark.py                 # Algorithm benchmarking script
├── play_cli.py                  # Terminal-based human vs AI
├── test_ws.py                   # WebSocket test client
├── Dockerfile
├── docker-compose.yml
├── pytest.ini
├── requirements.txt
└── .github/workflows/tests.yml  # CI — runs on every push to main
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/game/new` | Create a new game |
| GET | `/game/{id}/state` | Get current board state |
| POST | `/game/{id}/move` | Make a move (AI responds automatically) |
| WS | `/game/{id}/watch` | Stream live AI vs AI game |

Full interactive docs: https://connect4-ai-arena.onrender.com/docs

---

## Running Locally

```bash
git clone https://github.com/DivyanshuGaba/connect4-ai-arena.git
cd connect4-ai-arena
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload
```

Then open `frontend/index.html` with Live Server in VS Code.

**Or with Docker:**
```bash
docker compose up --build
```

**Run tests:**
```bash
pytest
```

**Run benchmarks:**
```bash
python3 benchmark.py
```

**Play in terminal:**
```bash
python3 play_cli.py
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.12 |
| API | FastAPI + WebSockets |
| AI | Minimax, Alpha-Beta Pruning, MCTS |
| Frontend | HTML5 Canvas, Vanilla JS |
| Testing | pytest |
| Containerisation | Docker + Docker Compose |
| CI | GitHub Actions |
| Backend deployment | Render (free tier) |
| Frontend deployment | GitHub Pages |

---

## Roadmap

- [x] Game engine (board, moves, win/draw detection)
- [x] pytest suite (9 tests)
- [x] Terminal-playable CLI prototype
- [x] Minimax AI with alpha-beta pruning
- [x] Heuristic position evaluation
- [x] FastAPI backend with REST endpoints
- [x] WebSocket live streaming
- [x] Canvas-based web frontend
- [x] Score tracker + win highlighting
- [x] MCTS implementation with UCB1
- [x] Algorithm benchmark (Minimax vs MCTS vs Random)
- [x] Docker + docker-compose
- [x] GitHub Actions CI pipeline
- [x] Live backend deployment (Render)
- [x] Live frontend deployment (GitHub Pages)
- [ ] Self-play neural network agent (stretch goal)
- [ ] Frontend UI polish (animations, piece drop effect)