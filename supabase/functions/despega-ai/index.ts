import { createClient } from "npm:@supabase/supabase-js@2.95.0";

// DESPEGA — Supabase Edge Function for Nova
// Required secret: GEMINI_API_KEY
// Optional: GEMINI_MODEL, GEMINI_FALLBACK_MODEL, ALLOWED_ORIGINS (comma-separated exact origins)

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_QUESTION_CHARS = 1000;
const MAX_QUESTION_ID_CHARS = 100;
const MAX_EXAMPLE_CHARS = 1500;
const MAX_HISTORY_TURNS = 2;
const MAX_PROFILE_ITEMS = 30;
const MAX_BARRIER_DETAILS = 12;
const RATE_LIMIT_PER_MINUTE = 30;
const MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash";
const FALLBACK_MODEL = Deno.env.get("GEMINI_FALLBACK_MODEL") || "gemini-3.5-flash-lite";
const GEMINI_TIMEOUTS = Object.freeze({
  transcriptionFast: 6000,
  transcriptionFallback: 8000,
  analysisFast: 5000,
  analysisFallback: 6000,
});
const GEMINI_RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

const VALID_INTENTS = new Set([
  "answer",
  "repeat_question",
  "repeat_example",
  "explain_question",
  "pause",
  "skip_question",
]);
const VALID_SUFFICIENCY = new Set(["sufficient", "partial", "insufficient"]);
const VALID_FOLLOW_UP = new Set(["deepen", "clarify", "connect", "switch_dimension", "close"]);
const PROFILE_FIELDS = ["goals", "interests", "skills", "experience", "barriers", "training_needs"];
const CORE_DIMENSIONS = ["goal", "interests", "skills", "experience", "barriers"] as const;
const VALID_DIMENSIONS = new Set<string>(CORE_DIMENSIONS);
const VALID_BARRIER_TYPES = new Set([
  "economic",
  "connectivity",
  "education",
  "transport",
  "geographic",
  "time",
  "family_responsibilities",
  "information",
  "confidence",
  "gender_stereotype",
  "discrimination",
  "accessibility",
  "work_experience",
  "digital_skills",
  "documentation",
  "other",
]);
const QUESTION_MAP: Record<string, { question: string; example: string }> = {
  goal: {
    question: "¿Qué te gustaría hacer o aprender en este momento?",
    example: "Por ejemplo: terminar tus estudios, aprender una habilidad, conseguir tu primer trabajo o estudiar una carrera técnica.",
  },
  interests: {
    question: "¿Qué áreas o temas te interesan más?",
    example: "Por ejemplo: tecnología, diseño, negocios, salud, mecánica, educación o atención al cliente.",
  },
  skills: {
    question: "¿Qué cosas sientes que haces bien?",
    example: "Por ejemplo: organizar, explicar ideas, vender, reparar cosas, usar una computadora o ayudar a otras personas.",
  },
  experience: {
    question: "¿Hay algo que ya hayas hecho, aunque no haya sido un trabajo formal?",
    example: "Por ejemplo: ayudar en un negocio familiar, vender productos, cuidar personas o hacer proyectos del colegio.",
  },
  barriers: {
    question: "¿Hay algo que hoy te dificulte avanzar hacia lo que quieres?",
    example: "Por ejemplo: falta de tiempo, dinero, internet, transporte, responsabilidades en casa o no saber por dónde empezar.",
  },
};
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

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
  if (/^https:\/\/despega(?:plus)?(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return true;
  if (/^https:\/\/despega(?:-[a-z0-9-]+)?\.netlify\.app$/i.test(origin)) return true;
  if (/^https:\/\/kas01000101\.github\.io$/i.test(origin)) return true;
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

type EvidenceItem = {
  value: string;
  evidence: string;
};

const EVIDENCE_STOPWORDS = new Set([
  "para", "pero", "porque", "como", "esta", "este", "esto", "tengo", "quiero",
  "gustaria", "gusta", "tambien", "algo", "mucho", "poco", "hacer", "aprender",
]);

function normalizeForEvidence(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceAppearsInTranscript(evidence: unknown, transcript: string) {
  const normalizedEvidence = normalizeForEvidence(evidence);
  const normalizedTranscript = normalizeForEvidence(transcript);
  return Boolean(
    normalizedEvidence &&
    normalizedEvidence.length >= 2 &&
    normalizedTranscript.includes(normalizedEvidence)
  );
}

function detectExplicitControlIntent(value: unknown) {
  const normalized = normalizeForEvidence(value);
  if (!normalized || normalized.length > 120) return "";

  if (/^(repite|repitela|repitelo|otra vez|que me preguntaste|cual era la pregunta)$/.test(normalized)) {
    return "repeat_question";
  }
  if (/^(repite el ejemplo|otro ejemplo|dame el ejemplo otra vez)$/.test(normalized)) {
    return "repeat_example";
  }
  if (/^(no entendi|no entiendo|que significa|que quieres decir|que paso|dime que paso)$/.test(normalized)) {
    return "explain_question";
  }
  if (/^(pausa|espera|un momento|quiero pausar)$/.test(normalized)) {
    return "pause";
  }
  if (/^(paso|saltar|saltala|prefiero no responder|no quiero responder)$/.test(normalized)) {
    return "skip_question";
  }
  return "";
}

function meaningfulEvidenceTokens(value: unknown) {
  return normalizeForEvidence(value)
    .split(" ")
    .filter((token) => token.length >= 4 && !EVIDENCE_STOPWORDS.has(token));
}

function hasLexicalSupport(value: string, evidence: string, transcript: string) {
  const normalizedValue = normalizeForEvidence(value);
  const normalizedEvidence = normalizeForEvidence(evidence);
  const normalizedTranscript = normalizeForEvidence(transcript);
  if (!normalizedValue) return false;
  if (normalizedEvidence.includes(normalizedValue) || normalizedTranscript.includes(normalizedValue)) return true;

  const valueTokens = meaningfulEvidenceTokens(value);
  const supportTokens = new Set(meaningfulEvidenceTokens(`${evidence} ${transcript}`));
  return valueTokens.some((token) => {
    if (supportTokens.has(token)) return true;
    if (token.length < 5) return false;
    const stem = token.slice(0, 5);
    return [...supportTokens].some((candidate) =>
      candidate.length >= 5 && (candidate.startsWith(stem) || token.startsWith(candidate.slice(0, 5)))
    );
  });
}

function sanitizeEvidenceItems(value: unknown, transcript: string, maxItems = MAX_PROFILE_ITEMS): EvidenceItem[] {
  if (!Array.isArray(value)) return [];
  const result: EvidenceItem[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const rawValue = text(row.value, 500);
    const evidence = text(row.evidence, 500);
    if (!rawValue || !evidenceAppearsInTranscript(evidence, transcript)) continue;

    // Fail closed: if the semantic label is not lexically grounded, persist the literal evidence instead.
    const safeValue = hasLexicalSupport(rawValue, evidence, transcript) ? rawValue : evidence;
    const key = `${normalizeForEvidence(safeValue)}|${normalizeForEvidence(evidence)}`;
    if (!key || seen.has(key)) continue;

    seen.add(key);
    result.push({ value: safeValue, evidence });
    if (result.length >= maxItems) break;
  }

  return result;
}

type BarrierDetail = {
  type: string;
  description: string;
  source_evidence: string;
};

function sanitizeBarrierDetails(value: unknown, maxItems = MAX_BARRIER_DETAILS): BarrierDetail[] {
  if (!Array.isArray(value)) return [];
  const result: BarrierDetail[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const rawType = String(row.type || "").trim().toLowerCase();
    const type = VALID_BARRIER_TYPES.has(rawType) ? rawType : "other";
    const description = text(row.description, 500);
    const sourceEvidence = text(row.source_evidence, 500);
    if (!description || !sourceEvidence) continue;

    const key = `${type}|${description.toLowerCase()}|${sourceEvidence.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ type, description, source_evidence: sourceEvidence });
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

function mergeProfile(base: Record<string, string[]>, result: Record<string, unknown>) {
  const merged: Record<string, unknown> = {};
  for (const field of PROFILE_FIELDS) {
    merged[field] = stringArray([...(base[field] || []), ...stringArray(result[field])]);
  }
  merged.barrier_details = sanitizeBarrierDetails(result.barrier_details);
  return merged;
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

function parseJsonObject(value: FormDataEntryValue | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
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

const transcriptionSchema = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    speech_detected: { type: "BOOLEAN" },
    quality: { type: "STRING", enum: ["good", "uncertain", "inaudible"] },
  },
  required: ["transcript", "speech_detected", "quality"],
};

const evidenceItemSchema = {
  type: "OBJECT",
  properties: {
    value: { type: "STRING" },
    evidence: { type: "STRING" },
  },
  required: ["value", "evidence"],
};

const analysisSchema = {
  type: "OBJECT",
  properties: {
    turn_intent: { type: "STRING" },
    control_response: { type: "STRING" },
    nova_reaction: { type: "STRING" },
    nova_emotion: { type: "STRING" },
    summary: { type: "STRING" },
    goals: { type: "ARRAY", items: evidenceItemSchema },
    interests: { type: "ARRAY", items: evidenceItemSchema },
    skills: { type: "ARRAY", items: evidenceItemSchema },
    experience: { type: "ARRAY", items: evidenceItemSchema },
    barriers: { type: "ARRAY", items: evidenceItemSchema },
    barrier_details: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING" },
          description: { type: "STRING" },
          source_evidence: { type: "STRING" },
        },
        required: ["type", "description", "source_evidence"],
      },
    },
    training_needs: { type: "ARRAY", items: evidenceItemSchema },
    evidence: { type: "ARRAY", items: { type: "STRING" } },
    missing_dimensions: { type: "ARRAY", items: { type: "STRING" } },
    covered_dimensions: { type: "ARRAY", items: { type: "STRING" } },
    skipped_dimensions: { type: "ARRAY", items: { type: "STRING" } },
    next_dimension: { type: "STRING" },
    interview_complete: { type: "BOOLEAN" },
    answer_sufficiency: { type: "STRING" },
    clarification_needed: { type: "BOOLEAN" },
    clarification_question: { type: "STRING" },
    rephrased_question: { type: "STRING" },
    next_question: { type: "STRING" },
    example_response: { type: "STRING" },
    follow_up_strategy: { type: "STRING" },
    profile_completeness: { type: "INTEGER" },
    should_finish: { type: "BOOLEAN" },
    final_message: { type: "STRING" },
    memory_summary: { type: "STRING" },
  },
  required: [
    "turn_intent", "control_response", "nova_reaction", "nova_emotion",
    "summary", "goals", "interests", "skills", "experience", "barriers", "barrier_details", "training_needs",
    "evidence", "missing_dimensions", "covered_dimensions", "skipped_dimensions",
    "next_dimension", "interview_complete", "answer_sufficiency", "clarification_needed",
    "clarification_question", "rephrased_question", "next_question", "example_response",
    "follow_up_strategy", "profile_completeness", "should_finish", "final_message", "memory_summary",
  ],
};

async function persistTurn(args: {
  sessionId: string;
  question: string;
  profile: Record<string, string[]>;
  onboardingData: Record<string, unknown> | null;
  result: Record<string, any>;
  usefulAnswersCount: number;
  turnsCount: number;
  durationMs: number | null;
  recordingId: string;
}) {
  if (!supabaseAdmin || !args.sessionId) return false;

  if (args.recordingId) {
    const { data: existingTurn, error: duplicateCheckError } = await supabaseAdmin
      .from("nova_turns")
      .select("id")
      .eq("session_id", args.sessionId)
      .eq("recording_id", args.recordingId)
      .maybeSingle();

    if (duplicateCheckError) throw duplicateCheckError;
    if (existingTurn) {
      console.log("Duplicate recording ignored", JSON.stringify({
        sessionId: args.sessionId,
        recordingId: args.recordingId,
      }));
      return true;
    }
  }

  const now = new Date().toISOString();
  const usefulCurrent =
    args.result.turn_intent === "answer" &&
    args.result.answer_sufficiency === "sufficient";
  const nextUseful = args.usefulAnswersCount + (usefulCurrent ? 1 : 0);
  const nextTurns = args.turnsCount + 1;
  const status = args.result.should_finish
    ? "completed"
    : args.result.turn_intent === "pause"
      ? "paused"
      : "active";
  const completedAt = args.result.should_finish ? now : null;
  const mergedProfile = mergeProfile(args.profile, args.result);

  const { error: sessionError } = await supabaseAdmin
    .from("nova_sessions")
    .upsert({
      session_id: args.sessionId,
      status,
      useful_answers_count: nextUseful,
      turns_count: nextTurns,
      memory_summary: text(args.result.memory_summary, 1500),
      completed_at: completedAt,
      updated_at: now,
    }, { onConflict: "session_id" });

  if (sessionError) throw sessionError;

  const profilePayload: Record<string, unknown> = {
    session_id: args.sessionId,
    nova_profile: mergedProfile,
    profile_completeness: Math.max(0, Math.min(100, Number(args.result.profile_completeness) || 0)),
    updated_at: now,
  };
  if (args.onboardingData) profilePayload.onboarding_data = args.onboardingData;

  const [profileWrite, turnWrite] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "session_id" }),
    supabaseAdmin
      .from("nova_turns")
      .insert({
        session_id: args.sessionId,
        question: args.question,
        transcript: text(args.result.transcript, 3000),
        summary: text(args.result.summary, 1500),
        turn_intent: text(args.result.turn_intent, 100),
        nova_reaction: text(args.result.nova_reaction, 1000),
        follow_up_strategy: text(args.result.follow_up_strategy, 100),
        answer_sufficiency: text(args.result.answer_sufficiency, 100),
        duration_ms: args.durationMs,
        recording_id: args.recordingId || null,
      }),
  ]);

  if (profileWrite.error) throw profileWrite.error;
  if (turnWrite.error) throw turnWrite.error;
  return true;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function geminiRequestBody(
  prompt: string,
  responseSchema: Record<string, unknown>,
  audioType?: string,
  audioBase64?: string,
  temperature = 0.2,
) {
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (audioBase64) {
    parts.push({
      inlineData: {
        mimeType: audioType || "audio/webm",
        data: audioBase64,
      },
    });
  }

  return {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature,
      responseMimeType: "application/json",
      responseSchema,
    },
  };
}

async function callGeminiResilient(args: {
  apiKey: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  audioType?: string;
  audioBase64?: string;
  temperature?: number;
  phase?: "transcription" | "analysis";
}) {
  const phase = args.phase || "analysis";
  const attempts = phase === "transcription"
    ? [
        { model: MODEL, timeoutMs: GEMINI_TIMEOUTS.transcriptionFallback, label: "primary_quality" },
        { model: FALLBACK_MODEL, timeoutMs: GEMINI_TIMEOUTS.transcriptionFast, label: "fallback_fast" },
      ]
    : [
        { model: FALLBACK_MODEL, timeoutMs: GEMINI_TIMEOUTS.analysisFast, label: "primary_fast" },
        { model: MODEL, timeoutMs: GEMINI_TIMEOUTS.analysisFallback, label: "fallback_quality" },
      ];

  let lastResponse: Response | null = null;
  let lastPayload: any = null;
  const attemptMetrics: Array<Record<string, unknown>> = [];

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(attempt.model)}:generateContent?key=${encodeURIComponent(args.apiKey)}`;
    const controller = new AbortController();
    const startedAt = performance.now();
    const timeout = setTimeout(() => controller.abort(), attempt.timeoutMs);

    console.log("[NOVA RECOVERY] gemini_attempt_started", JSON.stringify({
      phase,
      attempt: index + 1,
      path: attempt.label,
      model: attempt.model,
      timeout_ms: attempt.timeoutMs,
    }));

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiRequestBody(
          args.prompt,
          args.responseSchema,
          args.audioType,
          args.audioBase64,
          args.temperature ?? 0.2,
        )),
        signal: controller.signal,
      });

      const payload = await response.json();
      lastResponse = response;
      lastPayload = payload;
      const durationMs = Math.round(performance.now() - startedAt);
      attemptMetrics.push({
        attempt: index + 1,
        path: attempt.label,
        model: attempt.model,
        duration_ms: durationMs,
        status: response.status,
        ok: response.ok,
      });

      if (response.ok) {
        console.log("[NOVA RECOVERY] gemini_attempt_succeeded", JSON.stringify({
          phase,
          attempt: index + 1,
          path: attempt.label,
          model: attempt.model,
          duration_ms: durationMs,
          recovered: index > 0,
        }));
        return {
          response,
          payload,
          model: attempt.model,
          path: attempt.label,
          attempts: attemptMetrics,
          fallbackUsed: index > 0,
        };
      }

      const retryable = GEMINI_RETRYABLE_STATUSES.has(response.status);
      console.error("[NOVA RECOVERY] gemini_attempt_failed", JSON.stringify({
        phase,
        attempt: index + 1,
        path: attempt.label,
        model: attempt.model,
        duration_ms: durationMs,
        status: response.status,
        code: payload?.error?.status || payload?.error?.code || null,
        retryable,
      }));

      if (!retryable) break;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      const code = error instanceof Error ? error.name : "UNKNOWN";
      attemptMetrics.push({
        attempt: index + 1,
        path: attempt.label,
        model: attempt.model,
        duration_ms: durationMs,
        status: "timeout_or_network",
        code,
        ok: false,
      });
      console.error("[NOVA RECOVERY] gemini_attempt_failed", JSON.stringify({
        phase,
        attempt: index + 1,
        path: attempt.label,
        model: attempt.model,
        duration_ms: durationMs,
        status: "timeout_or_network",
        code,
        retryable: true,
      }));
    } finally {
      clearTimeout(timeout);
    }
  }

  console.error("[NOVA RECOVERY] gemini_exhausted", JSON.stringify({
    phase,
    attempts: attemptMetrics.length,
  }));

  return {
    response: lastResponse,
    payload: lastPayload,
    model: null,
    path: "failed",
    attempts: attemptMetrics,
    fallbackUsed: attemptMetrics.length > 1,
  };
}

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
      databaseConfigured: Boolean(supabaseAdmin),
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
    const requestStartedAt = performance.now();
    const timing = {
      transcription_ms: 0,
      transcription_attempt_1_ms: 0,
      transcription_attempt_2_ms: 0,
      transcription_model: "",
      transcription_fallback_used: false,
      analysis_ms: 0,
      analysis_attempt_1_ms: 0,
      analysis_attempt_2_ms: 0,
      analysis_model: "",
      analysis_fallback_used: false,
      persistence_ms: 0,
      total_ms: 0,
    };

    const form = await req.formData();
    const modeRaw = text(form.get("mode"), 32).toLowerCase();
    const mode = modeRaw === "transcribe" || modeRaw === "analyze" ? modeRaw : "full";
    const transcriptOverride = text(form.get("transcript_override"), 3000);
    const audioEntry = form.get("audio");
    const audio = audioEntry instanceof File ? audioEntry : null;

    if (mode !== "analyze" && !audio) {
      return json({ error: "AUDIO_REQUIRED" }, 400, origin);
    }
    if (audio && !audio.type.startsWith("audio/")) {
      return json({ error: "INVALID_AUDIO_TYPE" }, 400, origin);
    }
    if (audio && (audio.size <= 0 || audio.size > MAX_AUDIO_BYTES)) {
      return json({ error: "INVALID_AUDIO_SIZE", maxBytes: MAX_AUDIO_BYTES }, 400, origin);
    }
    if (mode === "analyze" && !transcriptOverride) {
      return json({ error: "TRANSCRIPT_REQUIRED", phase: "analysis" }, 400, origin);
    }

    const sessionId = text(form.get("session_id"), 120);
    if (!sessionId) {
      return json({ error: "SESSION_ID_REQUIRED" }, 400, origin);
    }
    if (!allowRequest(sessionId)) {
      return json({
        error: "RATE_LIMITED",
        message: "Hay demasiadas solicitudes seguidas. Espera un momento y vuelve a intentarlo.",
      }, 429, origin);
    }

    const recordingId = text(form.get("recording_id"), 160) || crypto.randomUUID();
    const question = text(form.get("question"), MAX_QUESTION_CHARS);
    const questionId = text(form.get("question_id"), MAX_QUESTION_ID_CHARS);
    const currentExample = text(form.get("current_example"), MAX_EXAMPLE_CHARS);
    const usefulAnswersCount = Math.max(0, Math.min(50, Number(form.get("answers_count") || 0) || 0));
    const turnsCount = Math.max(0, Math.min(100, Number(form.get("turns_count") || 0) || 0));
    const durationMsRaw = Number(form.get("duration_ms") || 0);
    const durationMs = Number.isFinite(durationMsRaw) && durationMsRaw > 0
      ? Math.min(durationMsRaw, 10 * 60_000)
      : null;

    let profile: Record<string, string[]> = sanitizeProfile({});
    let history: unknown[] = [];

    try {
      profile = sanitizeProfile(JSON.parse(String(form.get("profile") || "{}")));
    } catch {}

    try {
      history = sanitizeHistory(JSON.parse(String(form.get("conversation_history") || "[]")));
    } catch {}

    const onboardingData = parseJsonObject(form.get("onboarding_data"));
    const analysisProfile = Object.fromEntries(
      PROFILE_FIELDS.map((field) => [
        field,
        Array.isArray(profile[field]) ? profile[field].slice(-8) : [],
      ]),
    );
    const analysisHistory = history.slice(-2);
    const rawDimensionStatus = parseJsonObject(form.get("dimension_status")) || {};
    const dimensionStatus: Record<string, string> = {};
    for (const dimension of CORE_DIMENSIONS) {
      const value = String(rawDimensionStatus[dimension] || "pending").toLowerCase();
      dimensionStatus[dimension] = value === "covered" || value === "skipped" ? value : "pending";
    }
    let transcript = mode === "analyze" ? transcriptOverride : "";
    let speechDetected = mode === "analyze" ? Boolean(transcriptOverride) : false;
    let transcriptionQuality = mode === "analyze" ? "good" : "uncertain";

    if (mode !== "analyze") {
        const bytes = new Uint8Array(await audio!.arrayBuffer());
      const audioBase64 = toBase64(bytes);

      console.log("Nova transcription start", JSON.stringify({
        sessionId,
        recordingId,
        bytes: audio!.size,
        audioType: audio!.type,
      }));

      const transcriptionPrompt = `
Transcribe literalmente este audio hablado en español.

REGLAS OBLIGATORIAS:
- Devuelve exactamente lo que escuchas.
- No omitas las palabras finales aunque haya pausas naturales dentro de la respuesta.
- Conserva repeticiones, autocorrecciones y fragmentos tal como fueron pronunciados.
- No respondas al contenido.
- No interpretes intención, objetivos, intereses ni habilidades.
- No uses contexto de conversaciones anteriores.
- No completes palabras usando conocimiento del dominio.
- No inventes información.
- Si no hay voz humana comprensible, speech_detected=false.
- Si escuchas voz pero hay partes relevantes que no puedes entender, usa quality="uncertain".
- Si el audio es esencialmente incomprensible, usa quality="inaudible".
- Usa quality="good" solo cuando la transcripción sea suficientemente clara.

Devuelve únicamente el JSON solicitado por el schema.
`;

      const transcriptionStartedAt = performance.now();
      const transcriptionGemini = await callGeminiResilient({
        apiKey: geminiKey,
        prompt: transcriptionPrompt,
        responseSchema: transcriptionSchema,
        audioType: audio!.type || "audio/webm",
        audioBase64,
        temperature: 0,
        phase: "transcription",
      });

      timing.transcription_ms = Math.round(performance.now() - transcriptionStartedAt);
      timing.transcription_attempt_1_ms = Number(transcriptionGemini.attempts?.[0]?.duration_ms || 0);
      timing.transcription_attempt_2_ms = Number(transcriptionGemini.attempts?.[1]?.duration_ms || 0);
      timing.transcription_model = String(transcriptionGemini.model || "");
      timing.transcription_fallback_used = Boolean(transcriptionGemini.fallbackUsed);

      if (!transcriptionGemini.response?.ok) {
        return json({
          error: "TRANSCRIPTION_TEMPORARILY_UNAVAILABLE",
          message: "No pude transcribir el audio en este momento. Intenta otra vez.",
          retryable: true,
          recording_id: recordingId,
          phase: "transcription",
          timing,
        }, 503, origin);
      }

      const transcriptionOutput =
        transcriptionGemini.payload?.candidates?.[0]?.content?.parts
          ?.map((part: any) => part?.text || "")
          .join("")
          .trim() || "";

      let transcription: Record<string, any>;
      try {
        transcription = JSON.parse(transcriptionOutput);
      } catch {
        console.error("Invalid transcription JSON", transcriptionOutput.slice(0, 500));
        return json({ error: "INVALID_TRANSCRIPTION_JSON", retryable: true }, 502, origin);
      }

        transcript = text(transcription.transcript, 3000);
        speechDetected = Boolean(transcription.speech_detected);
        transcriptionQuality = ["good", "uncertain", "inaudible"].includes(String(transcription.quality))
        ? String(transcription.quality)
        : "uncertain";

      console.log("Nova transcription result", JSON.stringify({
        sessionId,
        recordingId,
        speechDetected,
        transcriptionQuality,
        transcriptLength: transcript.length,
      }));

      if (!speechDetected) {
        return json({
          error: "NO_SPEECH_DETECTED",
          message: "No detecté una respuesta hablada. Inténtalo otra vez.",
          retryable: true,
          recording_id: recordingId,
          transcript: "",
          transcription_quality: transcriptionQuality,
          speech_detected: false,
        }, 422, origin);
      }

      if (!transcript || transcriptionQuality === "inaudible") {
        return json({
          error: "AUDIO_INAUDIBLE",
          message: "No pude entender el audio con suficiente claridad. Inténtalo otra vez.",
          retryable: true,
          recording_id: recordingId,
          transcript,
          transcription_quality: "inaudible",
          speech_detected: true,
        }, 422, origin);
      }

      if (transcriptionQuality !== "good") {
        return json({
          error: "TRANSCRIPTION_UNCERTAIN",
          message: "Escuché tu voz, pero no tengo suficiente certeza sobre lo que dijiste. Inténtalo otra vez.",
          retryable: true,
          recording_id: recordingId,
          transcript,
          transcription_quality: transcriptionQuality,
          speech_detected: true,
        }, 422, origin);
      }


    } else {
      console.log("Nova analysis-only request", JSON.stringify({
        sessionId,
        recordingId,
        transcriptLength: transcript.length,
      }));
    }

    if (mode === "transcribe") {
      timing.total_ms = Math.round(performance.now() - requestStartedAt);
      return json({
        transcript,
        transcription_quality: transcriptionQuality,
        speech_detected: speechDetected,
        recording_id: recordingId,
        phase: "transcription",
        timing,
      }, 200, origin);
    }

    const prompt = `
TRANSCRIPCIÓN LITERAL E INMUTABLE DEL TURNO:
${transcript}

REGLA DE EVIDENCIA:
- Analiza únicamente la transcripción literal anterior.
- No cambies, completes ni reescribas lo que el usuario dijo.
- goals, interests, skills, experience, barriers y training_needs deben ser arrays de objetos { value, evidence }.
- evidence debe copiar literalmente una frase presente en la TRANSCRIPCIÓN LITERAL del turno actual.
- No uses el perfil previo, historial, pregunta ni ejemplos como evidence.
- Si no existe una frase literal que respalde un dato, NO lo extraigas.
- No inventes una etiqueta semántica a partir de una evidencia no relacionada.
- El contexto histórico sirve para continuidad conversacional, nunca para crear evidencia del turno actual.


Eres NOVA, la guía conversacional de DESPEGA, una plataforma de orientación educativa y laboral para jóvenes.

IDENTIDAD Y TONO:
- Cercana, juvenil, optimista, clara y respetuosa.
- Energética sin exagerar; nunca infantil ni condescendiente.
- Usa español simple y frases cortas.
- Reconoce brevemente lo que el joven acaba de decir cuando aporte valor.
- No repitas muletillas ni elogios vacíos.
- Haz UNA sola pregunta a la vez.

OBJETIVO DE LA ENTREVISTA:
Construir un perfil breve usando SOLO estas 5 dimensiones:
1. goal: objetivo actual.
2. interests: áreas o temas de interés.
3. skills: habilidades.
4. experience: experiencia formal o informal.
5. barriers: barreras actuales.

DISTINCIÓN OBLIGATORIA ENTRE HABILIDAD Y EXPERIENCIA:
- skills describe capacidades o cosas que la persona siente que sabe hacer bien. Una respuesta breve en infinitivo a la pregunta de habilidades, como "organizar reuniones", "dibujar" o "usar una computadora", es una habilidad; NO la conviertas en experiencia solo porque describe una acción.
- experience describe algo que la persona ya hizo en un contexto real, proyecto, ayuda, trabajo formal o informal, normalmente expresado como un hecho o antecedente.
- La PREGUNTA ACTUAL es una señal fuerte para interpretar respuestas breves, salvo que la propia transcripción contenga evidencia explícita de otra dimensión.
- Una misma evidencia no debe copiarse a skills y experience por defecto. Solo usa ambas cuando la transcripción explícitamente sostenga ambas ideas.

MAPA OFICIAL:
${JSON.stringify(QUESTION_MAP)}

REGLAS DE COBERTURA:
- covered_dimensions debe incluir todas las dimensiones que la respuesta actual cubra con evidencia explícita.
- skipped_dimensions debe incluir una dimensión solo si el usuario expresa que no sabe, no quiere responder o pide saltarla.
- No preguntes nuevamente una dimensión cuyo estado ya sea covered o skipped.
- Una sola respuesta puede cubrir varias dimensiones.
- No inventes habilidades, experiencia, barreras ni intereses.
- Si el usuario cuenta experiencia informal, reconócela como experiencia sin exagerar.
- Si menciona una barrera, responde con empatía breve, no con entusiasmo.
- next_dimension debe ser una de: goal, interests, skills, experience, barriers, o cadena vacía al cerrar.
- next_question debe corresponder a next_dimension. Puedes adaptar ligeramente la redacción al contexto, pero debe perseguir la misma dimensión.
- example_response debe ser un ejemplo corto y coherente con next_dimension.
- Si Gemini no necesita adaptar la pregunta, usa la pregunta oficial del MAPA.
- Nunca generes una sexta dimensión.

BARRERAS, SESGOS Y CONTEXTO PERSONAL:
- barriers sigue siendo una de las 5 dimensiones oficiales. barrier_details es metadata estructurada; NO es una sexta dimensión.
- Clasifica cada barrera explícita usando solo: economic, connectivity, education, transport, geographic, time, family_responsibilities, information, confidence, gender_stereotype, discrimination, accessibility, work_experience, digital_skills, documentation, other.
- Cada barrier_details debe incluir type, description y source_evidence basado en palabras realmente expresadas por el usuario.
- Si el usuario expresa una dificultad relacionada con género, discriminación, estereotipos sociales o sensación de exclusión, trátala como barrera contextual.
- Nunca presentes un estereotipo como un hecho objetivo.
- Nunca concluyas que una carrera o actividad no es apropiada por género, edad, origen, situación económica o zona geográfica.
- Nunca conviertas inseguridad en falta de capacidad.
- Nunca reduzcas o descartes una aspiración debido a una barrera expresada.
- Si una respuesta contiene simultáneamente un interés y una barrera, conserva ambos.
- No diagnostiques estados psicológicos ni atribuyas estados no expresados por el usuario.
- Ante discriminación, inseguridad, problemas familiares, dificultades económicas, exclusión o miedo, evita entusiasmo artificial.

EJEMPLOS:
- "Me gusta mecánica pero me siento insegura porque soy mujer." => interests incluye mecánica; barriers incluye la dificultad contextual; barrier_details usa gender_stereotype. NO infieras falta de habilidad.
- "Quiero terminar secundaria pero tengo que cuidar a mis hermanos." => goal + family_responsibilities.
- "Ayudo a mi tío reparando motos." => experience informal. NO inventes certificación ni dominio avanzado.

MÁXIMO DE PREGUNTAS:
- El frontend tiene un máximo absoluto de 5 preguntas principales.
- Ayuda a terminar antes si varias dimensiones ya quedaron cubiertas.
- interview_complete puede ser true cuando ya exista información suficiente para construir una ruta y se hayan resuelto al menos 3 dimensiones; prioriza cubrir objetivo + interés + (habilidad o experiencia) y, si fue mencionada o preguntada, barrera.
- should_finish debe tener el mismo valor que interview_complete.
- Si todas las dimensiones están cubiertas o skipped, interview_complete=true.
- No fuerces una pregunta redundante solo para llegar a 5.

INTENCIONES:
turn_intent debe ser EXACTAMENTE uno de:
answer, repeat_question, repeat_example, explain_question, pause, skip_question.

CONTROLES:
- "repítela", "otra vez", "qué me preguntaste" => repeat_question.
- "no entendí" => explain_question y reformula la misma dimensión.
- pedir repetir ejemplo => repeat_example.
- pedir saltar / "prefiero no responder" => skip_question; marca la dimensión actual como skipped si su ID es una dimensión válida.
- Las intenciones de control no agregan datos al perfil.
- Para control, deja goals/interests/skills/experience/barriers/barrier_details/training_needs/evidence vacíos.
- pause no completa la entrevista.
- answer_sufficiency solo puede ser sufficient, partial o insufficient.
- Si la respuesta es vaga, clarification_needed=true y haz una aclaración breve sobre la MISMA dimensión.
- Para interests, mencionar al menos un área, tema o actividad concreta (por ejemplo "tecnología", "diseño", "negocios") ES suficiente: marca interests como covered y NO pidas aclaración adicional.
- Si es insufficient, no extraigas datos nuevos.
- profile_completeness entre 0 y 100.

PERSONALIDAD EN REACCIONES:
- Objetivo claro: "Perfecto, ya tengo más claro hacia dónde quieres avanzar."
- Experiencia informal: "Eso también cuenta como experiencia."
- Barrera: "Entiendo. Voy a tenerlo en cuenta para tu ruta."
- Evita repetir exactamente estas frases en todos los turnos.
- Mantén nova_reaction en una sola frase breve.

PREGUNTA ACTUAL: ${question}
ID / DIMENSIÓN ACTUAL: ${questionId}
RESPUESTAS ÚTILES PREVIAS: ${usefulAnswersCount}
TURNOS PREVIOS: ${turnsCount}
EJEMPLO ACTUAL: ${currentExample}
ESTADO DE DIMENSIONES: ${JSON.stringify(dimensionStatus)}
PERFIL: ${JSON.stringify(analysisProfile)}
HISTORIAL RECIENTE: ${JSON.stringify(analysisHistory)}

Devuelve solo el JSON solicitado por el schema.
`

    console.log("Nova analysis start", JSON.stringify({ sessionId, recordingId }));
    const analysisStartedAt = performance.now();

    const gemini = await callGeminiResilient({
      apiKey: geminiKey,
      prompt,
      responseSchema: analysisSchema,
      temperature: 0.2,
      phase: "analysis",
    });
    timing.analysis_ms = Math.round(performance.now() - analysisStartedAt);
    timing.analysis_attempt_1_ms = Number(gemini.attempts?.[0]?.duration_ms || 0);
    timing.analysis_attempt_2_ms = Number(gemini.attempts?.[1]?.duration_ms || 0);
    timing.analysis_model = String(gemini.model || "");
    timing.analysis_fallback_used = Boolean(gemini.fallbackUsed);
    const geminiResponse = gemini.response;
    const payload = gemini.payload;

    if (!geminiResponse?.ok) {
      console.error("Gemini exhausted retries", JSON.stringify({
        status: geminiResponse?.status || null,
        code: payload?.error?.status || payload?.error?.code || null,
      }));
      return json({
        error: "GEMINI_TEMPORARILY_UNAVAILABLE",
        message: "No pude analizar la respuesta en este momento. Intenta otra vez.",
        retryable: true,
        recording_id: recordingId,
        phase: "analysis",
        transcript,
        transcription_quality: transcriptionQuality,
        speech_detected: true,
        timing,
      }, 503, origin);
    }

    const output =
      payload?.candidates?.[0]?.content?.parts
        ?.map((part: any) => part?.text || "")
        .join("")
        .trim() || "";

    if (!output) {
      return json({ error: "EMPTY_GEMINI_OUTPUT" }, 502, origin);
    }

    let result: Record<string, any>;
    try {
      result = JSON.parse(output);
    } catch {
      console.error("Invalid JSON from Gemini", output.slice(0, 500));
      return json({ error: "INVALID_GEMINI_JSON" }, 502, origin);
    }

    result.transcript = transcript;
    result.transcription_quality = transcriptionQuality;
    result.recording_id = recordingId;
    result.turn_intent = VALID_INTENTS.has(String(result.turn_intent)) ? String(result.turn_intent) : "answer";
    const explicitControlIntent = detectExplicitControlIntent(transcript);
    if (explicitControlIntent) result.turn_intent = explicitControlIntent;
    result.answer_sufficiency = VALID_SUFFICIENCY.has(String(result.answer_sufficiency))
      ? String(result.answer_sufficiency)
      : "sufficient";
    result.follow_up_strategy = VALID_FOLLOW_UP.has(String(result.follow_up_strategy))
      ? String(result.follow_up_strategy)
      : (result.clarification_needed ? "clarify" : "deepen");
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

    for (const field of PROFILE_FIELDS) {
      result[field] = sanitizeEvidenceItems(result[field], transcript);
    }

    result.barrier_details = sanitizeBarrierDetails(result.barrier_details)
      .filter((item: BarrierDetail) => evidenceAppearsInTranscript(item.source_evidence, transcript));

    result.evidence = Array.from(new Set(
      PROFILE_FIELDS.flatMap((field) =>
        (Array.isArray(result[field]) ? result[field] : [])
          .map((item: EvidenceItem) => item.evidence)
          .filter(Boolean)
      )
    )).slice(0, 20);

    const evidenceBackedDimensions = new Set<string>();
    if (result.goals.length) evidenceBackedDimensions.add("goal");
    if (result.interests.length) evidenceBackedDimensions.add("interests");
    if (result.skills.length) evidenceBackedDimensions.add("skills");
    if (result.experience.length) evidenceBackedDimensions.add("experience");
    if (result.barriers.length) evidenceBackedDimensions.add("barriers");
    result.missing_dimensions = stringArray(result.missing_dimensions, 10);
    result.covered_dimensions = stringArray(result.covered_dimensions, 5)
      .filter((value) => VALID_DIMENSIONS.has(value) && evidenceBackedDimensions.has(value));
    result.skipped_dimensions = stringArray(result.skipped_dimensions, 5).filter((value) => VALID_DIMENSIONS.has(value));
    result.next_dimension = VALID_DIMENSIONS.has(String(result.next_dimension || ""))
      ? String(result.next_dimension)
      : "";
    result.interview_complete = Boolean(result.interview_complete);
    result.should_finish = result.interview_complete;

    console.log("Nova evidence validated", JSON.stringify({
      sessionId,
      recordingId,
      accepted: Object.fromEntries(PROFILE_FIELDS.map((field) => [field, result[field].length])),
      evidenceCount: result.evidence.length,
    }));

    if (result.turn_intent === "answer" && questionId === "interests") {
      const transcript = String(result.transcript || "").trim();
      const normalizedTranscript = transcript.toLowerCase();
      const nonAnswer = !transcript
        || /^(no|no sé|no se|ninguno|ninguna|prefiero no responder|paso)$/i.test(normalizedTranscript);

      if (!nonAnswer && result.interests.length > 0) {
        result.answer_sufficiency = "sufficient";
        result.clarification_needed = false;
        if (!result.covered_dimensions.includes("interests")) result.covered_dimensions.push("interests");
        if (result.next_dimension === "interests") result.next_dimension = "";
      }
    }

    if (result.answer_sufficiency === "insufficient") {
      for (const field of PROFILE_FIELDS) result[field] = [];
      result.barrier_details = [];
      result.evidence = [];
      result.covered_dimensions = [];
      result.interview_complete = false;
      result.should_finish = false;
      result.follow_up_strategy = "clarify";
    }

    if (result.turn_intent !== "answer") {
      for (const field of PROFILE_FIELDS) result[field] = [];
      result.barrier_details = [];
      result.evidence = [];
      result.summary = "";
      result.memory_summary = "";
      result.covered_dimensions = [];
      result.skipped_dimensions = [];
      result.interview_complete = false;
      result.should_finish = false;
      result.clarification_needed = false;

      if (result.turn_intent === "repeat_question") {
        result.control_response ||= "Claro, te la repito.";
        result.next_question = question;
        result.follow_up_strategy = "clarify";
      } else if (result.turn_intent === "repeat_example") {
        result.control_response ||= "Claro, escucha el ejemplo otra vez.";
        result.example_response = currentExample;
        result.next_question = question;
        result.follow_up_strategy = "clarify";
      } else if (result.turn_intent === "explain_question") {
        result.control_response ||= "Claro. Te la digo de una forma más sencilla.";
        result.next_question = result.rephrased_question || question;
        result.follow_up_strategy = "clarify";
      } else if (result.turn_intent === "pause") {
        result.control_response ||= "Claro. Cuando quieras, continuamos.";
        result.next_question = question;
        result.follow_up_strategy = "close";
      } else if (result.turn_intent === "skip_question") {
        result.control_response ||= "Está bien, podemos pasar a otra pregunta.";
        if (VALID_DIMENSIONS.has(questionId)) result.skipped_dimensions = [questionId];
        const nextDimension = CORE_DIMENSIONS.find((dimension) =>
          dimension !== questionId &&
          dimensionStatus[dimension] === "pending"
        ) || "";
        result.next_dimension = nextDimension;
        if (nextDimension) {
          result.next_question = QUESTION_MAP[nextDimension].question;
          result.example_response = QUESTION_MAP[nextDimension].example;
        } else {
          result.next_question = "";
          result.example_response = "";
          result.interview_complete = true;
          result.should_finish = true;
        }
        result.follow_up_strategy = nextDimension ? "switch_dimension" : "close";
      }
    }

    if (result.turn_intent === "answer") {
      const projectedStatus = { ...dimensionStatus };
      for (const dimension of result.covered_dimensions) projectedStatus[dimension] = "covered";
      for (const dimension of result.skipped_dimensions) projectedStatus[dimension] = "skipped";
      const resolvedCount = CORE_DIMENSIONS.filter((dimension) => projectedStatus[dimension] !== "pending").length;
      const currentIsUseful = result.answer_sufficiency === "sufficient";
      const usefulIncludingCurrent = usefulAnswersCount + (currentIsUseful ? 1 : 0);

      if (result.interview_complete && (usefulIncludingCurrent < 3 || resolvedCount < 3)) {
        result.interview_complete = false;
        result.should_finish = false;
      }

      if (resolvedCount === CORE_DIMENSIONS.length && usefulIncludingCurrent >= 3) {
        result.interview_complete = true;
        result.should_finish = true;
      }

      if (result.interview_complete) {
        result.follow_up_strategy = "close";
        result.next_dimension = "";
        result.next_question = "";
        result.example_response = "";
        result.final_message ||= "¡Listo! Ya tengo lo necesario para construir tu ruta.";
      }
    }

    let persistenceOk = false;
    const persistenceStartedAt = performance.now();
    try {
      persistenceOk = await persistTurn({
        sessionId,
        question,
        profile,
        onboardingData,
        result,
        usefulAnswersCount,
        turnsCount,
        durationMs,
        recordingId,
      });
    } catch (error) {
      console.error("Persistence error", error);
    }
    timing.persistence_ms = Math.round(performance.now() - persistenceStartedAt);
    timing.total_ms = Math.round(performance.now() - requestStartedAt);
    console.log("Nova timing", JSON.stringify({ sessionId, recordingId, ...timing }));

    return json({
      ...result,
      recording_id: recordingId,
      transcript,
      transcription_quality: transcriptionQuality,
      speech_detected: true,
      persistence_ok: persistenceOk,
      phase: "analysis",
      timing,
    }, 200, origin);
  } catch (error) {
    console.error(error);
    return json({
      error: "INTERNAL_ERROR",
      message: "No pudimos procesar el audio.",
    }, 500, origin);
  }
});
