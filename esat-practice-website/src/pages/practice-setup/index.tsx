import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildSession } from "../../engine/sessionBuilder";
import { useQuestionStore } from "../../lib/questionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { useSessionStore } from "../../lib/sessionStore";
import type { SessionMode } from "../../types/engine";

const MODES: { value: SessionMode; label: string; description: string }[] = [
  {
    value: "timed",
    label: "Timed",
    description: "Full exam conditions with countdown",
  },
  {
    value: "untimed",
    label: "Untimed",
    description: "No time pressure, focus on accuracy",
  },
  {
    value: "topic",
    label: "Topic focus",
    description: "Drill a specific subject area",
  },
  {
    value: "mixed",
    label: "Mixed",
    description: "Random selection across all topics",
  },
];

export default function PracticeSetup() {
  const navigate = useNavigate();
  const { questions, availableTopics, availableYears, isLoading, loaded } =
    useQuestionStore();
  const settings = useSettingsStore((state) => state.settings);
  const { createSession } = useSessionStore();

  const [mode, setMode] = useState<SessionMode>(settings.defaultMode);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState(settings.defaultQuestionCount);
  const isQuestionBankReady = loaded && !isLoading && questions.length > 0;
  const isQuestionBankLoading = !loaded || isLoading;

  function toggleTopic(topic: string) {
    setSelectedTopics((previous) =>
      previous.includes(topic)
        ? previous.filter((value) => value !== topic)
        : [...previous, topic],
    );
  }

  function toggleYear(year: number) {
    setSelectedYears((previous) =>
      previous.includes(year)
        ? previous.filter((value) => value !== year)
        : [...previous, year],
    );
  }

  async function handleStart() {
    if (!isQuestionBankReady) {
      window.alert("Question bank is still loading. Please wait a few seconds.");
      return;
    }

    const config = {
      mode,
      topic_filter: selectedTopics.length > 0 ? selectedTopics : undefined,
      year_filter: selectedYears.length > 0 ? selectedYears : undefined,
      question_count: questionCount,
      time_limit_ms:
        mode === "timed"
          ? questionCount * settings.timedSecondsPerQ * 1000
          : undefined,
    };

    const questionIds = buildSession(questions, config);
    if (questionIds.length === 0) {
      window.alert("No questions match your filters. Try broadening your selection.");
      return;
    }

    const session = await createSession({
      ...config,
      question_ids: questionIds,
    });
    navigate(`/session/${session.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-medium mb-1">New practice session</h1>
      <p className="text-sm text-gray-500 mb-8">
        {isQuestionBankLoading
          ? "Preparing question bank..."
          : `${questions.length} questions loaded`}
      </p>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Mode
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {MODES.map((item) => (
            <button
              type="button"
              key={item.value}
              onClick={() => setMode(item.value)}
              className={`text-left p-4 rounded-lg border transition-colors ${
                mode === item.value
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="font-medium text-sm">{item.label}</div>
              <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Topics <span className="normal-case font-normal">(leave empty for all)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {availableTopics.map((topic) => (
            <button
              type="button"
              key={topic}
              onClick={() => toggleTopic(topic)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selectedTopics.includes(topic)
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Papers <span className="normal-case font-normal">(leave empty for all)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {availableYears.map((year) => (
            <button
              type="button"
              key={year}
              onClick={() => toggleYear(year)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selectedYears.includes(year)
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-10">
        <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-3">
          Questions - <span className="text-gray-900 font-medium">{questionCount}</span>
        </h2>
        <input
          type="range"
          min={5}
          max={60}
          step={5}
          value={questionCount}
          onChange={(event) => setQuestionCount(Number(event.target.value))}
          className="w-full accent-indigo-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>5</span>
          <span>60</span>
        </div>
      </section>

      <button
        type="button"
        onClick={handleStart}
        disabled={!isQuestionBankReady}
        className="w-full py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:bg-indigo-300 disabled:cursor-not-allowed shadow"
      >
        {isQuestionBankLoading ? "Loading question bank..." : "Start session"}
      </button>
    </div>
  );
}
