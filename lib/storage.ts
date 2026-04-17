import type {
  BetRecord,
  AbandonedRecord,
  UnifiedRecord,
  CompletionStatus,
} from "./types";
import { calcPnl, matchDayStart, matchDayKey, type AppSettings } from "./types";
export type { AppSettings } from "./types";

// ─── Keys ─────────────────────────────────────────────────────────────────────

const KEYS = {
  BET_RECORDS:      "bda_bet_records",
  ABANDONED_RECORDS:"bda_abandoned_records",
  SETTINGS:         "bda_settings",
} as const;

// ─── Default Settings ─────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: AppSettings = {
  goals: {
    weeklyTarget:  5000,
    monthlyTarget: 20000,
    yearlyTarget:  200000,
  },
  riskControls: {
    maxDailyMatches:    3,
    maxDailyWatches:    3,
    dailyLossLimit:     15000,
    monthlyMaxDrawdown: 50000,
  },
  gradeAmounts: {
    C: 6000,
    B: 8000,
    A: 15000,
    S: 22000,
  },
  displayPrefs: {
    defaultTimeRange: "month",
  },
};

// ─── Generic helpers ──────────────────────────────────────────────────────────

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota exceeded or private browsing — ignore
  }
}

// ─── Bet Records ──────────────────────────────────────────────────────────────

export function getBetRecords(): BetRecord[] {
  return load<BetRecord[]>(KEYS.BET_RECORDS, []);
}

export function saveBetRecord(record: BetRecord): void {
  const all = getBetRecords();
  const idx = all.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.push(record);
  }
  save(KEYS.BET_RECORDS, all);
}

export function deleteBetRecord(id: string): void {
  const all = getBetRecords().filter((r) => r.id !== id);
  save(KEYS.BET_RECORDS, all);
}

// ─── Abandoned Records ────────────────────────────────────────────────────────

export function getAbandonedRecords(): AbandonedRecord[] {
  return load<AbandonedRecord[]>(KEYS.ABANDONED_RECORDS, []);
}

export function saveAbandonedRecord(record: AbandonedRecord): void {
  const all = getAbandonedRecords();
  const idx = all.findIndex((r) => r.id === record.id);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.push(record);
  }
  save(KEYS.ABANDONED_RECORDS, all);
}

export function deleteAbandonedRecord(id: string): void {
  const all = getAbandonedRecords().filter((r) => r.id !== id);
  save(KEYS.ABANDONED_RECORDS, all);
}

// ─── Unified Timeline ─────────────────────────────────────────────────────────

export function getAllRecords(): UnifiedRecord[] {
  const bets = getBetRecords();
  const abandoned = getAbandonedRecords();
  return [...bets, ...abandoned].sort(
    (a, b) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime()
  );
}

// ─── Auto Pending-Review Detection ───────────────────────────────────────────
// Call on app open; mutates and persists any bet records that should now be "pending_review"

export function syncPendingReview(): string[] {
  const all = getBetRecords();
  const now = new Date();
  const ninetyMin = 90 * 60 * 1000;
  const updated: string[] = [];

  const next = all.map((r) => {
    if (r.result) return r; // already has result
    const kickoff = new Date(r.kickoffTime);
    if (now.getTime() - kickoff.getTime() >= ninetyMin && r.completionStatus === "pristine") {
      updated.push(r.id);
      return { ...r, completionStatus: "pending_review" as CompletionStatus };
    }
    return r;
  });

  if (updated.length > 0) {
    save(KEYS.BET_RECORDS, next);
  }
  return updated;
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export function getSettings(): AppSettings {
  const stored = load<Partial<AppSettings>>(KEYS.SETTINGS, {});
  // Deep-merge with defaults so new fields always exist
  return {
    goals:        { ...DEFAULT_SETTINGS.goals,        ...stored.goals },
    riskControls: { ...DEFAULT_SETTINGS.riskControls, ...stored.riskControls },
    gradeAmounts: { ...DEFAULT_SETTINGS.gradeAmounts, ...stored.gradeAmounts },
    displayPrefs: { ...DEFAULT_SETTINGS.displayPrefs, ...stored.displayPrefs },
  };
}

export function saveSettings(settings: AppSettings): void {
  save(KEYS.SETTINGS, settings);
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

function calcBetListStats(bets: import("./types").BetRecord[]) {
  let totalBet = 0;
  let totalPnl = 0;
  let settled = 0;
  let pendingReviewCount = 0;
  for (const r of bets) {
    const amt = r.bets.reduce((s, b) => s + b.amount, 0);
    totalBet += amt;
    if (r.result) {
      const pnl = r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
      totalPnl += pnl;
      settled++;
    }
    if (r.completionStatus === "pending_review") pendingReviewCount++;
  }
  const roi = totalBet > 0 ? (totalPnl / totalBet) * 100 : 0;
  return { totalBet, totalPnl, roi, settled, total: bets.length, pendingReviewCount };
}

export function calcMonthStats(year: number, month: number) {
  // Month boundary follows match-day (10am) — kickoff attributed by matchDayStart().
  const bets = getBetRecords().filter((r) => {
    const a = matchDayStart(r.kickoffTime);
    return a.getFullYear() === year && a.getMonth() + 1 === month;
  });
  return calcBetListStats(bets);
}

export function calcYearStats(year: number) {
  const bets = getBetRecords().filter((r) => matchDayStart(r.kickoffTime).getFullYear() === year);
  return calcBetListStats(bets);
}

export function calcAllTimeStats() {
  return calcBetListStats(getBetRecords());
}

// ─── Week stats ───────────────────────────────────────────────────────────────
// Week starts Monday. weekStartDate is ISO yyyy-mm-dd of that Monday.

import { weekStart } from "./types";

export function calcWeekStats(weekStartDate: Date) {
  // Week bounds use match-day anchors: Monday 10:00 → next Monday 10:00
  const ws = weekStart(weekStartDate);
  ws.setHours(10, 0, 0, 0);
  const end = new Date(ws);
  end.setDate(end.getDate() + 7);
  const bets = getBetRecords().filter((r) => {
    const a = matchDayStart(r.kickoffTime);
    return a >= ws && a < end;
  });
  return calcBetListStats(bets);
}

// ─── Daily counters ───────────────────────────────────────────────────────────

export function countToday(): { bets: number; watches: number } {
  // "Today" = current match-day (10am → next 10am boundary).
  const todayKey = matchDayKey(new Date());
  const bets = getBetRecords().filter((r) => matchDayKey(r.kickoffTime) === todayKey).length;
  const watches = getAbandonedRecords().filter((r) => matchDayKey(r.kickoffTime) === todayKey).length;
  return { bets, watches };
}

// ─── Records analytics ────────────────────────────────────────────────────────
// Scoped analytics for a given bet+watch list (already filtered by time range).

export interface RecordsAnalytics {
  winRate: number;              // % of settled bets that are win / half_win (push counts 0.5)
  settledCount: number;
  totalPnl: number;
  totalBet: number;
  roi: number;
  disciplineScore: number;       // % of non-violation bets
  violationCount: number;
  streak: { type: "win" | "loss" | "none"; count: number };
  handicapRoi: { label: string; bet: number; pnl: number; roi: number; count: number }[]; // top 5
  errorTop: { err: string; count: number }[];
  watchConversion: {
    watchedThenAbandoned: { count: number; correct: number; rate: number };  // observed and stayed abandoned — rate = would-be-correct
    watchedThenBet: { count: number; win: number; rate: number };             // observed then promoted to bet
  };
}

export function calcRecordsAnalytics(bets: BetRecord[], watches: AbandonedRecord[]): RecordsAnalytics {
  // Settled & pnl
  let totalBet = 0;
  let totalPnl = 0;
  let settledCount = 0;
  let wins = 0;
  let halfWins = 0;
  let pushes = 0;
  let violations = 0;

  for (const r of bets) {
    if (r.isDisciplineViolation) violations++;
    totalBet += r.bets.reduce((s, b) => s + b.amount, 0);
    if (r.result) {
      settledCount++;
      totalPnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
      if (r.result.outcome === "win") wins++;
      else if (r.result.outcome === "half_win") halfWins++;
      else if (r.result.outcome === "push") pushes++;
    }
  }
  const winRate = settledCount > 0
    ? ((wins + halfWins * 0.5 + pushes * 0.5) / settledCount) * 100
    : 0;
  const roi = totalBet > 0 ? (totalPnl / totalBet) * 100 : 0;
  const disciplineScore = bets.length > 0 ? ((bets.length - violations) / bets.length) * 100 : 100;

  // Streak (latest consecutive win/loss across settled bets by kickoff time desc)
  const settled = [...bets]
    .filter((r) => !!r.result)
    .sort((a, b) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime());
  let streak: RecordsAnalytics["streak"] = { type: "none", count: 0 };
  if (settled.length > 0) {
    const first = settled[0].result!.outcome;
    const isWin = first === "win" || first === "half_win";
    const isLoss = first === "loss" || first === "half_loss";
    if (isWin || isLoss) {
      const type = isWin ? "win" : "loss";
      let count = 0;
      for (const r of settled) {
        const o = r.result!.outcome;
        const match = type === "win"
          ? (o === "win" || o === "half_win")
          : (o === "loss" || o === "half_loss");
        if (match) count++;
        else break;
      }
      streak = { type, count };
    }
  }

  // Handicap ROI — group by "主让0.5"/"客让0.75" label
  const hcMap = new Map<string, { bet: number; pnl: number; count: number }>();
  for (const r of bets) {
    const label = `${r.handicapSide === "home" ? "主让" : "客让"}${r.handicapValue}`;
    const amt = r.bets.reduce((s, b) => s + b.amount, 0);
    const pnl = r.result ? r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0) : 0;
    const cur = hcMap.get(label) ?? { bet: 0, pnl: 0, count: 0 };
    cur.bet += amt; cur.pnl += pnl; cur.count += 1;
    hcMap.set(label, cur);
  }
  const handicapRoi = Array.from(hcMap.entries())
    .map(([label, v]) => ({ label, ...v, roi: v.bet > 0 ? (v.pnl / v.bet) * 100 : 0 }))
    .sort((a, b) => b.bet - a.bet)
    .slice(0, 5);

  // Error top
  const errMap = new Map<string, number>();
  for (const r of bets) {
    if (!r.result?.errors) continue;
    for (const e of r.result.errors) {
      errMap.set(e, (errMap.get(e) ?? 0) + 1);
    }
  }
  const errorTop = Array.from(errMap.entries())
    .map(([err, count]) => ({ err, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Watch conversion
  //  - watchedThenAbandoned: stayed in watch pool, reviewed (abandon_correct = would-be-correct)
  //  - watchedThenBet: promoted, outcome win/half_win counts
  let abandonReviewed = 0, abandonCorrect = 0;
  for (const w of watches) {
    if (w.promotedToBetId) continue;
    if (w.reviewConclusion) {
      abandonReviewed++;
      if (w.reviewConclusion === "abandon_correct" || w.reviewConclusion === "no_regret") abandonCorrect++;
    }
  }
  const promotedIds = new Set(watches.filter((w) => w.promotedToBetId).map((w) => w.promotedToBetId!));
  let promotedSettled = 0, promotedWins = 0;
  for (const r of bets) {
    if (!promotedIds.has(r.id)) continue;
    if (!r.result) continue;
    promotedSettled++;
    if (r.result.outcome === "win" || r.result.outcome === "half_win") promotedWins++;
  }

  return {
    winRate,
    settledCount,
    totalPnl,
    totalBet,
    roi,
    disciplineScore,
    violationCount: violations,
    streak,
    handicapRoi,
    errorTop,
    watchConversion: {
      watchedThenAbandoned: {
        count: abandonReviewed,
        correct: abandonCorrect,
        rate: abandonReviewed > 0 ? (abandonCorrect / abandonReviewed) * 100 : 0,
      },
      watchedThenBet: {
        count: promotedSettled,
        win: promotedWins,
        rate: promotedSettled > 0 ? (promotedWins / promotedSettled) * 100 : 0,
      },
    },
  };
}

// ─── Promote watch → bet ──────────────────────────────────────────────────────

export function promoteWatchToBet(watchId: string, newBet: BetRecord): void {
  const all = getAbandonedRecords();
  const w = all.find((r) => r.id === watchId);
  if (w) {
    const updated = all.map((r) =>
      r.id === watchId ? { ...r, promotedToBetId: newBet.id } : r
    );
    save(KEYS.ABANDONED_RECORDS, updated);
  }
  saveBetRecord({ ...newBet, convertedFromWatchId: watchId });
}
