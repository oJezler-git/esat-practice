const META_MARKER = "export const meta = {";

/** Finds the end index (exclusive, past a trailing `;` if present) of the `export const meta = {...}` block. */
function findMetaBlockEnd(raw: string, start: number): number {
  let depth = 0;
  let end = start + META_MARKER.length - 1;
  for (; end < raw.length; end += 1) {
    if (raw[end] === "{") {
      depth += 1;
    } else if (raw[end] === "}") {
      depth -= 1;
      if (depth === 0) {
        end += 1;
        break;
      }
    }
  }

  if (raw[end] === ";") {
    end += 1;
  }

  return end;
}

/** Extracts the raw `export const meta = {...};` block from raw MDX source, or undefined if absent. */
export function extractMetaSource(raw: string): string | undefined {
  const start = raw.indexOf(META_MARKER);
  if (start === -1) {
    return undefined;
  }
  return raw.slice(start, findMetaBlockEnd(raw, start));
}

/** Strips the `export const meta = {...}` block from raw MDX source, returning just the body content. */
export function stripMdxExports(raw: string): string {
  const start = raw.indexOf(META_MARKER);
  if (start === -1) {
    return raw.trim();
  }

  return raw.slice(findMetaBlockEnd(raw, start)).trim();
}
