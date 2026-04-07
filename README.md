# 🪞 MemoryMirror

> *"Every 3 seconds someone develops dementia. They don't lose who they love. They lose access to the memory of them."*

MemoryMirror is an AI-powered memory companion for dementia patients. Families upload old photos, voice clips, and stories — the app builds an interactive companion the patient can talk to, hearing familiar voices, seeing familiar faces, and reliving cherished moments.

---

## ✨ Features

- **Family Dashboard** — Upload photos, voice clips, and stories with rich tagging (who, when, where, occasion)
- **Patient Linking** — Family members link their account to a specific patient via UID so memories are shared correctly
- **AI Memory Companion** — Patient talks to an AI that responds using *only* their real uploaded memories (powered by OpenRouter)
- **Smart Voice Selection** — AI automatically identifies which person a memory is about and narrates in their cloned voice
- **Memory Timeline** — Animated, scrollable timeline grouped by person showing all uploaded photos, stories, and voice memories sorted by year — tap any card to narrate it in that person's cloned voice
- **Memory Linking** — Stories and voice clips can be explicitly linked to photos; linked photos appear as story cover images and the correct voice plays automatically when narrating
- **Voice-to-Memory Linking** — Voice samples are linked directly to specific memories so the AI always narrates in the exact right voice, even if names don't match
- **Voice Cloning** — Loved ones' voices are cloned via ElevenLabs so the companion speaks in a familiar voice
- **Face Recognition** — Camera mode lets the patient ask "Who is this?" and the AI identifies people from memory context
- **Flashback Mode** — After 60 seconds of idle, a cinematic fullscreen experience auto-plays all memories chronologically: Ken Burns photo transitions, year/occasion overlays, and each memory narrated in the person's cloned voice with a live waveform — tap anywhere to return
- **Firebase Auth** — Google + Email/Password sign-in for family members and patients
- **Cloudinary Storage** — Photos and audio clips stored securely via Cloudinary (free tier)
- **Neon PostgreSQL** — Memory metadata, transcripts, and voice IDs stored in a serverless Postgres database
- **TTS Fallback Chain** — ElevenLabs → Browser Speech Synthesis, so audio always works
- **Dark / Light / System Theme** — Full theme support across the entire UI
- **Glassmorphism UI** — Frosted glass cards with drop shadows, responsive across all screen sizes

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4, Framer Motion |
| Backend | Node.js, Express, TypeScript (`server.ts`) |
| Database | Neon PostgreSQL (serverless) |
| File Storage | Cloudinary (free tier) |
| Auth | Firebase Authentication |
| AI (Chat) | OpenRouter API (`google/gemma-3-12b-it:free`) |
| AI (Vision) | OpenRouter API (`google/gemma-3-12b-it:free`) |
| AI (TTS) | OmniVoice (Python microservice) → ElevenLabs API → Browser Speech Synthesis fallback |
| Voice Cloning | OmniVoice zero-shot cloning → ElevenLabs Voice Cloning API fallback |
| Deployment | Vercel (serverless via `api/index.ts`) + local Express (`server.ts`) |

---

## 📁 Project Structure

```
MemoryMirror/
├── api/
│   └── index.ts                  # Vercel serverless handler (same API routes, no OmniVoice proxy)
├── src/
│   ├── components/
│   │   ├── FamilyDashboard.tsx   # Memory upload UI, voice cloning panel, patient linking
│   │   ├── PatientInterface.tsx  # Companion tab + Timeline tab, UID copy badge
│   │   └── ErrorBoundary.tsx
│   ├── services/
│   │   └── aiService.ts          # OpenRouter chat and vision calls
│   ├── lib/
│   │   ├── utils.ts
│   │   └── errorHandlers.ts
│   ├── App.tsx                   # Landing page, auth, routing, theme
│   ├── firebase.ts               # Firebase init (auth only, config via VITE_FIREBASE_* env vars)
│   ├── main.tsx
│   └── index.css                 # CSS variables, glassmorphism, glow orb animations
├── omnivoice_service/            # Python microservice for zero-shot voice cloning
├── server.ts                     # Express server + Neon DB + API routes (local dev)
├── vercel.json                   # Vercel deployment config
├── vite.config.ts
├── .env.local                    # Your secret keys (never commit this)
└── .env.example                  # Template for required env vars
```

---

## 🚀 Run Locally

**Prerequisites:** Node.js 18+

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Copy `.env.example` to `.env.local` and fill in your keys.

### 3. Run the app

```bash
npm run dev
```

App runs at **http://localhost:4000**

---

## 🔑 API Keys Setup Guide

### Neon PostgreSQL (Free — Database)
1. Go to [console.neon.tech](https://console.neon.tech) and create a free account
2. Create a new project → copy the **Connection String**
3. Paste into `DATABASE_URL` in `.env.local`
> The server auto-creates the required tables on first run. If `DATABASE_URL` is not set, it falls back to an in-memory store automatically.

### Cloudinary (Free — File Storage)
1. Go to [cloudinary.com](https://cloudinary.com) and create a free account
2. From the dashboard, copy your **Cloud Name**
3. Go to **Settings → Upload → Upload presets** → click **Add upload preset**
4. Set **Signing Mode** to **Unsigned** → save and copy the preset name
5. Add both to `.env.local`:
   - `VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name`
   - `VITE_CLOUDINARY_UPLOAD_PRESET=your_preset_name`
> Free tier gives 25GB storage and 25GB bandwidth/month — more than enough

### OpenRouter (Free — AI Chat + Vision)
1. Go to [openrouter.ai](https://openrouter.ai) and create a free account
2. Go to **Keys** → **Create Key**
3. Paste into both `OPENROUTER_API_KEY` and `VITE_OPENROUTER_API_KEY` in `.env.local`
> Uses `google/gemma-3-12b-it:free` for both chat and vision — no credit card needed

### ElevenLabs (Voice Cloning + TTS)
1. Go to [elevenlabs.io](https://elevenlabs.io) and sign up
2. Go to **Profile → API Key** → copy it
3. Paste into `ELEVENLABS_API_KEY` in `.env.local`
> If not set, the app falls back to browser speech synthesis — it always works.

### Firebase (Auth)
1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a project
2. Enable **Authentication** → **Sign-in method** → Google + Email/Password
3. Copy the config values from **Project Settings → Your apps** into `.env.local` as `VITE_FIREBASE_*` variables (see `.env.example`)
4. Make sure `localhost` (and your Vercel domain) is added to **Authentication → Authorized domains**

---

## 🗺️ How It Works

### Family Flow
1. Sign in → **Family Dashboard**
2. Copy the patient's UID from their companion screen and paste it into the **Link Patient** panel
3. Click **Add New Memory** → choose Photo, Voice, or Story
4. Tag the memory: who's in it, occasion, year, location
5. Upload the file — photos and voice clips go to Cloudinary; stories are text-only and saved directly to Neon DB
6. For voice clips: click **Clone Voice** to create an ElevenLabs voice clone for that person
7. After saving a **story**, a link picker appears — select a photo to pair with it (shows as the story's cover image)
8. After saving a **voice clip**, a link picker appears — select the photos/stories this voice belongs to so the AI always uses the right voice when narrating those memories
9. All metadata (including `linked_memory_id` and `voice_sample_id`) is saved to Neon PostgreSQL, linked to the patient's UID

### Patient Flow
1. Sign in → **Patient Companion**
2. Share your UID (bottom-right badge) with your family member so they can link their account
3. **Companion tab** — press the 🎙️ mic button and speak (e.g. *"Tell me about my son"*)
   - The AI fetches memories linked to your UID, builds a warm response, and speaks it in the relevant person's cloned voice automatically
   - A relevant photo appears on screen simultaneously
   - If idle for 60 seconds, the companion proactively shares a memory
   - Press the 📷 camera button → point at someone → ask *"Who is this?"* → Vision AI identifies them
4. **Timeline tab** — scroll through all memories grouped by person, sorted by year
   - Each card shows the photo, story text, occasion, year, and location
   - Tap **Narrate in their voice** on any card to hear it spoken in that person's cloned voice, with the photo displayed on the Companion screen

---

## 🌐 API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/memories` | Fetch memories (filter by `?authorId=` or `?patientId=`) |
| `POST` | `/api/memories` | Save a new memory with tags |
| `GET` | `/api/voices` | Fetch all cloned voice profiles |
| `POST` | `/api/clone-voice` | Clone a voice via ElevenLabs |
| `POST` | `/api/tts` | TTS proxy — OmniVoice → ElevenLabs → 404 (client falls back to browser) |
| `POST` | `/api/omnivoice-tts` | Direct OmniVoice TTS proxy (local dev only) |
| `POST` | `/api/omnivoice-clone` | OmniVoice voice clone proxy (local dev only) |
| `GET` | `/api/user-role/:uid` | Get a user's role (family / patient) |
| `POST` | `/api/user-role` | Save a user's role on first sign-in |
| `GET` | `/api/link-patient/:uid` | Get the patient linked to a family member |
| `POST` | `/api/link-patient` | Link a family member to a patient UID |
| `PATCH` | `/api/memories/:id/link` | Link a story/photo to another memory (`linked_memory_id`) |
| `PATCH` | `/api/memories/:id/voice-sample` | Link a voice sample to a memory (`voice_sample_id`) |

---

## 🎯 Roadmap

| Status | Feature |
|---|---|
| ✅ | Memory upload (photo, voice, story) with tagging |
| ✅ | AI-powered memory companion chat (OpenRouter) |
| ✅ | Smart voice selection — AI picks the right cloned voice per response |
| ✅ | Animated Memory Timeline grouped by person, sorted by year |
| ✅ | Narrate any timeline memory in the person's cloned voice |
| ✅ | ElevenLabs TTS + voice cloning |
| ✅ | Firebase Auth (Google + Email) |
| ✅ | Cloudinary file storage (photos + audio) |
| ✅ | Neon PostgreSQL for metadata |
| ✅ | Flashback Mode — cinematic idle slideshow with cloned voice narration per slide |
| ✅ | Face identification via Vision AI |
| ✅ | TTS fallback chain (ElevenLabs → Browser) |
| ✅ | Family ↔ Patient account linking via UID |
| ✅ | Glassmorphism UI with responsive layout |
| ✅ | Dark / Light / System theme |
| ✅ | OmniVoice zero-shot voice cloning (600+ languages, Python microservice — local dev) |
| ✅ | Memory linking — stories paired to photos, voice samples linked to specific memories |
| ✅ | Precise voice resolution via `voice_sample_id` — correct voice plays even without name match |
| 🔜 | Whisper transcription on voice upload |
| 🔜 | Emotion detection from voice tone |
| 🔜 | Mobile PWA support |

---

## 💡 Notes

- The patient companion greets the signed-in user by their Firebase display name (or email prefix as fallback)
- The AI response includes a `SPEAKER:` tag that the app uses to automatically select the right cloned voice — no manual selection needed
- Flashback Mode triggers after 60s of inactivity — it walks through all memories sorted by year, narrating each in the tagged person's cloned voice with Ken Burns photo animations and progress dots; tapping anywhere dismisses it and resets the idle timer
- Voice cloning uses the ElevenLabs Instant Voice Cloning API — upload a voice clip in the Family Dashboard and click **Clone Voice**
- Stories are text-only — no file is uploaded to Cloudinary; the story text lives in the `transcript` column of the `memories` table in Neon
- `linked_memory_id` on a story row points to its paired photo memory; `voice_sample_id` on any memory row points to the voice clip that should narrate it — both are set via the post-save link picker in the Family Dashboard
- Voice resolution priority when narrating: `voice_sample_id` direct link → loose `voiceMap` name match → browser speech synthesis
- The in-memory store fallback means the app works even without a database connection, great for demos
- All modals and cards use glassmorphism (`backdrop-blur-md` + semi-transparent background) with CSS variable-driven theming
- On Vercel, the Express server is replaced by `api/index.ts` (serverless). Set `OMNIVOICE_URL` to your ngrok tunnel URL in Vercel env vars to enable OmniVoice — otherwise it falls back to ElevenLabs automatically
- Firebase config is loaded entirely from `VITE_FIREBASE_*` environment variables — no `firebase-applet-config.json` needed
- Set `VITE_ELEVENLABS_API_KEY` (same value as `ELEVENLABS_API_KEY`) for client-side TTS fallback on Vercel where there's no Express backend
- Set `VITE_API_BASE` to your deployed backend URL on Vercel if you run Express separately (e.g. Railway/Render); leave empty for local dev

---

## 🤖 OmniVoice Microservice

FastAPI wrapper around OmniVoice — zero-shot multilingual TTS + voice cloning. Runs on your local machine and is exposed to Vercel via an **ngrok tunnel**.

### Architecture

```
Frontend (Vercel)
      ↓
Node.js Backend (Vercel api/index.ts)
      ↓
ngrok public URL  (https://xxx.ngrok-free.app)
      ↓
Your Laptop  (FastAPI + GPU + OmniVoice  →  localhost:8000)
```

### ngrok Setup (Windows)

1. Go to [ngrok.com/download](https://ngrok.com/download) → download **Windows (zip)** → extract `ngrok.exe` to `C:\ngrok`
2. Add `C:\ngrok` to **System Environment Variables → Path**
3. Sign up at [ngrok.com](https://ngrok.com) → Dashboard → copy your **Authtoken**
4. Run once in any terminal:
```bat
ngrok config add-authtoken YOUR_TOKEN_HERE
```

### Setup

**Prerequisites:** Python 3.12+, GPU recommended (NVIDIA CUDA or Apple Silicon MPS — CPU works but ~40x slower)

**1. Start the FastAPI service**
```bat
cd omnivoice_service
setup.bat   # first time only — creates venv, installs PyTorch + OmniVoice
start.bat   # starts uvicorn on http://localhost:8000 (downloads model ~2–4 GB on first run)
```

**2. Open a new terminal and start ngrok**
```bat
ngrok http 8000
```
You'll see output like:
```
Forwarding  https://abc123.ngrok-free.app → http://localhost:8000
```
Copy that `https://...ngrok-free.app` URL.

**3. Set the env var**

Paste the ngrok URL into `OMNIVOICE_URL` in `.env.local` (local dev) and in your **Vercel project environment variables** (production).

```
OMNIVOICE_URL=https://introrse-quellingly-hyman.ngrok-free.dev
```

Then restart `npm run dev` so it picks up the new value.

> ⚠️ The ngrok URL changes every time you restart ngrok — update `OMNIVOICE_URL` in `.env.local` and Vercel env vars each time.

For Apple Silicon, replace the PyTorch install line in `setup.bat` with:
```bat
venv\Scripts\pip install torch torchaudio
```

### OmniVoice API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/health` | Liveness check — returns `{"status":"ok","device":"..."}` |
| `POST` | `/tts` | Generate speech (pass `ref_audio_url` for voice cloning, `instruct` for voice design) |
| `POST` | `/clone` | Register a voice by Cloudinary URL |

Express proxies `/api/omnivoice-tts` and `/api/omnivoice-clone` to this service. If it's not running, Express falls through to ElevenLabs automatically.

### TTS Priority Chain

| Priority | Provider | Notes |
|---|---|---|
| 1 | OmniVoice | Best quality, zero-shot, 600+ languages |
| 2 | ElevenLabs | Cloned voices, requires API key |
| 3 | Browser Speech Synthesis | Offline safe, always works |

---

## 📄 License

MIT — built with ❤️ for families navigating dementia care.

## Copyright

Copyright © 2026 MemoryMirror. All rights reserved.

This project is licensed under the MIT License — you are free to use, modify, and distribute this software, provided the original copyright notice and license terms are retained.
