// analyze-email: turns an email into a structured task suggestion.
// Provider key resolution: server secret (GEMINI_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY)
// -> the signed-in user's own key from user_settings -> built-in heuristic fallback (no AI).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type EmailIn = {
  subject?: string;
  from_name?: string;
  from_address?: string;
  date?: string;
  body?: string;
  url?: string;
  now?: string;
  timezone?: string;
  lists?: string[];
  instructions?: string;
};

type TaskOut = {
  title: string;
  description: string;
  summary: string;
  due_at: string | null;
  all_day: boolean;
  priority: number;
  tags: string[];
  subtasks: string[];
  suggested_list: string | null;
  estimate_minutes: number | null;
  action_required: boolean;
  provider: string;
  model: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

function buildPrompt(e: EmailIn) {
  const lists = (e.lists ?? []).filter(Boolean);
  return `You are an assistant that converts an email into ONE actionable to-do task for the recipient.
Current date/time: ${e.now ?? new Date().toISOString()} (user timezone: ${e.timezone ?? "UTC"}).

Return ONLY a JSON object with exactly these keys:
{
  "title": string,            // short imperative task title, max 80 chars, e.g. "Submit MMMG assignment on LMS"
  "description": string,      // useful notes in plain text/markdown bullets: key facts, links, amounts, people, locations
  "summary": string,          // 1-2 sentence summary of the email
  "due_at": string | null,    // ISO 8601 with timezone offset for the deadline/meeting time if one is stated or clearly implied, else null
  "all_day": boolean,         // true if only a date (no specific time) is known
  "priority": 0|1|2|3|4,      // 0 none, 1 low, 2 medium, 3 high, 4 urgent (urgent only for explicit urgency / due within 24h)
  "tags": string[],           // 1-4 short lowercase tags
  "subtasks": string[],       // 0-6 concrete steps, only if helpful
  "suggested_list": string | null, // pick one of: ${lists.length ? lists.map((l) => JSON.stringify(l)).join(", ") : "(none)"} or null
  "estimate_minutes": number | null,
  "action_required": boolean  // false for pure newsletters/notifications with nothing to do
}
Resolve relative dates ("tomorrow", "next Friday", "EOD") against the current date and the user's timezone.
${e.instructions ? `Extra user instructions: ${e.instructions}\n` : ""}
EMAIL
From: ${e.from_name ?? ""} <${e.from_address ?? ""}>
Sent: ${e.date ?? "unknown"}
Subject: ${e.subject ?? "(no subject)"}

${(e.body ?? "").slice(0, 12000)}`;
}

function extractJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?/m, "").replace(/```\s*$/m, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error("Model did not return JSON");
  }
}

async function callGemini(key: string, model: string | null, prompt: string) {
  const models = model ? [model] : ["gemini-flash-latest", "gemini-2.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash-lite"];
  let lastErr = "";
  for (const m of models) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (r.ok) {
      const d = await r.json();
      const text = (d.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? "").join("");
      return { data: extractJson(text), model: m };
    }
    lastErr = `${r.status} ${(await r.text()).slice(0, 300)}`;
    if (r.status !== 404 && r.status !== 400) break;
  }
  throw new Error(`Gemini error: ${lastErr}`);
}

async function callOpenAI(key: string, model: string | null, prompt: string, baseUrl?: string | null) {
  const m = model || "gpt-4.1-mini";
  const r = await fetch(`${(baseUrl || "https://api.openai.com/v1").replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: m,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI error: ${r.status} ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return { data: extractJson(d.choices?.[0]?.message?.content ?? ""), model: m };
}

async function callAnthropic(key: string, model: string | null, prompt: string) {
  const m = model || "claude-haiku-4-5";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: m,
      max_tokens: 1200,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt + "\n\nRespond with the JSON object only." }],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic error: ${r.status} ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  const text = (d.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
  return { data: extractJson(text), model: m };
}

// ---------------------------------------------------------------- heuristic fallback
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function heuristic(e: EmailIn): Omit<TaskOut, "provider" | "model"> {
  const subject = (e.subject ?? "").replace(/^(re|fwd?|fw)\s*:\s*/gi, "").trim() || "Email follow-up";
  const body = e.body ?? "";
  const text = `${subject}\n${body}`.toLowerCase();
  const now = e.now ? new Date(e.now) : new Date();
  let due: Date | null = null;
  let allDay = true;

  if (/\b(today|tonight|eod|end of (the )?day)\b/.test(text)) due = new Date(now);
  else if (/\btomorrow\b/.test(text)) due = new Date(now.getTime() + 864e5);
  else {
    const dm = text.match(/\b(?:by|on|before|due|deadline[: ]*)\s*(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
    if (dm) {
      const target = DAYS.indexOf(dm[1]);
      due = new Date(now);
      let diff = (target - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      due.setDate(now.getDate() + diff);
    } else {
      const md = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/) ||
        text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
      if (md) {
        const [d, mo] = isNaN(Number(md[1])) ? [Number(md[2]), md[1]] : [Number(md[1]), md[2]];
        due = new Date(now.getFullYear(), MONTHS.indexOf(mo.slice(0, 3)), d, 9, 0, 0);
        if (due.getTime() < now.getTime() - 864e5 * 30) due.setFullYear(due.getFullYear() + 1);
      }
    }
  }
  const tm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (due && tm) {
    let h = Number(tm[1]) % 12;
    if (tm[3] === "pm") h += 12;
    due.setHours(h, Number(tm[2] ?? 0), 0, 0);
    allDay = false;
  } else if (due) due.setHours(9, 0, 0, 0);

  let priority = 0;
  if (/\b(urgent|asap|immediately|critical)\b/.test(text)) priority = 4;
  else if (/\b(deadline|important|due|final reminder|last date)\b/.test(text)) priority = 3;
  else if (due) priority = 2;

  const tags = new Set<string>();
  const rules: [RegExp, string][] = [
    [/\b(invoice|payment|pay|fee|bill|refund)\b/, "finance"],
    [/\b(meeting|call|zoom|meet\.google|calendar|invite)\b/, "meeting"],
    [/\b(assignment|submission|quiz|exam|course|class|lecture)\b/, "college"],
    [/\b(interview|resume|placement|internship|job)\b/, "career"],
    [/\b(review|feedback|approve)\b/, "review"],
    [/\b(reply|respond|let me know|get back)\b/, "reply"],
  ];
  for (const [re, t] of rules) if (re.test(text)) tags.add(t);

  const verb = tags.has("reply") ? "Reply to" : tags.has("meeting") ? "Attend" : tags.has("finance") ? "Handle" : "Follow up on";
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 280);
  return {
    title: `${verb}: ${subject}`.slice(0, 120),
    description: snippet ? `From ${e.from_name || e.from_address || "sender"}:\n${snippet}${body.length > 280 ? "…" : ""}` : "",
    summary: snippet.slice(0, 200),
    due_at: due ? due.toISOString() : null,
    all_day: allDay,
    priority,
    tags: [...tags].slice(0, 4),
    subtasks: [],
    suggested_list: null,
    estimate_minutes: null,
    action_required: true,
  };
}

function normalize(raw: Record<string, unknown>, e: EmailIn): Omit<TaskOut, "provider" | "model"> {
  const fb = heuristic(e);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  let due: string | null = null;
  if (typeof raw.due_at === "string" && raw.due_at && !isNaN(Date.parse(raw.due_at))) due = new Date(raw.due_at).toISOString();
  const pr = Number(raw.priority);
  return {
    title: (str(raw.title) || fb.title).slice(0, 200),
    description: str(raw.description),
    summary: str(raw.summary),
    due_at: due,
    all_day: typeof raw.all_day === "boolean" ? raw.all_day : true,
    priority: Number.isFinite(pr) ? Math.max(0, Math.min(4, Math.round(pr))) : 0,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => String(t).toLowerCase().replace(/^#/, "").trim()).filter(Boolean).slice(0, 6) : [],
    subtasks: Array.isArray(raw.subtasks) ? raw.subtasks.map((s) => String(s).trim()).filter(Boolean).slice(0, 10) : [],
    suggested_list: str(raw.suggested_list) || null,
    estimate_minutes: Number.isFinite(Number(raw.estimate_minutes)) && raw.estimate_minutes !== null ? Number(raw.estimate_minutes) : null,
    action_required: raw.action_required !== false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let email: EmailIn;
  try {
    email = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Look up the caller's own AI settings (RLS restricts this to their row).
  let settings: { ai_provider?: string; ai_api_key?: string; ai_model?: string; ai_base_url?: string } = {};
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Sign in required" }, 401);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (userErr || !userData?.user) return json({ error: "Invalid or expired session" }, 401);
  try {
    const { data } = await sb.from("user_settings").select("ai_provider, ai_api_key, ai_model, ai_base_url").maybeSingle();
    if (data) settings = data;
  } catch (_) { /* ignore */ }

  const prompt = buildPrompt(email);
  const userKey = settings.ai_api_key?.trim();
  const provider = settings.ai_provider ?? "gemini";
  const attempts: Array<() => Promise<{ data: Record<string, unknown>; model: string }>> = [];
  const names: string[] = [];

  if (provider !== "none") {
    if (userKey) {
      if (provider === "openai" || provider === "openai_compatible") attempts.push(() => callOpenAI(userKey, settings.ai_model ?? null, prompt, settings.ai_base_url));
      else if (provider === "anthropic") attempts.push(() => callAnthropic(userKey, settings.ai_model ?? null, prompt));
      else attempts.push(() => callGemini(userKey, settings.ai_model ?? null, prompt));
      names.push(provider);
    }
    const g = Deno.env.get("GEMINI_API_KEY"), o = Deno.env.get("OPENAI_API_KEY"), a = Deno.env.get("ANTHROPIC_API_KEY");
    if (g) { attempts.push(() => callGemini(g, Deno.env.get("GEMINI_MODEL") ?? null, prompt)); names.push("gemini"); }
    if (o) { attempts.push(() => callOpenAI(o, Deno.env.get("OPENAI_MODEL") ?? null, prompt)); names.push("openai"); }
    if (a) { attempts.push(() => callAnthropic(a, Deno.env.get("ANTHROPIC_MODEL") ?? null, prompt)); names.push("anthropic"); }
  }

  const errors: string[] = [];
  for (let i = 0; i < attempts.length; i++) {
    try {
      const { data, model } = await attempts[i]();
      return json({ task: { ...normalize(data, email), provider: names[i], model } });
    } catch (err) {
      errors.push(String((err as Error).message ?? err));
    }
  }
  return json({
    task: { ...heuristic(email), provider: "heuristic", model: null },
    warning: attempts.length ? `AI failed, used basic extraction. ${errors.join(" | ")}` : "No AI key configured — used basic extraction. Add a key in Settings.",
  });
});
