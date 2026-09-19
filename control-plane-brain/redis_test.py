
import redis

# Connect Python to Redis
r = redis.Redis(
    host="localhost",
    port=6379,
    decode_responses=True
)

# Test the connection
try:
    print("Redis connected:", r.ping())
except redis.ConnectionError:
    print("Could not connect to Redis")


# Read the latest RPS records from Redis
metrics = r.lrange("rps_metrics", 0, 4)

print("\nLatest RPS metrics:")
for metric in metrics:
    print(metric)



import json

# Get the latest 10 RPS records from Redis
metrics = r.lrange("rps_metrics", 0, 9)

# Convert JSON strings into Python dictionaries
live_data = [json.loads(metric) for metric in metrics]

print("Number of records:", len(live_data))

print("\nLive RPS values:")
for record in live_data:
    print(record["rps"], record["timestamp"])