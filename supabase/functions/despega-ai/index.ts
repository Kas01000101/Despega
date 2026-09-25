// DESPEGA+ — Supabase Edge Function for Nova
// Required secret: GEMINI_API_KEY
// Optional: GEMINI_MODEL, ALLOWED_ORIGINS (comma-separated exact origins)

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_QUESTION_CHARS = 1000;
const MAX_QUESTION_ID_CHARS = 100;
const MAX_EXAMPLE_CHARS = 1500;
const MAX_HISTORY_TURNS = 10;
const MAX_PROFILE_ITEMS = 30;
const RATE_LIMIT_PER_MINUTE = 20;
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

const VALID_INTENTS = new Set([
  "answer",
  "repeat_question",
  "repeat_example",
  "explain_question",
  "pause",
  "skip_question",
]);
const VALID_SUFFICIENCY = new Set(["sufficient", "partial", "insufficient"]);
const PROFILE_FIELDS = ["goals", "interests", "skills", "experience", "barriers", "training_needs"];
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function configuredOrigins() {
  return new Set(
    String(Deno.env.get("ALLOWED_ORIGINS") || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function isAllowedOrigin(origin: string | null) {
  if (!origin) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  if (/^https:\/\/despega(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return true;
  if (/^https:\/\/despega(?:-[a-z0-9-]+)?\.netlify\.app$/i.test(origin)) return true;
  return configuredOrigins().has(origin);
}

function cors(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
  if (!origin) headers["Access-Control-Allow-Origin"] = "*";
  else if (isAllowedOrigin(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function itemText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const item = value as Record<string, unknown>;
  return String(item.value || item.subcategory || item.category || item.description || item.name || "").trim();
}

function stringArray(value: unknown, maxItems = MAX_PROFILE_ITEMS) {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const normalized = itemText(item).slice(0, 500);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    result.push(normalized);
    seen.add(key);
    if (result.length >= maxItems) break;
  }
  return result;
}

function sanitizeProfile(value: unknown) {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const profile: Record<string, string[]> = {};
  for (const field of PROFILE_FIELDS) profile[field] = stringArray(source[field]);
  return profile;
}

function sanitizeHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_HISTORY_TURNS).map((entry) => {
    const row = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
    return {
      questionId: text(row.questionId, 100),
      question: text(row.question, 1000),
      transcript: text(row.transcript, 1500),
      summary: text(row.summary, 1000),
      intent: text(row.intent, 100),
      novaReaction: text(row.novaReaction, 1000),
    };
  });
}

function allowRequest(key: string) {
  const now = Date.now();
  const safeKey = key || "anonymous";
  const bucket = rateBuckets.get(safeKey);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(safeKey, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (bucket.count >= RATE_LIMIT_PER_MINUTE) return false;
  bucket.count += 1;
  return true;
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
    "transcript", "turn_intent", "control_response", "nova_reaction", "nova_emotion",
    "summary", "goals", "interests", "skills", "experience", "barriers", "training_needs",
    "evidence", "missing_dimensions", "answer_sufficiency", "clarification_needed",
    "clarification_question", "rephrased_question", "next_question", "example_response",
    "profile_completeness", "should_finish", "final_message", "memory_summary",
  ],
};

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");

  if (origin && !isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "ORIGIN_NOT_ALLOWED" }), {
      status: 403,
      headers: { "Content-Type": "application/json; charset=utf-8", "Vary": "Origin" },
    });
  }

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

    const sessionId = text(form.get("session_id"), 120);
    if (!allowRequest(sessionId)) {
      return json({
        error: "RATE_LIMITED",
        message: "Hay demasiadas solicitudes seguidas. Espera un momento y vuelve a intentarlo.",
      }, 429, origin);
    }

    const question = text(form.get("question"), MAX_QUESTION_CHARS);
    const questionId = text(form.get("question_id"), MAX_QUESTION_ID_CHARS);
    const currentExample = text(form.get("current_example"), MAX_EXAMPLE_CHARS);
    const usefulAnswersCount = Math.max(0, Math.min(7, Number(form.get("answers_count") || 0) || 0));
    const turnsCount = Math.max(0, Math.min(7, Number(form.get("turns_count") || 0) || 0));

    let profile: Record<string, string[]> = sanitizeProfile({});
    let history: unknown[] = [];

    try {
      profile = sanitizeProfile(JSON.parse(String(form.get("profile") || "{}")));
    } catch {}

    try {
      history = sanitizeHistory(JSON.parse(String(form.get("conversation_history") || "[]")));
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
- Si pide saltar, usa skip_question y formula next_question sobre OTRA dimensión pendiente.
- Las intenciones de control NO agregan información al perfil.
- Para una intención de control, deja goals/interests/skills/experience/barriers/training_needs/evidence vacíos.
- No infieras atributos sensibles ni condiciones que el usuario no haya declarado.
- Si la respuesta es vaga, usa clarification_needed=true y formula una aclaración breve.
- answer_sufficiency solo puede ser sufficient, partial o insufficient.
- Si es insufficient, no extraigas datos nuevos del perfil.
- Solo usa should_finish=true cuando, contando esta respuesta, existan al menos 3 respuestas útiles y haya evidencia de objetivo + interés + (habilidad o experiencia) + barrera/necesidad.
- Si faltan datos, genera next_question sobre la dimensión faltante más importante.
- profile_completeness debe estar entre 0 y 100.

PREGUNTA ACTUAL: ${question}
ID: ${questionId}
RESPUESTAS ÚTILES PREVIAS: ${usefulAnswersCount}
TURNOS DE RESPUESTA PREVIOS: ${turnsCount}
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

    const output =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part?.text || "")
        .join("")
        .trim() || "";

    if (!output) {
      return json({ error: "EMPTY_GEMINI_OUTPUT" }, 502, origin);
    }

    let result: any;
    try {
      result = JSON.parse(output);
    } catch {
      console.error("Invalid JSON from Gemini", output.slice(0, 500));
      return json({ error: "INVALID_GEMINI_JSON" }, 502, origin);
    }

    result.transcript = text(result.transcript, 3000);
    result.turn_intent = VALID_INTENTS.has(String(result.turn_intent)) ? String(result.turn_intent) : "answer";
    result.answer_sufficiency = VALID_SUFFICIENCY.has(String(result.answer_sufficiency))
      ? String(result.answer_sufficiency)
      : "sufficient";
    result.profile_completeness = Math.max(0, Math.min(100, Number(result.profile_completeness) || 0));
    result.clarification_needed = Boolean(result.clarification_needed);
    result.should_finish = Boolean(result.should_finish);
    result.control_response = text(result.control_response, 1000);
    result.nova_reaction = text(result.nova_reaction, 1000);
    result.nova_emotion = text(result.nova_emotion, 100);
    result.summary = text(result.summary, 1500);
    result.clarification_question = text(result.clarification_question, 1000);
    result.rephrased_question = text(result.rephrased_question, 1000);
    result.next_question = text(result.next_question, 1000);
    result.example_response = text(result.example_response, 1500);
    result.final_message = text(result.final_message, 1000);
    result.memory_summary = text(result.memory_summary, 1500);

    for (const field of PROFILE_FIELDS) result[field] = stringArray(result[field]);
    result.evidence = stringArray(result.evidence, 20);
    result.missing_dimensions = stringArray(result.missing_dimensions, 10);

    if (result.answer_sufficiency === "insufficient") {
      for (const field of PROFILE_FIELDS) result[field] = [];
      result.evidence = [];
      result.should_finish = false;
    }

    if (result.turn_intent !== "answer") {
      for (const field of PROFILE_FIELDS) result[field] = [];
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
      } else if (result.turn_intent === "skip_question") {
        result.control_response ||= "Está bien, podemos pasar a otra pregunta.";
        result.next_question ||= "Cuéntame sobre otro aspecto que consideres importante para decidir tu siguiente paso.";
      }
    }

    if (result.turn_intent === "answer" && result.should_finish) {
      const currentIsUseful = result.answer_sufficiency === "sufficient";
      const usefulIncludingCurrent = usefulAnswersCount + (currentIsUseful ? 1 : 0);
      if (usefulIncludingCurrent < 3) result.should_finish = false;
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
