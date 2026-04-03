@echo off
echo Starting locus-agent...

:: Try starting existing agent (fast path — already installed)
"%USERPROFILE%\.locus-agent\venv\Scripts\python.exe" -m locus_agent start --daemon 2>nul
if not errorlevel 1 goto :docker

:: First time or venv missing — install from repo source
echo Installing agent for the first time...
if not exist "%USERPROFILE%\.locus-agent\locus-agent" (
    mkdir "%USERPROFILE%\.locus-agent\locus-agent" 2>nul
    xcopy /s /e /y /q "%~dp0agent\*" "%USERPROFILE%\.locus-agent\locus-agent\"
)
python -m venv "%USERPROFILE%\.locus-agent\venv"
"%USERPROFILE%\.locus-agent\venv\Scripts\pip.exe" install --quiet "%USERPROFILE%\.locus-agent\locus-agent"
echo Starting agent...
start /b "" "%USERPROFILE%\.locus-agent\venv\Scripts\python.exe" -m locus_agent start > "%USERPROFILE%\.locus-agent\agent.log" 2>&1
timeout /t 2 /nobreak > nul
echo Agent running on http://localhost:7700

:docker
echo Starting Docker...
docker compose up --build -d
