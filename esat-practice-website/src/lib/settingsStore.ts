import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
  DEFAULT_SOUND_VOLUME,
  MAX_SOUND_VOLUME,
  MIN_SOUND_VOLUME,
  normalizeShortcutKey,
} from "../types/settings";
import type { ShortcutMap, UserSettings } from "../types/settings";

interface SettingsStore {
  settings: UserSettings;
  update: (patch: Partial<UserSettings>) => void;
  reset: () => void;
}

function sanitizeShortcuts(shortcuts?: Partial<ShortcutMap>): ShortcutMap {
  const merged = {
    ...DEFAULT_SHORTCUTS,
    ...(shortcuts ?? {}),
  };

  return {
    revealCorrect:
      normalizeShortcutKey(merged.revealCorrect) ??
      DEFAULT_SHORTCUTS.revealCorrect,
    incorrect:
      normalizeShortcutKey(merged.incorrect) ?? DEFAULT_SHORTCUTS.incorrect,
    prev: normalizeShortcutKey(merged.prev) ?? DEFAULT_SHORTCUTS.prev,
    next: normalizeShortcutKey(merged.next) ?? DEFAULT_SHORTCUTS.next,
    flag: normalizeShortcutKey(merged.flag) ?? DEFAULT_SHORTCUTS.flag,
    skip: normalizeShortcutKey(merged.skip) ?? DEFAULT_SHORTCUTS.skip,
  };
}

function sanitizeSoundVolume(value: unknown): number {
  const volume = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(volume)) {
    return DEFAULT_SOUND_VOLUME;
  }
  return Math.min(MAX_SOUND_VOLUME, Math.max(MIN_SOUND_VOLUME, Math.round(volume)));
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...patch,
            soundVolume: sanitizeSoundVolume(
              patch.soundVolume ?? state.settings.soundVolume,
            ),
            shortcuts: sanitizeShortcuts(
              patch.shortcuts ?? state.settings.shortcuts,
            ),
          },
        })),
      reset: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: "esat-settings",
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsStore> | undefined;
        return {
          ...currentState,
          ...persisted,
          settings: {
            ...DEFAULT_SETTINGS,
            ...(persisted?.settings ?? {}),
            soundVolume: sanitizeSoundVolume(persisted?.settings?.soundVolume),
            shortcuts: sanitizeShortcuts(persisted?.settings?.shortcuts),
            claudePromptTemplate:
              typeof persisted?.settings?.claudePromptTemplate === 'string'
                ? persisted.settings.claudePromptTemplate
                : DEFAULT_SETTINGS.claudePromptTemplate,
          },
        };
      },
    },
  ),
);
