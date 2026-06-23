import { clearAllData, clearProgressData } from "./dataManagement";
import { getDecision, checkAlreadyPersisted } from "./persistentStorage";

interface EsatDebug {
  wipe: () => Promise<void>;
  wipeProgress: () => Promise<void>;
  storageStatus: () => Promise<void>;
}

declare global {
  interface Window {
    __esat: EsatDebug;
  }
}

export function registerDebugCommands(): void {
  window.__esat = {
    async wipe() {
      console.log("[esat] Wiping everything...");
      await clearAllData();
      console.log("[esat] Done. Reloading...");
      window.location.reload();
    },
    async wipeProgress() {
      console.log("[esat] Wiping progress data (keeping settings)...");
      await clearProgressData();
      console.log("[esat] Done. Reloading...");
      window.location.reload();
    },
    async storageStatus() {
      const decision = getDecision();
      const persisted = await checkAlreadyPersisted();
      const raw = localStorage.getItem("persistent_storage");
      console.log(
        "[esat] Storage status:\n" +
        `  navigator.storage.persisted() = ${persisted}\n` +
        `  localStorage["persistent_storage"] = ${JSON.stringify(raw)}\n` +
        `  getDecision() = "${decision}"`,
      );
    },
  };

  console.log(
    "[esat] Debug commands available:\n" +
    "  __esat.wipe()           — clear everything (IndexedDB + localStorage) and reload\n" +
    "  __esat.wipeProgress()   — clear sessions/stats only, keep settings\n" +
    "  __esat.storageStatus()  — show persistent storage state",
  );
}
