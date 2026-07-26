import numpy as np
import pandas as pd
from datetime import datetime, timedelta

np.random.seed(42)

# ---------------- CONFIG ----------------
START_DATE = datetime(2026, 1, 1)
DURATION_DAYS = 30
FREQ_MINUTES = 5
CAPACITY_PER_INSTANCE = 250        # max requests/sec a single instance can handle
TARGET_UTILIZATION = 0.75          # ideal provisioning target (75% headroom)
BASELINE_INSTANCES = 8             # fixed instance count if NOT auto-scaling (naive deployment)
BASE_LATENCY_MS = 40                # latency floor with zero congestion

n_points = int(DURATION_DAYS * 24 * 60 / FREQ_MINUTES)
timestamps = [START_DATE + timedelta(minutes=FREQ_MINUTES * i) for i in range(n_points)]

# ---------------- SEASONAL DEMAND ----------------
def base_demand(ts):
    hour = ts.hour + ts.minute / 60
    day_of_week = ts.weekday()  # 0=Mon .. 6=Sun

    # daily pattern: low at night, peak mid-afternoon/evening
    daily = 150 + 350 * np.exp(-((hour - 15) ** 2) / (2 * 4 ** 2))

    # weekly pattern: weekdays busier than weekends
    weekly_factor = 0.65 if day_of_week >= 5 else 1.0

    return daily * weekly_factor

rps = np.array([base_demand(ts) for ts in timestamps])

# random noise
rps += np.random.normal(0, 15, size=n_points)
rps = np.clip(rps, 20, None)

# ---------------- INJECT SPIKES ----------------
is_spike = np.zeros(n_points, dtype=int)
n_spikes = 25

for _ in range(n_spikes):
    start_idx = np.random.randint(0, n_points - 12)
    spike_len = np.random.randint(4, 12)          # 20-60 min spikes at 5-min resolution
    magnitude = np.random.uniform(3, 8)           # 3x - 8x normal traffic

    for j in range(spike_len):
        idx = start_idx + j
        if idx >= n_points:
            break
        ramp = np.sin(np.pi * j / spike_len)      # smooth ramp up/down
        rps[idx] += rps[idx] * magnitude * ramp
        is_spike[idx] = 1

rps = np.round(np.clip(rps, 20, None), 1)

# ---------------- DERIVED METRICS ----------------
required_instances = np.ceil(rps / (CAPACITY_PER_INSTANCE * TARGET_UTILIZATION)).astype(int)
required_instances = np.clip(required_instances, 2, None)

# naive fixed-capacity deployment (does NOT scale) -> shows overload during spikes
cpu_utilization = np.clip((rps / (BASELINE_INSTANCES * CAPACITY_PER_INSTANCE)) * 100, 0, None)

def latency(util_pct):
    if util_pct <= 80:
        return BASE_LATENCY_MS + util_pct * 0.5
    else:
        overload = util_pct - 80
        return BASE_LATENCY_MS + 40 + (overload ** 1.8) * 2

response_time_ms = np.array([latency(u) for u in cpu_utilization])
response_time_ms = np.round(response_time_ms, 1)

df = pd.DataFrame({
    "timestamp": timestamps,
    "day_of_week": [ts.weekday() for ts in timestamps],
    "hour_of_day": [ts.hour for ts in timestamps],
    "is_weekend": [1 if ts.weekday() >= 5 else 0 for ts in timestamps],
    "requests_per_second": rps,
    "is_spike": is_spike,
    "baseline_active_instances": BASELINE_INSTANCES,
    "cpu_utilization_pct": np.round(cpu_utilization, 1),
    "response_time_ms": response_time_ms,
    "required_instances": required_instances
})

df.to_csv("traffic_simulation.csv", index=False)
print("Shape:", df.shape)
print("\nSpike rows:", df['is_spike'].sum())
print("\nRequired instances range:", df['required_instances'].min(), "-", df['required_instances'].max())
print("\n", df.head(10))
