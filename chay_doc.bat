@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ============================================
echo   TAO BAN ANH GIAM DINH - KHO A4 DOC
echo ============================================
echo.

set /p gdv="Nhap ten Giam Dinh Vien: "

echo.
echo Chon kieu ban anh:
echo   1. Ban anh CHI TIET thiet hai
echo   2. Ban anh HIEN TRUONG
echo   3. GIAY TO co lien quan (bo cuc tu dong)
echo   4. Anh XAC MINH hien truong
echo.
set /p loai_so="Nhap so (1-4, Enter = mac dinh 1): "

if "%loai_so%"=="2" (
    set loai=hientruong
) else if "%loai_so%"=="3" (
    set loai=giayto
) else if "%loai_so%"=="4" (
    set loai=xacminh
) else (
    set loai=chitiet
)

set so_anh=6
if not "%loai%"=="giayto" (
    echo.
    echo So anh tren moi trang ^(A4 doc^): 1, 2, 3, 4, 6, 8, 9, 12
    set /p so_anh_in="Nhap so anh/trang (Enter = 6): "
    if not "!so_anh_in!"=="" set so_anh=!so_anh_in!
)

echo.
set /p ma_hs="Ma ho so (Enter de bo qua): "
set /p ngay="Ngay giam dinh DD/MM/YYYY (Enter de bo qua): "

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
if "%loai%"=="giayto" (
    python ghep_anh.py --gdv "%gdv%" --layout doc --loai %loai% --ma-ho-so "%ma_hs%" --ngay "%ngay%"
) else (
    python ghep_anh.py --gdv "%gdv%" --layout doc --loai %loai% --so-anh %so_anh% --ma-ho-so "%ma_hs%" --ngay "%ngay%"
)
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
