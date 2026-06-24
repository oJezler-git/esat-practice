import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_SETTINGS,
  DEFAULT_SHORTCUTS,
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

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      update: (patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            ...patch,
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
