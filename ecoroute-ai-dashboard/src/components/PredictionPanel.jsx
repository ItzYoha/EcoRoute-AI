
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
} from "lucide-react";

import { PredictionChart } from "./ChartCard";

export default function PredictionPanel({ data, confidence }) {
  const currentRps = Number(data?.current_rps ?? 0);
  const predictedRps = Number(data?.predicted_rps ?? 0);

  const chartData = [
    {
      time: "Current",
      actual: currentRps,
      predicted: null,
    },
    {
      time: "In 15 min",
      actual: null,
      predicted: predictedRps,
    },
  ];

  const changePercent =
    currentRps > 0
      ? ((predictedRps - currentRps) / currentRps) * 100
      : null;

  const isIncrease = predictedRps > currentRps;

  return (
    <section className="panel prediction-panel" id="prediction">
      <div className="panel-heading">
        <div>
          <h2>Workload Prediction</h2>
          <p>15-minute workload forecast</p>
        </div>

        <span className="model-pill">
          <BrainCircuit size={15} />
          {data?.model_name ?? "Forecasting model"}
        </span>
      </div>

      <div className="prediction-layout">
        <div className="prediction-stats">
          <div className="forecast-card">
            <span>Current workload</span>
            <strong>
              {currentRps.toFixed(2)} <small>RPS</small>
            </strong>
            <em>Latest collected measurement</em>
          </div>

          <div className="forecast-card highlight">
            <span>15-min forecast</span>
            <strong>
              {predictedRps.toFixed(2)} <small>RPS</small>
            </strong>
            <em>
              <Trending confidence={confidence} />
            </em>
          </div>

          <div className="spike-alert">
            {isIncrease ? (
              <AlertTriangle size={18} />
            ) : (
              <CheckCircle2 size={18} />
            )}

            <div>
              <b>
                {isIncrease
                  ? "Forecast indicates an increase"
                  : "Forecast does not indicate an increase"}
              </b>

              <p>
                {changePercent === null
                  ? "Percentage change unavailable because current RPS is zero."
                  : `Forecast change: ${
                      changePercent > 0 ? "+" : ""
                    }${changePercent.toFixed(1)}% over 15 minutes.`}
              </p>
            </div>
          </div>

          <p className="prediction-note">
            Status: {data?.prediction_status ?? "Unavailable"}
            <br />
            Forecast for:{" "}
            {data?.forecast_for_time
              ? new Date(data.forecast_for_time).toLocaleTimeString()
              : "N/A"}
          </p>
        </div>

        <div className="chart-wrap">
          <PredictionChart data={chartData} />
        </div>
      </div>
    </section>
  );
}

function Trending({ confidence }) {
  const value = Number(confidence);

  return (
    <span className="confidence">
      <CheckCircle2 size={14} />
      {Number.isFinite(value)
        ? `${value.toFixed(1)} confidence proxy`
        : "Confidence unavailable"}
    </span>
  );
}