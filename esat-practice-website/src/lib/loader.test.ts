import { describe, it, expect } from "vitest";
import pipelineSample from "../data/pipeline-sample.json";
import { normalizePipelinePayload } from "./loader";

describe("loader", () => {
  it("should normalize pipeline payload correctly", () => {
    const { questions, skipped } = normalizePipelinePayload(pipelineSample);

    expect(skipped).toBe(0);
    expect(questions.length).toBe(2);

    for (const question of questions) {
      expect(question.id.length).toBeGreaterThan(0);
      expect(question.source.paper.length).toBeGreaterThan(0);
      expect(question.content.text.length).toBeGreaterThan(0);
      expect(question.answer.correct).toMatch(/^[A-Z]$/);
      expect(question.meta.times_attempted).toBe(0);
      expect(question.meta.accuracy_rate).toBe(0);
    }
  });

  it("should handle malformed question records by skipping them", () => {
    const malformedPayload = {
      questions: [
        { id: "valid", text: "Some text" },
        { id: "invalid-no-text" },
        "not-an-object"
      ]
    };
    
    const { questions, skipped } = normalizePipelinePayload(malformedPayload);
    expect(questions).toHaveLength(1);
    expect(skipped).toBe(2);
    expect(questions[0].id).toBe("valid");
  });

  it("should handle empty or invalid payloads", () => {
    expect(normalizePipelinePayload(null).questions).toHaveLength(0);
    expect(normalizePipelinePayload({}).questions).toHaveLength(0);
    expect(normalizePipelinePayload([]).questions).toHaveLength(0);
  });

  it("should sanitize IDs and provide defaults for missing metadata", () => {
    const payload = {
      questions: [{
        id: "Question With Spaces!",
        text: "Content"
      }]
    };
    const { questions } = normalizePipelinePayload(payload);
    expect(questions[0].id).toBe("Question_With_Spaces");
    expect(questions[0].source.paper).toBe("Unknown Paper");
    expect(questions[0].taxonomy.primary_topic).toBe("Unclassified");
  });
});
