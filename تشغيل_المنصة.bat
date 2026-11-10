@echo off
chcp 65001 > nul
title تشغيل منصة استوديو EDGE الإبداعي
color 0b

echo ======================================================
echo    🚀 جاري تشغيل منصة استوديو EDGE الإبداعي...
echo ======================================================
echo.

node -v > nul 2>&1
if %errorlevel% neq 0 (
    echo [خطأ] لم يتم العثور على Node.js في جهازك!
    echo يرجى التأكد من تثبيت Node.js من: https://nodejs.org
    pause
    exit /b
)

echo [1/2] فحص الحزم والاعتماديات...
if not exist node_modules (
    echo جاري تثبيت الحزم المطلوبة لأول مرة...
    call npm install
)

echo [2/2] بدء تشغيل الخادم وفتح المتصفح...
start http://localhost:3000

call npm start
pause

