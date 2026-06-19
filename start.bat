@echo off
echo Starting Backend...
start "Backend" cmd /k "cd backend && python startup.py"

echo Waiting for backend at http://localhost:8000/api/health ...
:wait_loop
curl -s http://localhost:8000/api/health >nul 2>&1
if %errorlevel% equ 0 (
    echo Backend is ready!
    goto :start_frontend
)
timeout /t 1 /nobreak >nul
goto :wait_loop

:start_frontend
echo Starting Frontend...
start "Frontend" cmd /k "cd frontend && npm run dev"
echo.
echo Backend:  http://localhost:8000/docs
echo Frontend: http://localhost:5173
