
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# ---------------- CONFIG ----------------
BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
LIVE_DATA = BASE_DIR / "data" / "gold" / "live_rps_with_intervals.csv"

FORECAST_MINUTES = 15
INTERVAL_MINUTES = 5
MIN_HISTORY = 13
TIMESTAMP_TOLERANCE_SECONDS = 30

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
    recent = df.tail(MIN_HISTORY).copy()
    gaps = recent["timestamp"].diff().dropna().dt.total_seconds()

    expected_seconds = INTERVAL_MINUTES * 60
    valid_intervals = (
        (gaps - expected_seconds).abs()
        <= TIMESTAMP_TOLERANCE_SECONDS
    )

    if not valid_intervals.all():
        raise HTTPException(
            status_code=422,
            detail=(
                "Latest samples are not regularly spaced "
                "at 5-minute intervals. Collect regularly "
                "spaced data before forecasting."
            ),
        )

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