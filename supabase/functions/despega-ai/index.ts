// DESPEGA+ — Supabase Edge Function for Nova
// Secret required in Supabase: GEMINI_API_KEY
// Optional: GEMINI_MODEL (defaults to gemini-2.5-flash)

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const responseSchema = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    turn_intent: { type: "STRING" },
    control_response: { type: "STRING" },
    nova_reaction: { type: "STRING" },
    nova_emotion: { type: "STRING" },
    summary: { type: "STRING" },
    goals: { type: "ARRAY", items: { type: "STRING" } },
    interests: { type: "ARRAY", items: { type: "STRING" } },
    skills: { type: "ARRAY", items: { type: "STRING" } },
    experience: { type: "ARRAY", items: { type: "STRING" } },
    barriers: { type: "ARRAY", items: { type: "STRING" } },
    training_needs: { type: "ARRAY", items: { type: "STRING" } },
    evidence: { type: "ARRAY", items: { type: "STRING" } },
    missing_dimensions: { type: "ARRAY", items: { type: "STRING" } },
    answer_sufficiency: { type: "STRING" },
    clarification_needed: { type: "BOOLEAN" },
    clarification_question: { type: "STRING" },
    rephrased_question: { type: "STRING" },
    next_question: { type: "STRING" },
    example_response: { type: "STRING" },
    profile_completeness: { type: "INTEGER" },
    should_finish: { type: "BOOLEAN" },
    final_message: { type: "STRING" },
    memory_summary: { type: "STRING" },
  },
  required: [
    "transcript","turn_intent","control_response","nova_reaction","nova_emotion",
    "summary","goals","interests","skills","experience","barriers","training_needs",
    "evidence","missing_dimensions","answer_sufficiency","clarification_needed",
    "clarification_question","rephrased_question","next_question","example_response",
    "profile_completeness","should_finish","final_message","memory_summary"
  ],
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors(origin) });
  }

  if (req.method === "GET") {
    return json({
      ok: true,
      service: "despega-ai",
      model: MODEL,
      geminiConfigured: Boolean(Deno.env.get("GEMINI_API_KEY")),
    }, 200, origin);
  }

  if (req.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405, origin);
  }

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return json({
      error: "GEMINI_NOT_CONFIGURED",
      message: "Configura GEMINI_API_KEY en Supabase Edge Functions > Secrets.",
    }, 503, origin);
  }

  try {
    const form = await req.formData();
    const audio = form.get("audio");

    if (!(audio instanceof File)) {
      return json({ error: "AUDIO_REQUIRED" }, 400, origin);
    }
    if (!audio.type.startsWith("audio/")) {
      return json({ error: "INVALID_AUDIO_TYPE" }, 400, origin);
    }
    if (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES) {
      return json({ error: "INVALID_AUDIO_SIZE", maxBytes: MAX_AUDIO_BYTES }, 400, origin);
    }

    const question = String(form.get("question") || "");
    const questionId = String(form.get("question_id") || "");
    const currentExample = String(form.get("current_example") || "");
    const answersCount = Math.max(0, Number(form.get("answers_count") || 0));

    let profile: Record<string, unknown> = {};
    let history: unknown[] = [];
    try { profile = JSON.parse(String(form.get("profile") || "{}")); } catch {}
    try {
      const parsed = JSON.parse(String(form.get("conversation_history") || "[]"));
      history = Array.isArray(parsed) ? parsed.slice(-10) : [];
    } catch {}

    const bytes = new Uint8Array(await audio.arrayBuffer());
    const audioBase64 = toBase64(bytes);

    const prompt = `
Eres NOVA, la agente conversacional de DESPEGA+, una plataforma de orientación educativa y laboral para jóvenes.

PERSONALIDAD:
- Cálida, optimista, curiosa y breve.
- Nunca infantilices ni juzgues.
- Si el usuario expresa una dificultad, responde con empatía; no uses entusiasmo exagerado.
- Haz UNA sola pregunta por turno.

OBJETIVO:
Construir progresivamente un perfil con evidencia sobre:
1) objetivos,
2) intereses,
3) habilidades o experiencia,
4) barreras o necesidades.

MEMORIA:
Usa el historial para recordar preguntas y respuestas previas.
No repitas información ya resuelta salvo que necesites aclararla.

INTENCIONES:
Clasifica turn_intent EXACTAMENTE como uno de:
answer, repeat_question, repeat_example, explain_question, pause, skip_question.

REGLAS CRÍTICAS:
- Si el usuario dice "repítela", "otra vez" o "qué me preguntaste", usa repeat_question.
- Si dice "no entendí", usa explain_question y reformula la MISMA pregunta.
- Si pide repetir el ejemplo, usa repeat_example.
- Las intenciones de control NO agregan información al perfil.
- Para una intención de control, deja goals/interests/skills/experience/barriers/training_needs/evidence vacíos.
- No infieras atributos sensibles ni condiciones que el usuario no haya declarado.
- Si la respuesta es vaga, usa clarification_needed=true y formula una aclaración breve.
- Si ya hay evidencia suficiente de objetivo + interés + (habilidad o experiencia) + barrera/necesidad y existen al menos 3 respuestas útiles, should_finish=true.
- Si faltan datos, genera next_question sobre la dimensión faltante más importante.
- profile_completeness debe estar entre 0 y 100.

PREGUNTA ACTUAL: ${question}
ID: ${questionId}
RESPUESTAS ÚTILES PREVIAS: ${answersCount}
EJEMPLO ACTUAL: ${currentExample}
PERFIL: ${JSON.stringify(profile)}
HISTORIAL RECIENTE: ${JSON.stringify(history)}

Devuelve solo el JSON solicitado por el schema.
`;

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(geminiKey)}`;

    const geminiResponse = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: audio.type || "audio/webm",
                data: audioBase64,
              },
            },
          ],
        }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema,
        },
      }),
    });

    const payload = await geminiResponse.json();

    if (!geminiResponse.ok) {
      console.error("Gemini error", JSON.stringify(payload));
      return json({
        error: "GEMINI_ERROR",
        message: "No pudimos analizar la respuesta en este momento.",
      }, 502, origin);
    }

    const text =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part?.text || "")
        .join("")
        .trim() || "";

    if (!text) {
      return json({ error: "EMPTY_GEMINI_OUTPUT" }, 502, origin);
    }

    let result: any;
    try {
      result = JSON.parse(text);
    } catch {
      console.error("Invalid JSON from Gemini", text.slice(0, 500));
      return json({ error: "INVALID_GEMINI_JSON" }, 502, origin);
    }

    const controlIntents = new Set([
      "repeat_question",
      "repeat_example",
      "explain_question",
      "pause",
      "skip_question",
    ]);

    if (controlIntents.has(result.turn_intent)) {
      result.goals = [];
      result.interests = [];
      result.skills = [];
      result.experience = [];
      result.barriers = [];
      result.training_needs = [];
      result.evidence = [];
      result.summary = "";
      result.memory_summary = "";
      result.should_finish = false;
      result.clarification_needed = false;

      if (result.turn_intent === "repeat_question") {
        result.control_response ||= "Claro, te la repito.";
        result.next_question = question;
      } else if (result.turn_intent === "repeat_example") {
        result.control_response ||= "Claro, escucha el ejemplo otra vez.";
        result.example_response = currentExample;
        result.next_question = question;
      } else if (result.turn_intent === "explain_question") {
        result.control_response ||= "Claro. Te la digo de una forma más sencilla.";
        result.next_question = result.rephrased_question || question;
      } else if (result.turn_intent === "pause") {
        result.control_response ||= "Claro. Cuando quieras, continuamos.";
        result.next_question = question;
      }
    }

    return json(result, 200, origin);
  } catch (error) {
    console.error(error);
    return json({
      error: "INTERNAL_ERROR",
      message: "No pudimos procesar el audio.",
    }, 500, origin);
  }
});
