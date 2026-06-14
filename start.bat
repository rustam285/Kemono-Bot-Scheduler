@echo off
echo Starting VK Scheduler...
start "Backend" cmd /k "cd backend && python startup.py"
timeout /t 3 /nobreak >nul
start "Frontend" cmd /k "cd frontend && npm run dev"
echo.
echo Backend:  http://localhost:8000/docs
echo Frontend: http://localhost:5173
