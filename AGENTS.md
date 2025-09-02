# Repository Guidelines

## Project Structure & Module Organization
- backend: FastAPI app (`main.py`), domain services (`backend/services`), models, and tests (`backend/tests` + root-level `backend/test_*.py`). Scenarios live in `backend/scenarios` and runtime scenarios in `./tmp`.
- frontend: React + TypeScript app (`frontend/src`, components in `src/components`).
- nlu: Standalone NLU service (`nlu/main.py`).
- webhook-server: Mock webhook/API server (JSON Server) on port 3001.
- docs: API Call specs and SRS.

## Build, Test, and Development Commands
- Backend: `./start_backend.sh` — creates venv, installs `backend/requirements.txt`, starts Uvicorn on 8000. SCENARIO_DIR is set to `./tmp`.
- Backend tests: `./run_backend_tests.sh` — ensures venv, installs pytest + asyncio, runs `pytest backend tests`.
- Frontend: `./start_frontend.sh` — installs deps then `npm start` (React dev server on 3000). Or in `frontend/`: `npm install && npm start`.
- Webhook server: `./start_webhook_server.sh` or `cd webhook-server && npm start` (port 3001).
- NLU: `./start_nlu.sh` — creates venv, installs `nlu/requirements.txt`, starts on 8001.

## Coding Style & Naming Conventions
- Python: PEP 8, 4-space indent, snake_case for functions/vars, PascalCase for classes. Prefer type hints. Keep FastAPI routers/services small and cohesive.
- TypeScript/React: Follow CRA ESLint defaults. 2-space indent. Components in PascalCase (e.g., `CustomNode.tsx`), functions/vars camelCase. Co-locate helpers in `src/utils` and shared types in `src/types`.
- JSON scenarios: Use kebab/numbered IDs (e.g., `9000-0001.json`) and stable keys.

## Testing Guidelines
- Framework: pytest (+ pytest-asyncio). Name files `test_*.py`; use async tests where appropriate.
- Run: `./run_backend_tests.sh` or `PYTHONPATH=backend pytest backend tests`.
- Aim: cover state transitions, handlers, API/webhook integrations. Prefer small, deterministic tests.

## Commit & Pull Request Guidelines
- Commits: Conventional Commits style (e.g., `feat: ...`, `fix: ...`, `refactor: ...`, `docs: ...`). Keep subject ≤72 chars; use body for context.
- PRs: include clear description, linked issues, and steps to validate. Add screenshots/GIFs for UI changes. Note any config/env impacts (ports, env vars).

## Security & Configuration Tips
- Env: `SCENARIO_DIR` controls runtime scenario location (default `./tmp`).
- Ports: backend 8000, NLU 8001, frontend 3000, webhook 3001.
- Do not edit scenario JSONs while services are running; update, restart, then test.

