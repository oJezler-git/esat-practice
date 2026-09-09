import { useEffect } from "react";
import { startSyncCoordinator } from "../lib/syncCoordinator";

/** Mount once near the application root. StrictMode-safe singleton coordinator. */
export function SyncCoordinator(): null {
  useEffect(() => startSyncCoordinator(), []);
  return null;
}
