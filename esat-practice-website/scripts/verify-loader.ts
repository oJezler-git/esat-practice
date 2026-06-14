import assert from "node:assert/strict";
import pipelineSample from "../src/data/pipeline-sample.json";
import { normalizePipelinePayload } from "../src/lib/loader";

const { questions, skipped } = normalizePipelinePayload(pipelineSample);

assert.equal(skipped, 0, "Expected no skipped records in sample pipeline JSON.");
assert.equal(questions.length, 2, "Expected two normalized questions.");

for (const question of questions) {
  assert.ok(question.id.length > 0, "Question ID is required.");
  assert.ok(question.source.paper.length > 0, "Question source.paper is required.");
  assert.ok(question.content.text.length > 0, "Question content.text is required.");
  assert.ok(
    /^[A-Z]$/.test(question.answer.correct),
    "Question answer.correct must be a single uppercase letter.",
  );
  assert.equal(
    question.meta.times_attempted,
    0,
    "Question meta.times_attempted should default to 0.",
  );
  assert.equal(
    question.meta.accuracy_rate,
    0,
    "Question meta.accuracy_rate should default to 0.",
  );
}

console.log(`Loader mapping verified for ${questions.length} questions.`);
