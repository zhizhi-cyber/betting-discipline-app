import type {
  BetRecord,
  AbandonedRecord,
  UnifiedRecord,
  CompletionStatus,
  HandicapDeduction,
  HandicapValue,
  BettingDirection,
} from "./types";
import { calcPnl, matchDayStart, matchDayKey, parseKickoff, errorWeightOf, type AppSettings } from "./types";
export type { AppSettings } from "./types";

// ─── Keys ─────────────────────────────────────────────────────────────────────

const KEYS = {
  BET_RECORDS:      "bda_bet_records",
  ABANDONED_RECORDS:"bda_abandoned_records",
  SETTINGS:         "bda_settings",
  LAST_WEEKLY_DIGEST: "bda_last_weekly_digest",  // YYYY-MM-DD of last time weekly digest was shown
  SCREENING_POOL:   "bda_screening_pool",        // 快筛今日候选池
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
    cooldownMinutes:         30,
    winStreakAlert:          3,
    abnormalAmountMultiplier: 3,
  },
  capital: {
    principal: 0,
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
    capital:      { ...DEFAULT_SETTINGS.capital!,     ...(stored.capital || {}) },
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
  reason: "daily_loss" | "monthly_drawdown" | "loss_streak_3" | "loss_streak_5" | null;
  dailyPnl: number;
  monthlyPnl: number;
  dailyLossLimit: number;
  monthlyMaxDrawdown: number;
  unlockAt?: string;          // ISO; when lock ends
  unlockLabel?: string;       // human readable
  /** 连败锁触发时的连败场次（用于 UI 显示） */
  lossStreak?: number;
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
    // 触发日限额 → 强制休息一整天：锁到后天 10:00（跳过当日剩余场次 + 完整一天）
    const anchor = matchDayStart(now);
    anchor.setDate(anchor.getDate() + 2);
    state.unlockAt = anchor.toISOString();
    const mm = anchor.getMonth() + 1;
    const dd = anchor.getDate();
    state.unlockLabel = `${mm}月${dd}日 10:00`;
    return state;
  }

  // 连败硬锁（连胜只是 soft warning，连败才是追损风险）
  //  递增规则：连败 3 → 锁 1 天；之后每再 2 场连败 +1 天
  //   streak=3,4 → 1 天
  //   streak=5,6 → 2 天
  //   streak=7,8 → 3 天
  //  "从次日起算 N 天" ⇒ unlockAt = 今天 10:00 + (N + 1) 天
  const streak = calcLossStreak(bets);
  if (streak >= 3) {
    const lockDays = 1 + Math.floor((streak - 3) / 2);
    state.locked = true;
    state.lossStreak = streak;
    const anchor = matchDayStart(now); // 今天 10:00
    anchor.setDate(anchor.getDate() + lockDays + 1);
    state.unlockAt = anchor.toISOString();
    state.unlockLabel = `${anchor.getMonth() + 1}月${anchor.getDate()}日 10:00`;
    // 简化为单一 reason；文案用 lossStreak 动态生成
    state.reason = streak >= 5 ? "loss_streak_5" : "loss_streak_3";
    return state;
  }

  return state;
}

/** 近期已结算单按下注时间倒序，取首段连败长度（含输半；走盘忽略不打断）。 */
function calcLossStreak(bets: BetRecord[]): number {
  const settled = bets
    .filter((b) => b.result)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.bets[0]?.betTime || a.createdAt).getTime();
      const tb = new Date(b.bets[0]?.betTime || b.createdAt).getTime();
      return tb - ta;
    });
  let n = 0;
  for (const b of settled) {
    const o = b.result!.outcome;
    if (o === "push") continue;
    if (o === "loss" || o === "half_loss") n++;
    else break;
  }
  return n;
}

/** 冷静期倒计时：仅最近一笔"输/输半"在 cooldownMinutes 以内才 active。 */
export function calcCooldownRemaining(
  now: Date = new Date(),
  settings?: AppSettings
): { active: boolean; remainingMin: number; remainingSec: number; activeUntilISO: string | null } {
  const s = settings ?? getSettings();
  const cd = s.riskControls.cooldownMinutes ?? 30;
  if (cd <= 0) return { active: false, remainingMin: 0, remainingSec: 0, activeUntilISO: null };
  const bets = getBetRecords();
  const sortedSettled = bets
    .filter((b) => b.result)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.bets[0]?.betTime || a.createdAt).getTime();
      const tb = new Date(b.bets[0]?.betTime || b.createdAt).getTime();
      return tb - ta;
    });
  const lastLoss = sortedSettled.find(
    (b) => b.result!.outcome === "loss" || b.result!.outcome === "half_loss"
  );
  if (!lastLoss) return { active: false, remainingMin: 0, remainingSec: 0, activeUntilISO: null };
  const t = new Date(lastLoss.bets[0]?.betTime || lastLoss.createdAt).getTime();
  const until = t + cd * 60000;
  const remainingMs = until - now.getTime();
  if (remainingMs <= 0) return { active: false, remainingMin: 0, remainingSec: 0, activeUntilISO: null };
  return {
    active: true,
    remainingMin: Math.ceil(remainingMs / 60000),
    remainingSec: Math.ceil(remainingMs / 1000),
    activeUntilISO: new Date(until).toISOString(),
  };
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
  if (lock.reason === "loss_streak_5" || lock.reason === "loss_streak_3") {
    const streak = lock.lossStreak ?? 3;
    const days = 1 + Math.floor((streak - 3) / 2);
    return `连败 ${streak} 场，强制休息 ${days} 天（至 ${when}）`;
  }
  // daily_loss 现在强制休息一整天（锁到后天 10:00）
  return `今日亏损达上限，强制休息至 ${when}（期间不得下注与补录）`;
}

// ─── 行为违纪探测（C5）────────────────────────────────────────────────────
/**
 * 除了"超建议金额"和"观察转下注"之外的行为型违纪：
 *  - 连败追损：近 2 场已结算单都输（含输半）且本次下注额大于它们的最大值
 *  - 临开赛冲动：距开赛 < 10 分钟
 *  - 同场重复：同一 match-day 内对同对阵已经下过单
 * 仅返回原因数组；调用方与既有的 "超建议金额 / 观察转下注" 合并成最终 violation 描述。
 */
export function detectBehavioralViolations(params: {
  amount: number;
  kickoffISO: string;
  homeTeam: string;
  awayTeam: string;
  now?: Date;
  existingBets?: BetRecord[];
  /** 编辑模式：把自己这条记录排除掉，避免「同场重复」把自己算进去（照镜子问题）。 */
  excludeId?: string;
}): string[] {
  const now = params.now ?? new Date();
  const allBets = params.existingBets ?? getBetRecords();
  const bets = params.excludeId ? allBets.filter((b) => b.id !== params.excludeId) : allBets;
  const reasons: string[] = [];

  // 1) 连败追损：按下注时间倒序取最近 2 条已结算，都负且本次金额更大
  const settled = bets
    .filter((b) => b.result && (b.result.outcome === "loss" || b.result.outcome === "half_loss"))
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.bets[0]?.betTime || a.createdAt).getTime();
      const tb = new Date(b.bets[0]?.betTime || b.createdAt).getTime();
      return tb - ta;
    });
  // 还要保证这两条是连续的（中间没有赢过）
  const lastTwoSettled = bets
    .filter((b) => b.result)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.bets[0]?.betTime || a.createdAt).getTime();
      const tb = new Date(b.bets[0]?.betTime || b.createdAt).getTime();
      return tb - ta;
    })
    .slice(0, 2);
  const bothLoss = lastTwoSettled.length === 2 && lastTwoSettled.every(
    (b) => b.result!.outcome === "loss" || b.result!.outcome === "half_loss"
  );
  if (bothLoss) {
    const prevMax = Math.max(
      ...lastTwoSettled.map((b) => b.bets.reduce((s, x) => s + x.amount, 0))
    );
    if (params.amount > prevMax) {
      reasons.push(`连败追损（前 2 场都输，本次 ¥${params.amount.toLocaleString()} > 前两场最大 ¥${prevMax.toLocaleString()}）`);
    }
    void settled; // silence unused
  }

  // 2) 临开赛冲动：< 10 分钟
  const kickoff = new Date(params.kickoffISO).getTime();
  const diffMin = (kickoff - now.getTime()) / 60000;
  if (diffMin >= 0 && diffMin < 10) {
    reasons.push(`临开赛冲动（距开赛 ${Math.round(diffMin)} 分钟）`);
  }

  // 3) 同场重复：同 match-day + 同对阵已有单
  const newDay = matchDayKey(params.kickoffISO);
  const dup = bets.find(
    (b) =>
      matchDayKey(b.kickoffTime) === newDay &&
      ((b.homeTeam === params.homeTeam && b.awayTeam === params.awayTeam) ||
       (b.homeTeam === params.awayTeam && b.awayTeam === params.homeTeam))
  );
  if (dup) {
    reasons.push("同场重复下注（同一对阵已经下过）");
  }

  return reasons;
}

// ─── 软提示探测 (心理防线) ────────────────────────────────────────────────
/**
 * 返回"软提示"字符串数组——不阻塞下注，只在下注前弹出提醒。
 * 用户看到后可继续下注；若继续，最终违纪原因里不会带上这些。
 *  - 冷静期：距最近一笔"输/输半"结算完成时间不足 N 分钟（默认 30）
 *  - 连胜警告：近 N 场已结算连赢（含赢半、排除走盘）
 *  - 异常金额：当笔金额 > 近 30 单均值 × 倍数
 */
export function detectSoftWarnings(params: {
  amount: number;
  now?: Date;
  settings?: AppSettings;
  existingBets?: BetRecord[];
  excludeId?: string;
}): string[] {
  const now = params.now ?? new Date();
  const s = params.settings ?? getSettings();
  const rc = s.riskControls;
  const allBets = params.existingBets ?? getBetRecords();
  const bets = params.excludeId ? allBets.filter((b) => b.id !== params.excludeId) : allBets;
  const warnings: string[] = [];

  // 按下注时间倒序
  const sortedSettled = bets
    .filter((b) => b.result)
    .slice()
    .sort((a, b) => {
      const ta = new Date(a.bets[0]?.betTime || a.createdAt).getTime();
      const tb = new Date(b.bets[0]?.betTime || b.createdAt).getTime();
      return tb - ta;
    });

  // 1) 冷静期：最近一笔"输/输半"发生在 cooldownMinutes 以内
  const cooldownMin = rc.cooldownMinutes ?? 30;
  if (cooldownMin > 0) {
    const lastLoss = sortedSettled.find(
      (b) => b.result!.outcome === "loss" || b.result!.outcome === "half_loss"
    );
    if (lastLoss) {
      const t = new Date(lastLoss.bets[0]?.betTime || lastLoss.createdAt).getTime();
      const elapsedMin = (now.getTime() - t) / 60000;
      if (elapsedMin >= 0 && elapsedMin < cooldownMin) {
        const wait = Math.ceil(cooldownMin - elapsedMin);
        warnings.push(`冷静期未过（刚输完 ${Math.round(elapsedMin)} 分钟，建议再等 ${wait} 分钟）`);
      }
    }
  }

  // 2) 连胜警告
  const streakThreshold = rc.winStreakAlert ?? 3;
  if (streakThreshold > 0) {
    let streak = 0;
    for (const b of sortedSettled) {
      const o = b.result!.outcome;
      if (o === "push") continue; // 走盘不打断也不计入
      if (o === "win" || o === "half_win") streak++;
      else break;
    }
    if (streak >= streakThreshold) {
      warnings.push(`连赢已 ${streak} 场（警惕膨胀，建议维持平常金额）`);
    }
  }

  // 3) 异常金额：近 30 单均值
  const mult = rc.abnormalAmountMultiplier ?? 3;
  if (mult > 0) {
    const recent = bets
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.bets[0]?.betTime || a.createdAt).getTime();
        const tb = new Date(b.bets[0]?.betTime || b.createdAt).getTime();
        return tb - ta;
      })
      .slice(0, 30);
    if (recent.length >= 5) {
      const sum = recent.reduce(
        (acc, b) => acc + b.bets.reduce((s, x) => s + x.amount, 0),
        0
      );
      const avg = sum / recent.length;
      if (avg > 0 && params.amount > avg * mult) {
        warnings.push(`金额异常偏大（近 ${recent.length} 单均值 ¥${Math.round(avg).toLocaleString()}，本次 ¥${params.amount.toLocaleString()} > ${mult} 倍）`);
      }
    }
  }

  return warnings;
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
  /** 带严重度权重的失误 top；weight=1 轻/2 中/3 重 */
  errorTop: { err: string; count: number; weight: 1 | 2 | 3 }[];
  /** 加权平均失误严重度（已结算样本；无数据为 null） */
  avgErrorSeverity: number | null;
  watchConversion: {
    watchedThenAbandoned: { count: number; correct: number; rate: number };  // observed and stayed abandoned — rate = would-be-correct
    watchedThenBet: { count: number; win: number; rate: number };             // observed then promoted to bet
  };
  /** 平均提前下单分钟数 (kickoff - betTime, 仅已结算有 betTime 的) */
  avgLeadMinutes: number | null;
  /** 赛前时长分桶：早盘 >4h / 近赛 1-4h / 临盘 <1h（胜率与 ROI 同主口径） */
  leadBuckets: {
    early: { count: number; settled: number; winRate: number; roi: number };
    near:  { count: number; settled: number; winRate: number; roi: number };
    last:  { count: number; settled: number; winRate: number; roi: number };
  };
  /** 深夜单 (00:00-06:00) 的对照统计 */
  lateNight: {
    count: number;
    settled: number;
    winRate: number;   // 盘面胜率（与主胜率同口径）
    roi: number;       // 基于有效投注
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

  // Error top — 加权排序（weight × count），权重来自 ERROR_WEIGHTS
  const errMap = new Map<string, number>();
  let totalErrWeight = 0;
  let totalErrCount = 0;
  for (const r of bets) {
    if (!r.result?.errors) continue;
    for (const e of r.result.errors) {
      errMap.set(e, (errMap.get(e) ?? 0) + 1);
      totalErrWeight += errorWeightOf(e);
      totalErrCount += 1;
    }
  }
  const errorTop = Array.from(errMap.entries())
    .map(([err, count]) => ({ err, count, weight: errorWeightOf(err) }))
    .sort((a, b) => (b.count * b.weight) - (a.count * a.weight))
    .slice(0, 5);
  const avgErrorSeverity = totalErrCount > 0 ? totalErrWeight / totalErrCount : null;

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
  // 平均赛前下单时长（分钟）：基于第一笔 betTime 和 kickoffTime 之差，取已结算单样本
  let leadSum = 0;
  let leadN = 0;
  for (const r of bets) {
    const bt = r.bets[0]?.betTime;
    if (!bt) continue;
    const kt = new Date(r.kickoffTime).getTime();
    const bTime = new Date(bt).getTime();
    const diff = (kt - bTime) / 60000;
    if (diff > 0 && diff < 60 * 24 * 7) { // 过滤异常（负/> 7 天）
      leadSum += diff;
      leadN++;
    }
  }
  const avgLeadMinutes = leadN > 0 ? leadSum / leadN : null;

  // 赛前时长分桶：early >4h / near 1-4h / last <1h
  type LB = { count: number; settled: number; wins: number; halfWins: number; push: number; effBet: number; pnl: number };
  const mk = (): LB => ({ count: 0, settled: 0, wins: 0, halfWins: 0, push: 0, effBet: 0, pnl: 0 });
  const lb = { early: mk(), near: mk(), last: mk() };
  for (const r of bets) {
    const bt = r.bets[0]?.betTime;
    if (!bt) continue;
    const diffMin = (new Date(r.kickoffTime).getTime() - new Date(bt).getTime()) / 60000;
    if (!(diffMin > 0 && diffMin < 60 * 24 * 7)) continue;
    const bucket = diffMin > 240 ? lb.early : diffMin >= 60 ? lb.near : lb.last;
    bucket.count++;
    if (r.result) {
      bucket.settled++;
      const o = r.result.outcome;
      const ratio = effRatio(o);
      bucket.effBet += r.bets.reduce((s, b) => s + b.amount * ratio, 0);
      bucket.pnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, o), 0);
      if (o === "win") bucket.wins++;
      else if (o === "half_win") bucket.halfWins++;
      else if (o === "push") bucket.push++;
    }
  }
  const finalizeBucket = (b: LB) => {
    const nonPush = b.settled - b.push;
    return {
      count: b.count,
      settled: b.settled,
      winRate: nonPush > 0 ? ((b.wins + b.halfWins * 0.5) / nonPush) * 100 : 0,
      roi: b.effBet > 0 ? (b.pnl / b.effBet) * 100 : 0,
    };
  };
  const leadBuckets = {
    early: finalizeBucket(lb.early),
    near:  finalizeBucket(lb.near),
    last:  finalizeBucket(lb.last),
  };

  // 深夜单统计（00:00-06:00 根据 betTime）
  let lnCount = 0, lnSettled = 0, lnWins = 0, lnHalfWins = 0, lnPush = 0;
  let lnEffBet = 0, lnPnl = 0;
  for (const r of bets) {
    const bt = r.bets[0]?.betTime;
    if (!bt) continue;
    const h = new Date(bt).getHours();
    if (!(h >= 0 && h < 6)) continue;
    lnCount++;
    if (r.result) {
      lnSettled++;
      const o = r.result.outcome;
      const ratio = effRatio(o);
      lnEffBet += r.bets.reduce((s, b) => s + b.amount * ratio, 0);
      lnPnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, o), 0);
      if (o === "win") lnWins++;
      else if (o === "half_win") lnHalfWins++;
      else if (o === "push") lnPush++;
    }
  }
  const lnNonPush = lnSettled - lnPush;
  const lnWinRate = lnNonPush > 0 ? ((lnWins + lnHalfWins * 0.5) / lnNonPush) * 100 : 0;
  const lnRoi = lnEffBet > 0 ? (lnPnl / lnEffBet) * 100 : 0;

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
    avgLeadMinutes,
    leadBuckets,
    avgErrorSeverity,
    lateNight: {
      count: lnCount,
      settled: lnSettled,
      winRate: lnWinRate,
      roi: lnRoi,
    },
  };
}

// ─── 周简报触发判定 ────────────────────────────────────────────────────────
/**
 * 是否应显示本周周简报：
 *  - 本地时间：周日（getDay()===0）22:00 以后
 *  - 且本周尚未显示过（以 Monday-anchored week key 记忆）
 * 返回 true 时调用方应弹窗；用户关闭后调用 markWeeklyDigestSeen()。
 */
export function shouldShowWeeklyDigest(now: Date = new Date()): boolean {
  const dow = now.getDay();
  const hr = now.getHours();
  // 周日 22:00 以后，或周一 10:00 之前（跨过去后补弹一次）
  const inWindow = (dow === 0 && hr >= 22) || (dow === 1 && hr < 10);
  if (!inWindow) return false;
  if (typeof window === "undefined") return false;
  try {
    const last = localStorage.getItem(KEYS.LAST_WEEKLY_DIGEST);
    const wk = weekKey(now);
    return last !== wk;
  } catch {
    return false;
  }
}

export function markWeeklyDigestSeen(now: Date = new Date()): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEYS.LAST_WEEKLY_DIGEST, weekKey(now));
  } catch {
    // ignore
  }
}

function weekKey(d: Date): string {
  const ws = weekStart(d);
  return `${ws.getFullYear()}-W-${ws.getMonth() + 1}-${ws.getDate()}`;
}

// ─── 今日候选池 (快筛模式) ────────────────────────────────────────────────
export interface ScreeningItem {
  id: string;
  createdAt: string;
  matchDayKey: string;          // 归属 match-day，用于"今日"过滤
  matchName?: string;
  homeTeam?: string;
  awayTeam?: string;
  kickoffTime?: string;

  // 盘口信息（可选；深挖时预填 review）
  handicapSide?: "home" | "away";
  handicapValue?: HandicapValue;
  bettingDirection?: BettingDirection;

  // 盘口推演（核心）—— 来自 review 页的 HandicapDeduction
  deduction?: HandicapDeduction;

  // 变盘（选填，与 review 页同口径）
  openHandicap?: string;
  openOdds?: number;
  closeHandicap?: string;
  closeOdds?: number;

  // 旧版 A/B/C 三问（仅保留兼容读取，新数据不再写）
  reliability?: "A" | "B" | "C";
  trap?:        "A" | "B" | "C";
  bookie?:      "A" | "B" | "C";

  bucket: "dig" | "gray" | "pass";  // 手动选：深挖 / 灰色 / 放弃
  note?: string;
  promotedToBetId?: string;     // 如已深挖到完整复盘，记录链路
}

export function getScreeningPool(): ScreeningItem[] {
  return load<ScreeningItem[]>(KEYS.SCREENING_POOL, []);
}

export function saveScreeningItem(item: ScreeningItem): void {
  const all = getScreeningPool();
  const idx = all.findIndex((x) => x.id === item.id);
  if (idx >= 0) all[idx] = item;
  else all.push(item);
  save(KEYS.SCREENING_POOL, all);
}

export function deleteScreeningItem(id: string): void {
  save(KEYS.SCREENING_POOL, getScreeningPool().filter((x) => x.id !== id));
}

export function clearScreeningPool(): void {
  save(KEYS.SCREENING_POOL, []);
}

/** 扫盘条目是否已过期：>24h 未深挖 & 非 pass → 该归档到历史。 */
export function isScreeningStale(item: ScreeningItem, now: Date = new Date()): boolean {
  if (item.promotedToBetId) return false;
  if (item.bucket === "pass") return false;
  const age = now.getTime() - new Date(item.createdAt).getTime();
  return age > 24 * 60 * 60 * 1000;
}

/** 旧版 A/B/C bucket 判定（保留供历史数据读取） */
export function screeningBucket(r: "A"|"B"|"C", t: "A"|"B"|"C", b: "A"|"B"|"C"): "dig" | "gray" | "pass" {
  if (r === "B" || t === "B" || b === "B") return "pass";
  if (r === "A" && t === "A" && b === "A") return "dig";
  return "gray";
}

/**
 * 根据盘口推演自动推荐 bucket（用户可覆盖）
 * 规则：suspectedTrap → pass；信心度 ≥4 → dig；否则 gray。
 */
export function suggestBucketFromDeduction(d: HandicapDeduction | undefined): "dig" | "gray" | "pass" {
  if (!d) return "gray";
  if (d.suspectedTrap) return "pass";
  if (d.confidence >= 4) return "dig";
  return "gray";
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
