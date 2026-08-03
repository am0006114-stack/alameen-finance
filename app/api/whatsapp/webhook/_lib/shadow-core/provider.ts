import type { ShadowAttemptResult, ShadowGenerationResult } from "./types";

function stripCodeFence(value: string) {
  return String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function extractModelText(data: unknown) {
  const obj = data as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = obj?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((item) => item?.text || "").join("\n").trim();
  return "";
}

function parseReply(raw: string) {
  const clean = stripCodeFence(raw);
  if (!clean) return { reply: "", mode: "failed" as const };
  try {
    const parsed = JSON.parse(clean) as { reply?: unknown };
    if (typeof parsed.reply === "string" && parsed.reply.trim()) return { reply: parsed.reply.trim(), mode: "json" as const };
  } catch {
    const objectMatch = clean.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        const repaired = JSON.parse(objectMatch[0]) as { reply?: unknown };
        if (typeof repaired.reply === "string" && repaired.reply.trim()) return { reply: repaired.reply.trim(), mode: "repaired_json" as const };
      } catch {
        // handled below
      }
    }
  }
  return { reply: "", mode: "failed" as const };
}

function retryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function truncate(value: string, max = 6000) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateJsonReply(input: {
  systemPrompt: string;
  userPrompt: string;
}): Promise<ShadowGenerationResult> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const model = process.env.DEEPSEEK_MODEL || process.env.DEEPSEEK_REASONING_MODEL || "deepseek-chat";
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
  const requestedTimeout = Number(process.env.WHATSAPP_SHADOW_TIMEOUT_MS || "22000");
  const timeoutMs = Number.isFinite(requestedTimeout) ? Math.min(30000, Math.max(12000, requestedTimeout)) : 22000;
  const startedAt = Date.now();
  const attempts: ShadowAttemptResult[] = [];

  if (!apiKey) {
    return {
      ok: false, retryable: false, candidateReply: "", model, generationMs: 0, parseMode: "failed",
      providerHttpStatus: null, errorCode: "missing_api_key", errorMessage: "DEEPSEEK_API_KEY is missing", attempts,
    };
  }

  let useJsonMode = true;
  let lastStatus: number | null = null;
  let lastCode = "generation_failed";
  let lastMessage = "تعذر توليد الرد التجريبي";
  let retryable = false;

  for (let providerAttempt = 1; providerAttempt <= 2; providerAttempt += 1) {
    const attemptStarted = Date.now();
    const startedAtIso = new Date(attemptStarted).toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        temperature: 0.15,
        max_tokens: Number(process.env.WHATSAPP_SHADOW_MAX_TOKENS || "600"),
      };
      if (useJsonMode) body.response_format = { type: "json_object" };

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const rawBody = await response.text();
      lastStatus = response.status;

      if (!response.ok) {
        const unsupportedJsonMode = response.status === 400 && /response_format|json_object|json mode/i.test(rawBody);
        const currentRetryable = retryableStatus(response.status) || unsupportedJsonMode;
        lastCode = unsupportedJsonMode ? "json_mode_unsupported" : `http_${response.status}`;
        lastMessage = truncate(rawBody || `HTTP ${response.status}`, 1200);
        retryable = currentRetryable;
        attempts.push({
          providerAttempt, model, startedAt: startedAtIso, completedAt: new Date().toISOString(),
          latencyMs: Date.now() - attemptStarted, httpStatus: response.status, outcome: "http_error",
          errorCode: lastCode, errorMessage: lastMessage, rawResponse: truncate(rawBody),
        });
        if (unsupportedJsonMode) useJsonMode = false;
        if (!currentRetryable || providerAttempt === 2) break;
        await wait(700 + Math.floor(Math.random() * 500));
        continue;
      }

      let decoded: unknown;
      try {
        decoded = JSON.parse(rawBody);
      } catch {
        decoded = null;
      }
      const modelText = extractModelText(decoded);
      const parsed = parseReply(modelText);
      if (!parsed.reply) {
        lastCode = "invalid_json_reply";
        lastMessage = "مزود النموذج أعاد ردًا لا يحتوي JSON صالحًا بالحقل reply";
        retryable = true;
        attempts.push({
          providerAttempt, model, startedAt: startedAtIso, completedAt: new Date().toISOString(),
          latencyMs: Date.now() - attemptStarted, httpStatus: response.status, outcome: "parse_error",
          errorCode: lastCode, errorMessage: lastMessage, rawResponse: truncate(rawBody),
        });
        useJsonMode = true;
        if (providerAttempt === 2) break;
        await wait(700 + Math.floor(Math.random() * 500));
        continue;
      }

      attempts.push({
        providerAttempt, model, startedAt: startedAtIso, completedAt: new Date().toISOString(),
        latencyMs: Date.now() - attemptStarted, httpStatus: response.status, outcome: "success",
        errorCode: null, errorMessage: null, rawResponse: truncate(rawBody),
      });
      return {
        ok: true, retryable: false, candidateReply: parsed.reply, model,
        generationMs: Date.now() - startedAt, parseMode: parsed.mode,
        providerHttpStatus: response.status, errorCode: null, errorMessage: null, attempts,
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      lastCode = isTimeout ? "timeout" : "network_error";
      lastMessage = isTimeout ? `انتهت مهلة الطلب بعد ${timeoutMs}ms` : (error instanceof Error ? error.message : String(error));
      retryable = true;
      attempts.push({
        providerAttempt, model, startedAt: startedAtIso, completedAt: new Date().toISOString(),
        latencyMs: Date.now() - attemptStarted, httpStatus: null, outcome: isTimeout ? "timeout" : "network_error",
        errorCode: lastCode, errorMessage: lastMessage, rawResponse: null,
      });
      if (providerAttempt === 2) break;
      await wait(700 + Math.floor(Math.random() * 500));
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false, retryable, candidateReply: "", model, generationMs: Date.now() - startedAt,
    parseMode: "failed", providerHttpStatus: lastStatus, errorCode: lastCode,
    errorMessage: lastMessage, attempts,
  };
}
