@echo off
echo [OmniVoice] Creating virtual environment with Python 3.12...
py -3.12 -m venv venv
if errorlevel 1 (
    echo ERROR: Python 3.12 not found. Install from https://python.org
    pause & exit /b 1
)

echo [OmniVoice] Upgrading pip...
venv\Scripts\python -m pip install --upgrade pip

echo [OmniVoice] Installing OmniVoice from PyPI (pulls CPU torch as dep)...
venv\Scripts\pip install omnivoice

echo [OmniVoice] Installing FastAPI + server deps...
venv\Scripts\pip install "fastapi>=0.111.0" "uvicorn[standard]>=0.29.0" "pydantic>=2.0.0"

echo [OmniVoice] Overwriting torch with CUDA 12.8 build (RTX 3050)...
venv\Scripts\pip install torch==2.7.0+cu128 torchaudio==2.7.0+cu128 --extra-index-url https://download.pytorch.org/whl/cu128 --force-reinstall --no-deps

echo.
echo [OmniVoice] Verifying CUDA...
venv\Scripts\python -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NOT FOUND')"

echo.
echo [OmniVoice] Setup complete!
echo Run .\start.bat to launch the service.
pause
