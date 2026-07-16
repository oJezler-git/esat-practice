// Fetches recent commits from the public GitHub repo so the update prompt can
// show "what's new" for a pending update. We fetch at runtime (rather than
// baking commit info into the build) because when the prompt fires the page is
// still running the OLD bundle — a build-time constant would describe the
// version the user is already on, not the update that's waiting.

const REPO = "oJezler-git/esat-practice";

export interface RecentCommit {
  sha: string;
  subject: string;
  url: string;
  date: string;
}

export async function fetchRecentCommits(signal?: AbortSignal): Promise<RecentCommit[]> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/commits?per_page=5`, {
    signal,
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw new Error(`GitHub API responded ${res.status}`);
  }
  const data = (await res.json()) as Array<{
    sha: string;
    html_url: string;
    commit: {
      message: string;
      author: { date: string } | null;
      committer: { date: string } | null;
    };
  }>;
  return data.map((c) => ({
    sha: c.sha,
    subject: c.commit.message.split("\n")[0],
    url: c.html_url,
    date: c.commit.author?.date ?? c.commit.committer?.date ?? "",
  }));
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 60 * 60 * 24 * 365],
  ["month", 60 * 60 * 24 * 30],
  ["day", 60 * 60 * 24],
  ["hour", 60 * 60],
  ["minute", 60],
  ["second", 1],
];

export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((then - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, secondsInUnit] of UNITS) {
    if (Math.abs(diffSec) >= secondsInUnit || unit === "second") {
      return rtf.format(Math.round(diffSec / secondsInUnit), unit);
    }
  }
  return "";
}
