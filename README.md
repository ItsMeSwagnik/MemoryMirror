# 🪞 MemoryMirror

> *"Every 3 seconds someone develops dementia. They don't lose who they love. They lose access to the memory of them."*

MemoryMirror is an AI-powered memory companion for dementia patients. Families upload old photos, voice clips, and stories — the app builds an interactive companion the patient can talk to, hearing familiar voices, seeing familiar faces, and reliving cherished moments.

---

## ✨ Features

- **Family Dashboard** — Upload photos, voice clips, and stories with rich tagging (who, when, where, occasion)
- **Patient Linking** — Family members link their account to a specific patient via UID so memories are shared correctly
- **AI Memory Companion** — Patient talks to an AI that responds using *only* their real uploaded memories (powered by OpenRouter)
- **Voice Cloning** — Loved ones' voices are cloned via ElevenLabs so the companion can speak in a familiar voice
- **Face Recognition** — Camera mode lets the patient ask "Who is this?" and the AI identifies people from memory context
- **Proactive Reminiscence** — If the patient is idle for 60 seconds, the companion proactively shares a warm memory
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
| AI (Chat) | OpenRouter API (`mistralai/mistral-small-3.1-24b-instruct:free`) |
| AI (Vision) | OpenRouter API (`meta-llama/llama-3.2-11b-vision-instruct:free`) |
| AI (TTS) | ElevenLabs API → Browser Speech Synthesis fallback |
| Voice Cloning | ElevenLabs Voice Cloning API |

---

## 📁 Project Structure

```
MemoryMirror/
├── src/
│   ├── components/
│   │   ├── FamilyDashboard.tsx   # Memory upload UI, voice cloning panel, patient linking
│   │   ├── PatientInterface.tsx  # Patient-facing companion screen, UID copy badge
│   │   └── ErrorBoundary.tsx
│   ├── services/
│   │   └── aiService.ts          # OpenRouter chat and vision calls
│   ├── lib/
│   │   ├── utils.ts
│   │   └── errorHandlers.ts
│   ├── App.tsx                   # Landing page, auth, routing, theme
│   ├── firebase.ts               # Firebase init (auth only)
│   ├── main.tsx
│   └── index.css                 # CSS variables, glassmorphism, glow orb animations
├── server.ts                     # Express server + Neon DB + API routes
├── vite.config.ts
├── .env.local                    # Your secret keys (never commit this)
├── .env.example                  # Template for required env vars
└── firebase-applet-config.json   # Firebase project config
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
3. Paste into `OPENROUTER_API_KEY` in `.env.local`
> Uses `mistralai/mistral-small-3.1-24b-instruct:free` for chat and `meta-llama/llama-3.2-11b-vision-instruct:free` for vision — no credit card needed

### Neon PostgreSQL (Free — Database)
1. Go to [console.neon.tech](https://console.neon.tech) and create a free account
2. Create a new project → copy the **Connection String**
3. Paste into `DATABASE_URL` in `.env.local`
> The server auto-creates the required tables on first run. If `DATABASE_URL` is not set, it falls back to an in-memory store automatically.

### ElevenLabs (Voice Cloning + TTS)
1. Go to [elevenlabs.io](https://elevenlabs.io) and sign up
2. Go to **Profile → API Key** → copy it
3. Paste into `ELEVENLABS_API_KEY` in `.env.local`
> If not set, the app falls back to browser speech synthesis — it always works.

### Firebase (Auth) — 
The Firebase is set up in `firebase-applet-config.json`. Auth (Google + Email) works out of the box. Make sure `localhost` is added to **Firebase Console → Authentication → Authorized domains**.

---

## 🗺️ How It Works

### Family Flow
1. Sign in → **Family Dashboard**
2. Copy the patient's UID from their companion screen and paste it into the **Link Patient** panel
3. Click **Add New Memory** → choose Photo, Voice, or Story
4. Tag the memory: who's in it, occasion, year, location
5. Upload the file (stored in Cloudinary)
6. For voice clips: click **Clone Voice** to create an ElevenLabs voice clone for that person
7. All metadata is saved to Neon PostgreSQL, linked to the patient's UID

### Patient Flow
1. Sign in → **Patient Companion**
2. Share your UID (bottom-right badge) with your family member so they can link their account
3. Press the 🎙️ mic button and speak (e.g. *"Tell me about my son"*)
4. The app fetches memories linked to your UID from the database
5. OpenRouter AI builds a warm, memory-grounded response
6. ElevenLabs speaks the response in a cloned familiar voice
7. A relevant photo appears on screen simultaneously
8. If idle for 60 seconds, the companion proactively shares a memory
9. Press the 📷 camera button → point at someone → ask *"Who is this?"* → Vision AI identifies them from memory context

---

## 🌐 API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/memories` | Fetch memories (filter by `?authorId=` or `?patientId=`) |
| `POST` | `/api/memories` | Save a new memory with tags |
| `GET` | `/api/voices` | Fetch all cloned voice profiles |
| `POST` | `/api/clone-voice` | Clone a voice via ElevenLabs |
| `POST` | `/api/tts` | Text-to-speech proxy via ElevenLabs |
| `GET` | `/api/user-role/:uid` | Get a user's role (family / patient) |
| `POST` | `/api/user-role` | Save a user's role on first sign-in |
| `GET` | `/api/link-patient/:uid` | Get the patient linked to a family member |
| `POST` | `/api/link-patient` | Link a family member to a patient UID |

---

## 🎯 Roadmap

| Status | Feature |
|---|---|
| ✅ | Memory upload (photo, voice, story) with tagging |
| ✅ | AI-powered memory companion chat (OpenRouter) |
| ✅ | ElevenLabs TTS + voice cloning |
| ✅ | Firebase Auth (Google + Email) |
| ✅ | Cloudinary file storage (photos + audio) |
| ✅ | Neon PostgreSQL for metadata |
| ✅ | Proactive reminiscence (idle trigger) |
| ✅ | Face identification via Vision AI |
| ✅ | TTS fallback chain (ElevenLabs → Browser) |
| ✅ | Family ↔ Patient account linking via UID |
| ✅ | Glassmorphism UI with responsive layout |
| ✅ | Dark / Light / System theme |
| 🔜 | Whisper transcription on voice upload |
| 🔜 | Emotion detection from voice tone |
| 🔜 | Family daily digest email |
| 🔜 | Mobile PWA support |

---

## 💡 Notes

- The patient companion greets the signed-in user by their Firebase display name (or email prefix as fallback)
- Voice cloning uses the ElevenLabs Instant Voice Cloning API — upload a voice clip in the Family Dashboard and click **Clone Voice** to create a real cloned voice for that person
- The in-memory store fallback means the app works even without a database connection, great for demos
- All modals and cards use glassmorphism (`backdrop-blur-md` + semi-transparent background) with CSS variable-driven theming for consistent appearance across light, dark, and system modes

---

## 📄 License

MIT — built with ❤️ for families navigating dementia care.

## Copyright

Copyright © 2026 MemoryMirror. All rights reserved.

This project is licensed under the MIT License — you are free to use, modify, and distribute this software, provided the original copyright notice and license terms are retained.
