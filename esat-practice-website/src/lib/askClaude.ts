import type { Question } from "../types/schema";

export const DEFAULT_PROMPT_TEMPLATE = `I'm practising for the Engineering and Science Admissions Test (ESAT) and need help with a {{topic}} question.

The question begins:
{{question}}

Correct answer:
{{answer}}

Act as an expert ESAT tutor.

The ESAT is completed without a calculator and candidates have approximately 1.5 minutes per question.

Structure your response exactly as follows:

## Concept Tested
- Identify the underlying physics principle(s).
- State any key equations.

## Fast Recognition
- What clues in the question immediately indicate the required concept?
- What should an ESAT candidate notice within the first 5-10 seconds?

## Fastest Solution
- Show the quickest reliable method suitable for exam conditions.
- Highlight any shortcuts, approximations, eliminations, or observations that save time.

## Option Analysis
- Why the correct answer is correct.
- Why each incorrect option is wrong.
- Identify the misconception behind each distractor.

## General Pattern
- Describe the broader class of ESAT questions this belongs to.
- Give a reusable strategy for solving similar questions.

## Exam Takeaway
- One or two concise rules to remember in future.`;

const TEMPLATE_VARS: Record<string, (q: Question) => string> = {
  question: (q) => {
    const t = q.content.text.trim().replace(/\s+/g, " ");
    return t.length > 140 ? t.slice(0, 140) + "…" : t;
  },
  question_full: (q) => q.content.text.trim(),
  answer:  (q) => q.answer.correct,
  topic:   (q) => q.taxonomy.primary_topic,
  subject: (q) => q.source.subject,
  year:    (q) => String(q.source.year),
  paper:   (q) => q.source.paper,
};

// Substitutes {{variable}} tokens. Unknown tokens are left as-is.
export function renderPromptTemplate(template: string, question: Question): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const fn = TEMPLATE_VARS[key];
    return fn ? fn(question) : match;
  });
}

export function questionHasImage(question: Question): boolean {
  return Boolean(question.content.image_url ?? question.content.image_b64);
}

const IMAGE_GUARD =
  "If no image has been attached to this message, reply ONLY with: \"Please also attach the question image — the question text above is only a partial extract and I need the full image to help you properly.\" Do not answer the question until the image is provided.\n\n";

// No-script path: copy prompt text to clipboard and open claude.ai.
// User attaches the image manually.
export async function askClaudeBasic(question: Question, template: string): Promise<void> {
  let prompt = renderPromptTemplate(template, question);
  if (!prompt.trim()) throw new Error("Prompt template is empty — add some content in Settings.");
  if (questionHasImage(question)) prompt = IMAGE_GUARD + prompt;
  await navigator.clipboard.writeText(prompt);
  const tab = window.open("https://claude.ai/new", "_blank", "noopener,noreferrer");
  if (!tab) throw new Error("Claude could not be opened — allow pop-ups for this site.");
}

// Userscript path: post the raw question data to the userscript running on this
// page. It handles image fetching (via GM_xmlhttpRequest, which bypasses CORS)
// then opens claude.ai and auto-injects everything.
export function askClaudeWithScript(question: Question, template: string, hasExtension: boolean): void {
  if (!hasExtension) throw new Error("Tampermonkey extension not detected — install it or switch to copy & paste mode in Settings.");
  const prompt = renderPromptTemplate(template, question);
  if (!prompt.trim()) throw new Error("Prompt template is empty — add some content in Settings.");
  if (prompt.length > 100_000) throw new Error("Rendered prompt exceeds 100 KB — shorten your template in Settings.");

  const imageB64 = question.content.image_b64
    ? question.content.image_b64.startsWith("data:")
      ? question.content.image_b64
      : `data:image/png;base64,${question.content.image_b64}`
    : undefined;

  // Resolve to an absolute URL so the userscript can fetch it cross-origin via GM_xmlhttpRequest.
  const imageUrl = question.content.image_url
    ? new URL(question.content.image_url, window.location.origin).href
    : undefined;

  window.postMessage(
    {
      type: "esat:ask-claude",
      payload: { prompt, imageUrl, imageB64 },
    },
    window.location.origin,
  );
}
