@echo off
chcp 65001 > nul
echo Starting local server...
echo The browser will open automatically.
start http://localhost:3000
npm run dev
