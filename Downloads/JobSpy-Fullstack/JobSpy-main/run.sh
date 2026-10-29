#!/usr/bin/env bash

set -Ee

cd "$(dirname "$0")"
PROJECT_DIR="$PWD"

cleanup() {
    echo
    echo "Stopping JobSpy frontend and backend..."
    kill "${BACKEND_PID:-}" "${FRONTEND_PID:-}" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "=================================="
echo "       JobSpy Full Stack"
echo "=================================="

# Check requirements
command -v python3 >/dev/null || {
    echo "Python3 missing. Install with: sudo apt install python3 python3-venv"
    exit 1
}

command -v npm >/dev/null || {
    echo "npm missing. Install with: sudo apt install nodejs npm"
    exit 1
}

# Python environment
if [ ! -d .venv ]; then
    python3 -m venv .venv
fi

source .venv/bin/activate

echo "[1/5] Installing backend dependencies..."
python -m pip install -e .
python -m pip install -r backend/requirements.txt

# Frontend dependencies
echo "[2/5] Installing frontend dependencies..."
cd "$PROJECT_DIR/ui"
npm install
cd "$PROJECT_DIR"

# Start backend
echo "[3/5] Starting backend..."
python -m uvicorn backend.main:app \
    --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

# Wait for backend health
echo "Waiting for backend API..."
READY=0

for i in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
        READY=1
        break
    fi

    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Backend stopped unexpectedly. Check the error above."
        exit 1
    fi

    sleep 1
done

if [ "$READY" -ne 1 ]; then
    echo "Backend health check failed. Check port 8000 and backend errors."
    exit 1
fi

echo "Backend API connected."

# Start frontend
echo "[4/5] Starting frontend..."
cd "$PROJECT_DIR/ui"
npm run dev -- --host 127.0.0.1 &
FRONTEND_PID=$!
cd "$PROJECT_DIR"

sleep 3

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    echo "Frontend failed to start. Check npm errors."
    exit 1
fi

echo
echo "[5/5] JobSpy is running!"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://127.0.0.1:8000"
echo "API Docs: http://127.0.0.1:8000/docs"
echo
echo "Keep this terminal open. Press Ctrl+C to stop both."

xdg-open http://localhost:5173 >/dev/null 2>&1 || true

wait
