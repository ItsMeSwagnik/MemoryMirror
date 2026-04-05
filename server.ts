import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config(); // fallback to .env

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Neon connection pool (only when DATABASE_URL is set)
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    })
  : null;

// In-memory fallback store
const memStore = {
  memories: [] as any[],
  voices: [] as any[],
  users: [] as any[],
  nextId: 1,
};

async function query(text: string, params?: any[]): Promise<{ rows: any[] }> {
  if (pool) return pool.query(text, params);

  // Minimal in-memory shim for the queries used in this server
  const t = text.trim().toUpperCase();

  if (t.startsWith("CREATE TABLE")) return { rows: [] };

  if (t.startsWith("SELECT ROLE FROM USERS")) {
    const uid = params?.[0];
    const user = memStore.users.find(u => u.uid === uid);
    return { rows: user ? [{ role: user.role }] : [] };
  }
  if (t.startsWith("SELECT LINKED_PATIENT_ID FROM USERS")) {
    const uid = params?.[0];
    const user = memStore.users.find(u => u.uid === uid);
    return { rows: user ? [{ linked_patient_id: user.linked_patient_id || null }] : [] };
  }
  if (t.startsWith("INSERT INTO USERS")) {
    const [uid, role] = params || [];
    const existing = memStore.users.find(u => u.uid === uid);
    if (!existing) memStore.users.push({ uid, role, linked_patient_id: null });
    return { rows: [] };
  }
  if (t.startsWith("UPDATE USERS SET LINKED_PATIENT_ID")) {
    const [patientId, uid] = params || [];
    const user = memStore.users.find(u => u.uid === uid);
    if (user) user.linked_patient_id = patientId;
    return { rows: [] };
  }
  if (t.startsWith("SELECT * FROM MEMORIES")) {
    const filterVal = params?.[0];
    const filterKey = t.includes("PATIENT_ID") ? "patient_id" : "author_id";
    const rows = filterVal ? memStore.memories.filter(m => m[filterKey] === filterVal) : [...memStore.memories];
    return { rows: rows.reverse() };
  }
  if (t.startsWith("INSERT INTO MEMORIES")) {
    const [type, file_url, transcript, people, occasion, year, location, author_id, patient_id] = params || [];
    const row = { id: memStore.nextId++, type, file_url, transcript, people, occasion, year, location, author_id, patient_id, linked_memory_id: null, voice_sample_id: null, created_at: new Date() };
    memStore.memories.push(row);
    return { rows: [row] };
  }
  if (t.startsWith("SELECT * FROM PEOPLE_VOICES")) {
    return { rows: [...memStore.voices].reverse() };
  }
  if (t.startsWith("INSERT INTO PEOPLE_VOICES")) {
    const [person_name, voice_id] = params || [];
    const existing = memStore.voices.find(v => v.person_name === person_name);
    if (existing) existing.voice_id = voice_id;
    else memStore.voices.push({ id: memStore.nextId++, person_name, voice_id, created_at: new Date() });
    return { rows: [] };
  }

  return { rows: [] };
}

async function initDb() {
  if (!pool) {
    console.warn("DATABASE_URL not set — using in-memory store (data resets on restart)");
    return;
  }
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS memories (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        file_url TEXT,
        transcript TEXT,
        people TEXT[],
        occasion TEXT,
        year TEXT,
        location TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        author_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        linked_memory_id INTEGER,
        voice_sample_id INTEGER
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS people_voices (
        id SERIAL PRIMARY KEY,
        person_name TEXT UNIQUE NOT NULL,
        voice_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        uid TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('family', 'patient')),
        linked_patient_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_patient_id TEXT`);
    await query(`ALTER TABLE memories ADD COLUMN IF NOT EXISTS linked_memory_id INTEGER`);
    await query(`ALTER TABLE memories ADD COLUMN IF NOT EXISTS voice_sample_id INTEGER`);
    console.log("Database initialized");
  } catch (err: any) {
    console.error("Database initialization error:", err.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 4000;

  app.use(express.json());

  // User role routes
  app.get("/api/user-role/:uid", async (req, res) => {
    try {
      const { uid } = req.params;
      const result = await query("SELECT role FROM users WHERE uid = $1", [uid]);
      if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
      res.json({ role: result.rows[0].role });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/user-role", async (req, res) => {
    try {
      const { uid, role } = req.body;
      await query(
        "INSERT INTO users (uid, role) VALUES ($1, $2) ON CONFLICT (uid) DO NOTHING",
        [uid, role]
      );
      res.json({ uid, role });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Family <-> Patient linking
  app.get("/api/link-patient/:uid", async (req, res) => {
    try {
      const result = await query("SELECT linked_patient_id FROM users WHERE uid = $1", [req.params.uid]);
      if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
      res.json({ linkedPatientId: result.rows[0].linked_patient_id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/link-patient", async (req, res) => {
    try {
      const { familyUid, patientUid } = req.body;
      // Verify the patientUid is actually a patient role
      const check = await query("SELECT role FROM users WHERE uid = $1", [patientUid]);
      if (check.rows.length === 0) return res.status(404).json({ error: "Patient account not found" });
      if (check.rows[0].role !== "patient") return res.status(400).json({ error: "That account is not a patient" });
      await query("UPDATE users SET linked_patient_id = $1 WHERE uid = $2", [patientUid, familyUid]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const OMNIVOICE_URL = "http://localhost:8000";

  // Check if OmniVoice microservice is running
  async function omnivoiceAvailable(): Promise<boolean> {
    try {
      const r = await fetch(`${OMNIVOICE_URL}/health`, { signal: AbortSignal.timeout(1000) });
      return r.ok;
    } catch { return false; }
  }

  // OmniVoice TTS proxy
  app.post("/api/omnivoice-tts", async (req, res) => {
    try {
      const { text, refAudioUrl, instruct } = req.body;
      const r = await fetch(`${OMNIVOICE_URL}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ref_audio_url: refAudioUrl ?? null, instruct: instruct ?? null }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: "OmniVoice error", detail: err });
      }
      const buf = await r.arrayBuffer();
      res.set("Content-Type", "audio/wav");
      res.send(Buffer.from(buf));
    } catch (err: any) {
      res.status(503).json({ error: "OmniVoice unavailable", detail: err.message });
    }
  });

  // OmniVoice voice clone proxy
  app.post("/api/omnivoice-clone", async (req, res) => {
    try {
      const { name, sampleUrl } = req.body;
      const r = await fetch(`${OMNIVOICE_URL}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sample_url: sampleUrl }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        return res.status(r.status).json({ error: "OmniVoice clone error", detail: err });
      }
      const { voice_id } = await r.json();
      await query(
        "INSERT INTO people_voices (person_name, voice_id) VALUES ($1, $2) ON CONFLICT (person_name) DO UPDATE SET voice_id = $2",
        [name, voice_id]
      );
      console.log(`[Voice Clone] OmniVoice ✅ | person: ${name} | voice_id: ${voice_id}`);
      res.json({ voiceId: voice_id, name, provider: "omnivoice" });
    } catch (err: any) {
      res.status(503).json({ error: "OmniVoice unavailable", detail: err.message });
    }
  });

  // TTS — priority: OmniVoice → ElevenLabs → 404 (client falls back to browser TTS)
  app.post("/api/tts", async (req, res) => {
    const { text, voiceId, refAudioUrl } = req.body;

    // 1. Try OmniVoice (if running)
    if (await omnivoiceAvailable()) {
      try {
        // If voiceId looks like a Cloudinary URL it's an OmniVoice clone — use it as ref audio
        const ref = refAudioUrl || (voiceId?.startsWith("http") ? voiceId : null);
        const r = await fetch(`${OMNIVOICE_URL}/tts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, ref_audio_url: ref ?? null }),
        });
        if (r.ok) {
          console.log(`[TTS] OmniVoice ✅ | voice: ${ref ?? "auto"}`);
          const buf = await r.arrayBuffer();
          res.set("Content-Type", "audio/wav");
          return res.send(Buffer.from(buf));
        }
      } catch { /* fall through */ }
    }

    // 2. Try ElevenLabs (only if voiceId is an ElevenLabs ID, not a URL)
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const elevenLabsVoiceId = voiceId && !voiceId.startsWith("http") ? voiceId : "21m00Tcm4TlvDq8ikWAM";
    if (apiKey) {
      try {
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoiceId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
          body: JSON.stringify({
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: { stability: 0.5, similarity_boost: 0.75 },
          }),
        });
        if (response.ok) {
          console.log(`[TTS] ElevenLabs ✅ | voice: ${elevenLabsVoiceId}`);
          const buf = await response.arrayBuffer();
          res.set("Content-Type", "audio/mpeg");
          return res.send(Buffer.from(buf));
        }
        if (response.status === 402) {
          console.warn("[TTS] ElevenLabs quota exceeded, falling back to browser TTS");
          return res.status(402).json({ error: "ElevenLabs quota exceeded" });
        }
      } catch { /* fall through */ }
    }

    // 3. No TTS available — client will use browser speech synthesis
    console.warn("[TTS] No provider available — client will use browser fallback");
    res.status(404).json({ error: "No TTS provider available" });
  });

  // ElevenLabs Voice Cloning Proxy
  app.post("/api/clone-voice", async (req, res) => {
    try {
      const { name, sampleUrl } = req.body;
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
      if (!sampleUrl) throw new Error("No audio sample URL provided");

      // Fetch the audio file from Cloudinary
      const audioRes = await fetch(sampleUrl);
      if (!audioRes.ok) throw new Error("Failed to fetch audio sample from Cloudinary");
      const audioBuffer = await audioRes.arrayBuffer();

      // Build multipart/form-data for ElevenLabs IVC API
      const formData = new FormData();
      formData.append("name", name);
      formData.append("files", new Blob([audioBuffer], { type: "audio/mpeg" }), `${name}.mp3`);

      const cloneRes = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: { "xi-api-key": apiKey },
        body: formData,
      });

      if (!cloneRes.ok) {
        const err = await cloneRes.json().catch(() => ({}));
        throw new Error(`ElevenLabs cloning failed: ${cloneRes.status} ${JSON.stringify(err)}`);
      }

      const { voice_id } = await cloneRes.json();

      await query(
        "INSERT INTO people_voices (person_name, voice_id) VALUES ($1, $2) ON CONFLICT (person_name) DO UPDATE SET voice_id = $2",
        [name, voice_id]
      );
      console.log(`[Voice Clone] ElevenLabs ✅ | person: ${name} | voice_id: ${voice_id}`);
      res.json({ voiceId: voice_id, name });
    } catch (err: any) {
      console.error("Voice cloning error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Link a story/photo to another memory
  app.patch("/api/memories/:id/link", async (req, res) => {
    try {
      const { linkedMemoryId } = req.body;
      await query("UPDATE memories SET linked_memory_id = $1 WHERE id = $2", [linkedMemoryId ?? null, req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Link a voice sample to a memory
  app.patch("/api/memories/:id/voice-sample", async (req, res) => {
    try {
      const { voiceSampleId } = req.body;
      await query("UPDATE memories SET voice_sample_id = $1 WHERE id = $2", [voiceSampleId ?? null, req.params.id]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Routes
  app.get("/api/memories", async (req, res) => {
    try {
      const { authorId, patientId } = req.query;
      let q = "SELECT * FROM memories ORDER BY created_at DESC";
      let params: any[] = [];

      if (patientId) {
        q = "SELECT * FROM memories WHERE patient_id = $1 ORDER BY created_at DESC";
        params = [patientId as string];
      } else if (authorId) {
        q = "SELECT * FROM memories WHERE author_id = $1 ORDER BY created_at DESC";
        params = [authorId as string];
      }

      const result = await query(q, params);
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch memories" });
    }
  });

  app.post("/api/memories", async (req, res) => {
    try {
      const { type, fileUrl, transcript, tags, authorId, patientId } = req.body;
      const { people, occasion, year, location } = tags || {};

      const q = `
        INSERT INTO memories (type, file_url, transcript, people, occasion, year, location, author_id, patient_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;
      const params = [
        type,
        fileUrl,
        transcript,
        people || [],
        occasion,
        year,
        location,
        authorId,
        patientId || "default-patient",
      ];

      const result = await query(q, params);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to save memory" });
    }
  });

  app.get("/api/voices", async (req, res) => {
    try {
      const result = await query("SELECT * FROM people_voices ORDER BY created_at DESC");
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to fetch voices" });
    }
  });

  await initDb();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("Failed to start server:", err);
});
