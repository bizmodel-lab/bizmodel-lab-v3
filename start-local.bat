@echo off
chcp 65001 >nul
echo ============================================
echo   创见 BizLab V3 - 商业模式设计实训系统
echo ============================================
cd /d "%~dp0"
echo 正在启动服务: http://localhost:8700
echo 首次启动将自动创建管理员账号 admin / admin123456
echo （请登录后立即修改默认密码）
echo 按 Ctrl+C 停止服务...
echo.
node server.js
pause