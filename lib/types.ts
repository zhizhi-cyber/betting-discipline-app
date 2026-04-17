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
  isDisciplineViolation: boolean;
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
  maxDailyMatches: number;     // 每日下注上限
  maxDailyWatches: number;     // 每日观察上限 (新)
  dailyLossLimit: number;
  monthlyMaxDrawdown: number;
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

export function calcPnl(amount: number, odds: number, outcome: Outcome): number {
  switch (outcome) {
    case "win":       return Math.round(amount * odds);
    case "half_win":  return Math.round(amount * odds * 0.5);
    case "push":      return 0;
    case "half_loss": return -Math.round(amount * 0.5);
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
export function gradeFromScore(totalScore: number, hardStopped: boolean, manualS?: boolean): Grade {
  if (hardStopped) return "C";
  if (totalScore === 10 && manualS) return "S";
  if (totalScore >= 9) return "A";
  if (totalScore >= 7) return "B";
  if (totalScore === 6) return "C";
  return "C"; // ≤5 should have been routed to watch
}

export function shouldRouteToWatch(totalScore: number, hardStopped: boolean): boolean {
  return hardStopped || totalScore <= 5;
}

// Hard stop: any of bookie/reliability/trap = 0
export function isHardStopped(scores: ScoreData): boolean {
  return scores.bookie.score === 0 || scores.reliability.score === 0 || scores.trap.score === 0;
}

export function suggestedAmount(grade: Grade, amounts: GradeAmounts): number {
  return amounts[grade];
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
  const team = sided.side === "home" ? (homeTeam || "主队") : (awayTeam || "客队");
  const parts = sided.values.map((v) => {
    const n = parseFloat(v);
    if (isNaN(n) || n === 0) return "0";
    return `+${v}`;
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
    const kickoff = new Date(record.kickoffTime);
    const now = new Date();
    const diffMs = now.getTime() - kickoff.getTime();
    const ninetyMin = 90 * 60 * 1000;
    if (diffMs >= ninetyMin) return "pending_review";
    return "pristine";
  }
  if (!record.result.reviewNote && record.result.errors.length === 0) return "pending_improve";
  return "complete";
}
