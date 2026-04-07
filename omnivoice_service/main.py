"""
OmniVoice FastAPI microservice
Runs on http://localhost:8000
Routes:
  POST /tts          — zero-shot TTS (text + optional ref_audio URL)
  POST /clone        — clone a voice from an audio URL, return voice_id (cached path)
  GET  /health       — liveness check
"""

import io
import os
import uuid
import tempfile
import urllib.request
from pathlib import Path
from typing import Optional

import torch
import torchaudio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Model loading (done once at startup)
# ---------------------------------------------------------------------------
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"
DTYPE  = torch.float16 if DEVICE == "cuda:0" else torch.float32

print(f"[OmniVoice] Loading model on {DEVICE} ({DTYPE})…")
from omnivoice import OmniVoice
model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=DEVICE, dtype=DTYPE)
print("[OmniVoice] Model ready.")

# Directory to cache downloaded reference audio files
CACHE_DIR = Path(tempfile.gettempdir()) / "omnivoice_refs"
CACHE_DIR.mkdir(exist_ok=True)

app = FastAPI(title="OmniVoice Microservice")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _download(url: str, suffix: str = ".wav") -> Path:
    """Download a remote audio file to a temp path and return it."""
    dest = CACHE_DIR / f"{uuid.uuid4().hex}{suffix}"
    urllib.request.urlretrieve(url, dest)
    return dest


def _generate_audio(text: str, ref_path: Optional[Path] = None, instruct: Optional[str] = None) -> bytes:
    """Run OmniVoice and return WAV bytes."""
    kwargs: dict = {"text": text}
    if ref_path:
        kwargs["ref_audio"] = str(ref_path)
        # Let Whisper auto-transcribe — omit ref_text
    elif instruct:
        kwargs["instruct"] = instruct

    audio_tensors = model.generate(**kwargs)  # list of Tensor (1, T) @ 24 kHz
    buf = io.BytesIO()
    torchaudio.save(buf, audio_tensors[0], 24000, format="wav")
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class TTSRequest(BaseModel):
    text: str
    ref_audio_url: Optional[str] = None   # Cloudinary URL of reference clip
    instruct: Optional[str] = None        # e.g. "female, british accent"


class CloneRequest(BaseModel):
    name: str
    sample_url: str                        # Cloudinary URL of the voice sample


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE}


@app.post("/tts")
async def tts(req: TTSRequest):
    ref_path = None
    try:
        if req.ref_audio_url:
            suffix = ".mp3" if req.ref_audio_url.endswith(".mp3") else ".wav"
            ref_path = _download(req.ref_audio_url, suffix)

        wav_bytes = _generate_audio(req.text, ref_path=ref_path, instruct=req.instruct)
        return StreamingResponse(io.BytesIO(wav_bytes), media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if ref_path and ref_path.exists():
            ref_path.unlink(missing_ok=True)


@app.post("/clone")
async def clone(req: CloneRequest):
    """
    'Cloning' with OmniVoice means storing the reference audio URL.
    At TTS time we pass it as ref_audio so the model clones on-the-fly.
    We return a voice_id that is just the Cloudinary URL — Express stores
    this in the DB and passes it back as ref_audio_url on /tts calls.
    """
    if not req.sample_url:
        raise HTTPException(status_code=400, detail="sample_url is required")
    # Validate the URL is reachable
    try:
        _download(req.sample_url, ".tmp").unlink(missing_ok=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch sample: {e}")

    return {"voice_id": req.sample_url, "name": req.name}
