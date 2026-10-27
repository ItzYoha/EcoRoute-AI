# EcoRoute AI — Predictive Load Balancer & Horizontal Auto-Scaler

**Core Engineering Team:** M Yoharudran Atsilia · Riddhi Saxena

---

## 1. Project Overview
**EcoRoute AI** is a decoupled, microservices-based load-balancing and horizontal autoscaling system. It separates the live HTTP routing pathway (**Data Plane**) from the machine-learning forecasting and container-reconciliation engine (**Control Plane**).

Incoming client traffic is routed by a **Node.js / Express** load balancer across six selectable load-balancing algorithms while recording request telemetry in **Redis**. A **Python / FastAPI** control plane reads five-minute request-rate history, forecasts workload **15 minutes ahead** using a trained **Scikit-Learn Random Forest Regressor**, and proactively reconciles **Docker** backend instances before predicted traffic peaks arrive. Monitoring and performance evaluation are provided through a **React + Vite** operational dashboard and a three-tab **R / Shiny** statistical evaluation app.

---

## 2. Problem Statement & Motivation
Traditional cloud autoscalers operate **reactively**: they wait until average CPU utilization or request latency crosses a high threshold before launching new server instances. Because pulling container images, booting processes, and warming up connections takes time (cold-start delay), sudden traffic spikes can overwhelm existing instances before new capacity comes online.

EcoRoute AI addresses this by:
1. Continuously aggregating five-minute request-per-second (RPS) intervals in Redis and exporting them to a structured time-series CSV.
2. Using historical lag and rolling-window features to forecast demand **15 minutes into the future** (`3 × 5-minute` steps).
3. Provisioning or removing Docker backend containers proactively and updating the load balancer's active backend registry without dropping live routing state.

---

## 3. Objectives & Key Features
- **Decoupled Data & Control Planes**: Keep live request forwarding fast in Node.js (Port `8000`) while running ML inference and Docker management asynchronously in Python/FastAPI (Port `5000`).
- **Six Runtime-Switchable Load-Balancing Algorithms**: Switch between Round Robin, Weighted Round Robin, Least Connections, Weighted Least Connections, Least Response Time, and Power of Two Choices via REST API or UI without restarting the gateway.
- **15-Minute Ahead ML Workload Forecasting**: Leakage-free time-series feature engineering trained on 30 days of 5-minute traffic intervals (`RandomForestRegressor`, 200 trees).
- **Automated Docker Horizontal Scaling**: Periodically reconciles running `ecoroute-backend-<n>` containers (between `2` and `10` instances) based on predicted RPS and registers active host ports (`5001`–`5010`) with the gateway.
- **Built-in Traffic Simulator**: Generates controlled HTTP traffic through the real load balancer using five selectable traffic shapes (`steady`, `ramp_up`, `spike`, `ramp_up_down`, `spike_drop`).
- **Dual Dashboards**:
  - **React + Vite Web Dashboard** (Port `5173`) for live control, algorithm switching, and traffic simulation.
  - **R / Shiny Analytics App** (Port `3838`) for live RPS distribution monitoring, fixed-capacity 6-algorithm benchmarking, and predictive autoscaling evaluation.

---

## 4. System Architecture

```mermaid
flowchart TB
    Client["Client / Built-in Traffic Simulator<br/>(POST /demo/start)"] -->|HTTP Requests| LB["Data Plane Gateway<br/>Node.js + Express (Port 8000)"]

    subgraph DataPlane["Data Plane (data-plane-gateway)"]
        LB --> Algo["Algorithm Selector<br/>(RR, WRR, LC, WLC, LRT, P2C)"]
        Algo -->|Proxy HTTP| B1["Backend 1<br/>ecoroute-backend-1 (Port 5001)"]
        Algo -->|Proxy HTTP| B2["Backend 2<br/>ecoroute-backend-2 (Port 5002)"]
        Algo -.->|Scaled Out| BN["Backend 3..10<br/>ecoroute-backend-N (Ports 5003..5010)"]
    end

    LB -->|lPush rps_metrics (5m)<br/>lPush response_times (per req)| Redis[("Redis Store<br/>(Port 6379)")]

    subgraph ControlPlane["Control Plane (control-plane-brain)"]
        Collector["collect_live_data.py<br/>(Polls Redis every 30s)"]
        CSV[("live_rps_with_intervals.csv")]
        FastAPI["FastAPI Brain + Autoscaler<br/>main.py (Port 5000)"]
        Model["RandomForestRegressor<br/>forecasting_model.joblib"]
        Bench["run_benchmark.py<br/>(6-Algorithm Evaluator)"]
    end

    Redis -->|lrange rps_metrics| Collector
    Collector -->|Append new 5m rows| CSV
    CSV -->|Read latest 13 rows| FastAPI
    Model --> FastAPI
    FastAPI -->|Docker SDK: start/stop containers| BN
    FastAPI -->|PUT /api/backends| LB
    Bench -->|Control /demo & /api/algorithm<br/>Read response_times| Redis

    subgraph Dashboards["Monitoring & Analytics"]
        ReactUI["React + Vite Dashboard<br/>(Port 5173)"]
        RShiny["R / Shiny Analytics App<br/>R-Analytics/app.R (Port 3838)"]
    end

    ReactUI <-->|GET/PUT :8000 & :5000| LB
    ReactUI <--> FastAPI
    CSV --> RShiny
    Bench -->|benchmark_summary.csv<br/>benchmark_requests.csv| RShiny
```

---

## 5. Technology Stack

| Layer | Technology | Purpose in EcoRoute AI |
| :--- | :--- | :--- |
| **Data Plane Gateway** | Node.js, Express (`^5.2.1`) | Reverse proxy on port `8000`, request routing, connection/latency tracking, and metrics API. |
| **In-Memory Telemetry** | Redis (`^6.2.1` JS / `8.1.0` Py) | Stores per-request latencies (`response_times`), 5-minute RPS summaries (`rps_metrics`), and active backend list (`active_backends`). |
| **Control Plane API** | Python 3, FastAPI (`0.141.1`), Uvicorn | Hosts `/predict`, `/instances`, `/demo/*` endpoints and runs the background 60-second autoscaling loop on port `5000`. |
| **Machine Learning** | Scikit-Learn (`1.9.0`), Pandas, NumPy, Joblib | Feature engineering, model training (`LinearRegression`, `RandomForestRegressor`, `GradientBoostingRegressor`), and 15-minute ahead RPS inference. |
| **Container Orchestration** | Docker Engine + Python `docker` SDK (`7.2.0`) | Runs `ecoroute-backend:latest` worker containers and dynamically scales instances `ecoroute-backend-1..10`. |
| **Operational Frontend** | React, Vite, Recharts, Lucide React | Real-time web dashboard on port `5173` for telemetry viewing, algorithm selection, and traffic simulation. |
| **Statistical Analytics** | R (`shiny`, `ggplot2`, `readr`) | Three-tab evaluation app (`R-Analytics/app.R`) for live monitoring, algorithm comparison, and autoscaling analysis. |

---

## 6. Project Directory Structure

```text
EcoRoute-AI/
├── README.md                                  # Root project documentation
├── .gitignore
├── docs/
│   ├── USER_MANUAL_AND_INSTALLATION_GUIDE.md  # Step-by-step setup, execution & troubleshooting guide
│   └── ECOROUTE_AI_STUDY_NOTES.md             # Viva study notes, math walkthroughs & Q&A
├── data-plane-gateway/                        # Node.js Data Plane & Backend Workers
│   ├── Dockerfile                             # Builds ecoroute-backend:latest (Node 20 Alpine, port 5001)
│   ├── package.json / package-lock.json
│   ├── load_balancer.js                       # Express gateway server & Redis telemetry producer (port 8000)
│   ├── server.js                              # Backend worker server 1 / container entrypoint (port 5001)
│   ├── server2.js                             # Local standalone backend worker server 2 (port 5002)
│   ├── algorithmRegistry.js                   # Holds currently selected algorithm ID in memory
│   ├── testAlgorithm.js                       # Unit smoke test for Power of Two Choices algorithm
│   └── algorithms/                            # Load-balancing algorithm modules
│       ├── index.js                           # Algorithm resolver
│       ├── roundRobin.js
│       ├── weightedRoundRobin.js
│       ├── leastConnections.js
│       ├── weightedLeastConnections.js
│       ├── leastResponseTime.js
│       └── powerOfTwoChoices.js
├── control-plane-brain/                       # Python Control Plane, ML Pipeline & Benchmark Runner
│   ├── requirements.txt                       # Locked Python dependencies
│   ├── main.py                                # FastAPI app, /predict, Docker autoscaler & /demo simulator
│   ├── collect_live_data.py                   # Polls Redis rps_metrics every 30s -> live_rps_with_intervals.csv
│   ├── generate_traffic.py                    # Generates 30-day synthetic training dataset
│   ├── train_model.py                         # Trains & evaluates Linear, RF, and GBR models
│   ├── run_benchmark.py                       # Fixed-capacity 2-backend benchmark runner for all 6 algorithms
│   ├── redis_test.py                          # Utility script to inspect Redis connectivity and rps_metrics
│   ├── data/
│   │   ├── raw/
│   │   │   └── traffic_simulation.csv         # 8,640-row synthetic 5-min dataset (30 days)
│   │   └── gold/
│   │       ├── live_rps.csv                   # Legacy 20-row live RPS file
│       │   ├── live_rps_with_intervals.csv    # Active 5-min RPS telemetry read by /predict and R/Shiny
│       │   ├── predictions_export.csv         # 1,725 held-out test-set predictions from train_model.py
│       │   ├── benchmark_summary.csv          # Per-algorithm summary metrics from run_benchmark.py
│       │   └── benchmark_requests.csv         # Per-request latency & server attribution from run_benchmark.py
│   └── models/
│       ├── forecasting_model.joblib           # Trained RandomForestRegressor artifact
│       ├── model_features.joblib              # Ordered list of 10 input feature names
│       └── model_metadata.json                # Test R², MAE, and feature importances
├── ecoroute-ai-dashboard/                     # React + Vite Operational UI (port 5173)
│   ├── package.json / vite.config.js / index.html
│   └── src/
│       ├── main.jsx / App.jsx / styles.css
│       ├── services/api.js                    # API client targeting localhost:8000 and localhost:5000
│       ├── data/mockData.js                   # Fallback defaults when backend endpoints are offline
│       └── components/                        # UI cards, charts, AlgorithmSelector, TrafficSimulator
└── R-Analytics/
    └── app.R                                  # 3-tab R/Shiny evaluation dashboard
```

---

## 7. Request & Telemetry Lifecycle
1. **Incoming Request**: A client or the built-in traffic simulator sends an HTTP request to `http://localhost:8000/`.
2. **Gateway Accounting**: `load_balancer.js` increments `requestCount` (for the 5-minute summary window) and appends `Date.now()` to `recentRequestTimestamps` (used to calculate real-time 10-second RPS in `GET /api/metrics`).
3. **Backend Selection**: `load_balancer.js` looks up the active algorithm from `algorithmRegistry.js` and invokes `selectServer(servers)` to pick one backend URL (e.g., `http://localhost:5001`).
4. **Connection Tracking**: If the active algorithm tracks in-flight connections (`least_connections`, `weighted_least_connections`, or `power_of_two`), `tracker.incrementConnections(server)` is called before forwarding and `tracker.decrementConnections(server)` is guaranteed to run inside the `finally` block.
5. **Forwarding & Per-Request Telemetry**: The gateway forwards the request via `fetch(server + req.originalUrl)`, measures `responseTime = Date.now() - startTime`, updates `leastResponseTime.recordResponseTime(server, responseTime)`, and pushes `{ server, responseTime, timestamp }` to the Redis list `response_times`.
6. **5-Minute RPS Aggregation**: Every 5 minutes (`300,000 ms`), `saveRpsMeasurement()` computes `rps = requestCount / elapsedSeconds` and pushes `{ rps, timestamp, interval_start, interval_end, duration_seconds }` to the Redis list `rps_metrics`.
7. **CSV Persistence**: `collect_live_data.py` polls Redis `rps_metrics` every 30 seconds and appends new intervals to `control-plane-brain/data/gold/live_rps_with_intervals.csv`.

---

## 8. How the Forecasting Model Predicts Future Load
- **Sampling Cadence & Horizon**: The model operates on 5-minute intervals and forecasts request rate **15 minutes ahead** (`FORECAST_HORIZON_STEPS = 3`).
- **Continuity Validation**: When `GET /predict` is called in `control-plane-brain/main.py`, it reads `live_rps_with_intervals.csv`, sorts by UTC timestamp, and checks consecutive timestamp differences (`300 seconds ± 30 seconds`). Whenever a gap exceeds tolerance, a new sequence is started. The latest continuous sequence must contain at least **13 consecutive samples** (60 minutes of uninterrupted history); otherwise `/predict` returns HTTP `422`.
- **10 Input Features**: Constructed strictly from the latest 13 consecutive rows (`recent.iloc[-1]` is current time $t$):
  1. `hour_of_day` (`0`–`23`)
  2. `day_of_week` (`0`=Mon .. `6`=Sun)
  3. `is_weekend` (`1` if Sat/Sun else `0`)
  4. `requests_per_second` (latest observed RPS at $t$, `rps.iloc[-1]`)
  5. `lag_1` (5 min ago, `rps.iloc[-2]`)
  6. `lag_3` (15 min ago, `rps.iloc[-4]`)
  7. `lag_6` (30 min ago, `rps.iloc[-7]`)
  8. `rolling_mean_6` (mean of `rps.iloc[-7:-1]`, trailing 30-min window)
  9. `rolling_mean_12` (mean of `rps.iloc[:-1]`, trailing 60-min window)
  10. `rolling_std_6` (standard deviation of `rps.iloc[-7:-1]`)
- **Inference & Confidence Proxy**: `forecasting_model.joblib` (`RandomForestRegressor` with 200 trees, `max_depth=10`) predicts the future RPS. Disagreement across the 200 trees (`spread = std(tree_predictions)`) is converted into a heuristic indicator `confidence_proxy = round(100 / (1 + spread), 1)`.

---

## 9. How Predictive Autoscaling Works
Configured in `control-plane-brain/main.py`:
- `CAPACITY_PER_INSTANCE = 250` RPS
- `TARGET_UTILIZATION = 0.75` (effective capacity per instance = $250 \times 0.75 = 187.5\text{ RPS}$)
- `MIN_INSTANCES = 2`, `MAX_INSTANCES = 10`
- **Sizing Formula**:
  $$\text{required\_instances} = \left\lceil \frac{\text{predicted\_rps}}{250 \times 0.75} \right\rceil, \quad \text{desired\_instances} = \min(10, \max(2, \text{required\_instances}))$$
- **Reconciliation Loop (`autoscaling_loop`)**:
  - Runs every **60 seconds** (`AUTO_SCALE_INTERVAL_SECONDS = 60`).
  - Enforces a **300-second cooldown** (`AUTO_SCALE_COOLDOWN_SECONDS = 300`) between capacity changes.
  - Requires baseline containers `ecoroute-backend-1` (host port `5001`) and `ecoroute-backend-2` (host port `5002`) to be running.
  - **Scale-Out**: Starts new detached containers `ecoroute-backend-<N>` from image `ecoroute-backend:latest` mapping container port `5001/tcp` to host port `5000 + N`, waits until `container.status == "running"`, and updates the gateway via `PUT http://localhost:8000/api/backends`.
  - **Scale-In**: First updates the gateway via `PUT /api/backends` with only the retained instances (so no new requests are routed to terminating containers), then stops and removes excess containers in reverse numeric order.

---

## 10. Purpose of the R/Shiny Analytics Dashboard
Located at `R-Analytics/app.R`, the Shiny app provides three implementation-focused evaluation tabs:
1. **Tab 1 — Live Monitoring**: Polls `live_rps_with_intervals.csv` every 5 seconds and plots the live RPS time series and RPS frequency distribution histogram.
2. **Tab 2 — Algorithm Comparison**: Displays the fixed-capacity (2-backend) benchmark results from `benchmark_summary.csv` and `benchmark_requests.csv`, comparing achieved throughput (`traffic_window_rps` and `achieved_rps`), per-backend request splits (`:5001` vs `:5002`), and per-request response latency distributions across all 6 algorithms. Shows an explicit empty state if no benchmark CSV exists.
3. **Tab 3 — Predictive Autoscaling**:
   - **Section A**: Displays the live snapshot from `GET http://localhost:5000/instances` alongside the measured live RPS curve from `live_rps_with_intervals.csv`.
   - **Section B**: Evaluates held-out test-set predictions from `predictions_export.csv` (Actual vs. 15-Minute Predicted RPS) and plots formula-derived target instance counts (`clamp(ceiling(RPS / 187.5), 2, 10)`).

---

## 11. Implemented Load-Balancing Algorithms
All six algorithms live in `data-plane-gateway/algorithms/`:

| Algorithm ID | File | Working Principle in Code |
| :--- | :--- | :--- |
| `round_robin` | `roundRobin.js` | Sequential cyclic selection (`servers[currentIndex % servers.length]`). Default algorithm. |
| `weighted_round_robin` | `weightedRoundRobin.js` | Smooth weighted selection using configured weights (`:5001`=5, `:5002`=3, `:5003`=2, `:5004`=4, `:5005`=1; default `1`). |
| `least_connections` | `leastConnections.js` | Selects the backend with the lowest in-flight `activeConnections[server]` count; ties break toward earlier servers in `servers`. |
| `weighted_least_connections` | `weightedLeastConnections.js` | Selects the backend minimizing `activeConnections[server] / weight` using the same weight map (`:5001`=5, `:5002`=3, etc.). |
| `least_response_time` | `leastResponseTime.js` | Probes any unvisited backend (`count === 0`) first, then selects the backend with the lowest mean response time (`totalTime / count`). Resets history when selected via `PUT /api/algorithm`. |
| `power_of_two` | `powerOfTwoChoices.js` | Picks two distinct backends uniformly at random and routes to whichever has fewer active connections (`firstLoad <= secondLoad`). |

---

## 12. Installation & Setup Prerequisites
- **Operating System**: Windows 10/11 with PowerShell.
- **Node.js**: v20+ (with `npm`).
- **Python**: Python 3.11+ (with `venv` and `pip`).
- **Docker Desktop**: Running Linux containers (required for Redis container and Docker-based backend containers).
- **R**: R 4.x with `Rscript` (`C:\Program Files\R\R-4.5.2\bin\Rscript.exe`) and packages `shiny`, `ggplot2`, and `readr`.

---

## 13. Exact Commands to Start Each Service (Windows PowerShell)

### Step 1: Start Redis (Port 6379) & Baseline Backend Containers (Ports 5001, 5002)
```powershell
# Start Redis if not already running
docker run -d --name ecoroute-redis -p 6379:6379 redis:alpine

# Build backend image and start baseline containers ecoroute-backend-1 and ecoroute-backend-2
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\data-plane-gateway
docker build -t ecoroute-backend:latest .
docker run -d --name ecoroute-backend-1 -p 5001:5001 --restart unless-stopped ecoroute-backend:latest
docker run -d --name ecoroute-backend-2 -p 5002:5001 --restart unless-stopped ecoroute-backend:latest
```
*(Alternative without Docker for backends: run `node server.js` on port 5001 and `node server2.js` on port 5002 in separate terminals; note that Docker autoscaling in `main.py` requires the two Docker containers above.)*

### Step 2: Start Data Plane Load Balancer (Port 8000)
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\data-plane-gateway
npm install
node load_balancer.js
```

### Step 3: Start Control Plane API (Port 5000) & Live Data Collector
```powershell
# Terminal A: Control Plane FastAPI Server (must use port 5000)
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\control-plane-brain
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 5000

# Terminal B: Redis-to-CSV Live Collector
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\control-plane-brain
.\.venv\Scripts\Activate.ps1
python collect_live_data.py
```

### Step 4: Start React Dashboard (Port 5173)
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\ecoroute-ai-dashboard
npm install
npm run dev
```

### Step 5: Start R / Shiny Analytics Dashboard (Port 3838)
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\R-Analytics
& "C:\Program Files\R\R-4.5.2\bin\Rscript.exe" -e "shiny::runApp('app.R', port=3838, launch.browser=TRUE)"
```

---

## 14. Generating Traffic & Running the Six-Algorithm Benchmark
- **Interactive Traffic Generation**: Open the React dashboard (`http://localhost:5173`), scroll to **Traffic Simulator**, choose a target RPS (`1–1000`), traffic pattern (`steady`, `ramp_up`, `spike`, `ramp_up_down`, `spike_drop`), and duration (`5–3600` seconds), or invoke `POST http://localhost:5000/demo/start`.
- **Six-Algorithm Fixed-Capacity Benchmark**:
  ```powershell
  Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\control-plane-brain
  .\.venv\Scripts\python.exe run_benchmark.py --rps 25 --duration 30
  ```
  This verifies that exactly 2 backends (`:5001` and `:5002`) are active, switches through each of the 6 algorithms via `PUT /api/algorithm`, verifies selection via `GET /api/algorithm`, runs a 30-second steady workload at 25 RPS, isolates the run's Redis `response_times` records, and writes `data/gold/benchmark_summary.csv` and `data/gold/benchmark_requests.csv`.

---

## 15. Opening & Interpreting the Analytics Dashboard
Open `http://127.0.0.1:3838` in your browser when running `R-Analytics/app.R`:
- **Tab 1 (Live Monitoring)**: Inspect the five-minute RPS curve and histogram recorded from Redis into `live_rps_with_intervals.csv`.
- **Tab 2 (Algorithm Comparison)**: Compare `traffic_window_rps` (requests divided by active request timestamp span) and `achieved_rps`, latency percentiles (`mean`, `median`, `p95`), and per-backend request counts (`:5001` vs `:5002`).
- **Tab 3 (Predictive Autoscaling)**: Check the live `/instances` snapshot and compare held-out test-set predictions (`predictions_export.csv`) against actual RPS and formula-derived instance counts.

---

## 16. Implemented API Endpoints

### Data Plane Gateway (`http://localhost:8000`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check (`{ status: "ok", service: "EcoRoute AI Load Balancer" }`). |
| `GET` | `/api/algorithm` | Returns `{ algorithm, availableAlgorithms }`. |
| `PUT` | `/api/algorithm` | Updates active routing algorithm (`{ "algorithm": "round_robin" }`). |
| `PUT` | `/api/backends` | Updates active backend URL list (`{ "servers": ["http://localhost:5001", ...] }`). |
| `GET` | `/api/metrics` | Returns 10s `currentRps`, `avgResponseTime`, and latest 20 items from `rps_metrics` and `response_times`. |
| `ALL` | `/*` | Proxies request to the backend selected by the active algorithm and logs response latency to Redis. |

### Control Plane Brain (`http://localhost:5000`)
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/health` | Health check (`{ status: "ok", service: "EcoRoute AI Prediction API", model_loaded: true }`). |
| `GET` | `/predict` | Forecasts RPS 15 minutes ahead from the latest 13 consecutive 5-minute rows of `live_rps_with_intervals.csv`. |
| `GET` | `/instances` | Returns running `ecoroute-backend-<n>` Docker containers and `latest_autoscaling_status`. |
| `POST` | `/demo/start` | Starts background HTTP traffic simulation (`target_rps`, `duration_seconds`, `pattern`). |
| `GET` | `/demo/status` | Returns running simulation progress (`total_requests`, `successful_requests`, `failed_requests`, `actual_rps`). |
| `POST` | `/demo/stop` | Stops an active traffic simulation. |

---

## 17. Data Files & Model Artifacts

| File Path | Purpose |
| :--- | :--- |
| `control-plane-brain/data/raw/traffic_simulation.csv` | 8,640-row synthetic 30-day training dataset generated by `generate_traffic.py`. |
| `control-plane-brain/data/gold/live_rps_with_intervals.csv` | Live 5-minute RPS intervals collected from Redis `rps_metrics` by `collect_live_data.py` and read by `/predict` and `app.R`. |
| `control-plane-brain/data/gold/live_rps.csv` | Earlier 20-row two-column (`timestamp,rps`) CSV retained from initial prototyping. |
| `control-plane-brain/data/gold/predictions_export.csv` | 1,725 held-out test-set rows exported by `train_model.py` (`Predicted_Workload`, `Actual_Workload`, `Prediction_Confidence`, `Actual_Is_Spike`). |
| `control-plane-brain/data/gold/benchmark_summary.csv` | Summary table for the 6-algorithm fixed-capacity benchmark generated by `run_benchmark.py`. |
| `control-plane-brain/data/gold/benchmark_requests.csv` | Per-request latency records (`4,500` rows across 6 algorithms) extracted from Redis during `run_benchmark.py`. |
| `control-plane-brain/models/forecasting_model.joblib` | Serialized `RandomForestRegressor` trained by `train_model.py`. |
| `control-plane-brain/models/model_features.joblib` | Serialized list of the 10 feature column names required by `forecasting_model.joblib`. |
| `control-plane-brain/models/model_metadata.json` | Training/test metrics (`test_r2 = 0.3322`, `test_mae_rps = 50.58`) and feature importances. |

---

## 18. Known Limitations & Troubleshooting
- **60-Minute Cold Start for Live `/predict`**: `/predict` requires 13 consecutive rows spaced 5 minutes apart (`±30s`). If `collect_live_data.py` and `load_balancer.js` are stopped and restarted after a gap, `/predict` returns HTTP `422` until 13 new 5-minute intervals (60 minutes) accumulate.
- **No Persistent Live Autoscaling History**: `latest_autoscaling_status` in `main.py` is stored in memory only; historical live Docker instance counts and live predictions are not persisted to CSV.
- **Unattributed Gateway Failures**: `load_balancer.js` writes to Redis `response_times` only when a backend responds. If a backend request throws a network error, the failure is counted by `/demo/status` (`failed_requests`), but not attributed to a specific backend in Redis.
- **Fast local responses (`~2 ms`) under moderate RPS (`25 RPS`)**: Because requests complete in `~2 ms` while arriving every `40 ms`, in-flight connection counts (`activeConnections`) are almost always `0` when the next request arrives, causing deterministic tie-breaking in `least_connections` and `weighted_least_connections` to favor `servers[0]` (`:5001`).

---

## 19. Testing & Evaluation Methodology
- **Algorithm Unit Test**: Run `node testAlgorithm.js` inside `data-plane-gateway/` to verify `powerOfTwoChoices` connection-based selection.
- **Fixed-Capacity Algorithm Benchmark**: `run_benchmark.py` holds capacity constant at 2 verified backends (`:5001` and `:5002`), runs 30 seconds of steady 25 RPS traffic per algorithm (`750` requests each), and isolates per-request Redis latencies to evaluate throughput, latency percentiles, and load distribution.
- **Chronological ML Evaluation**: `train_model.py` uses a strict 80/20 time-ordered split (`6,900` train / `1,725` test rows) with leakage-free lag and rolling features, comparing `LinearRegression`, `RandomForestRegressor`, and `GradientBoostingRegressor`.

---

## 20. Future Improvements (Not Currently Implemented)
- Persist live `/predict` outputs and Docker `active_instances` counts to a time-series log/CSV so live autoscaling history can be audited alongside offline test-set evaluations.
- Trim Redis lists (`LTRIM` on `response_times` and `rps_metrics`) to bound memory usage during multi-day runs.
- Add exponential moving average (EWMA) decay to `least_response_time` so older latency measurements decay over time without requiring a manual reset.
- Add automated PyTest and Jest test suites for end-to-end API regression testing.
