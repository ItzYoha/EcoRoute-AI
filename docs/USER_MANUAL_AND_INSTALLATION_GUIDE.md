# EcoRoute AI — User Manual and Installation Guide

This manual explains how to install, configure, start, verify, benchmark, and stop the **EcoRoute AI** system from scratch on **Windows 10/11 using PowerShell**. Every command, port, and file path below has been verified directly against the repository source code.

---

## 1. Required Software & Prerequisites

Before running EcoRoute AI, ensure the following software is installed on your Windows machine:

| Software | Version Used / Tested | Purpose | Verification Command |
| :--- | :--- | :--- | :--- |
| **Node.js & npm** | Node.js v20+ (v24.22.0 present) | Runs the Data Plane Load Balancer (`:8000`), Backend Servers (`:5001`, `:5002`), and React Dashboard (`:5173`) | `node --version` / `npm --version` |
| **Python** | Python 3.11+ (3.13.14 in `.venv`) | Runs the FastAPI Control Plane (`:5000`), Redis Collector, ML Trainer, and Benchmark Runner | `python --version` |
| **Docker Desktop** | Docker Engine 24+ | Runs Redis (`:6379`) and dynamically scaled backend containers (`ecoroute-backend-1..10`) | `docker --version` / `docker ps` |
| **R & Rscript** | R 4.x (`R-4.5.2` installed) | Runs the 3-tab R/Shiny Analytics Dashboard (`:3838`) | `& "C:\Program Files\R\R-4.5.2\bin\Rscript.exe" --version` |

---

## 2. Port Map & Service Overview

| Port | Service | Source File | Required By |
| :--- | :--- | :--- | :--- |
| `6379` | Redis Server | External / Docker `redis:alpine` | `load_balancer.js`, `collect_live_data.py`, `run_benchmark.py` |
| `5001` | Backend Worker 1 (Baseline) | `data-plane-gateway/server.js` (or `ecoroute-backend-1`) | `load_balancer.js`, `main.py`, `run_benchmark.py` |
| `5002` | Backend Worker 2 (Baseline) | `data-plane-gateway/server2.js` (or `ecoroute-backend-2`) | `load_balancer.js`, `main.py`, `run_benchmark.py` |
| `5003–5010` | Scaled Backend Workers 3–10 | Docker containers `ecoroute-backend-3..10` | Created/removed dynamically by `control-plane-brain/main.py` |
| `8000` | Data Plane Load Balancer | `data-plane-gateway/load_balancer.js` | Clients, React UI, `main.py`, `run_benchmark.py` |
| `5000` | Control Plane FastAPI Brain | `control-plane-brain/main.py` | React UI (`api.js`), `run_benchmark.py`, R/Shiny (`app.R`) |
| `5173` | React + Vite Web Dashboard | `ecoroute-ai-dashboard/src/main.jsx` | Browser UI (CORS whitelisted in `:8000` and `:5000`) |
| `3838` | R / Shiny Analytics App | `R-Analytics/app.R` | Browser UI for statistical & benchmark evaluation |

> **Important Note on Port 5000:** Uvicorn defaults to port `8000` if `--port` is omitted, which collides with `load_balancer.js` on port `8000`. Always start `main.py` with `--port 5000` because `ecoroute-ai-dashboard/src/services/api.js` hardcodes `CONTROL_PLANE_URL = "http://localhost:5000"`.

---

## 3. Repository Setup & Dependency Installation

### 3.1 Python Virtual Environment & Dependencies (`control-plane-brain`)
Open PowerShell and run:
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\control-plane-brain

# Create a virtual environment if .venv does not exist
if (-not (Test-Path .\.venv)) {
    python -m venv .venv
}

# Activate the virtual environment
.\.venv\Scripts\Activate.ps1

# Install locked Python packages (FastAPI, Uvicorn, Scikit-Learn, Pandas, Redis, Docker SDK)
pip install -r requirements.txt
```
*(If PowerShell blocks `.Activate.ps1`, run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` first, or invoke `.\.venv\Scripts\python.exe` directly.)*

### 3.2 Node.js Dependencies (`data-plane-gateway` & `ecoroute-ai-dashboard`)
```powershell
# Install Data Plane Gateway dependencies (express, redis)
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\data-plane-gateway
npm install

# Install React Dashboard dependencies (react, vite, recharts, lucide-react)
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\ecoroute-ai-dashboard
npm install
```

### 3.3 R Packages (`R-Analytics`)
```powershell
& "C:\Program Files\R\R-4.5.2\bin\Rscript.exe" -e "install.packages(c('shiny', 'ggplot2', 'readr'), repos='https://cloud.r-project.org')"
```

---

## 4. Starting the System in the Correct Order

Always start the services in the order below so downstream services can connect immediately.

### Step 1: Start Redis (Port `6379`)
Ensure Docker Desktop is running, then start a Redis container:
```powershell
docker start ecoroute-redis 2>$null
if ($LASTEXITCODE -ne 0) {
    docker run -d --name ecoroute-redis -p 6379:6379 redis:alpine
}
```

### Step 2: Start Baseline Backend Instances (Ports `5001` and `5002`)
You have two options depending on whether you are using Docker autoscaling:

#### Option A: Docker Containers (Recommended — Required for `main.py` Docker Autoscaling)
`control-plane-brain/main.py` expects an image named `ecoroute-backend:latest` and two baseline containers named `ecoroute-backend-1` and `ecoroute-backend-2`:
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\data-plane-gateway
docker build -t ecoroute-backend:latest .

docker rm -f ecoroute-backend-1 ecoroute-backend-2 2>$null
docker run -d --name ecoroute-backend-1 -p 5001:5001 --restart unless-stopped ecoroute-backend:latest
docker run -d --name ecoroute-backend-2 -p 5002:5001 --restart unless-stopped ecoroute-backend:latest
```

#### Option B: Local Node.js Processes (Lightweight Mode without Docker Containers)
If Docker Desktop is unavailable for backend containers, you can run the two worker scripts directly in two terminals (note that `/instances` and `autoscaling_loop` in `main.py` will not manage non-Docker processes):
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\data-plane-gateway
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node server.js"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node server2.js"
```

### Step 3: Start the Data Plane Load Balancer (Port `8000`)
In a new PowerShell window:
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\data-plane-gateway
node load_balancer.js
```
Expected console output:
```text
Load Balancer running on port 8000
Connected to Redis
Starting 5-minute RPS timer
```

### Step 4: Start the Live RPS Collector (`collect_live_data.py`)
In a new PowerShell window:
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\control-plane-brain
.\.venv\Scripts\python.exe collect_live_data.py
```
Expected console output:
```text
Connected to Redis: True
CSV destination: ...\control-plane-brain\data\gold\live_rps_with_intervals.csv
Live RPS collector started. Press Ctrl+C to stop.
```

### Step 5: Start the Control Plane FastAPI Server & Autoscaler (Port `5000`)
In a new PowerShell window:
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\control-plane-brain
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 5000
```
Expected console output:
```text
API CSV PATH: ...\control-plane-brain\data\gold\live_rps_with_intervals.csv
CSV EXISTS: True
Scheduled autoscaling started.
Check interval: 60s; cooldown: 300s
Uvicorn running on http://0.0.0.0:5000
```

### Step 6: Start the React Operational Dashboard (Port `5173`)
In a new PowerShell window:
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\ecoroute-ai-dashboard
npm run dev
```
Open `http://localhost:5173` in your browser.

### Step 7: Start the R/Shiny Analytics Dashboard (Port `3838`)
In a new PowerShell window:
```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\R-Analytics
& "C:\Program Files\R\R-4.5.2\bin\Rscript.exe" -e "shiny::runApp('app.R', port=3838, launch.browser=TRUE)"
```
Open `http://127.0.0.1:3838` in your browser.

---

## 5. How to Verify Each Service Is Running

Run these commands in PowerShell to verify every layer:

```powershell
# 1. Verify Redis connectivity
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\control-plane-brain
.\.venv\Scripts\python.exe redis_test.py

# 2. Verify Backend 1 (5001) and Backend 2 (5002)
Invoke-RestMethod http://localhost:5001/
Invoke-RestMethod http://localhost:5002/

# 3. Verify Data Plane Gateway health, active algorithm, and metrics (8000)
Invoke-RestMethod http://localhost:8000/api/health
Invoke-RestMethod http://localhost:8000/api/algorithm
Invoke-RestMethod http://localhost:8000/api/metrics

# 4. Verify Control Plane health, Docker instances, and ML prediction (5000)
Invoke-RestMethod http://localhost:5000/health
Invoke-RestMethod http://localhost:5000/instances
Invoke-RestMethod http://localhost:5000/predict
```

---

## 6. How to Generate Traffic & Run the 6-Algorithm Benchmark

### 6.1 Interactive Traffic Simulator (UI or API)
- **Via React Dashboard**: Open `http://localhost:5173`, scroll to **Traffic Simulator**, set **Target requests per second** (`1–1000`), choose a **Traffic Pattern** (`Steady Load`, `Gradual Ramp-Up`, `Sudden Spike`, `Ramp-Up and Ramp-Down`, or `Spike Followed by Drop`), set **Duration in seconds** (`5–3600`), and click **Start simulation**.
- **Via PowerShell API Call**:
  ```powershell
  Invoke-RestMethod -Uri "http://localhost:5000/demo/start" -Method POST -ContentType "application/json" -Body '{"target_rps": 25, "duration_seconds": 30, "pattern": "steady"}'
  Invoke-RestMethod -Uri "http://localhost:5000/demo/status" -Method GET
  ```

### 6.2 Running the Fixed-Capacity 6-Algorithm Benchmark
To evaluate all six load-balancing algorithms (`round_robin`, `weighted_round_robin`, `least_connections`, `weighted_least_connections`, `least_response_time`, `power_of_two`) under identical two-backend conditions:

```powershell
Set-Location C:\Users\yohar\OneDrive\Desktop\EcoRouteAI\EcoRoute-AI\control-plane-brain
.\.venv\Scripts\python.exe run_benchmark.py --rps 25 --duration 30
```

#### What `run_benchmark.py` Does:
1. Checks that Redis (`:6379`), the Gateway (`:8000/api/health`), and the Control Plane (`:5000/health`) are healthy.
2. Before each algorithm run, registers `["http://localhost:5001", "http://localhost:5002"]` via `PUT /api/backends` and verifies that exactly 2 backends are reachable and active (and `:5003` is not running).
3. Switches the algorithm via `PUT /api/algorithm` and confirms it took effect via `GET /api/algorithm`.
4. Snapshots Redis `LLEN response_times` and `window_start_utc`, runs a 30-second `steady` workload via `POST /demo/start`, and waits for completion.
5. Verifies that 2 backends are still active after the run.
6. Extracts only the Redis `response_times` entries recorded during that run's window and writes:
   - `control-plane-brain/data/gold/benchmark_summary.csv` (1 summary row per algorithm)
   - `control-plane-brain/data/gold/benchmark_requests.csv` (individual request latencies and backend attribution)

---

## 7. How to Stop the Services Safely

1. **Stop Active Traffic Simulation (if running)**:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:5000/demo/stop" -Method POST
   ```
2. **Stop Terminal Services**: Press `Ctrl + C` in the PowerShell terminals running:
   - R/Shiny (`app.R`)
   - React Dashboard (`npm run dev`)
   - Control Plane FastAPI (`uvicorn main:app`) — triggers the `@app.on_event("shutdown")` handler to cancel `autoscaling_loop` cleanly
   - Live RPS Collector (`collect_live_data.py`)
   - Data Plane Load Balancer (`node load_balancer.js`)
3. **Stop Docker Containers**:
   ```powershell
   docker stop ecoroute-backend-1 ecoroute-backend-2 ecoroute-redis
   ```

---

## 8. Troubleshooting Common Issues

| Problem / Error Message | Root Cause | Solution |
| :--- | :--- | :--- |
| **`Error: listen EADDRINUSE: address already in use :::8000`** | Another process (or `uvicorn` started without `--port 5000`) is already using port `8000`. | Find the PID with `Get-NetTCPConnection -LocalPort 8000` and stop it (`Stop-Process -Id <PID> -Force`), and ensure Uvicorn runs on `--port 5000`. |
| **`Redis connection error` / `Could not connect to Redis`** | Redis server is not running on `localhost:6379`. | Run `docker ps` to check if `ecoroute-redis` is up, or start it with `docker start ecoroute-redis`. |
| **`HTTP 422` on `GET /predict`: `Need 13 consecutive samples spaced 5 minutes apart. Latest continuous sequence has X.`** | `main.py` checks that the latest 13 rows in `live_rps_with_intervals.csv` have consecutive timestamps within `300s ± 30s`. If `load_balancer.js` and `collect_live_data.py` were stopped and restarted after a time gap, a new sequence starts at length `1`. | Keep `load_balancer.js` and `collect_live_data.py` running continuously for 60 minutes (13 × 5-minute intervals) so a complete sequence accumulates, or inspect the existing valid sequence at the tail of `live_rps_with_intervals.csv`. |
| **`HTTP 404` on `GET /predict`: `Live RPS CSV not found`** | `control-plane-brain/data/gold/live_rps_with_intervals.csv` is missing. | Start `load_balancer.js` and `collect_live_data.py` to populate `live_rps_with_intervals.csv`. |
| **`FileNotFoundError: models/forecasting_model.joblib`** | Model artifacts were deleted or not generated. | Run `.\.venv\Scripts\python.exe train_model.py` inside `control-plane-brain/`. |
| **`docker.errors.DockerException: Error while fetching server API version`** | Docker Desktop is not running on Windows when `main.py` starts (`docker.from_env()`). | Launch **Docker Desktop** and wait until the engine status shows running before starting `uvicorn main:app`. |
| **`RuntimeError: Both baseline containers must be running` in AutoScaler** | `reconcile_instances()` in `main.py` requires Docker containers `ecoroute-backend-1` and `ecoroute-backend-2` to be running. | Start both containers using the `docker run` commands in Section 4, Step 2 (Option A). |
| **`Rscript : The term 'Rscript' is not recognized`** | R's `bin` directory is not on your Windows `PATH`. | Invoke Rscript using its full path: `& "C:\Program Files\R\R-4.5.2\bin\Rscript.exe"`. |
