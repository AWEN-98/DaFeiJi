@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动资产布局编辑器...
echo 如果浏览器没自动打开，请手动访问：http://127.0.0.1:8942/editor/index.html
start "" "http://127.0.0.1:8942/editor/index.html"
python -m http.server 8942
