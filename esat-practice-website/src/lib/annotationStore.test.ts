import { describe, it, expect, beforeEach } from "vitest";
import { loadAnnotations, saveAnnotations } from "./annotationStore";
import type { Annotation } from "../types/annotations";

const PEN: Annotation = {
  id: "a1",
  kind: "pen",
  color: "#000",
  width: 4,
  points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
};

const TEXT: Annotation = {
  id: "t1",
  kind: "text",
  color: "#111",
  x: 5,
  y: 6,
  fontSize: 24,
  text: "note",
};

describe("annotationStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty array for an unknown key", () => {
    expect(loadAnnotations("missing")).toEqual([]);
  });

  it("returns an empty array for a blank key", () => {
    expect(loadAnnotations("")).toEqual([]);
  });

  it("round-trips annotations through save/load", () => {
    saveAnnotations("q1", [PEN, TEXT]);
    expect(loadAnnotations("q1")).toEqual([PEN, TEXT]);
  });

  it("removes the entry when saving an empty list", () => {
    saveAnnotations("q1", [PEN]);
    saveAnnotations("q1", []);
    expect(window.localStorage.getItem("esat-annotations:q1")).toBeNull();
    expect(loadAnnotations("q1")).toEqual([]);
  });

  it("tolerates corrupt JSON", () => {
    window.localStorage.setItem("esat-annotations:q1", "{not json");
    expect(loadAnnotations("q1")).toEqual([]);
  });

  it("filters out malformed entries", () => {
    window.localStorage.setItem(
      "esat-annotations:q1",
      JSON.stringify([PEN, { id: "bad" }, { kind: "pen" }, 42]),
    );
    expect(loadAnnotations("q1")).toEqual([PEN]);
  });

  it("keeps annotations isolated per key", () => {
    saveAnnotations("q1", [PEN]);
    saveAnnotations("q2", [TEXT]);
    expect(loadAnnotations("q1")).toEqual([PEN]);
    expect(loadAnnotations("q2")).toEqual([TEXT]);
  });
});
