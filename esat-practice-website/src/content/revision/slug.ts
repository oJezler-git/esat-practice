export function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function uniqueSlug(base: string, used: Set<string>): string {
  const fallback = base || "section";
  let next = fallback;
  let index = 2;

  while (used.has(next)) {
    next = `${fallback}-${index}`;
    index += 1;
  }

  used.add(next);
  return next;
}

export function buildUniqueHeadingId(text: string, used: Set<string>): string {
  return uniqueSlug(slugifyHeading(text), used);
}
