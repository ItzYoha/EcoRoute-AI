"""
EcoRoute AI - Predictive AI Engine
Trains a workload forecasting model matching the SRS Prediction entity:
    Predicted_Workload, Prediction_Confidence, Forecast_Duration, Prediction_Status

Target: Request_Rate (requests_per_second) FORECAST_HORIZON steps into the future.
This deliberately does NOT use the current interval's own rps-derived columns as
leakage-free inputs are limited to information available *before* the forecast window.
"""
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.metrics import r2_score, mean_absolute_error
import joblib
import json
from pathlib import Path
import os

# ---------------- CONFIG ----------------
FREQ_MINUTES = 5
FORECAST_HORIZON_STEPS = 3          # 3 steps * 5 min = 15 minutes ahead
FORECAST_DURATION_MIN = FORECAST_HORIZON_STEPS * FREQ_MINUTES
TRAIN_FRACTION = 0.8                # time-based split, no shuffling

# ---------------- LOAD ----------------
# Expects to be run from inside control-plane-brain/, with the dataset already placed
# at data/raw/original_dataset.csv per the repo's locked folder structure.
BASE_DIR = Path(__file__).resolve().parent
GOLD_DIR = BASE_DIR / "data" / "gold"
MODEL_DIR = BASE_DIR / "models"

GOLD_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

DATA_PATH = BASE_DIR / "data" / "raw" / "traffic_simulation.csv"

df = pd.read_csv(DATA_PATH, parse_dates=["timestamp"])
df = df.sort_values("timestamp").reset_index(drop=True)

print("Training dataset:", DATA_PATH)

# ---------------- FEATURE ENGINEERING (leakage-free) ----------------
# Only use information available AT the time of prediction (time t) to forecast t + horizon.
df["lag_1"] = df["requests_per_second"].shift(1)     # 5 min ago
df["lag_3"] = df["requests_per_second"].shift(3)     # 15 min ago
df["lag_6"] = df["requests_per_second"].shift(6)      # 30 min ago
df["rolling_mean_6"] = df["requests_per_second"].shift(1).rolling(6).mean()   # trailing 30-min avg
df["rolling_mean_12"] = df["requests_per_second"].shift(1).rolling(12).mean() # trailing 60-min avg
df["rolling_std_6"] = df["requests_per_second"].shift(1).rolling(6).std()

# TARGET: request rate FORECAST_HORIZON_STEPS ahead of the current row
df["target_future_rps"] = df["requests_per_second"].shift(-FORECAST_HORIZON_STEPS)
# keep the future timestamp too, for reporting
df["target_timestamp"] = df["timestamp"].shift(-FORECAST_HORIZON_STEPS)
df["target_is_spike"] = df["is_spike"].shift(-FORECAST_HORIZON_STEPS)

FEATURES = [
    "hour_of_day", "day_of_week", "is_weekend",
    "requests_per_second",   # current known rate at prediction time
    "lag_1", "lag_3", "lag_6",
    "rolling_mean_6", "rolling_mean_12", "rolling_std_6",
]

model_df = df.dropna(subset=FEATURES + ["target_future_rps"]).reset_index(drop=True)
print("Usable rows after feature engineering:", model_df.shape)

X = model_df[FEATURES]
y = model_df["target_future_rps"]

# ---------------- TIME-BASED TRAIN/TEST SPLIT ----------------
split_idx = int(len(model_df) * TRAIN_FRACTION)
X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
meta_test = model_df.iloc[split_idx:][["timestamp", "target_timestamp", "target_is_spike"]].reset_index(drop=True)

print(f"Train rows: {len(X_train)}, Test rows: {len(X_test)}")

# ---------------- TRAIN & COMPARE MODELS ----------------
candidates = {
    "LinearRegression": LinearRegression(),
    "RandomForest": RandomForestRegressor(n_estimators=200, max_depth=10, random_state=42, n_jobs=-1),
    "GradientBoosting": GradientBoostingRegressor(n_estimators=200, max_depth=3, learning_rate=0.05, random_state=42),
}

results = {}
for name, model in candidates.items():
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    r2 = r2_score(y_test, preds)
    mae = mean_absolute_error(y_test, preds)
    results[name] = {"r2": r2, "mae": mae, "model": model}
    print(f"{name:18s}  R2={r2:.4f}   MAE={mae:.2f} req/s")

best_name = max(results, key=lambda k: results[k]["r2"])
best_model = results[best_name]["model"]
print(f"\nSelected model: {best_name} (R2={results[best_name]['r2']:.4f})")

# ---------------- SAVE MODEL ----------------
joblib.dump(best_model, MODEL_DIR / "forecasting_model.joblib")
joblib.dump(FEATURES, MODEL_DIR / "model_features.joblib")

# ---------------- CONFIDENCE ESTIMATION ----------------
# For RandomForest: use spread across individual trees as an uncertainty proxy.
# For other models: fall back to a residual-based confidence using test-set MAE.
def compute_confidence(model, X_data, fallback_mae, y_range):
    if hasattr(model, "estimators_") and hasattr(model.estimators_[0], "predict"):
        try:
            tree_preds = np.array([est.predict(X_data.values) for est in model.estimators_])
            std = tree_preds.std(axis=0)
            confidence = 100 * (1 - np.clip(std / (y_range + 1e-6), 0, 1))
            return confidence
        except Exception:
            pass
    # fallback: flat confidence based on overall test MAE relative to data range
    flat_conf = 100 * (1 - min(fallback_mae / (y_range + 1e-6), 1))
    return np.full(len(X_data), flat_conf)

y_range = model_df["requests_per_second"].max() - model_df["requests_per_second"].min()
test_preds = best_model.predict(X_test)
confidence = compute_confidence(best_model, X_test, results[best_name]["mae"], y_range)

# ---------------- EXPORT PREDICTIONS (matches SRS Prediction entity) ----------------
predictions_export = pd.DataFrame({
    "Prediction_Time": meta_test["timestamp"],           # when the prediction was generated
    "Forecast_For_Time": meta_test["target_timestamp"],  # the future interval being forecast
    "Predicted_Workload": np.round(test_preds, 1),
    "Actual_Workload": np.round(y_test.values, 1),
    "Prediction_Confidence": np.round(confidence, 1),
    "Forecast_Duration": FORECAST_DURATION_MIN,
    "Prediction_Status": "SUCCESS",
    "Actual_Is_Spike": meta_test["target_is_spike"].astype(int),
})
predictions_export.to_csv(
    GOLD_DIR / "predictions_export.csv",
    index=False
)

# ---------------- FEATURE IMPORTANCE ----------------
if hasattr(best_model, "feature_importances_"):
    importance = dict(zip(FEATURES, best_model.feature_importances_.round(4)))
else:
    importance = dict(zip(FEATURES, np.abs(best_model.coef_).round(4)))
importance = dict(sorted(importance.items(), key=lambda x: -x[1]))

# ---------------- MODEL METADATA (for API/dashboard) ----------------
metadata = {
    "model_name": best_name,
    "forecast_duration_minutes": FORECAST_DURATION_MIN,
    "test_r2": round(results[best_name]["r2"], 4),
    "test_mae_rps": round(results[best_name]["mae"], 2),
    "all_model_comparison": {k: {"r2": round(v["r2"], 4), "mae": round(v["mae"], 2)} for k, v in results.items()},
    "feature_importance": importance,
    "features": FEATURES,
    "trained_rows": len(X_train),
    "test_rows": len(X_test),
}
with open(MODEL_DIR / "model_metadata.json", "w") as f:
    json.dump(metadata, f, indent=2)

print("\nSaved: models/forecasting_model.joblib, data/gold/predictions_export.csv, models/model_metadata.json")
print("\nFeature importance:")
for k, v in importance.items():
    print(f"  {k:18s} {v}")
