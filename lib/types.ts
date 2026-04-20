// ─── Primitives ───────────────────────────────────────────────────────────────

export type Outcome = "win" | "half_win" | "push" | "half_loss" | "loss";
export type Grade = "S" | "A" | "B" | "C";
export type ReviewConclusion = "abandon_correct" | "abandon_wrong" | "no_regret";
export type BettingDirection = "home" | "away";
export type CompletionStatus = "pristine" | "pending_review" | "pending_improve" | "complete";

// Post-match "事后印证" verdict on personal analysis
export type AnalysisVerdict = "accurate" | "passable" | "off";

// ─── Sub-dimension framework ──────────────────────────────────────────────────
// Each score category has sub-dimensions. User picks A/B/C per sub-dim, then
// assigns the category score 0/1/2 manually.

export type SubdimChoice = "A" | "B" | "C" | "";

export interface SubdimConfig {
  key: string;
  label: string;
  optionA: string;
  optionB: string;
  optionC: string;
  // Whether A/B map to home/away (for signal summary); if false, excluded from summary
  sidedMapping: boolean;
}

export const SUBDIMS: Record<string, SubdimConfig[]> = {
  fundamental: [
    { key: "form",      label: "状态",       optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "motivation",label: "战意",       optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "strength",  label: "强弱",       optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "legacy",    label: "历史形象",   optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "heat",      label: "冷热度",     optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "injuries",  label: "伤停形势",   optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "h2h",       label: "对阵历史",   optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
  ],
  odds: [
    { key: "opening",   label: "开盘倾向",   optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "movement",  label: "变盘倾向",   optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "water",     label: "水位偏向",   optionA: "主队", optionB: "客队", optionC: "均衡", sidedMapping: true },
    { key: "depth",     label: "盘口深浅",   optionA: "深",   optionB: "浅",   optionC: "均衡", sidedMapping: false },
  ],
  reliability: [
    { key: "info",      label: "信息完整度", optionA: "充分", optionB: "不足", optionC: "部分", sidedMapping: false },
    { key: "clarity",   label: "思路清晰度", optionA: "清楚", optionB: "模糊", optionC: "部分", sidedMapping: false },
    { key: "margin",    label: "安全边界",   optionA: "足够", optionB: "不足", optionC: "勉强", sidedMapping: false },
    { key: "impulse",   label: "是否冲动",   optionA: "是",   optionB: "否",   optionC: "有一点", sidedMapping: false },
    { key: "shouldWatch",label:"是否该转观察",optionA: "是",   optionB: "否",   optionC: "保持疑虑", sidedMapping: false },
  ],
  trap: [
    { key: "trap",      label: "诱盘嫌疑",   optionA: "无",   optionB: "有",   optionC: "可疑", sidedMapping: false },
    { key: "juice",     label: "抽水嫌疑",   optionA: "无",   optionB: "有",   optionC: "可疑", sidedMapping: false },
  ],
  bookie: [
    { key: "stance",    label: "立场清晰度", optionA: "偏主", optionB: "偏客", optionC: "暧昧", sidedMapping: true },
    { key: "direction", label: "庄家方向",   optionA: "利主", optionB: "利客", optionC: "暧昧", sidedMapping: true },
    { key: "heatFollow",label: "热度迎合",   optionA: "迎合热度", optionB: "反热门", optionC: "立场不明", sidedMapping: false },
    { key: "confidence",label: "庄家信心度", optionA: "没疑虑", optionB: "有疑虑", optionC: "暧昧", sidedMapping: false },
  ],
};

// ─── 子维度 → 质量分映射（仅质量型维度） ────────────────────────────────────
// 每个子维度把 A/B/C 答案映射到 0/1/2 的"质量分"（越高越好）。
// 不在此表中的维度（fundamental / odds）视为"方向型"维度，不做质量上限锁。
// 用户仍可在 0/1/2 三档里手动打总分，但最终 score 会被 clamp 到子维度推出的上限。
export const SUBDIM_QUALITY: Record<string, Record<string, { A: 0|1|2; B: 0|1|2; C: 0|1|2 }>> = {
  reliability: {
    info:        { A: 2, B: 0, C: 1 },  // 信息：充分=好
    clarity:     { A: 2, B: 1, C: 1 },  // 思路：清楚=好，模糊≠差（老手也在模糊局里找价值，只需谨慎不是淘汰）
    margin:      { A: 2, B: 0, C: 1 },  // 安全边界：足够=好
    impulse:     { A: 0, B: 2, C: 1 },  // 冲动：是=差（反向）
    shouldWatch: { A: 0, B: 2, C: 1 },  // 应转观察：是=差（反向）
  },
  trap: {
    trap:  { A: 2, B: 0, C: 1 },   // 诱盘嫌疑：无=好
    juice: { A: 2, B: 0, C: 1 },   // 抽水嫌疑：无=好
  },
  bookie: {
    stance:     { A: 2, B: 2, C: 0 },  // 立场清晰度：偏主/偏客都清晰=好，暧昧=0
    direction:  { A: 2, B: 2, C: 0 },  // 庄家方向：利主/利客都清，暧昧=0
    heatFollow: { A: 2, B: 2, C: 0 },  // 热度迎合：有立场就好
    confidence: { A: 2, B: 1, C: 0 },  // 信心度：没疑虑=2，有疑虑=1，暧昧=0
  },
};

/**
 * 根据子维度答案推出该维度 score 的上限（0/1/2）。
 * 规则：把填了的子维度质量分取向下平均（Math.floor），没填的忽略。
 * 一个子维度都没填 → 返回 2（不做约束，允许用户自己打分）。
 * 避免用户"子维度选全差但总分拍 2"的自欺。
 */
export function scoreCapFromSubdims(
  catKey: keyof ScoreData,
  subdims: Record<string, SubdimChoice>,
): 0 | 1 | 2 {
  const table = SUBDIM_QUALITY[catKey];
  if (!table) return 2; // fundamental / odds 不锁
  const vals: number[] = [];
  for (const [subKey, mapping] of Object.entries(table)) {
    const ch = subdims?.[subKey];
    if (ch === "A" || ch === "B" || ch === "C") vals.push(mapping[ch]);
  }
  if (vals.length === 0) return 2;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  // 向下取整做上限
  const cap = Math.floor(avg);
  return (cap <= 0 ? 0 : cap >= 2 ? 2 : 1);
}

// ─── Score ────────────────────────────────────────────────────────────────────

export interface ScoreItemData {
  score: 0 | 1 | 2;
  // New: sub-dimension choices keyed by subdim.key
  subdims: Record<string, SubdimChoice>;
  note: string;
  // Legacy (kept for migration readback); no longer written
  tags?: string[];
}

export interface ScoreData {
  fundamental: ScoreItemData;
  odds: ScoreItemData;
  reliability: ScoreItemData;
  trap: ScoreItemData;
  bookie: ScoreItemData;
}

// ─── Handicap ─────────────────────────────────────────────────────────────────

export type HandicapValue =
  | "0" | "0.25" | "0.5" | "0.75" | "1" | "1.25" | "1.5"
  | "1.75" | "2" | "2.25" | "2.5" | "2.75" | "3";

// Handicap deduction confidence 1-5 (replaces old ReverseOutcomeProbability)
export type HandicapConfidence = 1 | 2 | 3 | 4 | 5 | 0;

export interface SidedHandicap {
  side: "home" | "away" | "";
  values: HandicapValue[];
}

export interface HandicapDeduction {
  fairRanges: SidedHandicap;
  // Kept for back-compat; new records leave empty
  homeWinBookieExpected: SidedHandicap;
  awayWinBookieExpected: SidedHandicap;
  confidence: HandicapConfidence;          // 1-5, 0 = not set
  suspectedTrap: boolean;
  personalAnalysis: string;                 // renamed from `doubts`; now prominent
}

// ─── Bet Slip ─────────────────────────────────────────────────────────────────

export interface BetSlip {
  id: string;
  type: "pre" | "live";
  handicapSide: "home" | "away";
  handicapValue: string;
  odds: number;
  amount: number;
  betTime: string;
}

// ─── Bet Record ───────────────────────────────────────────────────────────────

export interface FinalScore {
  home: number;
  away: number;
}

export interface BetRecord {
  id: string;
  type: "bet";
  match: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  bettingDirection: BettingDirection;
  handicapSide: "home" | "away";
  handicapValue: string;
  grade: Grade;
  manualS?: boolean;              // true if user upgraded 10-score A → S
  totalScore: number;
  scores: ScoreData;
  deduction: HandicapDeduction;
  bets: BetSlip[];
  // 变盘记录（选填，专业复盘用）：初盘 vs 临开赛盘
  // 用于算"变盘方向"（升盘/降盘）、水位偏移幅度，比子维度打 A/B/C 更客观
  openHandicap?: string;          // 初盘让球数，如 "0.5"
  openOdds?: number;              // 初盘水位
  closeHandicap?: string;         // 临开赛盘让球数
  closeOdds?: number;             // 临开赛盘水位
  isDisciplineViolation: boolean;
  violationReason?: string;       // 违纪原因（如：观察转下注 / 超建议金额 / 硬门槛未过）
  result?: {
    outcome: Outcome;
    errors: string[];
    reviewNote: string;
    analysisVerdict?: AnalysisVerdict;  // 事后印证 rating on personal analysis
    finalScore?: FinalScore;            // 最终比分 (主:客)
    positiveNotes?: string[];           // 亮点/做得好
    decisionRating?: number;            // 1-5 本场决策总评
  };
  completionStatus: CompletionStatus;
  createdAt: string;
  convertedFromWatchId?: string;  // when a watch record is promoted to bet
}

// ─── Watch Record (formerly Abandoned) ────────────────────────────────────────

export interface AbandonedRecord {
  id: string;
  type: "abandoned";              // kept as literal for storage compat
  match: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  bettingDirection: BettingDirection;
  handicapSide: "home" | "away";
  handicapValue: string;
  totalScore: number;
  abandonReason: string;          // = 观察原因
  scores: ScoreData;
  deduction: HandicapDeduction;
  actualResult?: "win" | "loss" | "push" | "unknown";
  reviewConclusion?: ReviewConclusion;
  reviewNote?: string;
  analysisVerdict?: AnalysisVerdict;
  finalScore?: FinalScore;        // 最终比分 (观察对不对的参考)
  completionStatus: CompletionStatus;
  createdAt: string;
  promotedToBetId?: string;       // if later converted to bet
}

export type UnifiedRecord = BetRecord | AbandonedRecord;

// ─── Goals & Settings ─────────────────────────────────────────────────────────

export interface Goals {
  weeklyTarget: number;
  monthlyTarget: number;
  yearlyTarget: number;
}

export interface RiskControls {
  maxDailyMatches: number;         // 旧字段（保留向后兼容，周中默认用它）
  maxDailyMatchesWeekday?: number; // 周一-周五 每日下注上限
  maxDailyMatchesWeekend?: number; // 周六日 每日下注上限
  maxDailyWatches: number;         // 每日观察上限
  dailyLossLimit: number;          // 当日累计亏损触达后当天强制走观察
  monthlyMaxDrawdown: number;      // 月度累计亏损触达后锁一周（跨月重置）
}

export interface GradeAmounts {
  C: number;
  B: number;
  A: number;
  S: number;
}

export interface DisplayPrefs {
  defaultTimeRange: "week" | "month" | "year" | "all";
  recordsView?: "week" | "month" | "year";   // persisted segmented control
}

export interface AppSettings {
  goals: Goals;
  riskControls: RiskControls;
  gradeAmounts: GradeAmounts;
  displayPrefs: DisplayPrefs;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * 计算单注净盈亏。
 * 港盘水位含义：水位即净赢倍率（100 本金 × 0.97 = 净赢 97）。
 * 返回浮点（保留两位小数对齐到分），展示层再 round/format。
 * 此前版本在这里就 Math.round，会让 ROI 长期漂移 0.5-1%。
 */
export function calcPnl(amount: number, odds: number, outcome: Outcome): number {
  // 统一对齐到"分"精度，避免浮点尾数（如 0.1*3 = 0.30000000000000004）
  const toCents = (v: number) => Math.round(v * 100);
  const fromCents = (c: number) => c / 100;
  const a = toCents(amount);
  switch (outcome) {
    case "win":       return fromCents(Math.round(a * odds));
    case "half_win":  return fromCents(Math.round(a * odds * 0.5));
    case "push":      return 0;
    case "half_loss": return fromCents(-Math.round(a * 0.5));
    case "loss":      return -amount;
  }
}

export function getTotalBetAmount(record: BetRecord): number {
  return record.bets.reduce((sum, b) => sum + b.amount, 0);
}

export function getTotalPnl(record: BetRecord): number | null {
  if (!record.result) return null;
  return record.bets.reduce(
    (sum, bet) => sum + calcPnl(bet.amount, bet.odds, record.result!.outcome),
    0
  );
}

// New thresholds: 10→A(default, S manual), 9=A, 7-8=B, 6=C, ≤5=watch
// semiHardStopped = 庄家立场暧昧：在正常评级基础上再降一档（S→A, A→B, B→C, C 不再降）
export function gradeFromScore(
  totalScore: number,
  hardStopped: boolean,
  manualS?: boolean,
  semiHardStopped?: boolean,
): Grade {
  if (hardStopped) return "C";
  let g: Grade;
  if (totalScore === 10 && manualS) g = "S";
  else if (totalScore >= 9) g = "A";
  else if (totalScore >= 7) g = "B";
  else g = "C";
  if (semiHardStopped) {
    const step: Record<Grade, Grade> = { S: "A", A: "B", B: "C", C: "C" };
    g = step[g];
  }
  return g;
}

export function shouldRouteToWatch(totalScore: number, hardStopped: boolean): boolean {
  return hardStopped || totalScore <= 5;
}

/**
 * 硬门槛：强制转入观察、不允许下注。
 * 粒度细化：要"双红旗"——可靠性 = 0 且 陷阱嫌疑 = 0 同时出现（信息差 + 疑似诱盘）
 * 才视为高风险局面强制叫停。
 * 单项红旗（只有可靠性=0 或 只有陷阱=0）走半硬门槛——降一档 + 金额砍半，但允许下。
 * （原规则"任一=0 即硬停"过于绝对，放大了离谱被观察的比例，反而让用户懈怠评分。）
 */
export function isHardStopped(scores: ScoreData): boolean {
  return scores.reliability.score === 0 && scores.trap.score === 0;
}

/**
 * 半硬门槛：单个关键项为 0（可靠性、陷阱、庄家立场任一），不禁下但建议降级一档
 * + 建议金额砍半。由 gradeFromScore / suggestedAmount 共同响应。
 * 硬门槛优先——双红旗已触发硬停时不再报半硬。
 */
export function isSemiHardStopped(scores: ScoreData): boolean {
  if (isHardStopped(scores)) return false;
  return scores.bookie.score === 0
      || scores.reliability.score === 0
      || scores.trap.score === 0;
}

export function suggestedAmount(grade: Grade, amounts: GradeAmounts, semiHardStopped?: boolean): number {
  const base = amounts[grade];
  // 半硬门槛：立场暧昧 → 建议金额砍半（再加个 50 元取整兜底，避免出现 12.5 这种）
  return semiHardStopped ? Math.max(50, Math.round(base / 2 / 50) * 50) : base;
}

// Compact "team ±line" string for records list (no odds).
// Shows the team the user actually bet on, with sign from their perspective.
// betDirection === handicapSide → bet the favorite → "-line"
// betDirection !== handicapSide → bet the underdog → "+line"
export function formatBetDirection(params: {
  homeTeam: string;
  awayTeam: string;
  bettingDirection: BettingDirection;
  handicapSide: "home" | "away";
  handicapValue: string;
}): string {
  const { homeTeam, awayTeam, bettingDirection, handicapSide, handicapValue } = params;
  const team = bettingDirection === "home" ? (homeTeam || "主队") : (awayTeam || "客队");
  const hv = parseFloat(handicapValue);
  if (isNaN(hv) || hv === 0) return `${team} 平手`;
  const sign = bettingDirection === handicapSide ? "-" : "+";
  return `${team} ${sign}${handicapValue}`;
}

// Standard betting format: "曼联 +1.0 @0.97"
export function formatBetPreview(params: {
  teamName: string;
  handicapSide: "home" | "away";
  handicapValue: string;
  bettingDirection: BettingDirection;
  odds: number;
}): string {
  const { teamName, handicapSide, handicapValue, bettingDirection, odds } = params;
  const hv = parseFloat(handicapValue);
  if (isNaN(hv) || hv === 0) return `${teamName} 0 @${odds}`;
  // If bettingDirection matches handicapSide, user bet the favorite → sign is "-"
  // Otherwise user bet the underdog → sign is "+"
  const sign = bettingDirection === handicapSide ? "-" : "+";
  return `${teamName} ${sign}${hv} @${odds}`;
}

// Compact "曼联 +0.5 / +0.75 / +1" format for deduction display.
// side = 让球方 (the team that gives the ball handicap).
// Uses "+" sign to read naturally ("曼联 gives +1"). Team name appears once.
// Returns "" if team+values not both present (point 4: must select both to display).
export function formatSidedHandicap(
  sided: SidedHandicap,
  homeTeam: string,
  awayTeam: string,
): string {
  if (!sided.side || sided.values.length === 0) return "";
  // sided.side = 让球方（给出让球的那一方 / 强队视角）
  // 按亚盘惯例，让球方显示负号：例如主让 0.75 → "主队 -0.75"
  const team = sided.side === "home" ? (homeTeam || "主队") : (awayTeam || "客队");
  const parts = sided.values.map((v) => {
    const n = parseFloat(v);
    if (isNaN(n) || n === 0) return "0";
    return `-${v}`;
  });
  return `${team} ${parts.join(" / ")}`;
}

// Whether a SidedHandicap has both a side and at least one value selected.
export function isSidedHandicapComplete(sided: SidedHandicap): boolean {
  return !!sided.side && sided.values.length > 0;
}

// ─── Review option constants (post-match feedback) ────────────────────────────
// 6 symmetric error / positive items, paired by dimension.

export const ERROR_OPTIONS: string[] = [
  "基本面误判",
  "赔率/盘口理解错误",
  "庄家立场判断错误",
  "情绪下注/追单",
  "不该下却下了",
  "应转观察却下了",
];

export const DECISION_RATING_LABELS: Record<number, string> = {
  1: "差", 2: "勉强", 3: "尚可", 4: "良好", 5: "优秀",
};

export const POSITIVE_OPTIONS: string[] = [
  "基本面判断准确",
  "赔率/盘口解读到位",
  "看清了庄家立场",
  "情绪控制到位",
  "该下就下，果断",
  "该转观察果断转了",
];

// Count signals A=home, B=away, C=balanced across sidedMapping subdims
export function countSignals(scores: ScoreData): { home: number; away: number; balanced: number; total: number } {
  let home = 0, away = 0, balanced = 0, total = 0;
  for (const [catKey, cat] of Object.entries(scores)) {
    const subdims = SUBDIMS[catKey] ?? [];
    for (const sd of subdims) {
      if (!sd.sidedMapping) continue;
      const choice = cat.subdims?.[sd.key];
      if (!choice) continue;
      total++;
      if (choice === "A") home++;
      else if (choice === "B") away++;
      else if (choice === "C") balanced++;
    }
  }
  return { home, away, balanced, total };
}

export function emptyScoreItem(): ScoreItemData {
  return { score: 0, subdims: {}, note: "" };
}

export function emptyScoreData(): ScoreData {
  return {
    fundamental: emptyScoreItem(),
    odds:        emptyScoreItem(),
    reliability: emptyScoreItem(),
    trap:        emptyScoreItem(),
    bookie:      emptyScoreItem(),
  };
}

export function emptyDeduction(): HandicapDeduction {
  return {
    fairRanges: { side: "", values: [] },
    homeWinBookieExpected: { side: "", values: [] },
    awayWinBookieExpected: { side: "", values: [] },
    confidence: 0,
    suspectedTrap: false,
    personalAnalysis: "",
  };
}

// ─── Match-day boundary (10:00 → next 10:00) ──────────────────────────────────
// A "day" for stats/grouping starts at 10:00 local time.
// Any kickoff before 10:00 is attributed to the previous calendar day.

/**
 * Parse a kickoff time string into a Date, treating bare "YYYY-MM-DDTHH:MM"
 * (from <input type="datetime-local">) as LOCAL time rather than UTC.
 * Strings with explicit Z or ±HH:MM offsets are passed through.
 *
 * Workaround for Android Chrome versions that interpret bare datetime strings
 * as UTC — this caused displayed kickoff times to shift by the TZ offset.
 */
export function parseKickoff(s: string | Date): Date {
  if (s instanceof Date) return s;
  if (!s) return new Date(NaN);
  // Has explicit timezone info → let JS parse natively
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return new Date(s);
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
}

/** Normalize any kickoff string to a canonical UTC ISO string. */
export function normalizeKickoff(s: string): string {
  if (!s) return s;
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return s;
  const d = parseKickoff(s);
  return isNaN(d.getTime()) ? s : d.toISOString();
}

/** Format an ISO kickoff string as a "YYYY-MM-DDTHH:MM" value for datetime-local inputs. */
export function toDateTimeLocalValue(iso: string): string {
  if (!iso) return "";
  const d = parseKickoff(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 16);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const DAY_BOUNDARY_HOUR = 10;

/** Returns Date at 10:00 local of the "match day" that `iso` belongs to. */
export function matchDayStart(iso: string | Date): Date {
  const d = typeof iso === "string" ? parseKickoff(iso) : new Date(iso);
  const anchor = new Date(d);
  anchor.setHours(DAY_BOUNDARY_HOUR, 0, 0, 0);
  if (d.getHours() < DAY_BOUNDARY_HOUR) {
    anchor.setDate(anchor.getDate() - 1);
  }
  return anchor;
}

/** Returns yyyy-mm-dd string for the match day `iso` belongs to. */
export function matchDayKey(iso: string | Date): string {
  const a = matchDayStart(iso);
  const y = a.getFullYear();
  const m = String(a.getMonth() + 1).padStart(2, "0");
  const d = String(a.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Returns [start, end) interval (exclusive end) for the match-day anchored at `anchor`. */
export function matchDayRange(anchor: Date): { start: Date; end: Date } {
  const start = matchDayStart(anchor.toISOString());
  // If anchor is already at/after 10am it belongs to today's match-day, matchDayStart gives today 10am.
  // Else matchDayStart gives yesterday 10am. In both cases end = start + 24h.
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * Human-readable match-day key like "4月16日 周四" for a yyyy-mm-dd key.
 */
export function formatMatchDayLabel(dayKey: string): string {
  // dayKey is yyyy-mm-dd representing the 10am anchor date
  const [y, m, d] = dayKey.split("-").map((x) => parseInt(x, 10));
  const dt = new Date(y, m - 1, d, 12);
  return dt.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

// ISO week start (Monday). Returns Date set to 00:00 on Monday of that week.
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function weekEnd(date: Date): Date {
  const s = weekStart(date);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

export function sameWeek(a: Date, b: Date): boolean {
  return weekStart(a).getTime() === weekStart(b).getTime();
}

export function getCompletionStatus(record: BetRecord): CompletionStatus {
  if (!record.result) {
    const kickoff = parseKickoff(record.kickoffTime);
    const now = new Date();
    const diffMs = now.getTime() - kickoff.getTime();
    const ninetyMin = 90 * 60 * 1000;
    if (diffMs >= ninetyMin) return "pending_review";
    return "pristine";
  }
  if (!record.result.reviewNote && record.result.errors.length === 0) return "pending_improve";
  return "complete";
}
