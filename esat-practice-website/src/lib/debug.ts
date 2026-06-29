import { clearAllData, clearProgressData } from "./dataManagement";
import { getDecision, checkAlreadyPersisted } from "./persistentStorage";
import { getDb } from "./db";
import { generateId } from "./ids";
import { recomputeAllStats } from "./statsStore";
import type { Attempt, Session } from "../types/schema";

interface EsatDebug {
  wipe: () => Promise<void>;
  wipeProgress: () => Promise<void>;
  storageStatus: () => Promise<void>;
  seedProgress: () => Promise<void>;
}

declare global {
  interface Window {
    __esat: EsatDebug;
  }
}

// ─── synthetic progress seed ────────────────────────────────────────────────

const DAY_MS = 86_400_000;

// Sigmoid mapped to [lo, hi] — produces a smooth S-curve as i goes 0 → total-1
function sigmoidAccuracy(i: number, total: number, lo: number, hi: number): number {
  const x = (i / (total - 1)) * 8 - 4; // -4 … +4
  const s = 1 / (1 + Math.exp(-x));
  return lo + s * (hi - lo);
}

function jitter(base: number, spread: number): number {
  return Math.max(0, Math.min(1, base + (Math.random() - 0.5) * spread));
}

function sample<T>(arr: T[], n: number): T[] {
  if (arr.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(Math.random() * arr.length)]);
  return out;
}

async function seedProgress(): Promise<void> {
  const database = await getDb();
  const allQuestions = await database.getAll("questions");

  if (allQuestions.length === 0) {
    console.error("[esat] No questions loaded — run data:prepare and reload first.");
    return;
  }

  // Partition by module prefix
  const m1Qs  = allQuestions.filter(q =>  q.taxonomy.primary_topic?.startsWith("M") && !q.taxonomy.primary_topic?.startsWith("MM"));
  const m2Qs  = allQuestions.filter(q =>  q.taxonomy.primary_topic?.startsWith("MM"));
  const physQs = allQuestions.filter(q => q.taxonomy.primary_topic?.startsWith("P"));

  console.log(`[esat] Question pool — M1: ${m1Qs.length}, M2: ${m2Qs.length}, Physics: ${physQs.length}`);

  if (m1Qs.length === 0 && m2Qs.length === 0 && physQs.length === 0) {
    console.error("[esat] No classifiable questions (need M/MM/P topic prefixes).");
    return;
  }

  const TOTAL = 20;
  const NOW   = Date.now();

  // M2 is hardest — lower ceiling and harder content
  // Narrative: student starts poorly everywhere, M2 lags slightly behind all session
  const moduleRange = {
    m1:      { lo: 0.22, hi: 0.84 },
    m2:      { lo: 0.14, hi: 0.74 },
    physics: { lo: 0.28, hi: 0.82 },
  };

  const sessions: Session[] = [];
  const attempts: Attempt[] = [];

  for (let i = 0; i < TOTAL; i++) {
    // Space sessions ~1 week apart, with ±half-day jitter
    const completedAt = NOW - (TOTAL - 1 - i) * 7 * DAY_MS + (Math.random() - 0.5) * DAY_MS;
    const sessionDurationMs = (20 + Math.random() * 35) * 60_000; // 20–55 min
    const createdAt = completedAt - sessionDurationMs;

    const sessionId = `debug_seed_${i}_${generateId()}`;

    // Pick questions for this session (allow repeats across sessions — realistic for a practice tool)
    const picked = [
      ...sample(m1Qs,  m1Qs.length  > 0 ? 8 : 0),
      ...sample(m2Qs,  m2Qs.length  > 0 ? 4 : 0),
      ...sample(physQs, physQs.length > 0 ? 8 : 0),
    ];

    const attemptIds: string[] = [];
    let questionElapsed = 0;

    for (const q of picked) {
      const topic = q.taxonomy.primary_topic ?? "";
      const mod = topic.startsWith("MM") ? "m2" : topic.startsWith("M") ? "m1" : "physics";
      const targetAcc = sigmoidAccuracy(i, TOTAL, moduleRange[mod].lo, moduleRange[mod].hi);
      const result = Math.random() < jitter(targetAcc, 0.15) ? "correct" : "incorrect";

      // Time per question: starts slow (~90 s), speeds up to ~40 s
      const avgTimeMs = 90_000 - sigmoidAccuracy(i, TOTAL, 0, 1) * 50_000;
      const timeMs = Math.max(5_000, avgTimeMs + (Math.random() - 0.5) * 30_000);

      const attemptId = `debug_seed_attempt_${generateId()}`;
      attemptIds.push(attemptId);
      questionElapsed += timeMs;

      attempts.push({
        id: attemptId,
        question_id: q.id,
        session_id: sessionId,
        result,
        time_ms: Math.round(timeMs),
        flagged: false,
        timestamp: createdAt + questionElapsed,
      });
    }

    sessions.push({
      id: sessionId,
      created_at: createdAt,
      completed_at: completedAt,
      mode: "mixed" as const,
      config: { question_ids: picked.map(q => q.id), question_count: picked.length },
      attempt_ids: attemptIds,
      state: "completed" as const,
    });
  }

  const tx = database.transaction(["sessions", "attempts"], "readwrite");
  await Promise.all([
    ...sessions.map(s => tx.objectStore("sessions").put(s)),
    ...attempts.map(a => tx.objectStore("attempts").put(a)),
  ]);
  await tx.done;

  await recomputeAllStats();
  console.log(`[esat] Seeded ${TOTAL} synthetic sessions. Reloading...`);
  window.location.reload();
}

// ─── end seed ───────────────────────────────────────────────────────────────

export function registerDebugCommands(): void {
  window.__esat = {
    async wipe() {
      console.log("[esat] Wiping everything...");
      await clearAllData();
      console.log("[esat] Done. Reloading...");
      window.location.reload();
    },
    async wipeProgress() {
      console.log("[esat] Wiping progress data (keeping settings)...");
      await clearProgressData();
      console.log("[esat] Done. Reloading...");
      window.location.reload();
    },
    async storageStatus() {
      const decision = getDecision();
      const persisted = await checkAlreadyPersisted();
      const raw = localStorage.getItem("persistent_storage");
      console.log(
        "[esat] Storage status:\n" +
        `  navigator.storage.persisted() = ${persisted}\n` +
        `  localStorage["persistent_storage"] = ${JSON.stringify(raw)}\n` +
        `  getDecision() = "${decision}"`,
      );
    },
    async seedProgress() {
      await seedProgress();
    },
  };

  console.log(
    "[esat] Debug commands available:\n" +
    "  __esat.wipe()           — clear everything (IndexedDB + localStorage) and reload\n" +
    "  __esat.wipeProgress()   — clear sessions/stats only, keep settings\n" +
    "  __esat.storageStatus()  — show persistent storage state\n" +
    "  __esat.seedProgress()   — seed 20 synthetic sessions (poor→excellent arc) and reload",
  );
}
