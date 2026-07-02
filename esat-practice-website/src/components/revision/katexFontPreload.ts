// KaTeX ships its fonts with `font-display: block`, so math glyphs stay invisible
// until the web-fonts download and then pop in. Preloading the handful of fonts
// that cover almost all rendered math removes that flash on revision pages.
import mainRegular from "katex/dist/fonts/KaTeX_Main-Regular.woff2?url";
import mainItalic from "katex/dist/fonts/KaTeX_Main-Italic.woff2?url";
import mainBold from "katex/dist/fonts/KaTeX_Main-Bold.woff2?url";
import mathItalic from "katex/dist/fonts/KaTeX_Math-Italic.woff2?url";
import size1 from "katex/dist/fonts/KaTeX_Size1-Regular.woff2?url";

const FONT_URLS = [mainRegular, mainItalic, mainBold, mathItalic, size1];

let preloaded = false;

/** Injects `<link rel="preload">` for the core KaTeX fonts once. Safe to call repeatedly. */
export function preloadKatexFonts(): void {
  if (preloaded || typeof document === "undefined") {
    return;
  }
  preloaded = true;

  for (const href of FONT_URLS) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "font";
    link.type = "font/woff2";
    link.href = href;
    // Fonts are fetched in CORS mode even same-origin; without this the preload
    // would be ignored and the font re-fetched.
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }
}
