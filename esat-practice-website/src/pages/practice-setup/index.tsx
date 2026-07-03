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
];

const QUESTION_COUNT_MIN = 1;
const QUESTION_COUNT_MAX = 81;
const QUESTION_COUNT_MAJOR_MARKS = [27, 54, 81];
const QUESTION_COUNT_MINOR_STEP = 3;
const QUESTION_COUNT_MINOR_MARKS = Array.from(
  { length: Math.floor(QUESTION_COUNT_MAX / QUESTION_COUNT_MINOR_STEP) + 1 },
  (_, i) => i * QUESTION_COUNT_MINOR_STEP,
).filter((mark) => mark > 0 && !QUESTION_COUNT_MAJOR_MARKS.includes(mark));
const SLIDER_THUMB_PX = 18;

// Position as calc(radius + fraction * (100% - diameter)) so the visual thumb, fill,
// and tick marks all share one formula instead of trying to match the browser's
// native (and inconsistent, cross-browser) inset of the real range-input thumb.
function markPosition(mark: number): string {
  const fraction = (mark - QUESTION_COUNT_MIN) / (QUESTION_COUNT_MAX - QUESTION_COUNT_MIN);
  return `calc(${SLIDER_THUMB_PX / 2}px + ${fraction} * (100% - ${SLIDER_THUMB_PX}px))`;
}

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
      <p className="page-subtitle">
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

      <button
        type="button"
        onClick={handleStart}
        disabled={!isQuestionBankReady}
        className="w-full mb-8 py-3 bg-accent text-white rounded-lg font-medium hover:bg-accent-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow"
      >
        {isQuestionBankLoading ? "Loading question bank..." : "Start session"}
      </button>
      {setupError && (
        <p className="mb-8 text-sm text-danger-text border border-danger bg-danger-soft rounded-lg px-3 py-2">
          {setupError}
        </p>
      )}

      <section className="mb-10 card p-4">
        <h2 className="text-sm font-medium text-muted mb-3">
          Questions - <span className="text-primary font-medium">{questionCount}</span>
        </h2>
        <div className="relative h-[18px] flex items-center">
          <input
            type="range"
            min={QUESTION_COUNT_MIN}
            max={QUESTION_COUNT_MAX}
            step={1}
            value={questionCount}
            onChange={(event) => dispatch({ type: "set_count", count: Number(event.target.value) })}
            className="range-slider-native"
          />
          <div className="w-full h-1.5 rounded-full bg-subtle overflow-hidden">
            <div
              className="h-full bg-accent"
              style={{ width: markPosition(questionCount) }}
            />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[18px] h-[18px] rounded-full bg-accent border-[3px] border-solid pointer-events-none"
            style={{ left: markPosition(questionCount), borderColor: "var(--surface-1)", boxShadow: "0 1px 4px rgb(0 0 0 / 0.35)" }}
          />
        </div>
        <div className="relative h-2.5 mt-1">
          {QUESTION_COUNT_MINOR_MARKS.map((mark) => (
            <span
              key={mark}
              className="absolute top-0.5 -translate-x-1/2 w-px h-1.5 bg-subtle opacity-60"
              style={{ left: markPosition(mark) }}
            />
          ))}
          {QUESTION_COUNT_MAJOR_MARKS.map((mark) => (
            <span
              key={mark}
              className="absolute top-0 -translate-x-1/2 w-px h-2.5 bg-strong"
              style={{ left: markPosition(mark) }}
            />
          ))}
        </div>
        <div className="relative h-4 mt-0.5 text-xs text-muted opacity-60">
          <span className="absolute -translate-x-1/2" style={{ left: markPosition(QUESTION_COUNT_MIN) }}>
            {QUESTION_COUNT_MIN}
          </span>
          {QUESTION_COUNT_MAJOR_MARKS.map((mark) => (
            <span
              key={mark}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: markPosition(mark) }}
            >
              {mark}
            </span>
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
    </div>
  );
}
