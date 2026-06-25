import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  DEFAULT_PROMPT_TEMPLATE,
  renderPromptTemplate,
  questionHasImage,
  askClaudeBasic,
  askClaudeWithScript,
} from "./askClaude";
import type { Question } from "../types/schema";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    source: { paper: "1A", year: 2024, part: "1", subject: "Physics", page: 3 },
    content: { text: "What is the speed of light?" },
    answer: { correct: "C", verified: true },
    taxonomy: {
      primary_topic: "Waves",
      secondary_topics: [],
      confidence: 0.9,
      model_used: "gpt-4",
    },
    meta: { times_attempted: 0, accuracy_rate: 0 },
    ...overrides,
  };
}

// IMAGE_GUARD prefix used in askClaudeBasic for questions with images.
const IMAGE_GUARD_PREFIX = "If no image has been attached";

describe("renderPromptTemplate", () => {
  it("substitutes all known tokens", () => {
    const q = makeQuestion();
    const result = renderPromptTemplate(
      "{{topic}} {{subject}} {{year}} {{paper}} {{answer}} {{question}} {{question_full}}",
      q,
    );
    expect(result).toBe("Waves Physics 2024 1A C What is the speed of light? What is the speed of light?");
  });

  it("leaves unknown tokens unchanged", () => {
    const q = makeQuestion();
    const result = renderPromptTemplate("Hello {{unknown}} world", q);
    expect(result).toBe("Hello {{unknown}} world");
  });

  it("substitutes the same token multiple times in one template", () => {
    const q = makeQuestion();
    expect(renderPromptTemplate("{{topic}} and {{topic}}", q)).toBe("Waves and Waves");
  });

  it("truncates {{question}} at 140 chars with ellipsis", () => {
    const longText = "A".repeat(150);
    const q = makeQuestion({ content: { text: longText } });
    const result = renderPromptTemplate("{{question}}", q);
    expect(result).toHaveLength(141); // 140 + "…"
    expect(result.endsWith("…")).toBe(true);
  });

  it("does not truncate {{question}} at exactly 140 chars", () => {
    // The guard is > 140, so exactly 140 chars must NOT get an ellipsis.
    const text = "A".repeat(140);
    const q = makeQuestion({ content: { text } });
    const result = renderPromptTemplate("{{question}}", q);
    expect(result).toBe(text);
  });

  it("does not truncate {{question_full}}", () => {
    const longText = "A".repeat(150);
    const q = makeQuestion({ content: { text: longText } });
    expect(renderPromptTemplate("{{question_full}}", q)).toBe(longText);
  });

  it("trims and collapses whitespace in {{question}}", () => {
    const q = makeQuestion({ content: { text: "  hello   world  " } });
    expect(renderPromptTemplate("{{question}}", q)).toBe("hello world");
  });

  it("trims but preserves internal whitespace in {{question_full}}", () => {
    const q = makeQuestion({ content: { text: "  hello   world  " } });
    expect(renderPromptTemplate("{{question_full}}", q)).toBe("hello   world");
  });

  it("returns empty string for {{question}} and {{question_full}} when text is empty", () => {
    const q = makeQuestion({ content: { text: "" } });
    expect(renderPromptTemplate("{{question}}", q)).toBe("");
    expect(renderPromptTemplate("{{question_full}}", q)).toBe("");
  });

  it("works with the DEFAULT_PROMPT_TEMPLATE", () => {
    const q = makeQuestion();
    const result = renderPromptTemplate(DEFAULT_PROMPT_TEMPLATE, q);
    expect(result).toContain("Waves");
    expect(result).toContain("What is the speed of light?");
    expect(result).toContain("C");
  });
});

describe("questionHasImage", () => {
  it("returns false when no image fields are set", () => {
    expect(questionHasImage(makeQuestion())).toBe(false);
  });

  it("returns true when image_url is set", () => {
    const q = makeQuestion({ content: { text: "q", image_url: "https://example.com/img.png" } });
    expect(questionHasImage(q)).toBe(true);
  });

  it("returns true when image_b64 is set", () => {
    const q = makeQuestion({ content: { text: "q", image_b64: "abc123" } });
    expect(questionHasImage(q)).toBe(true);
  });
});

describe("askClaudeBasic", () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.spyOn(window, "open").mockReturnValue({} as Window);
  });

  it("writes rendered prompt to clipboard and opens claude.ai", async () => {
    const q = makeQuestion();
    await askClaudeBasic(q, "Topic: {{topic}} Answer: {{answer}}");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Topic: Waves Answer: C");
    expect(window.open).toHaveBeenCalledWith("https://claude.ai/new", "_blank", "noopener,noreferrer");
  });

  it("throws when the rendered prompt is empty", async () => {
    const q = makeQuestion();
    await expect(askClaudeBasic(q, "   ")).rejects.toThrow("Prompt template is empty");
  });

  it("throws when window.open returns null (pop-ups blocked)", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    const q = makeQuestion();
    await expect(askClaudeBasic(q, "{{topic}}")).rejects.toThrow("Claude could not be opened");
  });

  it("propagates clipboard write failures", async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("permission denied")) },
    });
    const q = makeQuestion();
    await expect(askClaudeBasic(q, "{{topic}}")).rejects.toThrow("permission denied");
  });

  it("prepends IMAGE_GUARD when question has image_url", async () => {
    const q = makeQuestion({ content: { text: "q", image_url: "https://example.com/img.png" } });
    await askClaudeBasic(q, "{{topic}}");
    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(written.startsWith(IMAGE_GUARD_PREFIX)).toBe(true);
  });

  it("prepends IMAGE_GUARD when question has image_b64", async () => {
    const q = makeQuestion({ content: { text: "q", image_b64: "abc123" } });
    await askClaudeBasic(q, "{{topic}}");
    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(written.startsWith(IMAGE_GUARD_PREFIX)).toBe(true);
  });

  it("does not prepend IMAGE_GUARD for questions without an image", async () => {
    const q = makeQuestion();
    await askClaudeBasic(q, "{{topic}}");
    const written = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(written.startsWith(IMAGE_GUARD_PREFIX)).toBe(false);
  });
});

describe("askClaudeWithScript", () => {
  beforeEach(() => {
    vi.spyOn(window, "postMessage").mockImplementation(() => {});
  });

  it("throws when hasExtension is false", () => {
    expect(() => askClaudeWithScript(makeQuestion(), "{{topic}}", false)).toThrow(
      "Tampermonkey extension not detected",
    );
  });

  it("throws when rendered prompt is empty", () => {
    expect(() => askClaudeWithScript(makeQuestion(), "  ", true)).toThrow("Prompt template is empty");
  });

  it("throws when rendered prompt exceeds 100 000 chars", () => {
    const hugeTemplate = "x".repeat(100_001);
    expect(() => askClaudeWithScript(makeQuestion(), hugeTemplate, true)).toThrow(
      "Rendered prompt exceeds 100 KB",
    );
  });

  it("does not throw when rendered prompt is exactly 100 000 chars", () => {
    const template = "x".repeat(100_000);
    expect(() => askClaudeWithScript(makeQuestion(), template, true)).not.toThrow();
  });

  it("posts the correct message with prompt and no image fields when question has no image", () => {
    const q = makeQuestion();
    askClaudeWithScript(q, "{{topic}}", true);
    expect(window.postMessage).toHaveBeenCalledWith(
      {
        type: "esat:ask-claude",
        payload: { prompt: "Waves", imageUrl: undefined, imageB64: undefined },
      },
      window.location.origin,
    );
  });

  it("resolves a relative image_url to an absolute URL", () => {
    const q = makeQuestion({ content: { text: "q", image_url: "/assets/img.png" } });
    askClaudeWithScript(q, "{{topic}}", true);
    expect(window.postMessage).toHaveBeenCalledWith(
      {
        type: "esat:ask-claude",
        payload: {
          prompt: "Waves",
          imageUrl: new URL("/assets/img.png", window.location.origin).href,
          imageB64: undefined,
        },
      },
      window.location.origin,
    );
  });

  it("leaves an already-absolute image_url unchanged", () => {
    const absUrl = "https://cdn.example.com/img.png";
    const q = makeQuestion({ content: { text: "q", image_url: absUrl } });
    askClaudeWithScript(q, "{{topic}}", true);
    expect(window.postMessage).toHaveBeenCalledWith(
      {
        type: "esat:ask-claude",
        payload: { prompt: "Waves", imageUrl: absUrl, imageB64: undefined },
      },
      window.location.origin,
    );
  });

  it("prefixes bare base64 with data URI scheme", () => {
    const q = makeQuestion({ content: { text: "q", image_b64: "abc123" } });
    askClaudeWithScript(q, "{{topic}}", true);
    expect(window.postMessage).toHaveBeenCalledWith(
      {
        type: "esat:ask-claude",
        payload: { prompt: "Waves", imageUrl: undefined, imageB64: "data:image/png;base64,abc123" },
      },
      window.location.origin,
    );
  });

  it("leaves a data URI image_b64 unchanged", () => {
    const q = makeQuestion({ content: { text: "q", image_b64: "data:image/png;base64,abc123" } });
    askClaudeWithScript(q, "{{topic}}", true);
    expect(window.postMessage).toHaveBeenCalledWith(
      {
        type: "esat:ask-claude",
        payload: { prompt: "Waves", imageUrl: undefined, imageB64: "data:image/png;base64,abc123" },
      },
      window.location.origin,
    );
  });

  it("includes both imageUrl and imageB64 when both are present on the question", () => {
    const q = makeQuestion({
      content: { text: "q", image_url: "/assets/img.png", image_b64: "abc123" },
    });
    askClaudeWithScript(q, "{{topic}}", true);
    expect(window.postMessage).toHaveBeenCalledWith(
      {
        type: "esat:ask-claude",
        payload: {
          prompt: "Waves",
          imageUrl: new URL("/assets/img.png", window.location.origin).href,
          imageB64: "data:image/png;base64,abc123",
        },
      },
      window.location.origin,
    );
  });
});
