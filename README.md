# EcoRoute-AI
EcoRoute AI: A predictive load balancer and horizontal auto-scaler that shifts infrastructure scaling from reactive recovery to proactive preparation using machine learning forecasting, custom metamorphic stress testing, and R-based cost optimization dashboards.

EcoRoute AI is a decoupled, microservices-based infrastructure management framework designed to shift cloud auto-scaling from reactive recovery to proactive preparation. By separating the live network traffic routing pathway (Data Plane) from the predictive analytics engine (Control Plane), the system eliminates execution latency overhead while forecasting traffic rushes 15–30 minutes in advance.

Core Engineering Team
M Yoharudran Atsilia
Riddhi Saxena 

Repository Architecture (Mono-Repo Layout)
This repository is organized as a unified monorepo containing our isolated microservices, validation suites and analytics reporting tools:

|-- data-plane-gateway/      # Node.js / Express.js telemetry and scaling service

|-- control-plane-brain/     # Python / FastAPI / Scikit-Learn predictive inference engine 

|-- testing-validation/      # PyTest and Jest automated metamorphic stress test suites

|-- analytics-dashboard/     # R / RStudio post-deployment statistical dashboards

