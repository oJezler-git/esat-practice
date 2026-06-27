/** Generates a unique id, preferring crypto.randomUUID with a timestamp fallback. */
export function generateId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
