// Re-export canonical types from types.ts for backward compat
export type {
  Outcome,
  Grade,
  ReviewConclusion,
  BettingDirection,
  CompletionStatus,
  ScoreItemData,
  ScoreData,
  HandicapValue,
  HandicapDeduction,
  BetSlip,
  BetRecord,
  AbandonedRecord,
  UnifiedRecord,
} from "./types";

export { calcPnl, getTotalBetAmount, getTotalPnl } from "./types";

import type { BetRecord, AbandonedRecord } from "./types";

export const mockDetailedRecords: BetRecord[] = [];
export const mockAbandonedRecords: AbandonedRecord[] = [];
