import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchRecentCommits, relativeTime } from "./recentCommits";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("relativeTime", () => {
  const now = new Date("2026-07-16T12:00:00Z").getTime();

  it("formats seconds, minutes, hours, days, months and years ago", () => {
    expect(relativeTime("2026-07-16T11:59:30Z", now)).toContain("30");
    expect(relativeTime("2026-07-16T11:30:00Z", now)).toContain("30");
    expect(relativeTime("2026-07-16T09:00:00Z", now)).toContain("3");
    expect(relativeTime("2026-07-14T12:00:00Z", now)).toContain("2");
    expect(relativeTime("2026-05-16T12:00:00Z", now)).toContain("2");
    expect(relativeTime("2024-07-16T12:00:00Z", now)).toContain("2");
  });

  it("returns an empty string for an unparseable date", () => {
    expect(relativeTime("not-a-date", now)).toBe("");
  });
});

describe("fetchRecentCommits", () => {
  it("maps the GitHub payload to subject/date/url", async () => {
    const payload = [
      {
        sha: "abc123",
        html_url: "https://github.com/x/y/commit/abc123",
        commit: {
          message: "feat: something\n\nbody text",
          author: { date: "2026-07-16T10:00:00Z" },
          committer: { date: "2026-07-16T10:05:00Z" },
        },
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) }),
    );

    const commits = await fetchRecentCommits();

    expect(commits).toEqual([
      {
        sha: "abc123",
        subject: "feat: something",
        url: "https://github.com/x/y/commit/abc123",
        date: "2026-07-16T10:00:00Z",
      },
    ]);
  });

  it("throws when the API responds with an error status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    await expect(fetchRecentCommits()).rejects.toThrow("403");
  });
});
