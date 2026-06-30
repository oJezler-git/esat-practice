import type { Annotation } from "../types/annotations";

// Per-question annotation persistence backed by localStorage. Keyed by the
// question id so a scan's drawings reappear when reopened (and survive reload).

const KEY_PREFIX = "esat-annotations:";

function storageKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

function isValidAnnotation(value: unknown): value is Annotation {
  if (!value || typeof value !== "object") return false;
  const ann = value as Record<string, unknown>;
  if (typeof ann.id !== "string" || typeof ann.kind !== "string") return false;
  switch (ann.kind) {
    case "pen":
    case "highlighter":
      return Array.isArray(ann.points);
    case "line":
    case "arrow":
    case "rect":
    case "ellipse":
      return (
        typeof ann.start === "object" &&
        ann.start !== null &&
        typeof ann.end === "object" &&
        ann.end !== null
      );
    case "text":
      return typeof ann.text === "string";
    case "math":
      return typeof ann.latex === "string";
    default:
      return false;
  }
}

export function loadAnnotations(key: string): Annotation[] {
  if (!key) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidAnnotation);
  } catch {
    return [];
  }
}

export function saveAnnotations(key: string, annotations: Annotation[]): void {
  if (!key) return;
  try {
    if (annotations.length === 0) {
      window.localStorage.removeItem(storageKey(key));
      return;
    }
    window.localStorage.setItem(storageKey(key), JSON.stringify(annotations));
  } catch {
    // Quota or serialization failure — annotations are non-critical, fail soft.
  }
}
