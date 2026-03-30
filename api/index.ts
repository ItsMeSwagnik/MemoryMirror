import express from "express";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const { Pool } = pg;

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    })
  : null;

const memStore = {
  memories: [] as any[],
  voices: [] as any[],
  users: [] as any[],
  nextId: 1,
};

async function query(text: string, params?: any[]): Promise<{ rows: any[] }> {
  if (pool) return pool.query(text, params);

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
    if (!memStore.users.find(u => u.uid === uid)) memStore.users.push({ uid, role, linked_patient_id: null });
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
    const row = { id: memStore.nextId++, type, file_url, transcript, people, occasion, year, location, author_id, patient_id, created_at: new Date() };
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
  if (!pool) return;
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
        patient_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS people_voices (
        id SERIAL PRIMARY KEY,
        person_name TEXT UNIQUE NOT NULL,
        voice_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS users (
        uid TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('family', 'patient')),
        linked_patient_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_patient_id TEXT;
    `);
  } catch (err: any) {
    console.error("DB init error:", err.message);
  }
}

const app = express();
app.use(express.json());

app.get("/api/user-role/:uid", async (req, res) => {
  try {
    const result = await query("SELECT role FROM users WHERE uid = $1", [req.params.uid]);
    if (result.rows.length === 0) return res.status(404).json({ error: "User not found" });
    res.json({ role: result.rows[0].role });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/user-role", async (req, res) => {
  try {
    const { uid, role } = req.body;
    await query("INSERT INTO users (uid, role) VALUES ($1, $2) ON CONFLICT (uid) DO NOTHING", [uid, role]);
    res.json({ uid, role });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    const check = await query("SELECT role FROM users WHERE uid = $1", [patientUid]);
    if (check.rows.length === 0) return res.status(404).json({ error: "Patient account not found" });
    if (check.rows[0].role !== "patient") return res.status(400).json({ error: "That account is not a patient" });
    await query("UPDATE users SET linked_patient_id = $1 WHERE uid = $2", [patientUid, familyUid]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(404).json({ error: "API key not set" });

    const selectedVoiceId = voiceId || "21m00Tcm4TlvDq8ikWAM";
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "xi-api-key": apiKey },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      if (response.status === 402) return res.status(402).json({ error: "ElevenLabs Quota Exceeded", details: errorData });
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(arrayBuffer));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/clone-voice", async (req, res) => {
  try {
    const { name, sampleUrl } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not set");
    if (!sampleUrl) throw new Error("No audio sample URL provided");

    const audioRes = await fetch(sampleUrl);
    if (!audioRes.ok) throw new Error("Failed to fetch audio sample from Cloudinary");
    const audioBuffer = await audioRes.arrayBuffer();

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
    res.json({ voiceId: voice_id, name });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

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
    res.status(500).json({ error: "Failed to fetch memories" });
  }
});

app.post("/api/memories", async (req, res) => {
  try {
    const { type, fileUrl, transcript, tags, authorId, patientId } = req.body;
    const { people, occasion, year, location } = tags || {};

    const result = await query(
      `INSERT INTO memories (type, file_url, transcript, people, occasion, year, location, author_id, patient_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [type, fileUrl, transcript, people || [], occasion, year, location, authorId, patientId || "default-patient"]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: "Failed to save memory" });
  }
});

app.get("/api/voices", async (req, res) => {
  try {
    const result = await query("SELECT * FROM people_voices ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

// Initialize DB and export handler
initDb();

export default app;
