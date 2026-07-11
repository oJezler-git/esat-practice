import { useState } from "react";
import type { ExcludedQuestion } from "../../types/schema";
import {
  DEFAULT_SHORTCUTS,
  type AutoExcludeOn,
  type ClaudeMode,
  type ShortcutAction,
  type UserSettings,
} from "../../types/settings";
import { DEFAULT_PROMPT_TEMPLATE } from "../../lib/askClaude";
import { AskClaudeInfoModal } from "../../components/AskClaudeInfoModal";
import { ALL_SUBJECTS, SUBJECT_LABELS } from "../../lib/subjects";
import { Field, Section, Select, ShortcutInput, Toggle } from "./controls";

const SHORTCUT_FIELDS: Array<{
  action: ShortcutAction;
  label: string;
  description: string;
}> = [
  {
    action: "revealCorrect",
    label: "Reveal / mark correct",
    description: "Reveals the answer first, then marks the question correct.",
  },
  {
    action: "incorrect",
    label: "Mark incorrect",
    description: "Marks the revealed question as incorrect.",
  },
  {
    action: "prev",
    label: "Previous question",
    description: "Moves to the previous question in the session.",
  },
  {
    action: "next",
    label: "Next question",
    description: "Moves to the next question.",
  },
  {
    action: "flag",
    label: "Flag question",
    description: "Toggles the flagged state for the current question.",
  },
  {
    action: "skip",
    label: "Skip question",
    description: "Skips the current question.",
  },
];

interface SettingsSectionProps {
  settings: UserSettings;
  update: (partial: Partial<UserSettings>) => void;
}

const COLOUR_THEMES: Array<{
  value: UserSettings["colorTheme"];
  label: string;
  swatch: string;
}> = [
  { value: "amber", label: "Amber", swatch: "linear-gradient(145deg, #f5c46c, #a9781f)" },
  { value: "rose", label: "Rose", swatch: "linear-gradient(145deg, #f2a6a6, #a85252)" },
  { value: "emerald", label: "Emerald", swatch: "linear-gradient(145deg, #8fe0aa, #2e7c47)" },
  { value: "teal", label: "Teal", swatch: "linear-gradient(145deg, #8fdedf, #1e7c82)" },
  { value: "azure", label: "Azure", swatch: "linear-gradient(145deg, #94c6f2, #2e6ba8)" },
  { value: "indigo", label: "Indigo", swatch: "linear-gradient(145deg, #b0a6f2, #4f3fa8)" },
];

function ColourThemePicker({ settings, update }: SettingsSectionProps) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-sm text-secondary">Colour theme</div>
      <div className="text-xs text-muted mt-0.5 mb-3">
        Sets the accent hue. Works in both light and dark.
      </div>
      <div className="theme-swatch-row" role="radiogroup" aria-label="Colour theme">
        {COLOUR_THEMES.map(({ value, label, swatch }) => {
          const active = settings.colorTheme === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={label}
              title={label}
              onClick={() => update({ colorTheme: value })}
              className={`theme-swatch${active ? " theme-swatch--active" : ""}`}
              style={{ background: swatch }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function SessionDefaultsSection({ settings, update }: SettingsSectionProps) {
  return (
    <Section
      title="Session defaults"
      description="Choose how new practice sessions should start."
    >
      <Field label="Default mode">
        <Select
          value={settings.defaultMode}
          ariaLabel="Default mode"
          onChange={(value) =>
            update({ defaultMode: value as UserSettings["defaultMode"] })
          }
          options={[
            { value: "untimed", label: "Untimed" },
            { value: "timed", label: "Timed" },
          ]}
        />
      </Field>

      <Field label="Default question count">
        <div className="flex items-center gap-3">
          <input
            type="range"
            aria-label="Default question count"
            min={1}
            max={81}
            step={1}
            value={settings.defaultQuestionCount}
            onChange={(event) =>
              update({ defaultQuestionCount: Number(event.target.value) })
            }
            className="w-40 accent-accent"
          />
          <input
            type="number"
            aria-label="Default question count"
            min={1}
            max={81}
            value={settings.defaultQuestionCount}
            onChange={(event) => {
              const value = Math.max(1, Math.min(81, Number(event.target.value)));
              if (!Number.isNaN(value)) update({ defaultQuestionCount: value });
            }}
            style={{ width: "4.5rem", textAlign: "right" }}
            className="text-sm"
          />
        </div>
      </Field>

      <Field label="Seconds per question (timed mode)">
        <div className="flex items-center gap-3">
          <input
            type="range"
            aria-label="Seconds per question"
            min={10}
            max={600}
            step={5}
            value={settings.timedSecondsPerQ}
            onChange={(event) =>
              update({ timedSecondsPerQ: Number(event.target.value) })
            }
            className="w-40 accent-accent"
          />
          <input
            type="number"
            aria-label="Seconds per question"
            min={10}
            max={600}
            value={settings.timedSecondsPerQ}
            onChange={(event) => {
              const value = Math.max(10, Math.min(600, Number(event.target.value)));
              if (!Number.isNaN(value)) update({ timedSecondsPerQ: value });
            }}
            style={{ width: "4.5rem", textAlign: "right" }}
            className="text-sm"
          />
        </div>
      </Field>
    </Section>
  );
}

export function SubjectsSection({ settings, update }: SettingsSectionProps) {
  const enabledSubjects = settings.enabledSubjects;

  function setSubjectEnabled(subject: UserSettings["enabledSubjects"][number], enabled: boolean) {
    const next = enabled
      ? [...enabledSubjects, subject]
      : enabledSubjects.filter((s) => s !== subject);
    update({ enabledSubjects: next });
  }

  return (
    <Section
      title="Subjects"
      description="Choose which subjects appear in practice sessions and topic pickers."
    >
      {ALL_SUBJECTS.map((subject) => (
        <Field key={subject} label={SUBJECT_LABELS[subject]}>
          <Toggle
            ariaLabel={SUBJECT_LABELS[subject]}
            checked={enabledSubjects.includes(subject)}
            onChange={(value) => setSubjectEnabled(subject, value)}
          />
        </Field>
      ))}
    </Section>
  );
}

export function BehaviourSection({ settings, update }: SettingsSectionProps) {
  return (
    <Section
      title="Behaviour"
      description="Tweak how sessions behave while you are answering."
    >
      <Field
        label="Exam mode"
        description="Hide topic tags, confidence scores, and metadata during sessions."
      >
        <Toggle
          ariaLabel="Exam mode"
          checked={settings.examMode}
          onChange={(value) => update({ examMode: value })}
        />
      </Field>

      <Field
        label="Auto-advance"
        description="Move to the next question automatically after marking your answer."
      >
        <Toggle
          ariaLabel="Auto-advance"
          checked={settings.autoAdvance}
          onChange={(value) => update({ autoAdvance: value })}
        />
      </Field>

      <Field
        label="Fullscreen on start"
        description="Automatically enter fullscreen mode when starting a session."
      >
        <Toggle
          ariaLabel="Fullscreen on start"
          checked={settings.fullscreenOnStart}
          onChange={(value) => update({ fullscreenOnStart: value })}
        />
      </Field>

      {settings.autoAdvance && (
        <Field
          label="Auto-advance delay"
          description="How long to show the result before advancing."
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              aria-label="Auto-advance delay"
              min={0}
              max={3000}
              step={100}
              value={settings.autoAdvanceDelayMs ?? 600}
              onChange={(event) =>
                update({ autoAdvanceDelayMs: Number(event.target.value) })
              }
              className="w-40 accent-accent"
            />
            <span className="text-sm text-secondary text-right tabular-nums" style={{ minWidth: "3rem", textAlign: "right" }}>
              {(settings.autoAdvanceDelayMs ?? 600) === 0
                ? "Instant"
                : `${((settings.autoAdvanceDelayMs ?? 600) / 1000).toFixed(1)}s`}
            </span>
          </div>
        </Field>
      )}

      <Field
        label="Show keyboard hints"
        description="Display a shortcut reminder below each question."
      >
        <Toggle
          ariaLabel="Show keyboard hints"
          checked={settings.showKeyboardHints}
          onChange={(value) => update({ showKeyboardHints: value })}
        />
      </Field>
    </Section>
  );
}

export function KeyboardShortcutsSection({ settings, update }: SettingsSectionProps) {
  function updateShortcut(action: ShortcutAction, key: string) {
    const nextShortcuts = {
      ...settings.shortcuts,
      [action]: key,
    };

    const duplicateAction = Object.entries(nextShortcuts).find(
      ([candidateAction, candidateKey]) =>
        candidateAction !== action && candidateKey === key,
    )?.[0] as ShortcutAction | undefined;

    if (duplicateAction) {
      nextShortcuts[duplicateAction] = settings.shortcuts[action];
    }

    update({ shortcuts: nextShortcuts });
  }

  return (
    <Section
      title="Keyboard shortcuts"
      description="These shortcuts are saved locally and used during practice sessions."
    >
      {SHORTCUT_FIELDS.map(({ action, label, description }) => (
        <Field key={action} label={label} description={description}>
          <ShortcutInput
          value={settings.shortcuts[action]}
          defaultValue={DEFAULT_SHORTCUTS[action]}
          onChange={(value) => updateShortcut(action, value)}
          ariaLabel={label}
        />
        </Field>
      ))}
    </Section>
  );
}

export function DisplaySection({ settings, update }: SettingsSectionProps) {
  return (
    <Section
      title="Display"
      description="Choose your reading comfort preferences."
    >
      <ColourThemePicker settings={settings} update={update} />

      <Field label="Appearance">
        <Select
          value={settings.theme}
          ariaLabel="Appearance"
          onChange={(value) =>
            update({ theme: value as UserSettings["theme"] })
          }
          options={[
            { value: "dark", label: "Dark (default)" },
            { value: "light", label: "Light (BETA)" },
          ]}
        />
      </Field>

      <Field
        label="Interface font"
        description="Applied across all pages and controls."
      >
        <Select
          value={settings.fontPreset}
          ariaLabel="Interface font"
          onChange={(value) =>
            update({ fontPreset: value as UserSettings["fontPreset"] })
          }
          options={[
            { value: "academic", label: "Academic (Manrope)" },
            { value: "premium", label: "Editorial (Manrope + Fraunces)" },
            { value: "readable", label: "Accessible (Atkinson Hyperlegible)" },
            { value: "modern", label: "Modern (Outfit)" },
            { value: "technical", label: "Technical (IBM Plex Sans)" },
            { value: "inter", label: "Clean (Inter)" },
            { value: "monospace", label: "Monospace (JetBrains Mono)" },
          ]}
        />
      </Field>

      <Field label="Question font size">
        <Select
          value={settings.fontSize}
          ariaLabel="Question font size"
          onChange={(value) =>
            update({ fontSize: value as UserSettings["fontSize"] })
          }
          options={[
            { value: "sm", label: "Small" },
            { value: "md", label: "Medium (default)" },
            { value: "lg", label: "Large" },
          ]}
        />
      </Field>
    </Section>
  );
}

interface QuestionPoolSectionProps extends SettingsSectionProps {
  excludedQuestions: ExcludedQuestion[];
  includeQuestion: (questionId: string) => Promise<void>;
}

export function QuestionPoolSection({ settings, update, excludedQuestions, includeQuestion }: QuestionPoolSectionProps) {
  return (
    <Section
      title="Question pool"
      description="Control which questions appear in new sessions."
    >
      <Field
        label="Auto-exclude answered questions"
        description="After each session, qualifying questions are removed from future sessions."
      >
        <Toggle
          ariaLabel="Auto-exclude answered questions"
          checked={settings.autoExclude}
          onChange={(value) => update({ autoExclude: value })}
        />
      </Field>

      {settings.autoExclude && (
        <Field
          label="Exclude when"
          description="Which results count as done."
        >
          <Select
            value={settings.autoExcludeOn}
            ariaLabel="Exclude when"
            onChange={(value) => update({ autoExcludeOn: value as AutoExcludeOn })}
            options={[
              { value: "attempted", label: "Attempted (correct or incorrect)" },
              { value: "correct", label: "Correct only" },
              { value: "any", label: "Seen (including skipped)" },
            ]}
          />
        </Field>
      )}

      {excludedQuestions.length > 0 && (
        <Field
          label="Excluded questions"
          description={`${excludedQuestions.length} question${excludedQuestions.length !== 1 ? "s" : ""} hidden from sessions. Manage individual questions in the question bank.`}
        >
          <button
            type="button"
            onClick={async () => {
              if (window.confirm(`Re-add all ${excludedQuestions.length} excluded questions to the pool?`)) {
                await Promise.all(excludedQuestions.map((eq) => includeQuestion(eq.question_id)));
              }
            }}
            className="storage-btn-outline"
          >
            Reset pool
          </button>
        </Field>
      )}
    </Section>
  );
}

export function AskClaudeSection({ settings, update }: SettingsSectionProps) {
  const [showClaudeModal, setShowClaudeModal] = useState(false);

  return (
    <Section
      title="Ask Claude (Experimental)"
      description="Control how the Ask Claude button sends questions to Claude."
    >
      <Field
        label="Integration mode"
        description="Controls whether the button uses the Tampermonkey extension or manual copy & paste."
      >
        <Select
          value={settings.claudeMode ?? "auto"}
          ariaLabel="Integration mode"
          onChange={(value) => update({ claudeMode: value as ClaudeMode })}
          options={[
            { value: "auto", label: "Detect automatically (default)" },
            { value: "extension", label: "Always use extension" },
            { value: "manual", label: "Always copy & paste" },
          ]}
        />
      </Field>

      <div className="px-4 py-4 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-secondary">Prompt template</div>
            <div className="text-xs text-muted mt-0.5">
              Customise what is sent to Claude. Use <code className="prompt-var-inline">{"{{variable}}"}</code> tokens — unknown tokens are left as-is.
            </div>
          </div>
          {(settings.claudePromptTemplate ?? DEFAULT_PROMPT_TEMPLATE) !== DEFAULT_PROMPT_TEMPLATE && (
            <button
              type="button"
              className="px-2.5 py-1 text-xs border border-subtle rounded-lg text-muted hover:border-strong hover:text-secondary transition-colors flex-shrink-0"
              onClick={() => update({ claudePromptTemplate: DEFAULT_PROMPT_TEMPLATE })}
            >
              Reset
            </button>
          )}
        </div>

        <textarea
          className="prompt-template-textarea"
          aria-label="Prompt template"
          value={settings.claudePromptTemplate ?? DEFAULT_PROMPT_TEMPLATE}
          onChange={(e) => update({ claudePromptTemplate: e.target.value })}
          rows={12}
          spellCheck={false}
          maxLength={50_000}
        />

        <div className="flex flex-wrap gap-1.5 mt-1">
          {[
            { token: "{{question}}", hint: "question text (truncated)" },
            { token: "{{question_full}}", hint: "full question text" },
            { token: "{{answer}}", hint: "correct answer" },
            { token: "{{topic}}", hint: "primary topic" },
            { token: "{{subject}}", hint: "subject" },
            { token: "{{year}}", hint: "year" },
            { token: "{{paper}}", hint: "paper code" },
          ].map(({ token, hint }) => (
            <button
              key={token}
              type="button"
              title={hint}
              className="prompt-var-chip"
              onClick={() => {
                const current = settings.claudePromptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
                update({ claudePromptTemplate: current + token });
              }}
            >
              {token}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 border-t border-subtle">
        <button
          type="button"
          className="settings-text-link"
          onClick={() => setShowClaudeModal(true)}
        >
          Installation guide &amp; how it works →
        </button>
      </div>

      {showClaudeModal && <AskClaudeInfoModal onClose={() => setShowClaudeModal(false)} />}
    </Section>
  );
}
