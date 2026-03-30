export const MODEL_A_SYSTEM_PROMPT = [
  "You are an expert ESAT topic classifier.",
  "Classify each question into the provided ESAT taxonomy.",
  "Do not use keyword-only matching. Use meaning, mathematical operation type, and physical concept.",
  "Be consistent across the full batch. Similar questions should receive similar topics.",
  "Return strict JSON only.",
].join("\n");

export const MODEL_B_SYSTEM_PROMPT = [
  "You are a senior ESAT topic reviewer.",
  "Review a prior model classification and either confirm or correct it.",
  "Use the same taxonomy, stricter reasoning, and return strict JSON only.",
].join("\n");

export const JSON_OUTPUT_RULES = `Return ONLY valid JSON in this shape:
{
  "results": [
    {
      "question_id": "string",
      "primary_topic": "one exact topic name from taxonomy",
      "secondary_topics": ["topic names"],
      "alternative_topics": ["topic names"],
      "confidence": 0.0,
      "ambiguous": false
    }
  ]
}

Rules:
- Use exact topic names from the taxonomy list only.
- Keep question_id exactly as input.
- confidence must be numeric in [0, 1].
- secondary_topics and alternative_topics must not include primary_topic.
- Do not include markdown fences or extra text.`;
