@echo off
echo =============================================
echo   StoreHub — Launching Application
echo =============================================
cd source

echo Step 0: Aggressive Clean-up...
rem Kill any existing node processes to be safe
taskkill /f /im node.exe 2>nul
rem Clear port 3000 specifically
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %%a 2>nul

echo Step 1: Purging build cache...
if exist .next rmdir /s /q .next

echo Step 2: Syncing database...
rem Ensure local SQLite is used even if system DATABASE_URL is set
set DATABASE_URL=file:./prisma/dev.db
npx prisma db push --accept-data-loss

echo Step 3: Generating Prisma client...
npx prisma generate

echo Step 4: Starting development server...
npm run dev

pause
