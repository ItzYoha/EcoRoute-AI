import math
import docker
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware
import re
import urllib.request
import urllib.error
import json
import asyncio
import time
from datetime import datetime, timezone

# ---------------- CONFIG ----------------
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
LIVE_DATA = BASE_DIR / "data" / "gold" / "live_rps_with_intervals.csv"
print("API CSV PATH:", LIVE_DATA.resolve())
print("CSV EXISTS:", LIVE_DATA.exists())


FORECAST_MINUTES = 15
INTERVAL_MINUTES = 5
MIN_HISTORY = 13
TIMESTAMP_TOLERANCE_SECONDS = 30
latest_autoscaling_status = {
    "predicted_rps": None,
    "desired_instances": None,
    "last_checked": None,
}

# ---------------- AUTOSCALING CONFIG ----------------
CAPACITY_PER_INSTANCE = 250
TARGET_UTILIZATION = 0.75
MIN_INSTANCES = 2
MAX_INSTANCES = 10

BACKEND_IMAGE = "ecoroute-backend:latest"
BACKEND_CONTAINER_PREFIX = "ecoroute-backend-"
LOAD_BALANCER_URL = "http://localhost:8000"

# Connect to Docker Engine
docker_client = docker.from_env()


# ---------------- LOAD MODEL ----------------
model = joblib.load(MODEL_DIR / "forecasting_model.joblib")
FEATURES = joblib.load(MODEL_DIR / "model_features.joblib")

app = FastAPI(
    title="EcoRoute AI Prediction API",
    description="15-minute workload forecasting service",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- DEMO TRAFFIC SIMULATOR ----------------

class DemoStartRequest(BaseModel):
    target_rps: int = Field(ge=1, le=100)
    duration_seconds: int = Field(ge=5, le=3600)


demo_status = {
    "running": False,
    "target_rps": 0,
    "duration_seconds": 0,
    "total_requests": 0,
    "successful_requests": 0,
    "failed_requests": 0,
    "actual_rps": 0.0,
    "started_at": None,
    "error": None,
}

_demo_task = None
_demo_stop_event = None
_demo_started_monotonic = None


def send_demo_request():
    """Send one real request through the Node.js load balancer."""
    request = urllib.request.Request(
        f"{LOAD_BALANCER_URL}/",
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return 200 <= response.status < 400
    except Exception:
        return False


async def run_demo_traffic(target_rps: int, duration_seconds: int):
    global _demo_started_monotonic

    loop = asyncio.get_running_loop()
    _demo_started_monotonic = time.monotonic()
    end_time = loop.time() + duration_seconds
    in_flight = set()

    async def tracked_request():
        succeeded = await asyncio.to_thread(send_demo_request)

        demo_status["total_requests"] += 1

        if succeeded:
            demo_status["successful_requests"] += 1
        else:
            demo_status["failed_requests"] += 1

    try:
        next_request_time = loop.time()

        while loop.time() < end_time and not _demo_stop_event.is_set():
            task = asyncio.create_task(tracked_request())
            in_flight.add(task)
            task.add_done_callback(in_flight.discard)

            next_request_time += 1 / target_rps
            delay = next_request_time - loop.time()

            if delay > 0:
                try:
                    await asyncio.wait_for(
                        _demo_stop_event.wait(),
                        timeout=delay,
                    )
                except asyncio.TimeoutError:
                    pass

        if in_flight:
            await asyncio.gather(*list(in_flight), return_exceptions=True)

    except asyncio.CancelledError:
        raise

    except Exception as error:
        demo_status["error"] = str(error)

    finally:
        elapsed = max(
            time.monotonic() - _demo_started_monotonic,
            0.001,
        )

        demo_status["actual_rps"] = round(
            demo_status["total_requests"] / elapsed,
            2,
        )
        demo_status["running"] = False


@app.post("/demo/start")
async def start_demo(request: DemoStartRequest):
    global _demo_task, _demo_stop_event

    if _demo_task is not None and not _demo_task.done():
        raise HTTPException(
            status_code=409,
            detail="A traffic simulation is already running.",
        )

    demo_status.update({
        "running": True,
        "target_rps": request.target_rps,
        "duration_seconds": request.duration_seconds,
        "total_requests": 0,
        "successful_requests": 0,
        "failed_requests": 0,
        "actual_rps": 0.0,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "error": None,
    })

    _demo_stop_event = asyncio.Event()

    _demo_task = asyncio.create_task(
        run_demo_traffic(
            request.target_rps,
            request.duration_seconds,
        )
    )

    return {"message": "Traffic simulation started.", **demo_status}


@app.get("/demo/status")
def get_demo_status():
    result = dict(demo_status)

    if demo_status["running"] and _demo_started_monotonic is not None:
        elapsed = max(time.monotonic() - _demo_started_monotonic, 0.001)
        result["actual_rps"] = round(
            demo_status["total_requests"] / elapsed,
            2,
        )

    return result


@app.post("/demo/stop")
async def stop_demo():
    if _demo_stop_event is not None and demo_status["running"]:
        _demo_stop_event.set()
        return {"message": "Stop requested.", **demo_status}

    return {"message": "No simulation is running.", **demo_status}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "EcoRoute AI Prediction API",
        "model_loaded": True,
    }

@app.get("/predict")
def predict():
    # 1. Check that live data exists
    if not LIVE_DATA.exists():
        raise HTTPException(
            status_code=404,
            detail="Live RPS CSV not found.",
        )

    # 2. Read and validate the data
    try:
        df = pd.read_csv(LIVE_DATA)
    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read live data: {error}",
        )

    if not {"timestamp", "rps"}.issubset(df.columns):
        raise HTTPException(
            status_code=400,
            detail="CSV must contain timestamp and rps columns.",
        )

    df["timestamp"] = pd.to_datetime(
        df["timestamp"], utc=True, errors="coerce"
    )
    df["rps"] = pd.to_numeric(df["rps"], errors="coerce")

    df = (
        df.dropna(subset=["timestamp", "rps"])
        .sort_values("timestamp")
        .drop_duplicates(subset=["timestamp"], keep="last")
        .reset_index(drop=True)
    )

    if (df["rps"] < 0).any():
        raise HTTPException(
            status_code=400,
            detail="RPS values cannot be negative.",
        )

    if len(df) < MIN_HISTORY:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Need at least {MIN_HISTORY} samples. "
                f"Currently have {len(df)}."
            ),
        )

    # 3. Check that the latest observations match
    #    the model's expected 5-minute interval.
    expected_seconds = INTERVAL_MINUTES * 60

    df = df.reset_index(drop=True)
    gaps = df["timestamp"].diff().dt.total_seconds()

    valid_intervals = (
        (gaps - expected_seconds).abs()
        <= TIMESTAMP_TOLERANCE_SECONDS
    )

    # Start a new sequence whenever there is a gap
    df["sequence"] = (~valid_intervals).cumsum()

    # Get the most recent continuous sequence
    latest_sequence = df["sequence"].iloc[-1]
    recent = df[df["sequence"] == latest_sequence].copy()

    print("API CSV PATH:", LIVE_DATA.resolve())
    print("TOTAL VALID ROWS:", len(df))
    print("LATEST TIMESTAMPS:")
    print(df[["timestamp", "rps", "sequence"]].tail(20).to_string(index=False))
    print("LATEST SEQUENCE SIZE:", len(recent))
    

    if len(recent) < MIN_HISTORY:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Need {MIN_HISTORY} consecutive samples "
                f"spaced 5 minutes apart. "
                f"Latest continuous sequence has {len(recent)}."
            ),
        )

    # Use the latest 13 samples from that sequence
    recent = recent.tail(MIN_HISTORY).reset_index(drop=True)

    # 4. Construct features from regularly spaced data
    recent = recent.reset_index(drop=True)
    rps = recent["rps"]
    current = recent.iloc[-1]
    timestamp = current["timestamp"]

    features = {
        "hour_of_day": timestamp.hour,
        "day_of_week": timestamp.dayofweek,
        "is_weekend": int(timestamp.dayofweek >= 5),
        "requests_per_second": float(rps.iloc[-1]),
        "lag_1": float(rps.iloc[-2]),
        "lag_3": float(rps.iloc[-4]),
        "lag_6": float(rps.iloc[-7]),
        "rolling_mean_6": float(rps.iloc[-7:-1].mean()),
        "rolling_mean_12": float(rps.iloc[:-1].mean()),
        "rolling_std_6": float(rps.iloc[-7:-1].std()),
    }

    input_df = pd.DataFrame(
        [[features[name] for name in FEATURES]],
        columns=FEATURES,
    )

    # 5. Generate prediction
    predicted_rps = float(model.predict(input_df)[0])
    predicted_rps = max(0.0, predicted_rps)

    # 6. Tree disagreement indicator (not probability)
    confidence_proxy = None

    if hasattr(model, "estimators_"):
        tree_predictions = np.array([
            tree.predict(input_df)[0]
            for tree in model.estimators_
        ])
        spread = float(np.std(tree_predictions))
        confidence_proxy = round(100 / (1 + spread), 1)

    return {
        "prediction_status": "SUCCESS",
        "prediction_time": timestamp.isoformat(),
        "forecast_for_time": (
            timestamp + pd.Timedelta(minutes=FORECAST_MINUTES)
        ).isoformat(),
        "forecast_duration_minutes": FORECAST_MINUTES,
        "current_rps": round(float(rps.iloc[-1]), 2),
        "predicted_rps": round(predicted_rps, 2),
        "model_name": type(model).__name__,
        "confidence_proxy": confidence_proxy,
        "history_samples": len(recent),
        "note": (
            "Forecast requires regularly spaced 5-minute data. "
            "Confidence proxy is not a calibrated probability."
        ),
    }

def get_backend_instances():
    """Return running EcoRoute backend containers in numeric order."""
    containers = docker_client.containers.list()
    backends = []

    for container in containers:
        match = re.fullmatch(
            re.escape(BACKEND_CONTAINER_PREFIX) + r"(\d+)",
            container.name
        )

        if match:
            instance_number = int(match.group(1))
            backends.append((instance_number, container))

    return sorted(backends, key=lambda item: item[0])


def get_host_port(container):
    """Find the Windows host port mapped to container port 5001."""
    container.reload()

    port_bindings = container.attrs.get(
        "NetworkSettings", {}
    ).get("Ports", {})

    bindings = port_bindings.get("5001/tcp")

    if not bindings:
        raise RuntimeError(
            f"No host port mapping found for {container.name}"
        )

    return int(bindings[0]["HostPort"])


def update_load_balancer(containers):
    """Tell the Node.js gateway which backend URLs are active."""
    backend_urls = []

    for container in containers:
        host_port = get_host_port(container)
        backend_urls.append(f"http://localhost:{host_port}")

    payload = json.dumps({"servers": backend_urls}).encode("utf-8")

    request = urllib.request.Request(
        f"{LOAD_BALANCER_URL}/api/backends",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="PUT"
    )

    with urllib.request.urlopen(request, timeout=5) as response:
        if response.status != 200:
            raise RuntimeError("Load balancer rejected backend update")

        return json.loads(response.read().decode("utf-8"))



def reconcile_instances(prediction):
    """Apply one forecast consistently to Docker and the load balancer."""
    predicted_rps = prediction["predicted_rps"]

    effective_capacity = CAPACITY_PER_INSTANCE * TARGET_UTILIZATION
    required_instances = math.ceil(predicted_rps / effective_capacity)

    desired_instances = max(
        MIN_INSTANCES,
        min(required_instances, MAX_INSTANCES)
    )

    running = get_backend_instances()
    baseline = [
        item for item in running if item[0] in (1, 2)
    ]

    if len(baseline) < MIN_INSTANCES:
        raise RuntimeError(
            "Both baseline containers must be running."
        )

    running.sort(key=lambda item: item[0])

    # Scale out when the forecast requires more instances.
    while len(running) < desired_instances:
        existing_numbers = {number for number, _ in running}
        next_number = max(existing_numbers, default=0) + 1

        while next_number in existing_numbers:
            next_number += 1

        container = docker_client.containers.run(
            BACKEND_IMAGE,
            name=f"{BACKEND_CONTAINER_PREFIX}{next_number}",
            detach=True,
            ports={"5001/tcp": 5000 + next_number},
            restart_policy={"Name": "unless-stopped"}
        )

        # Verify the container is running before registering it.
        for _ in range(20):
            container.reload()
            if container.status == "running":
                break
            time.sleep(0.5)

        if container.status != "running":
            raise RuntimeError(
                f"Container {container.name} failed to start."
            )

        running.append((next_number, container))
        running.sort(key=lambda item: item[0])

    # Scale in when fewer instances are needed.
    if len(running) > desired_instances:
        retained = running[:desired_instances]
        to_remove = running[desired_instances:]

        # Remove excess instances from routing before stopping them.
        update_load_balancer(
            [container for _, container in retained]
        )

        for _, container in reversed(to_remove):
            container.stop(timeout=10)
            container.remove()

        running = retained

    # Keep the registry synchronized even when no scaling was needed.
    update_load_balancer(
        [container for _, container in running]
    )

    return {
        "predicted_rps": predicted_rps,
        "desired_instances": desired_instances,
        "active_instances": len(running),
        "backends": [
            {
                "name": container.name,
                "host_port": get_host_port(container)
            }
            for _, container in running
        ]
    }

@app.get("/instances")
def get_instances_status():
    try:
        running = get_backend_instances()

        instances = []

        for number, container in running:
            host_port = get_host_port(container)

            instances.append({
                "id": container.name,
                "number": number,
                "host_port": host_port,
                "status": container.status,
            })

        return {
            "active_instances": len(instances),
            "desired_instances": latest_autoscaling_status[
                "desired_instances"
            ],
            "predicted_rps": latest_autoscaling_status[
                "predicted_rps"
            ],
            "last_checked": latest_autoscaling_status[
                "last_checked"
            ],
            "instances": instances,
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Could not retrieve instance status: {error}",
        )

# ---------------- SCHEDULED AUTOSCALING ----------------

AUTO_SCALE_INTERVAL_SECONDS = 60
AUTO_SCALE_COOLDOWN_SECONDS = 300

_auto_scale_task = None
_last_auto_scale_time = 0.0


async def autoscaling_loop():
    """Periodically compare forecast demand with running capacity."""
    global _last_auto_scale_time

    print("Scheduled autoscaling started.")
    print(
        f"Check interval: {AUTO_SCALE_INTERVAL_SECONDS}s; "
        f"cooldown: {AUTO_SCALE_COOLDOWN_SECONDS}s"
    )

    while True:
        try:
            await asyncio.sleep(AUTO_SCALE_INTERVAL_SECONDS)
            # Generate exactly one prediction for this check.
            prediction = await asyncio.to_thread(predict)
            predicted_rps = prediction["predicted_rps"]
            effective_capacity = (
                CAPACITY_PER_INSTANCE * TARGET_UTILIZATION
            )
            required_instances = math.ceil(
                predicted_rps / effective_capacity
            )
            desired = max(
                MIN_INSTANCES,
                min(required_instances, MAX_INSTANCES)
            )
            latest_autoscaling_status.update({
                "predicted_rps": round(float(predicted_rps), 2),
                "desired_instances": desired,
                "last_checked": datetime.now(timezone.utc).isoformat(),
            })
            running = await asyncio.to_thread(get_backend_instances)
            active = len(running)
            print(
                f"[AutoScaler] Active={active}, "
                f"Desired={desired}, "
                f"Predicted RPS={predicted_rps:.2f}"
            )
            if desired != active:
                elapsed = time.monotonic() - _last_auto_scale_time

                if elapsed < AUTO_SCALE_COOLDOWN_SECONDS:
                    remaining = int(
                        AUTO_SCALE_COOLDOWN_SECONDS - elapsed
                    )
                    print(
                        f"[AutoScaler] Cooldown active; "
                        f"{remaining}s remaining."
                    )
                    continue
            # Use the SAME prediction; do not predict again.
            result = await asyncio.to_thread(
                reconcile_instances, prediction
            )
            if result["active_instances"] != active:
                _last_auto_scale_time = time.monotonic()
                print("[AutoScaler] Capacity changed.")
            print(
                f"[AutoScaler] Reconciliation complete: "
                f"{result['active_instances']} instances."
            )

        except asyncio.CancelledError:
            raise
        except Exception as error:
            print(f"[AutoScaler] Check failed: {error}")


@app.on_event("startup")
async def start_scheduled_autoscaling():
    global _auto_scale_task

    if _auto_scale_task is None or _auto_scale_task.done():
        _auto_scale_task = asyncio.create_task(autoscaling_loop())


@app.on_event("shutdown")
async def stop_scheduled_autoscaling():
    global _auto_scale_task

    if _auto_scale_task is not None:
        _auto_scale_task.cancel()

        try:
            await _auto_scale_task
        except asyncio.CancelledError:
            pass

        _auto_scale_task = None

    print("Scheduled autoscaling stopped.")
