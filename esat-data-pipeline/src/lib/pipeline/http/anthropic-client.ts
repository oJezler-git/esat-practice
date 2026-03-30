const MAX_RETRIES = 5;
const ANTHROPIC_VERSION = "2023-06-01";
const ANTHROPIC_MESSAGES_URL = import.meta.env.VITE_ANTHROPIC_MESSAGES_URL
  ? String(import.meta.env.VITE_ANTHROPIC_MESSAGES_URL)
  : "/api/anthropic/v1/messages";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Anthropic responses are block-based; we intentionally keep only text blocks so
 * downstream parsing always receives one plain string.
 *
 * @param {unknown} responseJson Raw JSON body returned by Anthropic.
 * @returns {string} Concatenated text payload from `content` blocks.
 */
function asTextContent(responseJson: unknown): string {
  const blocks =
    typeof responseJson === "object" &&
    responseJson !== null &&
    "content" in responseJson
      ? (responseJson as { content?: unknown }).content
      : undefined;

  if (!Array.isArray(blocks)) {
    throw new Error("Anthropic response missing content array");
  }

  const joined = blocks
    .filter(
      (block): block is { type?: unknown; text?: unknown } =>
        typeof block === "object" && block !== null,
    )
    .filter((block) => block.type === "text")
    .map((block) => String(block.text ?? ""))
    .join("\n")
    .trim();

  if (!joined) {
    throw new Error("Anthropic response text content is empty");
  }

  return joined;
}

/**
 * Thin client wrapper used by both pipeline stages.
 * We only retry rate limits (429); retrying most other statuses tends to hide
 * actionable failures and slows feedback.
 *
 * @param {"claude-sonnet-4-6" | "claude-opus-4-6"} model Model identifier for the request.
 * @param {string} systemPrompt System instruction string.
 * @param {string} userPrompt User prompt payload.
 * @param {string} apiKey Anthropic API key.
 * @returns {Promise<string>} Text response extracted from Anthropic content blocks.
 */
export async function callAnthropic(
  model: "claude-sonnet-4-6" | "claude-opus-4-6",
  systemPrompt: string,
  userPrompt: string,
  apiKey: string,
): Promise<string> {
  let attempt = 0;
  let backoffMs = 1500;

  while (attempt <= MAX_RETRIES) {
    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        temperature: 0,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: userPrompt,
          },
        ],
      }),
    });

    if (response.ok) {
      const responseJson = await response.json();
      return asTextContent(responseJson);
    }

    const errorText = await response.text().catch(() => "");
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const jitter = Math.floor(Math.random() * 500);
      await sleep(backoffMs + jitter);
      backoffMs *= 2;
      attempt += 1;
      continue;
    }

    throw new Error(
      `Anthropic API error (${response.status}): ${errorText || response.statusText}`,
    );
  }

  throw new Error("Anthropic API failed after max retries");
}
