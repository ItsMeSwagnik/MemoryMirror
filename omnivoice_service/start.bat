set HF_HUB_DISABLE_SYMLINKS_WARNING=1
@echo off
echo [OmniVoice] Starting FastAPI on http://localhost:8000 ...
venv\Scripts\uvicorn main:app --host 0.0.0.0 --port 8000 --reload
