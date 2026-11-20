@echo off
chcp 65001 >nul
rem LifeSync 開發模式：同時啟動 Electron 與只限本機的瀏覽器模式伺服器
cd /d "%~dp0"

if not exist "node_modules\" (
  echo 第一次執行，正在安裝依賴套件（npm install）...
  call npm install
  if errorlevel 1 goto failed
)

call npm run dev:all
if errorlevel 1 goto failed
exit /b 0

:failed
echo.
echo 執行失敗，請查看上方的錯誤訊息。
pause
exit /b 1