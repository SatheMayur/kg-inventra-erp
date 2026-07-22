@echo off
setlocal

set "ROOT=D:\Store_KG\Store_KG"
set "FRONTEND=%ROOT%\frontend"
set "BACKEND=%ROOT%\backend"

echo Starting backend and frontend...

start "backend" /D "%BACKEND%" "C:\Progra~1\nodejs\node.exe" "src\server.js"
start "frontend" /D "%FRONTEND%\dist" "C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe" "-m" "http.server" "5173" "--bind" "127.0.0.1"

timeout /t 8 /nobreak >nul

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" "http://localhost:5173/inward/1"

endlocal
