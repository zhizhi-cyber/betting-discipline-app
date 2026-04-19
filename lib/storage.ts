import type {
  BetRecord,
  AbandonedRecord,
  UnifiedRecord,
  CompletionStatus,
} from "./types";
import { calcPnl, matchDayStart, matchDayKey, parseKickoff, type AppSettings } from "./types";
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
    maxDailyMatches:         2,
    maxDailyMatchesWeekday:  2,
    maxDailyMatchesWeekend:  3,
    maxDailyWatches:         3,
    dailyLossLimit:          15000,
    monthlyMaxDrawdown:      50000,
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

// ─── Backup / Restore ─────────────────────────────────────────────────────────

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  bets: BetRecord[];
  watches: AbandonedRecord[];
  settings: AppSettings;
}

export function exportAllData(): BackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    bets: load<BetRecord[]>(KEYS.BET_RECORDS, []),
    watches: load<AbandonedRecord[]>(KEYS.ABANDONED_RECORDS, []),
    settings: load<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS),
  };
}

export function importAllData(
  payload: unknown,
  mode: "replace" | "merge" = "replace"
): { bets: number; watches: number } {
  const p = payload as Partial<BackupPayload>;
  if (!p || typeof p !== "object" || !Array.isArray(p.bets) || !Array.isArray(p.watches)) {
    throw new Error("文件格式不正确");
  }

  if (mode === "replace") {
    save(KEYS.BET_RECORDS, p.bets);
    save(KEYS.ABANDONED_RECORDS, p.watches);
    if (p.settings) save(KEYS.SETTINGS, p.settings);
    return { bets: p.bets.length, watches: p.watches.length };
  }

  // merge: union by id, incoming wins on conflict
  const curBets = load<BetRecord[]>(KEYS.BET_RECORDS, []);
  const curWatches = load<AbandonedRecord[]>(KEYS.ABANDONED_RECORDS, []);
  const betMap = new Map(curBets.map((b) => [b.id, b]));
  p.bets.forEach((b) => betMap.set(b.id, b));
  const watchMap = new Map(curWatches.map((w) => [w.id, w]));
  p.watches.forEach((w) => watchMap.set(w.id, w));

  save(KEYS.BET_RECORDS, Array.from(betMap.values()));
  save(KEYS.ABANDONED_RECORDS, Array.from(watchMap.values()));
  return { bets: p.bets.length, watches: p.watches.length };
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
    (a, b) => parseKickoff(b.kickoffTime).getTime() - parseKickoff(a.kickoffTime).getTime()
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
    const kickoff = parseKickoff(r.kickoffTime);
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

// ─── Daily bet limit based on weekday ─────────────────────────────────────────
// Uses match-day anchor (10am boundary) to decide which weekday we're on.
export function dailyBetLimitFor(date: Date = new Date(), settings?: AppSettings): number {
  const s = settings ?? getSettings();
  const rc = s.riskControls;
  const anchor = matchDayStart(date);
  const dow = anchor.getDay(); // 0=Sun, 6=Sat
  const isWeekend = dow === 0 || dow === 6;
  const weekday = rc.maxDailyMatchesWeekday ?? rc.maxDailyMatches ?? 2;
  const weekend = rc.maxDailyMatchesWeekend ?? rc.maxDailyMatches ?? 3;
  return isWeekend ? weekend : weekday;
}

// ─── Lock computation ─────────────────────────────────────────────────────────
// Returns whether betting is currently locked and the reason.
// - daily: accumulated PnL on today's match-day ≤ -dailyLossLimit → lock until next 10am
// - monthly: current-calendar-month cumulative PnL ≤ -monthlyMaxDrawdown → lock 7 days (capped to month end)

export interface LockState {
  locked: boolean;
  reason: "daily_loss" | "monthly_drawdown" | null;
  dailyPnl: number;
  monthlyPnl: number;
  dailyLossLimit: number;
  monthlyMaxDrawdown: number;
  unlockAt?: string;          // ISO; when lock ends
  unlockLabel?: string;       // human readable
}

export function calcLockState(now: Date = new Date(), settings?: AppSettings): LockState {
  const s = settings ?? getSettings();
  const rc = s.riskControls;
  const todayKey = matchDayKey(now);
  const bets = getBetRecords();

  // Daily PnL = sum of settled bet PnL whose match-day === todayKey
  let dailyPnl = 0;
  for (const r of bets) {
    if (!r.result) continue;
    if (matchDayKey(r.kickoffTime) !== todayKey) continue;
    dailyPnl += r.bets.reduce((acc, b) => acc + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
  }

  // Monthly cumulative PnL — calendar month of `now`, by match-day
  const y = now.getFullYear();
  const m = now.getMonth();
  let monthlyPnl = 0;
  for (const r of bets) {
    if (!r.result) continue;
    const d = matchDayStart(r.kickoffTime);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;
    monthlyPnl += r.bets.reduce((acc, b) => acc + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
  }

  const state: LockState = {
    locked: false, reason: null,
    dailyPnl, monthlyPnl,
    dailyLossLimit: rc.dailyLossLimit,
    monthlyMaxDrawdown: rc.monthlyMaxDrawdown,
  };

  // Monthly takes priority (stronger lock)
  if (rc.monthlyMaxDrawdown > 0 && monthlyPnl <= -rc.monthlyMaxDrawdown) {
    state.locked = true;
    state.reason = "monthly_drawdown";
    // 7-day lock, capped to month end
    const unlock = new Date(now);
    unlock.setDate(unlock.getDate() + 7);
    const monthEnd = new Date(y, m + 1, 1); // first day of next month at 00:00
    if (unlock > monthEnd) unlock.setTime(monthEnd.getTime());
    state.unlockAt = unlock.toISOString();
    state.unlockLabel = `${unlock.getMonth() + 1}月${unlock.getDate()}日`;
    return state;
  }

  if (rc.dailyLossLimit > 0 && dailyPnl <= -rc.dailyLossLimit) {
    state.locked = true;
    state.reason = "daily_loss";
    // Unlock at next match-day start (tomorrow 10:00)
    const anchor = matchDayStart(now);
    anchor.setDate(anchor.getDate() + 1);
    state.unlockAt = anchor.toISOString();
    state.unlockLabel = "明日 10:00";
    return state;
  }

  return state;
}

/**
 * 统一口径的封锁文案。月度封锁=整体暂停（不可下注也不可观察）；
 * 当日封锁=仅限观察（不可下注）。各页面统一用这个函数，避免口径漂移。
 */
export function formatLockMessage(lock: LockState): string {
  if (!lock.locked) return "";
  const when = lock.unlockLabel ?? "";
  if (lock.reason === "monthly_drawdown") {
    return `月度亏损达上限，${when} 前暂停下注`;
  }
  return `今日亏损达上限，${when} 前仅限观察`;
}

// ─── Grade win-rate breakdown ─────────────────────────────────────────────────
// Half-win counts 0.5; push excluded from denominator.

export interface GradeWinRate {
  grade: "S" | "A" | "B" | "C";
  rate: number;      // 0-100; NaN if n=0
  sample: number;    // settled-minus-push
  total: number;     // all settled incl push
}

export function calcGradeWinRates(bets: BetRecord[]): GradeWinRate[] {
  const result: Record<string, { wins: number; sample: number; total: number }> = {
    S: { wins: 0, sample: 0, total: 0 },
    A: { wins: 0, sample: 0, total: 0 },
    B: { wins: 0, sample: 0, total: 0 },
    C: { wins: 0, sample: 0, total: 0 },
  };
  for (const r of bets) {
    if (!r.result) continue;
    const bucket = result[r.grade];
    if (!bucket) continue;
    bucket.total++;
    const o = r.result.outcome;
    if (o === "push") continue;
    bucket.sample++;
    if (o === "win") bucket.wins += 1;
    else if (o === "half_win") bucket.wins += 0.5;
    else if (o === "half_loss") bucket.wins += 0; // treat as partial loss = 0
  }
  const order: ("S" | "A" | "B" | "C")[] = ["S", "A", "B", "C"];
  return order.map((g) => {
    const b = result[g];
    return {
      grade: g,
      rate: b.sample > 0 ? (b.wins / b.sample) * 100 : NaN,
      sample: b.sample,
      total: b.total,
    };
  });
}

// ─── Daily PnL series (for bar chart) ─────────────────────────────────────────
// Returns array of { key: yyyy-mm-dd, pnl } grouped by match-day, length === days.
// `endAnchor` is the right-edge match-day anchor (today by default).
export function calcDailyPnlSeries(days: number, endAnchor: Date = matchDayStart(new Date())): { key: string; pnl: number }[] {
  const bets = getBetRecords();
  const out: { key: string; pnl: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endAnchor);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${dd}`;
    let pnl = 0;
    for (const r of bets) {
      if (!r.result) continue;
      if (matchDayKey(r.kickoffTime) !== key) continue;
      pnl += r.bets.reduce((acc, b) => acc + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
    }
    out.push({ key, pnl });
  }
  return out;
}

// ─── Weekly PnL series (for year view bar chart) ──────────────────────────────
// Returns 52 bars ending at the ISO-week containing `endDate`.
export function calcWeeklyPnlSeries(weeks: number, endDate: Date = new Date()): { key: string; pnl: number }[] {
  const bets = getBetRecords();
  // Anchor to Monday 10:00 of current week
  const ws = weekStart(endDate);
  ws.setHours(10, 0, 0, 0);
  const out: { key: string; pnl: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(ws);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const y = start.getFullYear();
    const m = String(start.getMonth() + 1).padStart(2, "0");
    const dd = String(start.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${dd}`;
    let pnl = 0;
    for (const r of bets) {
      if (!r.result) continue;
      const a = matchDayStart(r.kickoffTime);
      if (a < start || a >= end) continue;
      pnl += r.bets.reduce((acc, b) => acc + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
    }
    out.push({ key, pnl });
  }
  return out;
}

// ─── Reset all data ───────────────────────────────────────────────────────────
export function resetAllData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.BET_RECORDS);
  localStorage.removeItem(KEYS.ABANDONED_RECORDS);
  localStorage.removeItem(KEYS.SETTINGS);
}

// ─── Records analytics ────────────────────────────────────────────────────────
// Scoped analytics for a given bet+watch list (already filtered by time range).

export interface RecordsAnalytics {
  // 盘面胜率：剔除走盘（push）后的胜率；半赢 = 0.5 胜、半输 = 0 胜。
  // 分母 = 已结算场次 − 走盘场次。避免让整数让球"走盘是盘口必然"的结构被算作拖后腿。
  winRate: number;
  settledCount: number;
  totalPnl: number;
  totalBet: number;              // 全部本金投入（含 push 退本部分）
  effectiveBet: number;          // 有效投注（剔除走盘与走水退本的本金），用于 ROI
  roi: number;                   // = totalPnl / effectiveBet × 100
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
  // 每个 outcome 下"有效投注比例"（push 走盘 = 0；半赢/半输 = 0.5；其余 = 1）
  const effRatio = (o: string): number => {
    switch (o) {
      case "push":      return 0;
      case "half_win":
      case "half_loss": return 0.5;
      default:          return 1;
    }
  };

  let totalBet = 0;
  let effectiveBet = 0;
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
      const outcome = r.result.outcome;
      const ratio = effRatio(outcome);
      effectiveBet += r.bets.reduce((s, b) => s + b.amount * ratio, 0);
      totalPnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, outcome), 0);
      if (outcome === "win") wins++;
      else if (outcome === "half_win") halfWins++;
      else if (outcome === "push") pushes++;
    }
  }
  // 盘面胜率：分母去掉 push；半赢算 0.5 胜，半输算 0 胜
  const settledNonPush = settledCount - pushes;
  const winRate = settledNonPush > 0
    ? ((wins + halfWins * 0.5) / settledNonPush) * 100
    : 0;
  // ROI 基于有效投注（更反映让球盘真实回报率）
  const roi = effectiveBet > 0 ? (totalPnl / effectiveBet) * 100 : 0;
  const disciplineScore = bets.length > 0 ? ((bets.length - violations) / bets.length) * 100 : 100;

  // Streak (latest consecutive win/loss across settled bets by kickoff time desc)
  const settled = [...bets]
    .filter((r) => !!r.result)
    .sort((a, b) => parseKickoff(b.kickoffTime).getTime() - parseKickoff(a.kickoffTime).getTime());
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

  // Handicap ROI — group by signed line from bettor's perspective:
  // bet matches the side that gives the handicap → "-line" (took favorite)
  // bet opposes that side                         → "+line" (took underdog)
  const hcMap = new Map<string, { bet: number; pnl: number; count: number }>();
  for (const r of bets) {
    const hv = parseFloat(r.handicapValue);
    const sign = r.bettingDirection === r.handicapSide ? "-" : "+";
    const label = isNaN(hv) || hv === 0 ? "平手" : `${sign}${r.handicapValue}`;
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
    effectiveBet,
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
