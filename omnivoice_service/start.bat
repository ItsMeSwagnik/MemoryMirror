@echo off
set HF_HUB_DISABLE_SYMLINKS_WARNING=1
set HF_HUB_DISABLE_PROGRESS_BARS=0

echo [OmniVoice] Starting FastAPI on http://localhost:8000 ...
echo [OmniVoice] First run will download the model (~2-4 GB) - please wait.
echo.

venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8000 --reload
