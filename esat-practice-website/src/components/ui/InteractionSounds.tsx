import { useEffect } from "react";
import {
  installInteractionSounds,
  setInteractionSoundsEnabled,
} from "../../lib/interactionSounds";
import { useSettingsStore } from "../../lib/settingsStore";

export function InteractionSounds() {
  const soundEffects = useSettingsStore((state) => state.settings.soundEffects);

  useEffect(() => {
    const cleanup = installInteractionSounds();

    return () => {
      cleanup();
      setInteractionSoundsEnabled(false);
    };
  }, []);

  useEffect(() => {
    setInteractionSoundsEnabled(soundEffects);
  }, [soundEffects]);

  return null;
}
