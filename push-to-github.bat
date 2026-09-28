@echo off
chcp 65001 >nul
set "GIT=C:\Users\lenovo\AppData\Roaming\qianfan-desktop-app\lightsandbox\git\mingw64\bin\git.exe"
set "REPO_URL=https://github.com/bizmodel-lab/bizmodel-lab-v3.git"
echo ==================================================
echo   BizModelLab V3 - Push to GitHub (retry x5)
echo ==================================================
echo.
echo [1/2] Configuring remote ...
"%GIT%" config credential.helper manager
"%GIT%" remote remove origin 2>nul
"%GIT%" remote add origin %REPO_URL%
if errorlevel 1 goto :fail
echo       Remote added: %REPO_URL%
echo.
echo [2/2] Pushing (up to 5 attempts, 5s apart) ...
echo       If a browser login window opens, authorize with your GitHub account.
set PUSH_OK=0
for /L %%i in (1,1,5) do (
  echo       --- attempt %%i/5 ---
  "%GIT%" push -u origin main
  if not errorlevel 1 (
    set PUSH_OK=1
    goto :pushok
  )
  if %%i LSS 5 (
    echo       failed, retrying in 5 seconds...
    timeout /t 5 /nobreak >nul
  )
)
goto :fail
:pushok
echo.
echo ==================================================
echo   PUSH SUCCESS!
echo   Repo URL: https://github.com/bizmodel-lab/bizmodel-lab-v3
echo   Send this URL to DuMate to continue deployment.
echo ==================================================
pause
exit /b 0
:fail
echo.
echo ==================================================
echo   PUSH FAILED after 5 attempts.
echo   Possible causes: brief network/DNS issue,
echo   GitHub login not completed, or repo name mismatch.
echo   Please screenshot this window and send to DuMate.
echo ==================================================
pause
exit /b 1
