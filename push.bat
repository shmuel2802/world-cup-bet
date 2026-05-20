@echo off
chcp 65001 > nul
title Mundial Bet - Push to GitHub 🏆

echo ===================================================
echo   🏆 Mundial Bet - העלאת הפרויקט ל-GitHub 🏆
echo ===================================================
echo.
echo [חשוב מאוד] לפני שממשיכים, עליך לוודא שפתחת דפדפן
echo ויצרת מאגר (Repository) חדש וריק ב-GitHub שלך בשם:
echo       --- world-cup-bet ---
echo.
echo קישור ליצירת מאגר: https://github.com/new
echo.
echo ===================================================
echo.
set /p confirm=האם יצרת כבר את המאגר ב-GitHub? (y/n): 

if /i "%confirm%" neq "y" (
    echo.
    echo אנא צור את המאגר תחילה ולאחר מכן הפעל את הסקריפט מחדש.
    pause
    exit /b
)

echo.
echo [1/2] דוחף את הקוד ל-GitHub...
git push -u origin main

if %errorlevel% neq 0 (
    echo.
    echo [שגיאה] העלאה נכשלה. 
    echo ודא שהמאגר ב-GitHub נוצר בהצלחה עם השם המדויק 'world-cup-bet'
    echo ושאתה מחובר ל-GitHub במחשב זה.
    echo.
    pause
    exit /b
)

echo.
echo ===================================================
echo   🎉 הקוד הועלה בהצלחה לחשבון ה-GitHub שלך! 🎉
echo ===================================================
echo כעת תוכל להמשיך לשלב הבא:
echo 1. פריסת השרת ב-Render.com (נווט ל-README.md להוראות)
echo 2. הגדרת בסיס נתונים ב-Firebase.
echo.
pause
