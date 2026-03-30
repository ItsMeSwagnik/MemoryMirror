const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const CHAT_MODEL = "mistralai/mistral-small-3.1-24b-instruct:free";
const VISION_MODEL = "meta-llama/llama-3.2-11b-vision-instruct:free";

async function openRouterChat(messages: object[], model = CHAT_MODEL): Promise<string> {
  const res = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_OPENROUTER_API_KEY || ""}`,
      "HTTP-Referer": "http://localhost:4000",
    },
    body: JSON.stringify({ model, messages }),
  });

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function generateMemoryResponse(
  patientName: string,
  userMessage: string,
  memories: any[]
): Promise<string> {
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

  const systemPrompt = `You are a gentle, warm memory companion for ${patientName}, who has dementia.
Be deeply empathetic, patient, and kind. Use simple but descriptive language.
Use ONLY the provided memories — never invent facts. Be conversational and varied.

Memories you know:
${memoryContext}`;

  try {
    const text = await openRouterChat([
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ]);
    return text || "I'm right here with you. It's a lovely day to talk.";
  } catch (error) {
    console.error("AI chat error:", error);
    return "I'm right here with you. It's a lovely day to talk.";
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

  try {
    const text = await openRouterChat(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Who is this person in front of me?" },
            { type: "image_url", image_url: { url: imageData } },
          ],
        },
      ],
      VISION_MODEL
    );
    return text || "I'm not quite sure who this is, but they look like a friend.";
  } catch (error) {
    console.error("AI vision error:", error);
    return "I'm not quite sure who this is, but they look like a friend.";
  }
}
