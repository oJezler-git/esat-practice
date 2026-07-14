// Composites the source scan image and the annotation overlay onto a canvas and
// triggers a PNG download. Freehand/shape/text annotations carry inline SVG
// attributes so they rasterize faithfully; KaTeX math labels are best-effort
// (their external CSS/fonts aren't inlined, so they fall back to a plain font).

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load overlay image"));
    img.decoding = "async";
    img.src = src;
  });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Clones the live annotation SVG, strips interactive-only nodes (cursor preview,
// open editor, any in-progress live stroke), inlines the handwriting font that
// external CSS would otherwise supply, and rasterizes it to an <img>.
async function rasterizeOverlay(
  svg: SVGSVGElement,
  width: number,
  height: number,
): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;

  // Drop cursor preview, editor, and any transient live/preview elements.
  clone.querySelectorAll("[data-export-ignore]").forEach((node) => node.remove());
  // The in-progress freehand/shape preview renders under the id "__live".
  clone.querySelectorAll('[data-ann-id="__live"]').forEach((node) => node.remove());

  // Give the standalone SVG an intrinsic size so drawImage maps 1:1 to natural
  // pixels, and drop the class that only matters for the live (styled) layer.
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.removeAttribute("class");

  // External stylesheets don't apply to an SVG loaded via <img>, so inline the
  // handwriting font that `.drawing-text` would have supplied.
  const fontHand = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-hand")
    .trim();
  clone.querySelectorAll("text").forEach((text) => {
    if (fontHand) text.style.fontFamily = fontHand;
    text.style.fontWeight = "600";
  });

  const xml = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportAnnotatedScan(opts: {
  image: HTMLImageElement;
  svg: SVGSVGElement | null;
  naturalSize: { width: number; height: number };
  fileName: string;
}): Promise<void> {
  const { image, svg, naturalSize, fileName } = opts;
  const width = Math.round(naturalSize.width);
  const height = Math.round(naturalSize.height);
  if (width <= 0 || height <= 0) throw new Error("Scan has no natural size yet");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  // Opaque backing so a transparent scan (or overlay gaps) reads as paper.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  if (svg) {
    const overlay = await rasterizeOverlay(svg, width, height);
    ctx.drawImage(overlay, 0, 0, width, height);
  }

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error("Failed to encode PNG (the scan may be cross-origin)");
  downloadBlob(blob, fileName);
}
