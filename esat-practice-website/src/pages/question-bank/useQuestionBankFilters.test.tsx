import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { NsaaDuplicateAnalysis } from "../../lib/questionDedup";
import type { Question } from "../../types/schema";
import {
  type SortKey,
  type QuestionScope,
  useQuestionBankFilters,
} from "./useQuestionBankFilters";

function makeQuestion(
  id: string,
  {
    text,
    topic,
    year,
    paper = "ENGAA 2021",
    verified = true,
    accuracy = 0.5,
    imageUrl,
    secondaryTopics = [],
    subject = "Math",
    part = "1A",
    answer = "A",
    model = "primary",
  }: {
    text: string;
    topic: string;
    year: number;
    paper?: string;
    verified?: boolean;
    accuracy?: number;
    imageUrl?: string;
    secondaryTopics?: string[];
    subject?: string;
    part?: string;
    answer?: string;
    model?: string;
  },
): Question {
  return {
    id,
    source: { paper, year, part, subject, page: 1 },
    content: { text, image_url: imageUrl },
    answer: { correct: answer, verified },
    taxonomy: {
      primary_topic: topic,
      secondary_topics: secondaryTopics,
      confidence: 0.9,
      model_used: model,
    },
    meta: { times_attempted: 2, accuracy_rate: accuracy },
  };
}

const practiceQuestions = [
  makeQuestion("q1", {
    text: "Algebra expansion question",
    topic: "Algebra",
    year: 2020,
    verified: true,
    accuracy: 0.8,
    imageUrl: "/q1.png",
    secondaryTopics: ["Graphs"],
    answer: "B",
  }),
  makeQuestion("q2", {
    text: "Mechanics force question",
    topic: "Mechanics",
    year: 2022,
    verified: false,
    accuracy: 0.2,
    paper: "NSAA 2022",
    model: "escalated",
  }),
  makeQuestion("q3", {
    text: "Calculus rate question",
    topic: "Calculus",
    year: 2021,
    verified: true,
    accuracy: 0.5,
  }),
];

const excludedQuestions = [
  makeQuestion("ex1", {
    text: "Excluded algebra question",
    topic: "Algebra",
    year: 2019,
    verified: false,
    accuracy: 0.1,
  }),
];

const duplicateAnalysis: NsaaDuplicateAnalysis = {
  hiddenNsaaIds: new Set(["q2"]),
  excludedPairs: [],
  nearMissPairs: [],
};

let latest:
  | ReturnType<typeof useQuestionBankFilters>
  | undefined;

function FiltersHarness({
  initialTopicFilter = [],
}: {
  initialTopicFilter?: string[];
}) {
  latest = useQuestionBankFilters({
    fullPracticeBank: practiceQuestions,
    excludedQuestions,
    nsaaDuplicateAnalysis: duplicateAnalysis,
    initialTopicFilter,
  });

  return (
    <output data-testid="ids">
      {latest.filtered.map((question) => question.id).join(",")}
    </output>
  );
}

function current() {
  if (!latest) {
    throw new Error("Harness has not rendered");
  }
  return latest;
}

describe("useQuestionBankFilters", () => {
  beforeEach(() => {
    latest = undefined;
  });

  it("filters by search text, topic, year, and verified state", () => {
    render(<FiltersHarness />);

    expect(screen.getByTestId("ids")).toHaveTextContent("q1,q3");

    act(() => current().setSearch("rate"));
    expect(screen.getByTestId("ids")).toHaveTextContent("q3");

    act(() => current().setSearch(""));
    act(() => current().toggleTopic("Algebra"));
    expect(screen.getByTestId("ids")).toHaveTextContent("q1");

    act(() => current().toggleYear(2021));
    expect(screen.getByTestId("ids")).toHaveTextContent("");

    act(() => current().toggleTopic("Algebra"));
    expect(screen.getByTestId("ids")).toHaveTextContent("q3");

    act(() => current().setHideDupes(false));
    act(() => current().setVerifiedOnly(true));
    expect(current().filtered.map((question) => question.id)).toEqual(["q3"]);

    act(() => current().setVerifiedOnly(false));
    expect(current().filtered.map((question) => question.id)).toEqual(["q3"]);
  });

  it("hides NSAA duplicates by default and can include them", () => {
    render(<FiltersHarness />);

    expect(current().hiddenNsaaDuplicateCount).toBe(1);
    expect(current().visibleQuestions.map((question) => question.id)).toEqual([
      "q1",
      "q3",
    ]);

    act(() => current().setHideDupes(false));

    expect(current().visibleQuestions.map((question) => question.id)).toEqual([
      "q1",
      "q2",
      "q3",
    ]);
  });

  it("switches between practice and excluded scopes", () => {
    render(<FiltersHarness />);

    expect(current().scope).toBe<QuestionScope>("practice");
    expect(current().sourceQuestions.map((question) => question.id)).toEqual([
      "q1",
      "q2",
      "q3",
    ]);

    act(() => current().setScope("excluded"));

    expect(current().sourceQuestions.map((question) => question.id)).toEqual([
      "ex1",
    ]);
    expect(current().filtered.map((question) => question.id)).toEqual(["ex1"]);
  });

  it("supports topic, year, and accuracy sort orders", () => {
    render(<FiltersHarness />);

    act(() => current().setHideDupes(false));
    act(() => current().setSort("topic"));
    expect(current().sortKey).toBe<SortKey>("topic");
    expect(current().filtered.map((question) => question.id)).toEqual([
      "q1",
      "q3",
      "q2",
    ]);

    act(() => current().setSort("year"));
    expect(current().filtered.map((question) => question.id)).toEqual([
      "q2",
      "q3",
      "q1",
    ]);

    act(() => current().setSort("accuracy"));
    expect(current().filtered.map((question) => question.id)).toEqual([
      "q1",
      "q3",
      "q2",
    ]);
  });

  it("honours the initial topic filter passed from the URL", () => {
    render(<FiltersHarness initialTopicFilter={["Calculus"]} />);

    expect(current().topicFilter).toEqual(["Calculus"]);
    expect(current().filtered.map((question) => question.id)).toEqual(["q3"]);
  });

  it("builds data dump counts only when details are open", () => {
    render(<FiltersHarness />);

    expect(current().dataDump).toBeNull();

    act(() => current().setDetailsOpen(true));

    expect(current().dataDump).toMatchObject({
      totalQuestions: 3,
      verifiedQuestions: 2,
      unverifiedQuestions: 1,
      questionsWithImage: 1,
      questionsWithoutImage: 2,
    });
    expect(current().dataDump?.byPrimaryTopic).toEqual([
      { label: "Algebra", count: 1 },
      { label: "Calculus", count: 1 },
      { label: "Mechanics", count: 1 },
    ]);
    expect(current().dataDump?.byYear).toEqual([
      { label: "2020", count: 1 },
      { label: "2021", count: 1 },
      { label: "2022", count: 1 },
    ]);
  });
});
