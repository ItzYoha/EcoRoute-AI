
import csv
import json
import time
from pathlib import Path

import redis

# Resolve paths relative to this Python file, not the terminal directory.
BASE_DIR = Path(__file__).resolve().parent
OUTPUT_FILE = BASE_DIR / "data" / "gold" / "live_rps_with_intervals.csv"

# Connect to Redis.
r = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True,
    socket_connect_timeout=5,
)

CSV_COLUMNS = [
    "timestamp",
    "rps",
    "interval_start",
    "interval_end",
    "duration_seconds",
]


def load_saved_timestamps():
    """Load timestamps already present in the CSV."""
    saved = set()

    if OUTPUT_FILE.exists():
        with OUTPUT_FILE.open("r", newline="", encoding="utf-8") as file:
            reader = csv.DictReader(file)
            for row in reader:
                if row.get("timestamp"):
                    saved.add(row["timestamp"])

    return saved


def collect_latest_metrics(saved_timestamps):
    metrics = r.lrange("rps_metrics", 0, -1)
    pending = {}

    # Identify records missing from the CSV, even if a Redis
    # deduplication marker was created during an earlier run.
    for metric in metrics:
        try:
            data = json.loads(metric)
            timestamp = data["timestamp"]

            if timestamp in saved_timestamps:
                # Keep Redis marker consistent with the CSV.
                r.set(f"collected_rps:{timestamp}", "1")
                continue

            pending[timestamp] = data

        except (json.JSONDecodeError, KeyError, TypeError) as error:
            print("Skipping invalid Redis metric:", error)

    if not pending:
        print("New records collected: 0")
        return

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    file_exists = OUTPUT_FILE.exists() and OUTPUT_FILE.stat().st_size > 0

    ordered = sorted(pending.items(), key=lambda item: item[0])

    # Write and flush CSV rows before marking timestamps in Redis.
    with OUTPUT_FILE.open("a", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)

        if not file_exists:
            writer.writerow(CSV_COLUMNS)

        for timestamp, data in ordered:
            writer.writerow([
                timestamp,
                data.get("rps", ""),
                data.get("interval_start", ""),
                data.get("interval_end", ""),
                data.get("duration_seconds", ""),
            ])

        file.flush()

    # Mark only after the rows have been written.
    for timestamp, _ in ordered:
        r.set(f"collected_rps:{timestamp}", "1")
        saved_timestamps.add(timestamp)

    print("New records collected:", len(ordered))


if __name__ == "__main__":
    print("Connected to Redis:", r.ping())
    print("CSV destination:", OUTPUT_FILE)
    print("Live RPS collector started. Press Ctrl+C to stop.")

    saved_timestamps = load_saved_timestamps()

    try:
        while True:
            collect_latest_metrics(saved_timestamps)
            time.sleep(30)

    except KeyboardInterrupt:
        print("\nCollector stopped.")
