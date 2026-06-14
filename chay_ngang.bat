@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ==============================================
echo   TAO ANH GIAM DINH - KHO NGANG (4 anh/trang)
echo ==============================================
echo.

set /p gdv="Nhap ten Giam Dinh Vien: "

echo.
echo Chon loai giam dinh:
echo   1. Giam dinh CHI TIET
echo   2. Giam dinh HIEN TRUONG
echo   3. Giam dinh GIAY TO XE
echo.
set /p loai_so="Nhap so (1/2/3, Enter = mac dinh 1): "

if "%loai_so%"=="2" (
    set loai=hientruong
) else if "%loai_so%"=="3" (
    set loai=giayto
) else (
    set loai=chitiet
)

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
python ghep_anh.py --gdv "%gdv%" --layout ngang --loai %loai%
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
