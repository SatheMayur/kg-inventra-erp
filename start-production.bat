@echo off
echo Starting FG Inventory Production Stack...
docker-compose up -d --build
echo.
echo Backend API: http://localhost:4000
echo Frontend:    http://localhost:80
echo.
echo Run 'docker-compose logs -f backend' to follow logs
