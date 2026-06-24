import { describe, it, expect } from "vitest";
import { shuffle } from "./shuffle";

describe("shuffle", () => {
  it("returns an array of the same length", () => {
    expect(shuffle([1, 2, 3, 4, 5])).toHaveLength(5);
  });

  it("contains the same elements as the input", () => {
    const input = [1, 2, 3, 4, 5];
    expect(shuffle(input).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("does not mutate the original array", () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it("returns an empty array for empty input", () => {
    expect(shuffle([])).toEqual([]);
  });

  it("returns a single-element array unchanged", () => {
    expect(shuffle([42])).toEqual([42]);
  });

  it("produces different orderings across runs (statistical)", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(JSON.stringify(shuffle(input)));
    }
    // With 10 elements, the odds of getting the same permutation 50 times in a row
    // are astronomically small — this fails only if the PRNG is broken.
    expect(results.size).toBeGreaterThan(1);
  });
});
