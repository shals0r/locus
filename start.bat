@echo off
setlocal enabledelayedexpansion

echo.
echo  Locus - Engineering Control Plane
echo  ==================================
echo.

:: ------------------------------------------------------------------
:: Prerequisites
:: ------------------------------------------------------------------

where docker >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Docker not found. Install Docker Desktop first.
    exit /b 1
)

docker info >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Docker is not running. Start Docker Desktop first.
    exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Python not found. Install Python 3.12+ first.
    exit /b 1
)

:: ------------------------------------------------------------------
:: Environment file
:: ------------------------------------------------------------------

if not exist ".env" (
    echo  [SETUP] Creating .env from template...

    for /f "delims=" %%k in ('python -c "import secrets; print(secrets.token_hex(32))"') do set "SECRET_KEY=%%k"
    for /f "delims=" %%k in ('python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"') do set "ENC_KEY=%%k"

    if not defined ENC_KEY (
        echo  [WARN] cryptography not installed, using fallback for encryption key
        for /f "delims=" %%k in ('python -c "import secrets,base64; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())"') do set "ENC_KEY=%%k"
    )

    (
        echo LOCUS_DB_PASSWORD=locus_!SECRET_KEY:~0,12!
        echo LOCUS_SECRET_KEY=!SECRET_KEY!
        echo LOCUS_ENCRYPTION_KEY=!ENC_KEY!
        echo SSH_KEY_DIR=~/.ssh
    ) > .env

    echo  [SETUP] .env created with generated secrets
    echo.
)

:: ------------------------------------------------------------------
:: Host agent
:: ------------------------------------------------------------------

set "AGENT_VENV=%USERPROFILE%\.locus-agent\venv"
set "AGENT_PYTHON=%AGENT_VENV%\Scripts\python.exe"
set "AGENT_PIP=%AGENT_VENV%\Scripts\pip.exe"
set "AGENT_SRC=%USERPROFILE%\.locus-agent\locus-agent"

:: Fast path: agent already installed
if exist "%AGENT_PYTHON%" (
    echo  [AGENT] Starting host agent...
    "%AGENT_PYTHON%" -m locus_agent start --daemon 2>nul
    if not errorlevel 1 goto :agent_ready
)

:: First-time install
echo  [AGENT] Installing host agent for the first time...

if not exist "%AGENT_SRC%" mkdir "%AGENT_SRC%" 2>nul
xcopy /s /e /y /q "%~dp0agent\*" "%AGENT_SRC%\" >nul

echo  [AGENT] Creating virtual environment...
python -m venv "%AGENT_VENV%"
if errorlevel 1 (
    echo  [ERROR] Failed to create agent venv. Check your Python installation.
    exit /b 1
)

echo  [AGENT] Installing dependencies...
"%AGENT_PIP%" install --quiet "%AGENT_SRC%"

echo  [AGENT] Starting host agent...
"%AGENT_PYTHON%" -m locus_agent start --daemon

:agent_ready
echo  [AGENT] Waiting for agent to be ready...
ping -n 3 127.0.0.1 >nul

:: ------------------------------------------------------------------
:: Docker
:: ------------------------------------------------------------------

:: cmd.exe doesn't set HOME — Docker Compose needs it for bind mounts
if not defined HOME set "HOME=%USERPROFILE%"

echo  [DOCKER] Building and starting containers...
docker compose up --build -d
if errorlevel 1 (
    echo  [ERROR] Docker Compose failed. Check the output above.
    exit /b 1
)

echo.
echo  Ready! Open http://localhost:8080
echo.
