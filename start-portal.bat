@echo off
rem LITTLE HUNTER analytical portal - launcher (opens portal window without address bar if possible)
setlocal
set "HERE=%~dp0"
set "URL=file:///%HERE:\=/%index.html"

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  start "LITTLE HUNTER portal" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="%URL%" --window-size=1500,940
  goto end
)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
  start "LITTLE HUNTER portal" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="%URL%" --window-size=1500,940
  goto end
)
start "LITTLE HUNTER portal" "%URL%"

:end
endlocal
