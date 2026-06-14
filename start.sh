#!/bin/bash
echo "Starting VK Scheduler..."
(cd backend && python startup.py) &
BACKEND_PID=$!
(cd frontend && npm run dev) &
FRONTEND_PID=$!
trap "kill $BACKEND_PID $FRONTEND_PID" EXIT
wait
