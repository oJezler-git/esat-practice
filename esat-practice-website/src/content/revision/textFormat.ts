// Display-only formatting for revision UI copy — never applied to slugs,
// aria-labels, or anything else that needs the natural-language form.
export function ampersandize(text: string): string {
  return text.replace(/\band\b/g, "&");
}
