import type { ReactNode } from "react";
import { useSettingsStore } from "../../lib/settingsStore";
import {
  DEFAULT_SHORTCUTS,
  formatShortcutKey,
  normalizeShortcutKey,
  type ShortcutAction,
  type ShortcutMap,
  type UserSettings,
} from "../../types/settings";
import { DataManagementSection } from "../../components/DataManagementSection";

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

function getTargetYearOptions(
  targetYear: number,
): { value: string; label: string }[] {
  const years = [targetYear - 1, targetYear, targetYear + 1];
  return years.map((year) => ({ value: String(year), label: String(year) }));
}

export default function Settings() {
  const { settings, update, reset } = useSettingsStore();

  function updateShortcut(action: ShortcutAction, key: string) {
    const nextShortcuts: ShortcutMap = {
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
    <div className="page-shell max-w-3xl">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-medium">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Configure your default session flow and exam preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm("Reset all settings to defaults?")) {
              reset();
            }
          }}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors"
        >
          Reset to defaults
        </button>
      </div>

      <Section
        title="Session defaults"
        description="Choose how new practice sessions should start."
      >
        <Field label="Default mode">
          <Select
            value={settings.defaultMode}
            onChange={(value) =>
              update({ defaultMode: value as UserSettings["defaultMode"] })
            }
            options={[
              { value: "untimed", label: "Untimed" },
              { value: "timed", label: "Timed" },
              { value: "topic", label: "Topic focus" },
              { value: "mixed", label: "Mixed" },
            ]}
          />
        </Field>

        <Field label="Default question count">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={5}
              max={60}
              step={5}
              value={settings.defaultQuestionCount}
              onChange={(event) =>
                update({ defaultQuestionCount: Number(event.target.value) })
              }
              className="w-40 accent-indigo-500"
            />
            <span className="text-sm text-gray-600 w-8">
              {settings.defaultQuestionCount}
            </span>
          </div>
        </Field>

        <Field label="Seconds per question (timed mode)">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={30}
              max={180}
              step={15}
              value={settings.timedSecondsPerQ}
              onChange={(event) =>
                update({ timedSecondsPerQ: Number(event.target.value) })
              }
              className="w-40 accent-indigo-500"
            />
            <span className="text-sm text-gray-600 w-16">
              {settings.timedSecondsPerQ}s / Q
            </span>
          </div>
        </Field>
      </Section>

      <Section
        title="Behaviour"
        description="Tweak how sessions behave while you are answering."
      >
        <Field
          label="Exam mode"
          description="Hide topic tags, confidence scores, and metadata during sessions."
        >
          <Toggle
            checked={settings.examMode}
            onChange={(value) => update({ examMode: value })}
          />
        </Field>

        <Field
          label="Auto-advance"
          description="Move to the next question automatically after marking your answer."
        >
          <Toggle
            checked={settings.autoAdvance}
            onChange={(value) => update({ autoAdvance: value })}
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
                min={0}
                max={3000}
                step={100}
                value={settings.autoAdvanceDelayMs ?? 600}
                onChange={(event) =>
                  update({ autoAdvanceDelayMs: Number(event.target.value) })
                }
                className="w-40 accent-indigo-500"
              />
              <span className="text-sm text-gray-600 w-20 text-right tabular-nums">
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
            checked={settings.showKeyboardHints}
            onChange={(value) => update({ showKeyboardHints: value })}
          />
        </Field>
      </Section>

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
            />
          </Field>
        ))}
      </Section>

      <Section
        title="Display"
        description="Choose your reading comfort preferences."
      >
        <Field
          label="Interface font"
          description="Applied across all pages and controls."
        >
          <Select
            value={settings.fontPreset}
            onChange={(value) =>
              update({ fontPreset: value as UserSettings["fontPreset"] })
            }
            options={[
              {
                value: "academic",
                label: "Academic technical (IBM Plex Sans)",
              },
              {
                value: "premium",
                label: "Premium editorial (Manrope)",
              },
              {
                value: "readable",
                label: "Readability first (Atkinson Hyperlegible Next)",
              },
            ]}
          />
        </Field>

        <Field label="Question font size">
          <Select
            value={settings.fontSize}
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

      <Section
        title="Exam context"
        description="Set constraints that should be reflected in your practice sessions."
      >
        <Field label="Target year">
          <Select
            value={String(settings.targetYear)}
            onChange={(value) => update({ targetYear: Number(value) })}
            options={getTargetYearOptions(settings.targetYear)}
          />
        </Field>
      </Section>

      <DataManagementSection />
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-8 border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="px-4 py-3.5 border-b border-gray-100">
        <h2 className="text-sm font-medium text-gray-500">{title}</h2>
        <p className="text-xs text-gray-400 mt-1">{description}</p>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </section>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div>
        <div className="text-sm text-gray-700">{label}</div>
        {description && (
          <div className="text-xs text-gray-400 mt-0.5">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
        checked ? "bg-indigo-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:border-indigo-400"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ShortcutInput({
  value,
  defaultValue,
  onChange,
}: {
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onKeyDown={(event) => {
          event.preventDefault();
          const nextKey = normalizeShortcutKey(event.key);
          if (nextKey) {
            onChange(nextKey);
          }
        }}
        className="w-40 rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-gray-300"
        title="Focus and press a key to change this shortcut"
      >
        {formatShortcutKey(value)}
      </button>
      <button
        type="button"
        onClick={() => onChange(defaultValue)}
        className="text-xs text-gray-400 transition-colors hover:text-gray-600"
      >
        Reset
      </button>
    </div>
  );
}
