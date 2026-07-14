import { afterEach, describe, expect, it, vi } from "vitest";
import { exportAnnotatedScan } from "./exportAnnotatedScan";

// jsdom has no real canvas/Image, so stub the browser bits the exporter needs
// and record what it draws / serializes / downloads.
function installBrowserStubs() {
  const drawn: unknown[] = [];
  const ctx = {
    fillStyle: "",
    fillRect: vi.fn(),
    drawImage: vi.fn((source: unknown) => drawn.push(source)),
  };
  const toBlob = vi.fn((cb: (blob: Blob | null) => void) =>
    cb(new Blob(["png-bytes"], { type: "image/png" })),
  );

  const realCreate = document.createElement.bind(document);
  const anchorClick = vi.fn();
  let downloadName = "";
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag === "canvas") {
      return {
        width: 0,
        height: 0,
        getContext: () => ctx,
        toBlob,
      } as unknown as HTMLCanvasElement;
    }
    const el = realCreate(tag) as HTMLElement;
    if (tag === "a") {
      Object.defineProperty(el, "click", { value: anchorClick });
      Object.defineProperty(el, "download", {
        set: (v: string) => { downloadName = v; },
        get: () => downloadName,
        configurable: true,
      });
    }
    return el;
  });

  // new Image().src = url  →  fire onload on the next microtask.
  vi.stubGlobal("Image", class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decoding = "";
    set src(_v: string) {
      Promise.resolve().then(() => this.onload?.());
    }
  });

  const urls: string[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const u = `blob:mock-${urls.length}`;
    urls.push(u);
    return u;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

  return { ctx, toBlob, drawn, anchorClick, getDownloadName: () => downloadName };
}

function buildSvg(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const keep = document.createElementNS("http://www.w3.org/2000/svg", "path");
  keep.setAttribute("data-ann-id", "stroke-1");
  const cursor = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  cursor.setAttribute("data-export-ignore", "");
  const live = document.createElementNS("http://www.w3.org/2000/svg", "path");
  live.setAttribute("data-ann-id", "__live");
  svg.append(keep, cursor, live);
  return svg;
}

describe("exportAnnotatedScan", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("composites the scan then the overlay and downloads a named PNG", async () => {
    const stubs = installBrowserStubs();
    const image = { naturalWidth: 800, naturalHeight: 600 } as HTMLImageElement;

    await exportAnnotatedScan({
      image,
      svg: buildSvg(),
      naturalSize: { width: 800, height: 600 },
      fileName: "esat-q1-annotated.png",
    });

    // Scan drawn first, overlay second.
    expect(stubs.drawn[0]).toBe(image);
    expect(stubs.drawn).toHaveLength(2);
    expect(stubs.toBlob).toHaveBeenCalled();
    expect(stubs.anchorClick).toHaveBeenCalledTimes(1);
    expect(stubs.getDownloadName()).toBe("esat-q1-annotated.png");
  });

  it("strips cursor preview and live-stroke nodes from the exported overlay", async () => {
    installBrowserStubs();
    const serialize = vi.spyOn(XMLSerializer.prototype, "serializeToString");

    await exportAnnotatedScan({
      image: {} as HTMLImageElement,
      svg: buildSvg(),
      naturalSize: { width: 400, height: 300 },
      fileName: "x.png",
    });

    const xml = serialize.mock.results[0].value as string;
    expect(xml).toContain('data-ann-id="stroke-1"');
    expect(xml).not.toContain("data-export-ignore");
    expect(xml).not.toContain('__live');
  });

  it("skips overlay rasterization when there is no annotation layer", async () => {
    const stubs = installBrowserStubs();
    const image = {} as HTMLImageElement;

    await exportAnnotatedScan({
      image,
      svg: null,
      naturalSize: { width: 100, height: 100 },
      fileName: "x.png",
    });

    // Only the scan is drawn — no overlay.
    expect(stubs.drawn).toEqual([image]);
  });

  it("throws before drawing when the scan has no natural size", async () => {
    const stubs = installBrowserStubs();
    await expect(
      exportAnnotatedScan({
        image: {} as HTMLImageElement,
        svg: null,
        naturalSize: { width: 0, height: 0 },
        fileName: "x.png",
      }),
    ).rejects.toThrow(/natural size/);
    expect(stubs.toBlob).not.toHaveBeenCalled();
  });
});
