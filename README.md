# Connect 4 AI Arena

> 🎮 **Play the game:** https://d2fmd88qcyvnzc.cloudfront.net
>
> 📡 **Live API docs:** https://api.connect4ai.com/docs
>
> *(Also mirrored on GitHub Pages: https://divyanshugaba.github.io/connect4-ai-arena)*

A game-playing AI built from scratch in Python. Implements two approaches to the same problem, Minimax with alpha-beta pruning and Monte Carlo Tree Search (MCTS), served through a FastAPI backend with real-time WebSocket streaming so you can watch the AI think move by move. Deployed on AWS.

---

## Demo

- Click **New Game** to play against the Minimax AI
- Click **Watch AI vs AI** to watch two AIs compete live over WebSocket
- Click **Play online** to play another person live: **Find an opponent** uses matchmaking, **Play a friend** gives you an invite link. Results update an Elo rating shown on the leaderboard
- Winning pieces highlight in yellow when the game ends
- Score tracker updates across multiple games

---

## What this project demonstrates

- **Algorithms:** Minimax + alpha-beta pruning, MCTS with UCB1 selection, custom heuristic evaluation
- **API design:** FastAPI REST endpoints + WebSocket live streaming
- **Software engineering:** clean separation of engine / AI / API layers, pytest test suite, feature-branch git workflow with verified commits
- **Cloud deployment:** Dockerized backend on AWS (EC2, RDS, S3, CloudFront, Secrets Manager, CloudWatch), custom domain with HTTPS, CI via GitHub Actions

---

## Benchmark Results

All benchmarks run over 20 games on an M1 MacBook Pro.

| Matchup | P1 Wins | P2 Wins | Draws | P1 Avg Time/Game |
|---|---|---|---|---|
| Minimax (depth 4) vs Random | 20 | 0 | 0 | 0.111s |
| MCTS (500 iter) vs Random | 20 | 0 | 0 | 0.679s |
| Minimax (depth 4) vs MCTS (500 iter) | 20 | 0 | 0 | 0.193s |

**Key insight:** Minimax with a well-tuned heuristic outperforms MCTS at 500 iterations, both in win rate and speed (6x faster). MCTS needs significantly more iterations (5000+) to compete, at which point it becomes slower but more general since it requires no hand-crafted heuristic.

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
├── docs/                        # Web UI (served by S3/CloudFront and GitHub Pages)
│   ├── index.html               # Game page
│   ├── app.js                   # Game logic, API calls, WebSocket client
│   ├── replay.html              # Replay and leaderboard page
│   ├── replay.js                # Replay player logic
│   ├── board.js                 # Shared canvas board renderer
│   ├── theme.js                 # Light and dark mode toggle (light by default)
│   └── style.css                # Shared design system (light and dark themes)
├── tests/
│   └── test_board.py            # 9 pytest unit tests
├── benchmark.py                 # Algorithm benchmarking script
├── play_cli.py                  # Terminal-based human vs AI
├── test_ws.py                   # WebSocket test client
├── Dockerfile
├── docker-compose.yml
├── pytest.ini
├── requirements.txt
└── .github/workflows/tests.yml  # CI: runs on every push to main
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/game/new` | Create a new game |
| GET | `/game/{id}/state` | Get current board state |
| POST | `/game/{id}/move` | Make a move (AI responds automatically) |
| WS | `/game/{id}/watch` | Stream live AI vs AI game |
| POST | `/game/new/pvp` | Create a human vs human game (returns a seat token) |
| POST | `/game/{id}/join` | Take seat 2 of a human vs human game |
| WS | `/game/{id}/play?token=` | Live human vs human play, with reconnect window and forfeit |
| WS | `/matchmaking/queue?username=` | Redis-backed matchmaking queue |
| GET | `/leaderboard` | Top players by Elo |

Full interactive docs: https://api.connect4ai.com/docs

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

Then open `docs/index.html` with Live Server in VS Code. To make the frontend talk to your local backend, change the `API` constant at the top of `docs/app.js` to `http://localhost:8000` (it points at the live AWS backend by default).

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
| Data | PostgreSQL (AWS RDS), Redis (Upstash) |
| Frontend | HTML5 Canvas, Vanilla JS |
| Testing | pytest |
| Containerisation | Docker + Docker Compose |
| CI | GitHub Actions |
| Backend deployment | AWS EC2 + Nginx + Let's Encrypt |
| Frontend deployment | AWS S3 + CloudFront (mirrored on GitHub Pages) |

---

## AWS Deployment

The backend and frontend run on AWS, deployed and configured by hand through the console and SSH.

### Architecture

```
Browser
  -> CloudFront (HTTPS CDN) -> S3 (static frontend)
  -> api.connect4ai.com (HTTPS, Let's Encrypt)
       -> EC2 t3.micro (Amazon Linux 2023)
            -> Nginx reverse proxy (HTTP and WebSocket upgrade)
                 -> Docker container (FastAPI + Uvicorn on port 8000)
                      -> RDS PostgreSQL (private, reachable only from the EC2 security group)
                      -> Upstash Redis (matchmaking and game state)
```

### What is used

- **EC2:** single t3.micro instance running the backend in Docker with an automatic restart policy
- **RDS PostgreSQL:** managed database, public access disabled, access limited by security group
- **S3 + CloudFront:** static frontend hosting with Origin Access Control, so the bucket is not public
- **Nginx + Certbot:** reverse proxy with free auto-renewing SSL certificates (cron renewal)
- **DNS:** GoDaddy A record pointing api.connect4ai.com at the EC2 public IP
- **Secrets Manager:** DATABASE_URL and REDIS_URL are fetched at container launch using an IAM role attached to the instance, so no credentials are stored in commands, code, or the repo
- **IAM:** role for the instance with only the permissions it needs (Secrets Manager read, CloudWatch logging)
- **CloudWatch:** container logs streamed to a log group, plus alarms for failed status checks and CPU above 80 percent, delivered by email through SNS
- **AWS Budgets:** monthly cost alert

### Design notes

- Security groups act as the firewall: only SSH (from my IP), HTTP, and HTTPS are open to the internet; the database accepts traffic only from the backend instance.
- An HTTPS frontend cannot call an HTTP backend (browser mixed content rules), which is why the API has its own domain and certificate.
- The deployment is single instance by design to stay within free tier and credits. Scaling out would add an Application Load Balancer and an Auto Scaling group.

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
- [x] Frontend deployment (GitHub Pages)
- [x] AWS deployment (EC2, RDS, S3, CloudFront, HTTPS custom domain)
- [x] Secrets Manager for credentials, CloudWatch logs and alarms
- [x] Frontend redesign (light and dark themes, drop animation, hover preview, keyboard play, replay scrubber)
- [x] Online multiplayer in the web UI (matchmaking queue, invite links, Elo)
- [ ] Self-play neural network agent (stretch goal)