import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QuestionCard } from "./QuestionCard";
import type { Question } from "../../types/schema";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q-1",
    source: { paper: "ENGAA", year: 2020, part: "1A", subject: "Math", page: 5 },
    content: { text: "Solve for x." },
    answer: { correct: "A", verified: true },
    taxonomy: {
      primary_topic: "Algebra",
      secondary_topics: [],
      confidence: 0.9,
      model_used: "gpt-4",
    },
    meta: { times_attempted: 0, accuracy_rate: 0 },
    ...overrides,
  };
}

describe("QuestionCard — image source derivation", () => {
  it("uses image_url as the img src when provided", () => {
    const q = makeQuestion({
      content: { text: "Q", image_url: "https://cdn.example.com/q1.png" },
    });
    render(<QuestionCard question={q} />);
    expect(screen.getByAltText("Question diagram")).toHaveAttribute(
      "src",
      "https://cdn.example.com/q1.png",
    );
  });

  it("uses image_b64 as-is when it already starts with 'data:'", () => {
    const dataUrl = "data:image/png;base64,abc123";
    const q = makeQuestion({ content: { text: "Q", image_b64: dataUrl } });
    render(<QuestionCard question={q} />);
    expect(screen.getByAltText("Question diagram")).toHaveAttribute("src", dataUrl);
  });

  it("prepends 'data:image/png;base64,' when image_b64 lacks the prefix", () => {
    const raw = "abc123base64data";
    const q = makeQuestion({ content: { text: "Q", image_b64: raw } });
    render(<QuestionCard question={q} />);
    expect(screen.getByAltText("Question diagram")).toHaveAttribute(
      "src",
      `data:image/png;base64,${raw}`,
    );
  });

  it("renders no img element when neither image_url nor image_b64 is set", () => {
    const q = makeQuestion({ content: { text: "Q" } });
    render(<QuestionCard question={q} />);
    expect(screen.queryByAltText("Question diagram")).toBeNull();
  });

  it("prefers image_url over image_b64 when both are present", () => {
    const q = makeQuestion({
      content: {
        text: "Q",
        image_url: "https://cdn.example.com/preferred.png",
        image_b64: "abc123",
      },
    });
    render(<QuestionCard question={q} />);
    expect(screen.getByAltText("Question diagram")).toHaveAttribute(
      "src",
      "https://cdn.example.com/preferred.png",
    );
  });
});

describe("QuestionCard — metadata chips", () => {
  it("renders topic, paper/year, and confidence chips by default", () => {
    const q = makeQuestion();
    render(<QuestionCard question={q} />);
    expect(screen.getByText("Algebra")).toBeInTheDocument();
    expect(screen.getByText("ENGAA 2020")).toBeInTheDocument();
    expect(screen.getByText("Confidence 90%")).toBeInTheDocument();
  });

  it("hides all metadata chips when showMetadata is false", () => {
    const q = makeQuestion();
    render(<QuestionCard question={q} showMetadata={false} />);
    expect(screen.queryByText("Algebra")).toBeNull();
    expect(screen.queryByText("ENGAA 2020")).toBeNull();
    expect(screen.queryByText("Confidence 90%")).toBeNull();
  });

  it("still renders the question text when showMetadata is false", () => {
    const q = makeQuestion({ content: { text: "Solve for x." } });
    render(<QuestionCard question={q} showMetadata={false} />);
    expect(screen.getByText("Solve for x.")).toBeInTheDocument();
  });
});
