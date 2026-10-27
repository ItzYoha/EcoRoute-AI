"""
Minimal fixed-capacity load-balancing benchmark runner for EcoRoute AI.

Evaluates all 6 load-balancing algorithms using two fixed backend instances
(http://localhost:5001 and http://localhost:5002) and the existing traffic
simulator endpoints (/demo/start, /demo/status, /demo/stop) + Redis telemetry.

Outputs (saved separately from live_rps_with_intervals.csv):
  - data/gold/benchmark_summary.csv
  - data/gold/benchmark_requests.csv
"""

import argparse
import csv
import json
import math
import statistics
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import redis

BASE_DIR = Path(__file__).resolve().parent
GOLD_DIR = BASE_DIR / "data" / "gold"
SUMMARY_CSV = GOLD_DIR / "benchmark_summary.csv"
REQUESTS_CSV = GOLD_DIR / "benchmark_requests.csv"

GATEWAY_URL = "http://localhost:8000"
CONTROL_PLANE_URL = "http://localhost:5000"
REDIS_HOST = "localhost"
REDIS_PORT = 6379

INTENDED_BACKENDS = [
    "http://localhost:5001",
    "http://localhost:5002",
]

ALGORITHMS = [
    "round_robin",
    "weighted_round_robin",
    "least_connections",
    "weighted_least_connections",
    "least_response_time",
    "power_of_two",
]

SUMMARY_COLUMNS = [
    "run_id",
    "algorithm",
    "verified_algorithm",
    "target_rps",
    "configured_duration_seconds",
    "measured_window_seconds",
    "total_requests",
    "successful_requests",
    "failed_requests",
    "unattributed_failures",
    "skipped_requests",
    "achieved_rps",
    "successful_rps",
    "redis_recorded_responses",
    "mean_latency_ms",
    "median_latency_ms",
    "p95_latency_ms",
    "max_latency_ms",
    "backend_5001_requests",
    "backend_5002_requests",
    "backend_5001_share_pct",
    "backend_5002_share_pct",
    "active_backends_start",
    "active_backends_end",
    "capacity_verified",
    "capacity_note",
    "window_start_utc",
    "window_end_utc",
]

REQUEST_COLUMNS = [
    "run_id",
    "algorithm",
    "timestamp",
    "server",
    "response_time_ms",
]


def http_json(url, method="GET", payload=None, timeout=5):
    data = None
    headers = {}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8")
        return resp.status, json.loads(body) if body else {}


def probe_http_ok(url, timeout=3):
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return 200 <= resp.status < 400
    except Exception:
        return False


def parse_iso_utc(ts_str):
    if not ts_str:
        return None
    cleaned = ts_str.strip()
    if cleaned.endswith("Z"):
        cleaned = cleaned[:-1] + "+00:00"
    dt = datetime.fromisoformat(cleaned)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def verify_two_backends(r_client, set_registry=False):
    """
    Verify that:
      1. Both intended backends (5001, 5002) respond with HTTP 200.
      2. A 3rd scaled backend (5003) is NOT reachable/running.
      3. If /instances on Control Plane is reachable and reports Docker instances,
         active_instances == 2.
      4. Gateway active_backends in Redis matches exactly INTENDED_BACKENDS.
    """
    notes = []

    if set_registry:
        try:
            status, body = http_json(
                f"{GATEWAY_URL}/api/backends",
                method="PUT",
                payload={"servers": INTENDED_BACKENDS},
            )
            if status != 200 or body.get("activeBackends") != INTENDED_BACKENDS:
                return False, 0, "Gateway rejected PUT /api/backends"
        except Exception as exc:
            return False, 0, f"PUT /api/backends failed: {exc}"

    reachable = [b for b in INTENDED_BACKENDS if probe_http_ok(f"{b}/")]
    if len(reachable) != 2:
        return (
            False,
            len(reachable),
            f"Expected 2 reachable backends {INTENDED_BACKENDS}, found {reachable}",
        )

    # Check if an extra scaled backend on 5003 is unexpectedly running
    if probe_http_ok("http://localhost:5003/"):
        return (
            False,
            3,
            "Extra backend http://localhost:5003 is reachable; fixed 2-instance capacity violated",
        )

    # Check Redis active_backends key written by gateway
    raw_registry = r_client.get("active_backends")
    if raw_registry:
        try:
            registered = json.loads(raw_registry)
            if registered != INTENDED_BACKENDS:
                return (
                    False,
                    len(registered),
                    f"Redis active_backends={registered} != {INTENDED_BACKENDS}",
                )
        except Exception as exc:
            return False, 0, f"Invalid active_backends JSON in Redis: {exc}"

    # Check Control Plane /instances if Docker daemon is used
    try:
        status, inst_data = http_json(f"{CONTROL_PLANE_URL}/instances", timeout=3)
        if status == 200:
            docker_count = inst_data.get("active_instances", 0)
            if docker_count == 2:
                notes.append("Docker active_instances=2")
            elif docker_count == 0:
                notes.append("2 local Node backends verified (0 Docker containers)")
            else:
                return (
                    False,
                    docker_count,
                    f"Control Plane /instances reported {docker_count} Docker containers (expected 2)",
                )
    except Exception:
        notes.append("2 local backends verified on :5001 and :5002")

    return True, 2, "; ".join(notes) if notes else "2 active backends verified"


def set_and_verify_algorithm(algorithm):
    status_put, put_body = http_json(
        f"{GATEWAY_URL}/api/algorithm",
        method="PUT",
        payload={"algorithm": algorithm},
    )
    if status_put != 200:
        raise RuntimeError(f"PUT /api/algorithm failed for {algorithm}: {put_body}")

    status_get, get_body = http_json(f"{GATEWAY_URL}/api/algorithm", method="GET")
    verified = get_body.get("algorithm")
    if status_get != 200 or verified != algorithm:
        raise RuntimeError(
            f"Algorithm verification mismatch: expected '{algorithm}', got '{verified}'"
        )
    return verified


def compute_percentile(sorted_vals, pct):
    if not sorted_vals:
        return None
    if len(sorted_vals) == 1:
        return float(sorted_vals[0])
    rank = (pct / 100.0) * (len(sorted_vals) - 1)
    low = int(math.floor(rank))
    high = int(math.ceil(rank))
    weight = rank - low
    return float(sorted_vals[low] * (1 - weight) + sorted_vals[high] * weight)


def compute_active_traffic_window(isolated_records, fallback_seconds):
    """
    Calculate the actual traffic measurement window (in seconds) from the
    earliest request start timestamp to the latest request completion timestamp.
    This avoids diluting achieved_rps with client-side HTTP setup/polling delays.
    """
    if len(isolated_records) < 2:
        return max(float(fallback_seconds), 0.001)

    first_rec = isolated_records[0]
    last_rec = isolated_records[-1]
    first_end_dt = parse_iso_utc(first_rec["timestamp"])
    last_end_dt = parse_iso_utc(last_rec["timestamp"])

    if first_end_dt is None or last_end_dt is None:
        return max(float(fallback_seconds), 0.001)

    first_latency_s = float(first_rec["response_time_ms"]) / 1000.0
    span_s = (last_end_dt - first_end_dt).total_seconds() + first_latency_s
    return max(span_s, 0.001)


def run_single_algorithm(r_client, batch_id, index, algorithm, target_rps, duration_seconds):
    run_id = f"{batch_id}_{index:02d}_{algorithm}"
    print(f"\n--- [{index}/{len(ALGORITHMS)}] Running {algorithm} (run_id={run_id}) ---")

    # 1. Verify 2 backends before run
    cap_ok_start, count_start, note_start = verify_two_backends(r_client, set_registry=True)
    if not cap_ok_start:
        raise RuntimeError(f"Pre-run capacity verification failed: {note_start}")
    print(f"Pre-run capacity verified: {count_start} backends ({note_start})")

    # 2. Set and verify algorithm via Gateway API
    verified_algo = set_and_verify_algorithm(algorithm)
    print(f"Algorithm verified via GET /api/algorithm: {verified_algo}")

    # Ensure no leftover simulation is running
    try:
        _, demo_state = http_json(f"{CONTROL_PLANE_URL}/demo/status")
        if demo_state.get("running"):
            http_json(f"{CONTROL_PLANE_URL}/demo/stop", method="POST")
            time.sleep(1.0)
    except Exception as exc:
        raise RuntimeError(f"Control Plane /demo/status unreachable at {CONTROL_PLANE_URL}: {exc}")

    # 3. Snapshot Redis response_times length and UTC start time to isolate this run's window
    llen_before = r_client.llen("response_times")
    window_start_dt = datetime.now(timezone.utc)

    # 4. Trigger steady traffic workload
    status_start, _ = http_json(
        f"{CONTROL_PLANE_URL}/demo/start",
        method="POST",
        payload={
            "target_rps": target_rps,
            "duration_seconds": duration_seconds,
            "pattern": "steady",
        },
    )
    if status_start != 200:
        raise RuntimeError(f"POST /demo/start failed with HTTP {status_start}")

    # Start monotonic timer after /demo/start has initialized the task
    mono_start = time.monotonic()

    # 5. Poll /demo/status until finished
    final_demo = None
    while True:
        time.sleep(0.5)
        _, demo_state = http_json(f"{CONTROL_PLANE_URL}/demo/status")
        if not demo_state.get("running"):
            final_demo = demo_state
            break

    mono_elapsed = max(time.monotonic() - mono_start, 0.001)
    window_end_dt = datetime.now(timezone.utc)
    llen_after = r_client.llen("response_times")

    # 6. Verify 2 backends after run
    cap_ok_end, count_end, note_end = verify_two_backends(r_client, set_registry=False)
    capacity_verified = bool(cap_ok_start and cap_ok_end and count_start == 2 and count_end == 2)
    capacity_note = note_end if not cap_ok_end else note_start

    # 7. Extract only new Redis response_times records added during this run window
    added_count = max(0, llen_after - llen_before)
    raw_new_records = (
        r_client.lrange("response_times", 0, added_count - 1)
        if added_count > 0
        else []
    )

    isolated_records = []
    # Reverse to chronological order (oldest first)
    for raw_item in reversed(raw_new_records):
        try:
            item = json.loads(raw_item)
            rec_ts = parse_iso_utc(item.get("timestamp"))
            rec_server = item.get("server")
            rec_latency = float(item.get("responseTime"))
            if rec_ts is None or not math.isfinite(rec_latency) or rec_latency < 0:
                continue
            if window_start_dt <= rec_ts <= window_end_dt:
                isolated_records.append({
                    "run_id": run_id,
                    "algorithm": verified_algo,
                    "timestamp": item.get("timestamp"),
                    "server": rec_server,
                    "response_time_ms": round(rec_latency, 2),
                })
        except Exception:
            continue

    # 8. Compute metrics strictly from measured responses and completed traffic-generator counts
    total_requests = int(final_demo.get("total_requests", 0))
    successful_requests = int(final_demo.get("successful_requests", 0))
    failed_requests = int(final_demo.get("failed_requests", 0))
    skipped_requests = int(final_demo.get("skipped_requests", 0))

    # Gateway does not push failed requests to Redis response_times, so all failed_requests
    # are unattributed to individual backends.
    unattributed_failures = failed_requests

    # Use the active traffic window matching the completed requests (or generator's actual_rps)
    traffic_window_s = compute_active_traffic_window(isolated_records, mono_elapsed)
    generator_actual_rps = float(final_demo.get("actual_rps") or 0.0)
    achieved_rps = (
        round(generator_actual_rps, 2)
        if generator_actual_rps > 0
        else round(total_requests / traffic_window_s, 2)
    )
    successful_rps = (
        round((successful_requests / total_requests) * achieved_rps, 2)
        if total_requests > 0
        else 0.0
    )

    latencies = sorted(r["response_time_ms"] for r in isolated_records)
    if latencies:
        mean_lat = round(statistics.fmean(latencies), 2)
        median_lat = round(statistics.median(latencies), 2)
        p95_lat = round(compute_percentile(latencies, 95), 2)
        max_lat = round(max(latencies), 2)
    else:
        mean_lat = ""
        median_lat = ""
        p95_lat = ""
        max_lat = ""

    c_5001 = sum(1 for r in isolated_records if r["server"] == "http://localhost:5001")
    c_5002 = sum(1 for r in isolated_records if r["server"] == "http://localhost:5002")
    measured_total = len(isolated_records)

    share_5001 = round((c_5001 / measured_total) * 100.0, 2) if measured_total > 0 else ""
    share_5002 = round((c_5002 / measured_total) * 100.0, 2) if measured_total > 0 else ""

    summary_row = {
        "run_id": run_id,
        "algorithm": algorithm,
        "verified_algorithm": verified_algo,
        "target_rps": target_rps,
        "configured_duration_seconds": duration_seconds,
        "measured_window_seconds": round(traffic_window_s, 2),
        "total_requests": total_requests,
        "successful_requests": successful_requests,
        "failed_requests": failed_requests,
        "unattributed_failures": unattributed_failures,
        "skipped_requests": skipped_requests,
        "achieved_rps": achieved_rps,
        "successful_rps": successful_rps,
        "redis_recorded_responses": measured_total,
        "mean_latency_ms": mean_lat,
        "median_latency_ms": median_lat,
        "p95_latency_ms": p95_lat,
        "max_latency_ms": max_lat,
        "backend_5001_requests": c_5001,
        "backend_5002_requests": c_5002,
        "backend_5001_share_pct": share_5001,
        "backend_5002_share_pct": share_5002,
        "active_backends_start": count_start,
        "active_backends_end": count_end,
        "capacity_verified": capacity_verified,
        "capacity_note": capacity_note,
        "window_start_utc": window_start_dt.isoformat(),
        "window_end_utc": window_end_dt.isoformat(),
    }

    print(
        f"Completed {verified_algo}: achieved_rps={achieved_rps}, "
        f"ok={successful_requests}, fail={failed_requests} (unattributed={unattributed_failures}), "
        f"mean_ms={mean_lat}, p95_ms={p95_lat}, "
        f"5001={c_5001} ({share_5001}%), 5002={c_5002} ({share_5002}%), "
        f"capacity_verified={capacity_verified}"
    )

    if not capacity_verified:
        raise RuntimeError(
            f"Post-run capacity check failed for {algorithm}: {capacity_note}"
        )

    return summary_row, isolated_records


def main():
    parser = argparse.ArgumentParser(
        description="Run fixed-capacity 2-backend benchmark across EcoRoute AI algorithms."
    )
    parser.add_argument(
        "--rps",
        type=int,
        default=25,
        help="Steady target RPS for each algorithm (1-1000, default: 25)",
    )
    parser.add_argument(
        "--duration",
        type=int,
        default=30,
        help="Duration in seconds per algorithm (5-3600, default: 30)",
    )
    parser.add_argument(
        "--algorithms",
        nargs="*",
        default=ALGORITHMS,
        help="Algorithms to benchmark (default: all 6)",
    )
    args = parser.parse_args()

    if not (1 <= args.rps <= 1000):
        sys.exit("Error: --rps must be between 1 and 1000.")
    if not (5 <= args.duration <= 3600):
        sys.exit("Error: --duration must be between 5 and 3600.")

    r_client = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        decode_responses=True,
        socket_connect_timeout=5,
    )
    try:
        r_client.ping()
    except Exception as exc:
        sys.exit(f"Error: Redis is not reachable on {REDIS_HOST}:{REDIS_PORT}: {exc}")

    status_gw, _ = http_json(f"{GATEWAY_URL}/api/health")
    if status_gw != 200:
        sys.exit(f"Error: Load Balancer health check failed on {GATEWAY_URL}/api/health")

    status_cp, _ = http_json(f"{CONTROL_PLANE_URL}/health")
    if status_cp != 200:
        sys.exit(f"Error: Control Plane health check failed on {CONTROL_PLANE_URL}/health")

    GOLD_DIR.mkdir(parents=True, exist_ok=True)
    batch_id = datetime.now(timezone.utc).strftime("bench_%Y%m%dT%H%M%SZ")

    summary_rows = []
    request_rows = []

    for idx, algo in enumerate(args.algorithms, start=1):
        summary_row, req_rows = run_single_algorithm(
            r_client=r_client,
            batch_id=batch_id,
            index=idx,
            algorithm=algo,
            target_rps=args.rps,
            duration_seconds=args.duration,
        )
        summary_rows.append(summary_row)
        request_rows.extend(req_rows)

    with SUMMARY_CSV.open("w", newline="", encoding="utf-8") as f_sum:
        writer = csv.DictWriter(f_sum, fieldnames=SUMMARY_COLUMNS)
        writer.writeheader()
        writer.writerows(summary_rows)

    with REQUESTS_CSV.open("w", newline="", encoding="utf-8") as f_req:
        writer = csv.DictWriter(f_req, fieldnames=REQUEST_COLUMNS)
        writer.writeheader()
        writer.writerows(request_rows)

    print(f"\nBenchmark complete. Saved:")
    print(f"  Summary CSV : {SUMMARY_CSV}")
    print(f"  Requests CSV: {REQUESTS_CSV} ({len(request_rows)} measured responses)")


if __name__ == "__main__":
    main()
