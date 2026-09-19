
import json
import time
import csv
import os
from datetime import datetime, timezone

import redis
import time

# Connect to Redis
r = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True
)

OUTPUT_FILE = "data/gold/live_rps.csv"


def collect_latest_metrics():
    metrics = r.lrange("rps_metrics", 0, -1)

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    file_exists = os.path.exists(OUTPUT_FILE)

    collected = 0

    with open(OUTPUT_FILE, "a", newline="") as file:
        writer = csv.writer(file)

        if not file_exists:
            writer.writerow(["timestamp", "rps"])

        for metric in metrics:
            data = json.loads(metric)
            timestamp = data["timestamp"]

            # Redis prevents collecting the same record twice
            is_new = r.set(
                f"collected_rps:{timestamp}",
                "1",
                nx=True
            )

            if is_new:
                writer.writerow([
                    timestamp,
                    data["rps"]
                ])
                collected += 1

    print("New records collected:", collected)


if __name__ == "__main__":
    print("Connected to Redis:", r.ping())
    print("Live RPS collector started. Press Ctrl+C to stop.")

    try:
        while True:
            collect_latest_metrics()
            time.sleep(30)

    except KeyboardInterrupt:
        print("\nCollector stopped.")