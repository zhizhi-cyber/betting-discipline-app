import type {
  BetRecord,
  AbandonedRecord,
  UnifiedRecord,
  CompletionStatus,
} from "./types";
import { calcPnl, type AppSettings } from "./types";
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

export function calcMonthStats(year: number, month: number) {
  const bets = getBetRecords().filter((r) => {
    const d = new Date(r.kickoffTime);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });

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
