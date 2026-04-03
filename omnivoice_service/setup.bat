@echo off
echo [OmniVoice] Creating virtual environment with Python 3.12...
py -3.12 -m venv venv

echo [OmniVoice] Installing PyTorch 2.11 with CUDA 12.8 (RTX 3050)...
venv\Scripts\pip install torch==2.11.0+cu128 torchaudio==2.11.0+cu128 --extra-index-url https://download.pytorch.org/whl/cu128

echo [OmniVoice] Installing OmniVoice and FastAPI (ignoring torch pin)...
venv\Scripts\pip install omnivoice fastapi "uvicorn[standard]" pydantic --no-deps
venv\Scripts\pip install accelerate gradio numpy pydub soundfile tensorboardx

echo.
echo [OmniVoice] Setup complete!
echo To start the service run:  .\start.bat
