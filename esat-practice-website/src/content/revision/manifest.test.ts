import { describe, expect, it } from "vitest";
import { findRevisionDoc, revisionDocs, revisionModules } from "./manifest";

describe("revision manifest", () => {
  it("loads docs sorted by module and topic order", () => {
    expect(revisionDocs.map((doc) => doc.id)).toEqual([
      "m1/units",
      "m1/number",
      "m1/ratio-and-proportion",
      "m1/algebra",
      "m1/geometry",
      "m1/statistics",
      "m1/probability",
      "m2/algebra-and-functions",
      "m2/sequences-and-series",
      "m2/coordinate-geometry",
      "m2/trigonometry",
      "m2/exponentials-and-logarithms",
      "m2/differentiation",
      "m2/integration",
      "m2/graphs-of-functions",
      "physics/electricity",
      "physics/magnetism",
      "physics/mechanics",
      "physics/thermal-physics",
      "physics/matter",
      "physics/waves",
      "physics/radioactivity",
    ]);
  });

  it("groups docs into module sidebars", () => {
    const moduleCounts = Object.fromEntries(
      revisionModules.map((module) => [module.slug, module.docs.length]),
    );

    expect(moduleCounts).toEqual({ m1: 7, m2: 8, physics: 7 });
  });

  it("finds docs by route params and returns undefined for missing pages", () => {
    expect(findRevisionDoc("m1", "units")?.meta.title).toBe("Units");
    expect(findRevisionDoc("m1", "not-real")).toBeUndefined();
    expect(findRevisionDoc(undefined, "units")).toBeUndefined();
  });

  it("does not expose duplicate route ids", () => {
    const ids = revisionDocs.map((doc) => doc.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
