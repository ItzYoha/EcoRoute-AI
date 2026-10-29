# EcoRoute AI — User Manual and Installation Guide

## 1. Prerequisites

Install the following software before running EcoRoute AI.

| Software | Version | Purpose | Verification |
|---|---|---|---|
| Git | Current stable version | Clone the repository | `git --version` |
| Node.js and npm | Node.js 20 or newer | Gateway and React dashboard | `node --version`, `npm --version` |
| Python | Python 3.11 or newer, compatible with `requirements.txt` | Control plane, collector, model training and benchmark | `python --version` or `python3 --version` |
| Docker | Current supported version | Redis and backend containers | `docker --version`, `docker info` |
| R | R 4.x | R/Shiny analytics dashboard | `R --version` |
| Web browser | Current version | Access the dashboards | — |

The R/Shiny dashboard is optional. Docker is required for Redis and Docker-managed backend autoscaling.

## 2. Repository Setup

Clone the repository:

```bash
git clone https://github.com/ItzYoha/EcoRoute-AI.git
cd EcoRoute-AI
```

If the project was downloaded as a ZIP file, extract it and open a terminal in the extracted `EcoRoute-AI` directory.

The project root contains the `data-plane-gateway`, `control-plane-brain`, `ecoroute-ai-dashboard`, and `R-Analytics` directories.

## 3. Install Dependencies

### 3.1 Python Dependencies

Open a terminal in the project root and enter the control-plane directory:

```bash
cd control-plane-brain
```

Create a virtual environment.

**Windows PowerShell**
```powershell
python -m venv .venv
```

**macOS / Linux**
```bash
python3 -m venv .venv
```

Activate the environment.

**Windows PowerShell**
```powershell
.\.venv\Scripts\Activate.ps1
```

**macOS / Linux**
```bash
source .venv/bin/activate
```

Install the Python packages:

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If the Python command is not available, use the Python command provided by your installation. On Windows, `py` may be used instead of `python`.

Return to the project root:

```bash
cd ..
```

### 3.2 Node.js Dependencies

Install the gateway dependencies:

```bash
cd data-plane-gateway
npm install
cd ..
```

Install the dashboard dependencies:

```bash
cd ecoroute-ai-dashboard
npm install
cd ..
```

### 3.3 R/Shiny Dependencies

Install R 4.x and ensure `Rscript` is available in the terminal. Then install the packages:

```bash
Rscript -e "install.packages(c('shiny', 'ggplot2', 'readr'), repos='https://cloud.r-project.org')"
```

On Windows, if `Rscript` is not recognized, add the R `bin` directory to PATH or run `Rscript.exe` from its installation directory.

## 4. Port Map

| Port | Component | Purpose |
|---:|---|---|
| 6379 | Redis | Stores request and latency telemetry |
| 5001–5002 | Baseline backend workers | Initial backend instances |
| 5003–5010 | Additional backend workers | Additional Docker-managed capacity |
| 8000 | Node.js/Express gateway | Routes requests and exposes gateway APIs |
| 5000 | FastAPI control plane | Forecasting, instance status, traffic simulation and autoscaling |
| 5173 | React/Vite dashboard | Web interface |
| 3838 | R/Shiny dashboard | Analytics interface |

The gateway uses port `8000`. The control plane must use port `5000` to match the dashboard configuration.

## 5. Start the System

Run each long-running service in a separate terminal. Commands use paths relative to the project root.

### Step 1 — Start Docker

Start Docker Desktop on Windows or macOS, or start Docker Engine on Linux. Verify that it is running:

```bash
docker info
```

### Step 2 — Start Redis

On the first run, create the Redis container:

```bash
docker run -d --name ecoroute-redis -p 6379:6379 redis:alpine
```

For later runs, start the existing container:

```bash
docker start ecoroute-redis
```

Check container status with:

```bash
docker ps -a
```

### Step 3 — Build and Start Backend Containers

From the project root:

```bash
cd data-plane-gateway
docker build -t ecoroute-backend:latest .
```

Create the two baseline backend containers:

```bash
docker run -d --name ecoroute-backend-1 -p 5001:5001 --restart unless-stopped ecoroute-backend:latest
docker run -d --name ecoroute-backend-2 -p 5002:5001 --restart unless-stopped ecoroute-backend:latest
```

If containers with these names already exist, inspect them with `docker ps -a`. Remove an existing container before recreating it:

```bash
docker rm -f ecoroute-backend-1 ecoroute-backend-2
```

Return to the project root:

```bash
cd ..
```

Docker-managed baseline containers are required for the Docker autoscaling controller. Running the backend scripts as local Node.js processes supports basic routing tests, but those processes are not managed by the Docker autoscaler.

### Step 4 — Start the Gateway

In a new terminal:

```bash
cd data-plane-gateway
node load_balancer.js
```

The gateway listens on port `8000` and connects to Redis.

### Step 5 — Start the Live RPS Collector

In a new terminal:

**Windows PowerShell**
```powershell
cd control-plane-brain
.\.venv\Scripts\python.exe collect_live_data.py
```

**macOS / Linux**
```bash
cd control-plane-brain
.venv/bin/python collect_live_data.py
```

Keep the collector running while gathering telemetry.

### Step 6 — Start the Control Plane

In a new terminal:

**Windows PowerShell**
```powershell
cd control-plane-brain
.\.venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 5000
```

**macOS / Linux**
```bash
cd control-plane-brain
.venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 5000
```

The control plane serves the API and runs the autoscaling loop.

### Step 7 — Start the React Dashboard

In a new terminal:

```bash
cd ecoroute-ai-dashboard
npm run dev
```

Open the URL printed by Vite. The default address is `http://localhost:5173`.

### Step 8 — Start the R/Shiny Dashboard (Optional)

In a new terminal:

```bash
cd R-Analytics
Rscript -e "shiny::runApp('app.R', host='127.0.0.1', port=3838, launch.browser=TRUE)"
```

Open `http://127.0.0.1:3838` if the browser does not open automatically.

## 6. Verify the Services

Run the following checks after starting the services.

### 6.1 Redis and Docker

```bash
docker ps
docker exec ecoroute-redis redis-cli PING
```

Redis should return `PONG`.

### 6.2 Backend Workers

```bash
curl http://localhost:5001/
curl http://localhost:5002/
```

### 6.3 Gateway

```bash
curl http://localhost:8000/api/health
curl http://localhost:8000/api/algorithm
curl http://localhost:8000/api/metrics
```

### 6.4 Control Plane

```bash
curl http://localhost:5000/health
curl http://localhost:5000/instances
```

Test prediction after sufficient telemetry history has accumulated:

```bash
curl http://localhost:5000/predict
```

The prediction endpoint requires at least 13 consecutive five-minute samples. An HTTP 422 response can occur until enough valid history is available.

## 7. Generate Traffic

### 7.1 Through the Dashboard

Open the React dashboard at `http://localhost:5173`. Use the Traffic Simulator to select a target request rate, duration, and traffic pattern, then start the simulation.

### 7.2 Through the API

Start a steady traffic simulation:

```bash
curl -X POST http://localhost:5000/demo/start \
  -H "Content-Type: application/json" \
  -d '{"target_rps":25,"duration_seconds":30,"pattern":"steady"}'
```

Check the simulation status:

```bash
curl http://localhost:5000/demo/status
```

Stop the simulation:

```bash
curl -X POST http://localhost:5000/demo/stop
```

On Windows PowerShell, use `curl.exe` if `curl` is interpreted as a PowerShell alias.

## 8. Run the Load-Balancing Benchmark

Ensure Redis, the gateway, the control plane, and both baseline backend containers are running.

From the `control-plane-brain` directory, run:

**Windows PowerShell**
```powershell
.\.venv\Scripts\python.exe run_benchmark.py --rps 25 --duration 30
```

**macOS / Linux**
```bash
.venv/bin/python run_benchmark.py --rps 25 --duration 30
```

The benchmark evaluates the six configured load-balancing algorithms and writes result files under `control-plane-brain/data/gold/` when the run completes successfully.

## 9. Train the Model

If the model files required by the control plane are missing, run training from `control-plane-brain`.

**Windows PowerShell**
```powershell
.\.venv\Scripts\python.exe train_model.py
```

**macOS / Linux**
```bash
.venv/bin/python train_model.py
```

Training requires the project's training data to be available.

## 10. Stop the System

Stop an active traffic simulation:

```bash
curl -X POST http://localhost:5000/demo/stop
```

Press **Ctrl+C** in the terminals running the R/Shiny app, React dashboard, control plane, collector, and gateway.

Stop the Docker containers:

```bash
docker stop ecoroute-backend-1 ecoroute-backend-2 ecoroute-redis
```

If autoscaling created additional `ecoroute-backend-*` containers, check `docker ps` and stop any remaining project containers when finished.

## 11. Troubleshooting

| Problem | Possible cause | Resolution |
|---|---|---|
| Port already in use | Another process is using the port | Stop the conflicting process or update the application configuration and dependent URLs consistently |
| Redis connection refused | Redis is stopped or Docker is unavailable | Check `docker info` and `docker ps -a`; start `ecoroute-redis` |
| Docker API connection error | Docker Engine is not running or access is denied | Start Docker Engine and verify with `docker info` |
| HTTP 422 from `/predict` | Not enough consecutive five-minute samples | Keep the gateway and collector running until sufficient valid history is available |
| HTTP 404 from `/predict` because the CSV is missing | Live telemetry file has not been created | Start the gateway and collector and check the configured CSV path |
| Model file not found | Model artifacts are missing | Run `train_model.py` and confirm training data is available |
| Baseline container missing | Container was not created or is stopped | Check `docker ps -a`, build the image, and start both baseline containers |
| Dashboard cannot connect to an API | Service is stopped, port is incorrect, or CORS configuration does not match | Check that the gateway uses port 8000 and the control plane uses port 5000 |
| `Rscript` is not recognized | R is not installed or its executable is not on PATH | Install R and add its `bin` directory to PATH, or use the full path to `Rscript` |
| Python package installation fails | Unsupported Python version, network issue, or package build failure | Check the Python version and review the complete installation error |

## 12. Quick Startup Checklist

- [ ] Git, Node.js/npm, Python, and Docker are installed.
- [ ] Repository is cloned or extracted.
- [ ] Python virtual environment is created and dependencies are installed.
- [ ] Gateway and dashboard Node.js dependencies are installed.
- [ ] Docker Engine is running.
- [ ] Redis is running on port 6379.
- [ ] Backend image is built and baseline containers are running on ports 5001 and 5002.
- [ ] Gateway is running on port 8000.
- [ ] Live collector and control plane are running.
- [ ] React dashboard is accessible at the Vite URL.
- [ ] R/Shiny dashboard is running if required.
- [ ] Prediction is tested after sufficient telemetry history has accumulated.

**Repository:** https://github.com/ItzYoha/EcoRoute-AI
