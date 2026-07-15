# Connect 4 AI Arena

> Live API: https://connect4-ai-arena.onrender.com/docs
> *(Free tier — may take ~50 seconds to wake up on first request)*

A game-playing AI built from scratch in Python. Implements three approaches to 
the same problem — Minimax with alpha-beta pruning, Monte Carlo Tree Search (MCTS), 
and a planned self-play neural net — served through a FastAPI backend with 
real-time WebSocket streaming so you can watch the AI think move by move.

---

## What this project demonstrates

- **Algorithms** — Minimax + alpha-beta pruning, MCTS with UCB1 selection
- **API design** — FastAPI REST endpoints + WebSocket live streaming
- **Software engineering** — clean separation of engine / AI / API layers, 
  pytest test suite, feature-branch git workflow
- **Deployment** — Dockerized, CI via GitHub Actions, deployed live on Render

---

## Benchmark Results

All benchmarks run over 20 games on an M1 MacBook Pro.

| Matchup | Player 1 Wins | Player 2 Wins | Draws | P1 Avg Time/Game |
|---|---|---|---|---|
| Minimax (depth 4) vs Random | 20 | 0 | 0 | 0.111s |
| MCTS (500 iter) vs Random | 20 | 0 | 0 | 0.679s |
| Minimax (depth 4) vs MCTS (500 iter) | 20 | 0 | 0 | 0.193s |

**Key insight:** Minimax with a well-tuned heuristic outperforms MCTS at 500 
iterations — both in win rate and speed. MCTS needs significantly more iterations 
(5000+) to compete, at which point it becomes slower but more general 
(no hand-crafted heuristic needed).

---

## Project Structure


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

Or with Docker:
```bash
docker compose up --build
```

Then open `frontend/index.html` in your browser and click **New Game**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | Python 3.12 |
| API | FastAPI + WebSockets |
| AI | Minimax, Alpha-Beta Pruning, MCTS |
| Frontend | HTML5 Canvas, Vanilla JS |
| Testing | pytest |
| Deployment | Docker, Render |
| CI | GitHub Actions |

---

## Roadmap

- [x] Game engine (board, moves, win/draw detection)
- [x] Minimax AI with alpha-beta pruning
- [x] Heuristic position evaluation
- [x] FastAPI backend with REST endpoints
- [x] WebSocket live streaming
- [x] Canvas-based web frontend
- [x] MCTS implementation
- [x] Algorithm benchmark (Minimax vs MCTS vs Random)
- [x] Docker + GitHub Actions CI
- [x] Live deployment
- [ ] Self-play neural network agent (stretch goal)
- [ ] Frontend UI polish