import { useReducer } from "react";
import { useNavigate } from "react-router-dom";
import { buildSession } from "../../engine/sessionBuilder";
import { useExcludedQuestionStore } from "../../lib/excludedQuestionStore";
import { useQuestionStore } from "../../lib/questionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { useSessionStore } from "../../lib/sessionStore";
import type { SessionMode } from "../../types/engine";

type SetupState = {
  mode: SessionMode;
  selectedTopics: string[];
  selectedYears: number[];
  questionCount: number;
  setupError: string | null;
};

type SetupAction =
  | { type: "set_mode"; mode: SessionMode }
  | { type: "toggle_topic"; topic: string }
  | { type: "toggle_year"; year: number }
  | { type: "set_count"; count: number }
  | { type: "set_error"; error: string | null };

function setupReducer(state: SetupState, action: SetupAction): SetupState {
  switch (action.type) {
    case "set_mode":
      return { ...state, mode: action.mode };
    case "toggle_topic": {
      const topics = state.selectedTopics.includes(action.topic)
        ? state.selectedTopics.filter((t) => t !== action.topic)
        : [...state.selectedTopics, action.topic];
      return { ...state, selectedTopics: topics };
    }
    case "toggle_year": {
      const years = state.selectedYears.includes(action.year)
        ? state.selectedYears.filter((y) => y !== action.year)
        : [...state.selectedYears, action.year];
      return { ...state, selectedYears: years };
    }
    case "set_count":
      return { ...state, questionCount: action.count };
    case "set_error":
      return { ...state, setupError: action.error };
    default:
      return state;
  }
}

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
  const { excludedQuestionIds } = useExcludedQuestionStore();

  const [state, dispatch] = useReducer(setupReducer, undefined, () => ({
    mode: settings.defaultMode,
    selectedTopics: [],
    selectedYears: [],
    questionCount: settings.defaultQuestionCount,
    setupError: null,
  }));

  const { mode, selectedTopics, selectedYears, questionCount, setupError } = state;
  const isQuestionBankReady = loaded && !isLoading && questions.length > 0;
  const isQuestionBankLoading = !loaded || isLoading;
  const availableQuestions = questions.filter((q) => !excludedQuestionIds.has(q.id));

  async function handleStart() {
    if (!isQuestionBankReady) {
      dispatch({ type: "set_error", error: "Question bank is still loading. Please wait a few seconds." });
      return;
    }
    dispatch({ type: "set_error", error: null });

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

    const questionIds = buildSession(availableQuestions, config);
    if (questionIds.length === 0) {
      dispatch({ type: "set_error", error: "No questions match your filters. Try broadening your selection." });
      return;
    }

    const session = await createSession({
      ...config,
      question_ids: questionIds,
    });

    if (settings.fullscreenOnStart && document.documentElement.requestFullscreen) {
      try {
        await document.documentElement.requestFullscreen();
      } catch (err) {
        console.error("Error attempting to enable full-screen mode:", err);
      }
    }

    navigate(`/session/${session.id}`);
  }

  return (
    <div className="page-shell max-w-3xl">
      <h1 className="page-title">New practice session</h1>
      <p className="page-subtitle mb-8">
        {isQuestionBankLoading
          ? "Preparing question bank..."
          : excludedQuestionIds.size > 0
            ? `${availableQuestions.length} of ${questions.length} questions available`
            : `${questions.length} questions loaded`}
      </p>

      <section className="mb-8 card p-4">
        <h2 className="text-sm font-medium text-muted mb-3">
          Mode
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {MODES.map((item) => (
            <button
              type="button"
              key={item.value}
              onClick={() => dispatch({ type: "set_mode", mode: item.value })}
              className={`text-left p-4 rounded-lg border transition-colors ${
                mode === item.value
                  ? "border-accent bg-accent-soft"
                  : "border-subtle hover:border-strong"
              }`}
            >
              <div className="font-medium text-sm">{item.label}</div>
              <div className="text-xs text-muted mt-0.5">{item.description}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8 card p-4">
        <h2 className="text-sm font-medium text-muted mb-3">
          Topics <span className="normal-case font-normal">(leave empty for all)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {availableTopics.map((topic) => (
            <button
              type="button"
              key={topic}
              onClick={() => dispatch({ type: "toggle_topic", topic })}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selectedTopics.includes(topic)
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-subtle text-secondary hover:border-strong"
              }`}
            >
              {topic}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-8 card p-4">
        <h2 className="text-sm font-medium text-muted mb-3">
          Papers <span className="normal-case font-normal">(leave empty for all)</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          {availableYears.map((year) => (
            <button
              type="button"
              key={year}
              onClick={() => dispatch({ type: "toggle_year", year })}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                selectedYears.includes(year)
                  ? "border-accent bg-accent-soft text-accent-strong"
                  : "border-subtle text-secondary hover:border-strong"
              }`}
            >
              {year}
            </button>
          ))}
        </div>
      </section>

      <section className="mb-10 card p-4">
        <h2 className="text-sm font-medium text-muted mb-3">
          Questions - <span className="text-primary font-medium">{questionCount}</span>
        </h2>
        <input
          type="range"
          min={5}
          max={60}
          step={5}
          value={questionCount}
          onChange={(event) => dispatch({ type: "set_count", count: Number(event.target.value) })}
          className="w-full accent-accent"
        />
        <div className="flex justify-between text-xs text-muted mt-1">
          <span>5</span>
          <span>60</span>
        </div>
      </section>

      <button
        type="button"
        onClick={handleStart}
        disabled={!isQuestionBankReady}
        className="w-full py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow"
      >
        {isQuestionBankLoading ? "Loading question bank..." : "Start session"}
      </button>
      {setupError && (
        <p className="mt-3 text-sm text-danger-text border border-danger bg-danger-soft rounded-lg px-3 py-2">
          {setupError}
        </p>
      )}
    </div>
  );
}
