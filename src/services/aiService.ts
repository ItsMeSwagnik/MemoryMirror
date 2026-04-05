const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const CHAT_MODEL = "google/gemma-3-12b-it:free";
const VISION_MODEL = "google/gemma-3-12b-it:free";

let queue: Promise<unknown> = Promise.resolve();
const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = queue.then(fn);
  queue = next.catch(() => {});
  return next;
};

async function openRouterChat(messages: object[], model = CHAT_MODEL, retries = 3): Promise<string> {
  return enqueue(async () => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY || ""}`,
          "HTTP-Referer": typeof window !== "undefined" ? window.location.origin : "https://memory-mirror-three.vercel.app",
        },
        body: JSON.stringify({ model, messages }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`%c[AI] ${model} ✅`, "color:#a78bfa;font-weight:bold");
        return data.choices?.[0]?.message?.content || "";
      }

      if (res.status === 429 && attempt < retries) {
        const delay = Math.pow(2, attempt + 1) * 3000;
        console.warn(`%c[AI] 429 rate limit — waiting ${delay / 1000}s (retry ${attempt + 1}/${retries})`, "color:#f97316;font-weight:bold");
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      const errBody = await res.json().catch(() => ({}));
      console.error(`%c[AI] Error ${res.status}:`, "color:#f87171;font-weight:bold", JSON.stringify(errBody));
      throw new Error(`OpenRouter error: ${res.status}`);
    }
    throw new Error("OpenRouter: max retries exceeded");
  });
}

export async function generateMemoryResponse(
  patientName: string,
  userMessage: string,
  memories: any[]
): Promise<{ text: string; speakerName: string | null }> {
  // No memories uploaded yet — don't fabricate anything
  if (!memories || memories.length === 0) {
    return {
      text: `I don't have any memories to share yet, ${patientName}. Ask your family members to upload some photos, stories, or voice clips so we can remember together.`,
      speakerName: null,
    };
  }
  const memoryContext = memories
    .map((m) => {
      let ctx = `Memory Type: ${m.type}. `;
      if (m.people?.length) ctx += `People: ${m.people.join(", ")}. `;
      if (m.occasion) ctx += `Occasion: ${m.occasion}. `;
      if (m.year) ctx += `Year: ${m.year}. `;
      if (m.transcript) ctx += `Details: ${m.transcript}. `;
      return ctx;
    })
    .join("\n");

  // Collect all known people names
  const knownPeople = [...new Set(memories.flatMap(m => m.people || []))] as string[];

  const systemPrompt = `You are a gentle, warm memory companion for ${patientName}, who has dementia.
Be deeply empathetic, patient, and kind. Use simple but descriptive language.
You MUST only talk about the memories listed below. If the user asks about something not covered by these memories, say you don't have a memory about that yet and gently suggest their family can add one.
NEVER invent people, places, dates, or events. NEVER make up details.
At the END of your response, on a new line, write SPEAKER: <name> where <name> is the person whose voice should narrate this (pick from: ${knownPeople.join(", ") || "none"}). If no specific person is relevant, write SPEAKER: none.

Memories you know about ${patientName}:
${memoryContext}`;

  try {
    const raw = await openRouterChat([
      { role: "user", content: `${systemPrompt}\n\nUser message: ${userMessage}` },
    ]);

    // Parse out SPEAKER tag
    const speakerMatch = raw.match(/\nSPEAKER:\s*(.+)$/i);
    const speakerName = speakerMatch ? speakerMatch[1].trim() : null;
    const text = raw.replace(/\nSPEAKER:\s*.+$/i, "").trim();
    console.log(`%c[AI Chat] Speaker: ${speakerName ?? "none"}`, "color:#a78bfa");
    return { text: text || "I'm right here with you. It's a lovely day to talk.", speakerName: speakerName === "none" ? null : speakerName };
  } catch (error) {
    console.error("%c[AI Chat] Failed:", "color:#f87171;font-weight:bold", error);
    return { text: "I'm right here with you. It's a lovely day to talk.", speakerName: null };
  }
}

export async function identifyPerson(imageData: string, memories: any[]): Promise<string> {
  const peopleContext = memories
    .filter((m) => m.people?.length)
    .map((m) => `Person: ${m.people.join(", ")}. Occasion: ${m.occasion || "N/A"}. Year: ${m.year || "N/A"}`)
    .join("\n");

  const systemPrompt = `You are a face recognition assistant for a dementia patient.
Identify the person in the image based on these known people:
${peopleContext}`;

  console.log("%c[AI Vision] Identifying person via " + VISION_MODEL, "color:#a78bfa;font-weight:bold");
  try {
    const text = await openRouterChat(
      [
        { role: "user", content: [
            { type: "text", text: `${systemPrompt}\n\nQuestion: Who is this person in front of me?` },
            { type: "image_url", image_url: { url: imageData } },
          ],
        },
      ],
      VISION_MODEL
    );
    console.log("%c[AI Vision] Result:", "color:#a78bfa", text?.slice(0, 80));
    return text || "I'm not quite sure who this is, but they look like a friend.";
  } catch (error) {
    console.error("%c[AI Vision] Failed:", "color:#f87171;font-weight:bold", error);
    return "I'm not quite sure who this is, but they look like a friend.";
  }
}
