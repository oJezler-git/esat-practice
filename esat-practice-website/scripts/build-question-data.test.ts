import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildQuestionImageProjection,
  buildQuestionPackManifest,
  projectQuestion,
  resolveDatasetVersion,
  shouldIgnoreQuestionDataFile,
  sortPackManifestEntries,
} from "./build-question-data-helpers";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("build-question-data helpers", () => {
  it("ignores only the root pipeline sample input", () => {
    expect(shouldIgnoreQuestionDataFile("pipeline-sample.json")).toBe(true);
    expect(shouldIgnoreQuestionDataFile("papers/pipeline-sample.json")).toBe(false);
    expect(shouldIgnoreQuestionDataFile("paper.json")).toBe(false);
  });

  it("extracts an image into its sanitized generated URL and projects the question", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    const question = {
      id: "Paper 1/Q#2",
      text: "Question text",
      image: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      classification: {
        primary_topic: "Algebra",
        question_text: "Question text",
        question_id: "Paper 1/Q#2",
      },
    };

    const image = buildQuestionImageProjection(question);
    expect(image).toMatchObject({
      filename: "Paper_1Q2.jpg",
      url: "/data/images/Paper_1Q2.jpg",
    });
    expect(image?.buffer).toEqual(bytes);
    expect(projectQuestion(question, image?.url ?? null)).toEqual({
      id: "Paper 1/Q#2",
      text: "Question text",
      image_url: "/data/images/Paper_1Q2.jpg",
      classification: { primary_topic: "Algebra" },
    });
  });

  it("builds sorted manifest metadata and sorts entries by pack id", () => {
    const questions = [
      { id: "q2", source: { paper: "Zeta 2024", year: 2024 }, classification: { primary_topic: "Vectors" } },
      { id: "q1-2022", paper: "Alpha", classification: { primaryTopic: "Algebra" } },
      { id: "q3", source: { paper: "Alpha", year: "2022" }, taxonomy: { primary_topic: "Algebra" } },
    ];
    const zeta = buildQuestionPackManifest("nested/zeta.json", questions, 321);
    const alpha = buildQuestionPackManifest("alpha.json", [questions[0]], 123);

    expect(zeta).toEqual({
      id: "nested/zeta",
      path: "data/packs/nested/zeta.json",
      question_count: 3,
      years: [2022, 2024],
      topics: ["Algebra", "Vectors"],
      papers: ["Alpha", "Zeta 2024"],
      bytes: 321,
    });
    const sorted = sortPackManifestEntries([
      { manifest: zeta, contentHash: "z" },
      { manifest: alpha, contentHash: "a" },
    ]);
    expect(sorted.map((entry) => entry.manifest.id)).toEqual(["alpha", "nested/zeta"]);
  });

  it("derives a deterministic content-hash version that changes with pack content", () => {
    const expected = createHash("sha256").update("hash-a\nhash-b").digest("hex").slice(0, 16);
    expect(resolveDatasetVersion(["hash-a", "hash-b"], undefined)).toBe(expected);
    expect(resolveDatasetVersion(["hash-a", "hash-c"], undefined)).not.toBe(expected);
  });

  it("uses a trimmed environment version override", () => {
    vi.stubEnv("QUESTION_DATASET_VERSION", "  release-2026-07  ");
    expect(resolveDatasetVersion(["ignored"])).toBe("release-2026-07");
  });
});
