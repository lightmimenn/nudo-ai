const OPENAI_URL = "https://api.openai.com/v1/responses";

// Страны, где показываем “App unavailable”
const BLOCKED_COUNTRIES = new Set(["RU", "BY", "SY", "IQ", "IR"]);

const corsHeaders = (origin, allowOrigin) => {
  const h = new Headers();
  if (allowOrigin) h.set("Access-Control-Allow-Origin", origin);
  h.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, X-NudoAI-Code");
  h.set("Access-Control-Max-Age", "86400");
  return h;
};

const parseAllowedOrigins = (s) =>
  (s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const isAllowedOrigin = (origin, list) => !!origin && list.includes(origin);

// Best-effort rate limit (на Free без KV/DO — так)
const rateMap = new Map(); // key -> { resetAt, count }

function rateLimitHit(key, limitPerMin) {
  const now = Date.now();
  const windowMs = 60_000;

  const entry = rateMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateMap.set(key, { resetAt: now + windowMs, count: 1 });
    return false;
  }

  entry.count += 1;
  rateMap.set(key, entry);
  return entry.count > limitPerMin;
}

function json(resObj, status, headers) {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(resObj), { status, headers });
}

function getCountry(request) {
  // Cloudflare: request.cf.country (или CF-IPCountry header). :contentReference[oaicite:2]{index=2}
  return request.cf?.country || request.headers.get("CF-IPCountry") || "XX";
}

function getClientIP(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    "0.0.0.0"
  );
}

function clampInt(str, def, min, max) {
  const n = Number.parseInt(str ?? "", 10);
  if (Number.isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function buildDeveloperPrompt({ mode, customInstructions }) {
  const base = [
    "Ты — NudoAI.",
    "Запрещено: сексуальные темы, терроризм, экстремизм, политика. Если запрос об этом — вежливо откажись.",
    "Язык ответа: авто (отвечай на языке пользователя).",
  ];

  if (mode === "code") {
    base.push(
      "Режим: CODING MODE (серьёзно, без шуток).",
      "Если пользователь просит сайт/интерфейс: выдавай результат в виде файлов и структуры проекта.",
      "НЕ объясняй. Никаких вступлений. Только: названия файлов/папок и содержимое.",
      "Если достаточно одного файла — дай один файл. Если нужно — дай index.html + styles.css + script.js."
    );
  } else {
    base.push(
      "Режим: TEXT GENERATION (нейтрально).",
      "Не объясняй процесс. Просто выдай готовый результат."
    );
  }

  if (customInstructions && typeof customInstructions === "string") {
    base.push("Доп. инструкции пользователя (следуй им, если не конфликтуют с правилами):");
    base.push(customInstructions.slice(0, 2000));
  }

  return base.join("\n");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = parseAllowedOrigins(env.ALLOWED_ORIGINS);
    const allowOrigin = isAllowedOrigin(origin, allowedOrigins);
    const headers = corsHeaders(origin, allowOrigin);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: allowOrigin ? 204 : 403, headers });
    }

    // Meta: страна + блок
if (url.pathname === "/api/meta" && request.method === "GET") {
  const country = getCountry(request);
  const blocked = BLOCKED_COUNTRIES.has(country);

  // Сделаем meta доступным для прямого открытия в браузере:
  // если Origin нет — разрешаем всем (только для /api/meta).
  const h = new Headers(headers);
  if (!origin) h.set("Access-Control-Allow-Origin", "*");

  return json(
    {
      country,
      blocked,
      blockedCountries: Array.from(BLOCKED_COUNTRIES),
      defaultModel: env.DEFAULT_MODEL || "chatgpt-4o-latest",
      limits: {
        maxOutputTokens: clampInt(env.MAX_OUTPUT_TOKENS, 2000, 200, 4000),
        maxInputChars: clampInt(env.MAX_INPUT_CHARS, 8000, 1000, 20000),
        rateLimitPerMin: clampInt(env.RATE_LIMIT_PER_MIN, 10, 1, 120),
      },
      pricingUsdPer1M: {
        "chatgpt-4o-latest": { input: 5.0, output: 15.0 },
        "gpt-4o": { input: 2.5, output: 10.0 }
      }
    },
    200,
    h
  );
}

    // Chat stream
    if (url.pathname === "/api/chat" && request.method === "POST") {
      if (!allowOrigin) return json({ error: "cors_blocked" }, 403, headers);

      const country = getCountry(request);
      if (BLOCKED_COUNTRIES.has(country)) {
        return json({ error: "region_blocked", country }, 451, headers);
      }

      // Access code check
      const code = request.headers.get("X-NudoAI-Code") || "";
      const allowedCodes = (env.ACCESS_CODES || "").split(",").map(s => s.trim()).filter(Boolean);
      if (!allowedCodes.includes(code)) {
        return json({ error: "invalid_code" }, 401, headers);
      }

      // Rate limit (по IP + code)
      const ip = getClientIP(request);
      const limit = clampInt(env.RATE_LIMIT_PER_MIN, 10, 1, 120);
      const key = `${ip}:${code}`;
      if (rateLimitHit(key, limit)) {
        return json({ error: "rate_limited", retryAfterSec: 60 }, 429, headers);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400, headers);
      }

      const mode = body?.mode === "code" ? "code" : "text";
      const model = typeof body?.model === "string" ? body.model : (env.DEFAULT_MODEL || "chatgpt-4o-latest");
      const customInstructions = typeof body?.customInstructions === "string" ? body.customInstructions : "";
      const messages = Array.isArray(body?.messages) ? body.messages : [];

      const maxOutputTokens = clampInt(env.MAX_OUTPUT_TOKENS, 2000, 200, 4000);
      const maxInputChars = clampInt(env.MAX_INPUT_CHARS, 8000, 1000, 20000);

      // Trim & validate messages, also hard-limit chars
      const cleaned = [];
      let charBudget = maxInputChars;

      for (const m of messages.slice(-20)) {
        const role = m?.role;
        const content = typeof m?.content === "string" ? m.content : "";
        if (!["user", "assistant"].includes(role)) continue;
        if (!content) continue;

        // cut if needed
        const clipped = content.slice(0, Math.max(0, charBudget));
        charBudget -= clipped.length;
        if (clipped.length === 0) break;

        cleaned.push({ role, content: clipped });
        if (charBudget <= 0) break;
      }

      if (cleaned.length === 0) {
        return json({ error: "empty_input" }, 400, headers);
      }

      const developer = {
        role: "developer",
        content: buildDeveloperPrompt({ mode, customInstructions })
      };

      const payload = {
        model,
        input: [developer, ...cleaned],
        stream: true,
        max_output_tokens: maxOutputTokens,
        temperature: mode === "code" ? 0.3 : 0.8,
        store: false
      };

      const upstream = await fetch(OPENAI_URL, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
        },
        body: JSON.stringify(payload)
      });

      // Если OpenAI вернул ошибку — отдаём JSON (не стрим)
      if (!upstream.ok) {
        let errJson = {};
        try { errJson = await upstream.json(); } catch {}
        return json({ error: "openai_error", details: errJson }, 502, headers);
      }

      // Проксируем SSE поток “как есть”
      headers.set("Content-Type", "text/event-stream; charset=utf-8");
      headers.set("Cache-Control", "no-cache");
      headers.set("Connection", "keep-alive");

      return new Response(upstream.body, { status: 200, headers });
    }
const resp = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(payload),
});

if (!resp.ok) {
  const txt = await resp.text();
  console.error("OpenAI error:", resp.status, txt);
  return json(
    { error: "openai_error", status: resp.status, details: txt.slice(0, 2000) },
    502,
    corsHeaders(origin, env)
  );
}

    return new Response("Not found", { status: 404 });
  }
};

