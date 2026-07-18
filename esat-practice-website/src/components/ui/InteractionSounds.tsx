import { useEffect } from "react";
import {
  installInteractionSounds,
  setInteractionSoundVolume,
  setInteractionSoundsEnabled,
} from "../../lib/interactionSounds";
import { useSettingsStore } from "../../lib/settingsStore";

export function InteractionSounds() {
  const soundEffects = useSettingsStore((state) => state.settings.soundEffects);
  const soundVolume = useSettingsStore((state) => state.settings.soundVolume);

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

  useEffect(() => {
    setInteractionSoundVolume(soundVolume);
  }, [soundVolume]);

  return null;
}
