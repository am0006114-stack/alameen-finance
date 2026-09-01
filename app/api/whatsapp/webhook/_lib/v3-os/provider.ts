export type V3TextProvider = {
  generate(input: { system: string; user: string; temperature?: number; maxTokens?: number }): Promise<string>;
};

function cleanBaseUrl(value: string) { return value.replace(/\/+$/, ""); }

export function createOpenAiCompatibleProvider(input: { apiKey: string; baseUrl: string; model: string }): V3TextProvider {
  return {
    async generate(req) {
      const response = await fetch(`${cleanBaseUrl(input.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${input.apiKey}` },
        body: JSON.stringify({
          model: input.model,
          temperature: req.temperature ?? 0.25,
          max_tokens: req.maxTokens ?? 900,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
      });
      if (!response.ok) throw new Error(`v3_provider_http_${response.status}:${(await response.text()).slice(0, 500)}`);
      const json = await response.json() as { choices?: Array<{ message?: { content?: string | null } }> };
      const text = String(json.choices?.[0]?.message?.content || "").trim();
      if (!text) throw new Error("v3_provider_empty_response");
      return text;
    },
  };
}

export function createDeepSeekProvider(apiKey: string, model: string): V3TextProvider {
  return createOpenAiCompatibleProvider({
    apiKey,
    baseUrl: process.env.DEEPSEEK_V3_BASE_URL || "https://api.deepseek.com",
    model,
  });
}

export function createOpenAiProvider(apiKey: string, model: string): V3TextProvider {
  return createOpenAiCompatibleProvider({
    apiKey,
    baseUrl: process.env.OPENAI_V3_BASE_URL || "https://api.openai.com/v1",
    model,
  });
}

export function v3WriterProviderFromEnv(): V3TextProvider | null {
  const key = process.env.DEEPSEEK_V3_API_KEY || process.env.DEEPSEEK_V2_API_KEY || "";
  if (!key) return null;
  return createDeepSeekProvider(key, process.env.DEEPSEEK_V3_WRITER_MODEL || process.env.DEEPSEEK_V3_MODEL || "deepseek-chat");
}

export function v3InterpreterProviderFromEnv(): V3TextProvider | null {
  const key = process.env.DEEPSEEK_V3_API_KEY || process.env.DEEPSEEK_V2_API_KEY || "";
  if (!key) return null;
  return createDeepSeekProvider(key, process.env.DEEPSEEK_V3_INTERPRETER_MODEL || process.env.DEEPSEEK_V3_MODEL || "deepseek-chat");
}

export function v3JudgeProviderFromEnv(): V3TextProvider | null {
  const key = process.env.OPENAI_V3_API_KEY || process.env.OPENAI_V2_API_KEY || "";
  const model = process.env.OPENAI_V3_JUDGE_MODEL || "";
  if (!key || !model) return null;
  return createOpenAiProvider(key, model);
}
