import { useEffect, useMemo, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import { buildSession } from "../../engine/sessionBuilder";
import { useExcludedQuestionStore } from "../../lib/excludedQuestionStore";
import { useQuestionStore } from "../../lib/questionStore";
import { useSettingsStore } from "../../lib/settingsStore";
import { useSessionStore } from "../../lib/sessionStore";
import type { Session } from "../../types/schema";
import type { SessionMode } from "../../types/engine";

function formatElapsed(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

type SetupState = {
  mode: SessionMode;
  selectedTopics: string[];
  selectedYears: number[];
  questionCount: number;
  flaggedOnly: boolean;
  setupError: string | null;
};

type SetupAction =
  | { type: "set_mode"; mode: SessionMode }
  | { type: "toggle_topic"; topic: string }
  | { type: "toggle_year"; year: number }
  | { type: "set_count"; count: number }
  | { type: "set_count_exact"; count: number }
  | { type: "set_flagged_only"; value: boolean }
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
      return { ...state, questionCount: magnetizeCount(action.count) };
    case "set_count_exact":
      return { ...state, questionCount: clampExactCount(action.count) };
    case "set_flagged_only":
      return { ...state, flaggedOnly: action.value };
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
const SLIDER_THUMB_PX = 22;
// Give the major marks (27/54/81) a light magnetic pull: a value dragged within
// this many steps of one snaps to it, while everything outside the band stays free.
const QUESTION_COUNT_MAGNET_RADIUS = 2;

// The text box accepts any exact whole number the user types, including values
// above the slider's 81 ceiling, but never below the 1-question floor.
function clampExactCount(count: number): number {
  if (!Number.isFinite(count)) {
    return QUESTION_COUNT_MIN;
  }
  return Math.max(QUESTION_COUNT_MIN, Math.floor(count));
}

function magnetizeCount(count: number): number {
  let nearest = count;
  let nearestDistance = QUESTION_COUNT_MAGNET_RADIUS + 1;
  for (const mark of QUESTION_COUNT_MAJOR_MARKS) {
    const distance = Math.abs(count - mark);
    if (distance <= QUESTION_COUNT_MAGNET_RADIUS && distance < nearestDistance) {
      nearest = mark;
      nearestDistance = distance;
    }
  }
  return nearest;
}

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
  const { createSession, getActiveSessions, abandonSession, getFlaggedQuestionIds } =
    useSessionStore();
  const { excludedQuestionIds } = useExcludedQuestionStore();
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void getActiveSessions().then((sessions) => {
      if (!cancelled) {
        setActiveSession(sessions[0] ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getActiveSessions]);

  useEffect(() => {
    let cancelled = false;
    void getFlaggedQuestionIds().then((ids) => {
      if (!cancelled) {
        setFlaggedIds(ids);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getFlaggedQuestionIds]);

  function handleResume() {
    if (activeSession) {
      navigate(`/session/${activeSession.id}`);
    }
  }

  async function handleDiscard() {
    if (!activeSession) return;
    await abandonSession(activeSession.id);
    setActiveSession(null);
  }

  const [state, dispatch] = useReducer(setupReducer, undefined, () => ({
    mode: settings.defaultMode,
    selectedTopics: [],
    selectedYears: [],
    questionCount: settings.defaultQuestionCount,
    flaggedOnly: false,
    setupError: null,
  }));

  const { mode, selectedTopics, selectedYears, questionCount, flaggedOnly, setupError } =
    state;
  // O(1) membership checks for the chip render loops below.
  const selectedTopicSet = useMemo(() => new Set(selectedTopics), [selectedTopics]);
  const selectedYearSet = useMemo(() => new Set(selectedYears), [selectedYears]);
  // While the count field is focused we track the raw text so the user can clear
  // it and type freely; null means "not editing", so show the committed count.
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const isQuestionBankReady = loaded && !isLoading && questions.length > 0;
  const isQuestionBankLoading = !loaded || isLoading;
  const availableQuestions = questions.filter((q) => !excludedQuestionIds.has(q.id));
  // How many of the still-available questions are flagged — drives the toggle's
  // count and lets us disable it when there's nothing to practise.
  const flaggedAvailableCount = availableQuestions.filter((q) =>
    flaggedIds.has(q.id),
  ).length;

  async function handleStart() {
    if (!isQuestionBankReady) {
      dispatch({ type: "set_error", error: "Question bank is still loading. Please wait a few seconds." });
      return;
    }
    if (activeSession) {
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

    const pool = flaggedOnly
      ? availableQuestions.filter((q) => flaggedIds.has(q.id))
      : availableQuestions;

    const questionIds = buildSession(pool, config);
    if (questionIds.length === 0) {
      dispatch({
        type: "set_error",
        error: flaggedOnly
          ? "No flagged questions match your filters. Flag questions during a session, or turn off “Flagged only”."
          : "No questions match your filters. Try broadening your selection.",
      });
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
    <div className="sk-practice">
      <div className="sk-frame">
        <span className="sk-screw sk-screw--tl" aria-hidden="true" />
        <span className="sk-screw sk-screw--tr" aria-hidden="true" />
        <span className="sk-screw sk-screw--bl" aria-hidden="true" />
        <span className="sk-screw sk-screw--br" aria-hidden="true" />

        <header className="sk-practice-head">
          <h1 className="sk-practice-title">New practice session</h1>
          <p className="sk-practice-sub">
            {isQuestionBankLoading
              ? "Preparing question bank…"
              : excludedQuestionIds.size > 0
                ? `${availableQuestions.length} of ${questions.length} questions available`
                : `${questions.length} questions loaded`}
          </p>
        </header>

        {activeSession && (
          <div className="sk-resume">
            <div>
              <p className="sk-resume-title">
                Unfinished session from {formatElapsed(Date.now() - activeSession.created_at)}
              </p>
              <p className="sk-resume-meta">
                {activeSession.attempt_ids.length} of{" "}
                {activeSession.config.question_count ?? activeSession.config.question_ids.length}{" "}
                answered
              </p>
            </div>
            <div className="sk-resume-actions">
              <button
                type="button"
                onClick={() => {
                  void handleDiscard();
                }}
                className="sk-resume-discard"
              >
                Discard
              </button>
              <button type="button" onClick={handleResume} className="sk-resume-resume">
                Resume
              </button>
            </div>
          </div>
        )}

        <div className="sk-divider" aria-hidden="true" />

        <section className="sk-well">
          <h2 className="sk-well-title">Mode</h2>
          <div className="sk-mode-grid">
            {MODES.map((item) => (
              <button
                type="button"
                key={item.value}
                onClick={() => dispatch({ type: "set_mode", mode: item.value })}
                aria-pressed={mode === item.value}
                className={`sk-mode ${mode === item.value ? "sk-mode--active" : ""}`}
              >
                <div className="sk-mode-name">{item.label}</div>
                <div className="sk-mode-desc">{item.description}</div>
              </button>
            ))}
          </div>
        </section>

        <button
          type="button"
          role="switch"
          aria-checked={flaggedOnly}
          aria-label="Practise flagged questions only"
          disabled={flaggedAvailableCount === 0}
          onClick={() =>
            dispatch({ type: "set_flagged_only", value: !flaggedOnly })
          }
          className={`sk-flag-row ${flaggedOnly ? "sk-flag-row--on" : ""}`}
        >
          <span className="sk-flag-row-text">
            <span className="sk-flag-row-label">Flagged only</span>
            <span className="sk-flag-row-count">
              {flaggedAvailableCount === 0
                ? "none flagged yet"
                : `${flaggedAvailableCount} question${
                    flaggedAvailableCount === 1 ? "" : "s"
                  }`}
            </span>
          </span>
          <span
            className={`settings-toggle ${
              flaggedOnly ? "settings-toggle--on" : ""
            }`}
            aria-hidden="true"
          >
            <span className="settings-toggle__knob" />
          </span>
        </button>

        <button
          type="button"
          onClick={handleStart}
          disabled={!isQuestionBankReady || Boolean(activeSession)}
          className="sk-cta"
        >
          <span>
            {isQuestionBankLoading
              ? "Loading question bank…"
              : activeSession
                ? "Resume or discard your unfinished session first"
                : "Start session"}
          </span>
        </button>
        {setupError && (
          <p className="sk-error" role="alert">
            {setupError}
          </p>
        )}

        <section className="sk-well">
          <p className="sk-q-label">
            <label htmlFor="question-count-input">Questions · </label>
            <input
              id="question-count-input"
              type="number"
              inputMode="numeric"
              min={QUESTION_COUNT_MIN}
              step={1}
              className="sk-q-count-input"
              value={countDraft ?? String(questionCount)}
              onChange={(event) => {
                const raw = event.target.value;
                setCountDraft(raw);
                if (raw.trim() !== "") {
                  dispatch({ type: "set_count_exact", count: Number(raw) });
                }
              }}
              onFocus={(event) => event.currentTarget.select()}
              onBlur={() => setCountDraft(null)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
            />
          </p>
          <div className="sk-slider">
            <input
              type="range"
              aria-label="Number of questions"
              min={QUESTION_COUNT_MIN}
              max={QUESTION_COUNT_MAX}
              step={1}
              value={Math.min(questionCount, QUESTION_COUNT_MAX)}
              onChange={(event) => dispatch({ type: "set_count", count: Number(event.target.value) })}
              className="range-slider-native"
            />
            <div className="sk-slider-track">
              <div
                className="sk-slider-fill"
                style={{ width: markPosition(Math.min(questionCount, QUESTION_COUNT_MAX)) }}
              />
            </div>
            <div
              className="sk-slider-knob"
              style={{ left: markPosition(Math.min(questionCount, QUESTION_COUNT_MAX)) }}
            />
          </div>
          <div className="sk-slider-ticks">
            {QUESTION_COUNT_MINOR_MARKS.map((mark) => (
              <span
                key={mark}
                className="sk-slider-tick"
                style={{ left: markPosition(mark) }}
              />
            ))}
            {QUESTION_COUNT_MAJOR_MARKS.map((mark) => (
              <span
                key={mark}
                className="sk-slider-tick sk-slider-tick--major"
                style={{ left: markPosition(mark) }}
              />
            ))}
          </div>
          <div className="sk-slider-labels">
            <span style={{ left: markPosition(QUESTION_COUNT_MIN) }}>{QUESTION_COUNT_MIN}</span>
            {QUESTION_COUNT_MAJOR_MARKS.map((mark) => (
              <span key={mark} style={{ left: markPosition(mark) }}>
                {mark}
              </span>
            ))}
          </div>
        </section>

        <section className="sk-well">
          <h2 className="sk-well-title">Topics</h2>
          <p className="sk-hint">leave empty for all</p>
          <div className="sk-chips">
            {availableTopics.map((topic) => (
              <button
                type="button"
                key={topic}
                onClick={() => dispatch({ type: "toggle_topic", topic })}
                aria-pressed={selectedTopicSet.has(topic)}
                className={`sk-chip ${selectedTopicSet.has(topic) ? "sk-chip--active" : ""}`}
              >
                {topic}
              </button>
            ))}
          </div>
        </section>

        <section className="sk-well">
          <h2 className="sk-well-title">Papers</h2>
          <p className="sk-hint">leave empty for all</p>
          <div className="sk-chips">
            {availableYears.map((year) => (
              <button
                type="button"
                key={year}
                onClick={() => dispatch({ type: "toggle_year", year })}
                aria-pressed={selectedYearSet.has(year)}
                className={`sk-chip ${selectedYearSet.has(year) ? "sk-chip--active" : ""}`}
              >
                {year}
              </button>
            ))}
          </div>
        </section>

        <span className="sk-dial" aria-hidden="true" />
      </div>
    </div>
  );
}
