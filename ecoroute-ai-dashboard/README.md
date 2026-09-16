# EcoRoute AI Dashboard

React + Vite frontend for the EcoRoute AI predictive load balancer project.

## Stack
- React
- Vite
- Recharts
- Lucide React

## Run
```bash
npm install
npm run dev
```

Then open the local URL shown by Vite.

## Project structure
```text
src/
  components/      Reusable UI components
  data/            Temporary mock/static data
  services/        Data-access layer; replace mocks with API calls later
  App.jsx
  main.jsx
  styles.css
```

## Backend integration later
The UI does not depend directly on Redis, Node.js, or FastAPI. Replace the functions in `src/services/api.js` with `fetch()` calls to your real endpoints. Keep the returned object shapes the same where possible, and the UI components should not need major changes.

Suggested future endpoints:
- `GET /api/overview`
- `GET /api/traffic`
- `GET /api/response-time`
- `GET /api/prediction`
- `GET /api/instances`
- `GET /api/telemetry`
