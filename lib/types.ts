// ─── Primitives ───────────────────────────────────────────────────────────────

export type Outcome = "win" | "half_win" | "push" | "half_loss" | "loss";
export type Grade = "S" | "A" | "B" | "C";
export type ReviewConclusion = "abandon_correct" | "abandon_wrong" | "no_regret";
export type BettingDirection = "home" | "away";
export type CompletionStatus = "pristine" | "pending_review" | "pending_improve" | "complete";

// ─── Score ────────────────────────────────────────────────────────────────────

export interface ScoreItemData {
  score: 2 | 0;
  tags: string[];
  note: string;
}

export interface ScoreData {
  fundamental: ScoreItemData;
  odds: ScoreItemData;
  reliability: ScoreItemData;
  trap: ScoreItemData;
  bookie: ScoreItemData;
}

// ─── Handicap Deduction Module ────────────────────────────────────────────────

export type HandicapValue =
  | "0"      // 平手
  | "0.25"   // 平半
  | "0.5"    // 半球
  | "0.75"   // 半一
  | "1"      // 一球
  | "1.25"   // 一球半
  | "1.5"    // 球半
  | "2";     // 两球

export type ReverseOutcomeProbability =
  | "very_low"      // 可能性极低
  | "somewhat"      // 有一定可能
  | "not_low"       // 可能性不低
  | "cannot_exclude"; // 无法排除

export interface SidedHandicap {
  side: "home" | "away" | "";
  values: HandicapValue[];
}

export interface HandicapDeduction {
  fairRanges: SidedHandicap;
  homeWinBookieExpected: SidedHandicap;
  awayWinBookieExpected: SidedHandicap;
  reverseProbability: ReverseOutcomeProbability | "";
  suspectedTrap: boolean;
  doubts: string;
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

export interface BetRecord {
  id: string;
  type: "bet";
  match: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;           // ISO string
  bettingDirection: BettingDirection;
  handicapSide: "home" | "away";
  handicapValue: string;
  grade: Grade;
  totalScore: number;
  scores: ScoreData;
  deduction: HandicapDeduction;
  bets: BetSlip[];
  isDisciplineViolation: boolean; // bet despite failing threshold
  result?: {
    outcome: Outcome;
    errors: string[];
    reviewNote: string;
  };
  completionStatus: CompletionStatus;
  createdAt: string;
}

// ─── Abandoned Record ─────────────────────────────────────────────────────────

export interface AbandonedRecord {
  id: string;
  type: "abandoned";
  match: string;
  homeTeam: string;
  awayTeam: string;
  kickoffTime: string;
  bettingDirection: BettingDirection;
  handicapSide: "home" | "away";
  handicapValue: string;
  totalScore: number;
  abandonReason: string;
  scores: ScoreData;
  deduction: HandicapDeduction;
  actualResult?: "win" | "loss" | "push" | "unknown";
  reviewConclusion?: ReviewConclusion;
  reviewNote?: string;
  completionStatus: CompletionStatus;
  createdAt: string;
}

// ─── Unified Record ───────────────────────────────────────────────────────────

export type UnifiedRecord = BetRecord | AbandonedRecord;

// ─── Goals & Settings ─────────────────────────────────────────────────────────

export interface Goals {
  weeklyTarget: number;
  monthlyTarget: number;
  yearlyTarget: number;
}

export interface RiskControls {
  maxDailyMatches: number;     // 单日最多场次
  dailyLossLimit: number;      // 单日亏损线（金额）
  monthlyMaxDrawdown: number;  // 月度最大回撤（金额）
}

export interface GradeAmounts {
  C: number;
  B: number;
  A: number;
  S: number;
}

export interface DisplayPrefs {
  defaultTimeRange: "month" | "week" | "all";
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

export function gradeFromScore(totalScore: number, allPass: boolean): Grade {
  if (totalScore <= 4) return "C"; // will be abandoned, but just in case
  if (totalScore === 6) return "C";
  if (totalScore === 8) return "B";
  if (totalScore === 10 && !allPass) return "A";
  if (totalScore === 10 && allPass) return "S";
  return "C";
}

export function suggestedAmount(grade: Grade, amounts: GradeAmounts): number {
  return amounts[grade];
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
