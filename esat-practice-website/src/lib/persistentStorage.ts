const KEY = "persistent_storage";

type Decision = "undecided" | "granted" | "snoozed" | "never";

function raw(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function write(value: string): void {
  try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
}

export function getDecision(): Decision {
  const val = raw();
  if (!val) return "undecided";
  if (val === "granted") return "granted";
  if (val === "never") return "never";
  if (val.startsWith("remind:")) {
    const until = new Date(val.slice(7));
    return !isNaN(until.getTime()) && Date.now() < until.getTime() ? "snoozed" : "undecided";
  }
  return "undecided";
}

export function saveGranted(): void { write("granted"); }
export function saveNever(): void { write("never"); }
export function saveRemindLater(): void {
  const until = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  write(`remind:${until}`);
}

export async function checkAlreadyPersisted(): Promise<boolean> {
  if (!navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}

export async function requestPersist(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export function isSupported(): boolean {
  return Boolean(navigator.storage?.persist) && Boolean(navigator.storage?.persisted);
}
