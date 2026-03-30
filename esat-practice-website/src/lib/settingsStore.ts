import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_SETTINGS } from "../types/settings";
import type { UserSettings } from "../types/settings";

interface SettingsStore {
  settings: UserSettings;
  update: (patch: Partial<UserSettings>) => void;
  reset: () => void;
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
          },
        };
      },
    },
  ),
);
