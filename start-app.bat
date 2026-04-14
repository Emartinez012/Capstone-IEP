@echo off
start "Backend" cmd /k "cd /d "c:\Users\ja373\OneDrive\Documents\Capstone EA\expert-advisor\server" && node server.js"
timeout /t 2 /nobreak > nul
start "Frontend" cmd /k "cd /d "c:\Users\ja373\OneDrive\Documents\Capstone EA\expert-advisor\client" && npm run dev"
timeout /t 3 /nobreak > nul
start http://localhost:5173
