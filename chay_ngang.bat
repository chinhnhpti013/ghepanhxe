@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   TAO ANH GIAM DINH - KHO NGANG (4 anh/trang)
echo ==============================================
echo.

set /p gdv="Nhap ten Giam Dinh Vien: "

echo.
echo [1/2] Dat ten file theo thu muc...
python dat_ten_file.py
if errorlevel 1 (
    echo LOI o buoc 1!
    pause
    exit /b 1
)

echo.
echo [2/2] Ghep anh thanh PDF...
python ghep_anh.py --gdv "%gdv%" --layout ngang
if errorlevel 1 (
    echo LOI o buoc 2!
    pause
    exit /b 1
)

echo.
echo Hoan thanh! File PDF luu tai thu muc output\
echo.
explorer output
pause
