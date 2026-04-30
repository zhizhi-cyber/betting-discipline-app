"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Star } from "lucide-react";
import BottomNav from "@/components/bottom-nav";
import DisciplineDisclaimer from "@/components/discipline-disclaimer";
import {
  saveBetRecord, saveAbandonedRecord, getSettings, countToday,
  getBetRecords, getAbandonedRecords, dailyBetLimitFor, calcLockState, promoteWatchToBet,
  formatLockMessage, detectBehavioralViolations, detectSoftWarnings,
  getScreeningPool, saveScreeningItem,
  type LockState,
} from "@/lib/storage";
import { parseAmount, parseOddsInput, genId } from "@/lib/format";
import { useToast } from "@/components/toast";
import type {
  HandicapValue,
  HandicapConfidence,
  Grade,
  ScoreData,
  ScoreItemData,
  HandicapDeduction,
  BettingDirection,
  SubdimChoice,
  SidedHandicap,
  BetRecord,
  AbandonedRecord,
} from "@/lib/types";
import {
  SUBDIMS,
  gradeFromScore,
  isSemiHardStopped,
  suggestedAmount as suggestedAmountOf,
  scoreCapFromSubdims,
  SUBDIM_QUALITY,
  shouldRouteToWatch,
  isHardStopped,
  countSignals,
  emptyScoreData,
  emptyDeduction,
  formatBetPreview,
  formatSidedHandicap,
  normalizeKickoff,
  toDateTimeLocalValue,
  detectReverseWaterSuspicion,
} from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const HANDICAP_LOW: HandicapValue[] = ["0", "0.25", "0.5", "0.75", "1", "1.25", "1.5"];
const HANDICAP_HIGH: HandicapValue[] = ["1.75", "2", "2.25", "2.5", "2.75", "3"];

const SCORE_CATEGORIES: {
  key: keyof ScoreData;
  title: string;
  badge?: "hard" | "semi-hard";
}[] = [
  { key: "fundamental", title: "基本面" },
  { key: "odds",        title: "赔率/盘口分析" },
  { key: "reliability", title: "可靠性", badge: "semi-hard" },
  { key: "trap",        title: "诱盘/抽水", badge: "hard" },
  { key: "bookie",      title: "庄家立场", badge: "hard" },
];

const CONFIDENCE_LABELS: Record<number, string> = {
  1: "几乎没把握", 2: "不太有把握", 3: "基本有把握", 4: "比较有信心", 5: "极有信心",
};

// ─── Sided handicap picker (reused for 合理区间 / 主胜应开 / 客胜应开) ──────────

function SidedHandicapPicker({
  data, onChange, homeTeam, awayTeam,
}: {
  data: SidedHandicap;
  onChange: (next: SidedHandicap) => void;
  homeTeam: string;
  awayTeam: string;
}) {
  const allVals = [...data.homeValues, ...data.awayValues];
  const hasHighSelected = allVals.some((v) => HANDICAP_HIGH.includes(v));
  const [showHigh, setShowHigh] = useState(hasHighSelected);
  // 主队 / 客队两侧是否激活：有值就视为激活；没值用 state 跟踪用户主动勾选
  const [activeHome, setActiveHome] = useState(data.homeValues.length > 0);
  const [activeAway, setActiveAway] = useState(data.awayValues.length > 0);
  useEffect(() => { if (hasHighSelected) setShowHigh(true); }, [hasHighSelected]);
  useEffect(() => { if (data.homeValues.length > 0) setActiveHome(true); }, [data.homeValues.length]);
  useEffect(() => { if (data.awayValues.length > 0) setActiveAway(true); }, [data.awayValues.length]);

  const toggleSideActive = (side: "home" | "away") => {
    if (side === "home") {
      const next = !activeHome;
      setActiveHome(next);
      if (!next) onChange({ ...data, homeValues: [] });
    } else {
      const next = !activeAway;
      setActiveAway(next);
      if (!next) onChange({ ...data, awayValues: [] });
    }
  };
  const toggleValue = (side: "home" | "away", v: HandicapValue) => {
    const key = side === "home" ? "homeValues" : "awayValues";
    const list = data[key];
    const sel = list.includes(v);
    onChange({
      ...data,
      [key]: sel ? list.filter((x) => x !== v) : [...list, v],
    });
  };

  const preview = formatSidedHandicap(data, homeTeam, awayTeam);
  const renderRow = (side: "home" | "away", active: boolean) => {
    const team = side === "home" ? (homeTeam || "主队") : (awayTeam || "客队");
    const label = side === "home" ? "主让" : "客让";
    const values = side === "home" ? data.homeValues : data.awayValues;
    return (
      <div className="space-y-1.5">
        <button
          onClick={() => toggleSideActive(side)}
          className={`w-full py-1.5 px-2 rounded text-[11px] font-semibold flex items-center justify-between gap-2 ${
            active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm border flex items-center justify-center text-[9px] leading-none ${
              active ? "bg-background border-background text-foreground" : "border-current"
            }`}>{active ? "✓" : ""}</span>
            <span className="opacity-70 text-[10px]">{label}</span>
            <span className="truncate">{team}</span>
          </span>
          {active && values.length > 0 && (
            <span className="text-[10px] opacity-70 font-mono">{values.length} 项</span>
          )}
        </button>
        {active && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {HANDICAP_LOW.map((v) => {
                const sel = values.includes(v);
                return (
                  <button key={v} onClick={() => toggleValue(side, v)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono ${
                      sel ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}
                  >{v}</button>
                );
              })}
            </div>
            {showHigh && (
              <div className="flex flex-wrap gap-1.5">
                {HANDICAP_HIGH.map((v) => {
                  const sel = values.includes(v);
                  return (
                    <button key={v} onClick={() => toggleValue(side, v)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono ${
                        sel ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                      }`}
                    >{v}</button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="space-y-2">
        {renderRow("home", activeHome)}
        {renderRow("away", activeAway)}
      </div>
      {(activeHome || activeAway) && (
        <div className="flex justify-end mt-1.5">
          <button onClick={() => setShowHigh((v) => !v)}
            className="px-2 py-0.5 rounded text-[10px] bg-muted/60 text-muted-foreground flex items-center gap-1">
            <span className={`transition-transform ${showHigh ? "rotate-180" : ""}`}>▾</span>
            {showHigh ? "收起高让球" : "展开高让球"}
          </button>
        </div>
      )}
      {preview ? (
        <div className="mt-2 rounded bg-foreground/5 border border-foreground/10 px-2.5 py-1.5">
          <p className="text-[11px] font-mono text-foreground/90">{preview}</p>
        </div>
      ) : (activeHome || activeAway) ? (
        <p className="mt-2 text-[10px] text-muted-foreground/60">· 还需选择让球数值</p>
      ) : null}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function ReviewInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editBetId   = searchParams.get("edit");
  const editWatchId = searchParams.get("editWatch");
  const screeningId = searchParams.get("screening");
  const isEditingBet   = !!editBetId;
  const isEditingWatch = !!editWatchId;
  const isEditing      = isEditingBet || isEditingWatch;

  // Match info
  const [matchName, setMatchName]   = useState("");
  const [homeTeam, setHomeTeam]     = useState("");
  const [awayTeam, setAwayTeam]     = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [handicapSide, setHandicapSide] = useState<"home" | "away" | "">("");
  const [handicapValue, setHandicapValue] = useState<HandicapValue | "">("");
  const [betType, setBetType] = useState<"pre" | "live">("pre");
  const [bettingDirection, setBettingDirection] = useState<BettingDirection | "">("");
  const [odds, setOdds] = useState("0.97");
  // 变盘（选填）：初盘 / 临开赛盘，用于复盘"变盘方向"而不靠子维度主观选 A/B/C
  const [openHandicap, setOpenHandicap] = useState("");
  const [openOdds, setOpenOdds] = useState("");
  const [closeHandicap, setCloseHandicap] = useState("");
  const [closeOdds, setCloseOdds] = useState("");
  const [showLineMove, setShowLineMove] = useState(false);

  // Show high handicap (default collapsed; auto-expand if a high value is selected)
  const [showHighHcp, setShowHighHcp] = useState(false);
  useEffect(() => {
    if (handicapValue && HANDICAP_HIGH.includes(handicapValue)) {
      setShowHighHcp(true);
    }
  }, [handicapValue]);

  // Handicap deduction
  const [deduction, setDeduction] = useState<HandicapDeduction>(emptyDeduction);
  const [deductionExpanded, setDeductionExpanded] = useState(true);

  // Scores — all categories expanded by default
  const [scores, setScores] = useState<ScoreData>(emptyScoreData);
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>({
    fundamental: true, odds: true, reliability: true, trap: true, bookie: true,
  });

  // Settings
  const [settings, setSettings] = useState(() => getSettings());
  useEffect(() => { setSettings(getSettings()); }, []);

  // Confirm & watch dialogs
  const [confirmOpen, setConfirmOpen]       = useState(false);
  const [confirmAmount, setConfirmAmount]   = useState("");
  const [confirmMode, setConfirmMode]       = useState<"new" | "edit" | "promote">("new");
  const [watchOpen, setWatchOpen]           = useState(false);
  const [watchReason, setWatchReason]       = useState("");

  // Today's counters
  const [todayCount, setTodayCount] = useState({ bets: 0, watches: 0 });
  useEffect(() => { setTodayCount(countToday()); }, []);

  // Toast for validation errors
  const { show: showToast, node: toastNode } = useToast();

  // Inline validation messages
  const [oddsError, setOddsError] = useState("");
  const [kickoffError, setKickoffError] = useState("");
  const [confirmAmountError, setConfirmAmountError] = useState("");

  // Edit-mode: original record (for preserving id/createdAt/result) + original amount
  const [editOriginalBet,   setEditOriginalBet]   = useState<BetRecord | null>(null);
  const [editOriginalWatch, setEditOriginalWatch] = useState<AbandonedRecord | null>(null);
  const [editAmountWarningShown, setEditAmountWarningShown] = useState(false);

  // Load record when entering edit mode
  useEffect(() => {
    if (isEditingBet) {
      const r = getBetRecords().find((x) => x.id === editBetId);
      if (!r) return;
      setEditOriginalBet(r);
      setMatchName(r.match);
      setHomeTeam(r.homeTeam);
      setAwayTeam(r.awayTeam);
      // datetime-local wants "YYYY-MM-DDTHH:mm" in local — convert from stored ISO
      setKickoffTime(toDateTimeLocalValue(r.kickoffTime));
      setHandicapSide(r.handicapSide);
      setHandicapValue(r.handicapValue as HandicapValue);
      setBettingDirection(r.bettingDirection);
      setOdds(String(r.bets[0]?.odds ?? "0.97"));
      setBetType(r.bets[0]?.type ?? "pre");
      setDeduction(r.deduction);
      setScores(r.scores);
      setManualS(!!r.manualS);
      setOpenHandicap(r.openHandicap ?? "");
      setOpenOdds(r.openOdds != null ? String(r.openOdds) : "");
      setCloseHandicap(r.closeHandicap ?? "");
      setCloseOdds(r.closeOdds != null ? String(r.closeOdds) : "");
      setShowLineMove(!!(r.openHandicap || r.openOdds || r.closeHandicap || r.closeOdds));
    } else if (isEditingWatch) {
      const r = getAbandonedRecords().find((x) => x.id === editWatchId);
      if (!r) return;
      setEditOriginalWatch(r);
      setMatchName(r.match);
      setHomeTeam(r.homeTeam);
      setAwayTeam(r.awayTeam);
      setKickoffTime(toDateTimeLocalValue(r.kickoffTime));
      setHandicapSide(r.handicapSide);
      setHandicapValue(r.handicapValue as HandicapValue);
      setBettingDirection(r.bettingDirection);
      setDeduction(r.deduction);
      setScores(r.scores);
      setWatchReason(r.abandonReason || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBetId, editWatchId]);

  // 从"今日扫盘"深挖：读 ?screening=id，预填比赛信息 + 盘口推演
  useEffect(() => {
    if (!screeningId || isEditing) return;
    const item = getScreeningPool().find((x) => x.id === screeningId);
    if (!item) return;
    if (item.matchName) setMatchName(item.matchName);
    if (item.homeTeam) setHomeTeam(item.homeTeam);
    if (item.awayTeam) setAwayTeam(item.awayTeam);
    if (item.kickoffTime) setKickoffTime(toDateTimeLocalValue(item.kickoffTime));
    if (item.handicapSide) setHandicapSide(item.handicapSide);
    if (item.handicapValue) setHandicapValue(item.handicapValue as HandicapValue);
    if (item.bettingDirection) setBettingDirection(item.bettingDirection);
    if (item.deduction) setDeduction(item.deduction);
    if (item.openHandicap) setOpenHandicap(item.openHandicap);
    if (item.openOdds != null) setOpenOdds(String(item.openOdds));
    if (item.closeHandicap) setCloseHandicap(item.closeHandicap);
    if (item.closeOdds != null) setCloseOdds(String(item.closeOdds));
    if (item.openHandicap || item.openOdds != null || item.closeHandicap || item.closeOdds != null) {
      setShowLineMove(true);
    }
    // 兼容旧数据：如果只存了 A/B/C 三问，映射回 3 个子维度
    if (!item.deduction && (item.reliability || item.trap || item.bookie)) {
      setScores((p) => {
        const next = { ...p };
        if (item.reliability) next.reliability = { ...p.reliability, subdims: { ...p.reliability.subdims, clarity: item.reliability } };
        if (item.trap) next.trap = { ...p.trap, subdims: { ...p.trap.subdims, trap: item.trap } };
        if (item.bookie) next.bookie = { ...p.bookie, subdims: { ...p.bookie.subdims, confidence: item.bookie } };
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screeningId]);

  // 辅助：把扫盘条目标记为已深挖（保存下注/观察后调用）
  const markScreeningPromoted = (betOrWatchId: string) => {
    if (!screeningId) return;
    const item = getScreeningPool().find((x) => x.id === screeningId);
    if (!item) return;
    saveScreeningItem({ ...item, promotedToBetId: betOrWatchId });
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const totalScore = useMemo(() => {
    return (scores.fundamental.score + scores.odds.score + scores.reliability.score +
            scores.trap.score + scores.bookie.score);
  }, [scores]);

  const hardStopped = useMemo(() => isHardStopped(scores), [scores]);
  const semiHardStopped = useMemo(() => isSemiHardStopped(scores), [scores]);
  const routeToWatch = shouldRouteToWatch(totalScore, hardStopped);
  const grade: Grade = useMemo(
    () => gradeFromScore(totalScore, hardStopped, false, semiHardStopped),
    [totalScore, hardStopped, semiHardStopped]
  );
  const canUpgradeS = totalScore === 10 && !hardStopped && !semiHardStopped;
  const [manualS, setManualS] = useState(false);
  const finalGrade: Grade = canUpgradeS && manualS ? "S" : grade;

  const signals = useMemo(() => countSignals(scores), [scores]);

  const suggestedAmount = suggestedAmountOf(finalGrade, settings.gradeAmounts, semiHardStopped);

  // Team name for preview
  const betTeamName = useMemo(() => {
    if (!bettingDirection) return "";
    return bettingDirection === "home" ? (homeTeam || "主队") : (awayTeam || "客队");
  }, [bettingDirection, homeTeam, awayTeam]);

  const preview = useMemo(() => {
    if (!handicapSide || !handicapValue || !bettingDirection) return "";
    const parsed = parseFloat(odds);
    const oddsForPreview = isNaN(parsed) || parsed <= 0 ? NaN : parsed;
    const s = formatBetPreview({
      teamName: betTeamName,
      handicapSide,
      handicapValue,
      bettingDirection,
      odds: isNaN(oddsForPreview) ? 0 : oddsForPreview,
    });
    return isNaN(oddsForPreview) ? s.replace(/@[\d.]+$/, "@?") : s;
  }, [betTeamName, handicapSide, handicapValue, bettingDirection, odds]);

  // Auto-generate watch reason (hard-gate returns chip list, not string)
  // 新规则（双红旗）：硬停 = 可靠性 AND 陷阱 都为 0
  const hardFailChips = useMemo(() => {
    if (!hardStopped) return [] as string[];
    const fail: string[] = [];
    if (scores.reliability.score === 0) fail.push("可靠性");
    if (scores.trap.score === 0) fail.push("诱盘/抽水");
    return fail;
  }, [hardStopped, scores]);

  // 倒赔嫌疑：基本面强弱 vs 庄家方向对不上
  const reverseWaterWarning = useMemo(
    () => detectReverseWaterSuspicion(scores),
    [scores]
  );

  // 半硬门槛触发原因（单项红旗）
  const semiHardChips = useMemo(() => {
    if (!semiHardStopped) return [] as string[];
    const fail: string[] = [];
    if (scores.bookie.score === 0) fail.push("庄家立场");
    if (scores.reliability.score === 0) fail.push("可靠性");
    if (scores.trap.score === 0) fail.push("诱盘/抽水");
    return fail;
  }, [semiHardStopped, scores]);

  const autoWatchReason = useMemo(() => {
    if (hardStopped) return `硬门槛未过：${hardFailChips.join("、")}`;
    if (totalScore <= 5) return `评分 ${totalScore}/10 偏低`;
    return "";
  }, [hardStopped, hardFailChips, totalScore]);

  // 子维度完成度：已填答案数 / 总子维度数（22）
  const { filledSubdims, totalSubdims, fillPct } = useMemo(() => {
    let filled = 0;
    let total = 0;
    (Object.keys(SUBDIMS) as (keyof typeof SUBDIMS)[]).forEach((cat) => {
      const subs = SUBDIMS[cat];
      total += subs.length;
      const cur = scores[cat as keyof typeof scores]?.subdims ?? {};
      for (const s of subs) {
        if (cur[s.key]) filled++;
      }
    });
    return { filledSubdims: filled, totalSubdims: total, fillPct: total > 0 ? (filled / total) * 100 : 0 };
  }, [scores]);

  // Basic fields ready?
  const coreReady = matchName && homeTeam && awayTeam && handicapSide && handicapValue && bettingDirection;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const setSubdim = (catKey: keyof ScoreData, subKey: string, choice: SubdimChoice) => {
    setScores((p) => {
      const nextSubdims = { ...p[catKey].subdims, [subKey]: choice };
      const newCap = scoreCapFromSubdims(catKey, nextSubdims);
      const oldCap = scoreCapFromSubdims(catKey, p[catKey].subdims);
      const curScore = p[catKey].score;
      // 向下：超出新上限的 clamp 下来
      // 向上：如果用户之前正好"踩在旧上限"，说明他是在吃满答案推的分，
      //      那答案变好后帮他把分同步拉到新上限（符合直觉：选 A 就该自动给 2 分）
      let nextScore: 0 | 1 | 2;
      if (curScore > newCap) nextScore = newCap as 0 | 1 | 2;
      else if (curScore === oldCap && newCap > oldCap) nextScore = newCap as 0 | 1 | 2;
      else nextScore = curScore;
      return {
        ...p,
        [catKey]: { ...p[catKey], subdims: nextSubdims, score: nextScore },
      };
    });
  };

  const setScore = (catKey: keyof ScoreData, score: 0 | 1 | 2) => {
    setScores((p) => {
      // 质量型维度：子维度答案推出的上限 clamp，避免"子维度全选差但总分拍 2"
      const cap = scoreCapFromSubdims(catKey, p[catKey].subdims);
      const clamped = (score > cap ? cap : score) as 0 | 1 | 2;
      return { ...p, [catKey]: { ...p[catKey], score: clamped } };
    });
  };

  const setNote = (catKey: keyof ScoreData, note: string) => {
    setScores((p) => ({ ...p, [catKey]: { ...p[catKey], note } }));
  };

  const toggleCat = (catKey: string) => {
    setExpandedCats((p) => ({ ...p, [catKey]: !p[catKey] }));
  };

  const resetAll = () => {
    setMatchName(""); setHomeTeam(""); setAwayTeam(""); setKickoffTime("");
    setHandicapSide(""); setHandicapValue(""); setBetType("pre");
    setBettingDirection(""); setOdds("0.97");
    setOpenHandicap(""); setOpenOdds(""); setCloseHandicap(""); setCloseOdds("");
    setShowLineMove(false);
    setDeduction(emptyDeduction());
    setScores(emptyScoreData());
    setExpandedCats({ fundamental: true, odds: true, reliability: true, trap: true, bookie: true });
    setConfirmOpen(false); setConfirmAmount("");
    setWatchOpen(false); setWatchReason("");
    setManualS(false);
  };

  // 校验关键字段（开赛时间必填、水位必须 > 0）
  const validateCore = (): boolean => {
    let ok = true;
    if (!kickoffTime) {
      setKickoffError("请填写开赛时间");
      ok = false;
    } else {
      setKickoffError("");
    }
    const o = parseOddsInput(odds);
    if (!o.ok) {
      setOddsError(o.error || "水位无效");
      ok = false;
    } else {
      setOddsError("");
    }
    // A4 升降盘字段校验：不填可以，填了要求开盘/临盘双侧都完整，避免半填脏数据
    const lineFields = [openHandicap, openOdds, closeHandicap, closeOdds].map((v) => (v || "").trim());
    const hasAny = lineFields.some((v) => v !== "");
    if (hasAny) {
      const hasAll = lineFields.every((v) => v !== "");
      if (!hasAll) {
        showToast("升降盘：开盘/临盘的盘口+水位要么都填，要么都空", "error");
        ok = false;
      }
    }
    if (!ok) {
      showToast("请先修正红字部分", "error");
    }
    return ok;
  };

  // 草率保存防护：子维度填 < 50% 弹确认。仅新下注路径（非编辑）生效，避免编辑旧单误报。
  const guardRashFill = (): boolean => {
    if (isEditingBet || isEditingWatch) return true;
    if (fillPct >= 50) return true;
    const missing = totalSubdims - filledSubdims;
    return confirm(`还有 ${missing} 个子维度没填（完成度 ${fillPct.toFixed(0)}%），确定要下注吗？\n建议返回把可靠性/陷阱/庄家维度填完再下单。`);
  };

  const handleOpenConfirm = () => {
    if (!validateCore()) return;
    if (!guardRashFill()) return;
    setConfirmAmount(suggestedAmount.toString());
    setConfirmAmountError("");
    setConfirmMode(isEditingBet ? "edit" : "new");
    setConfirmOpen(true);
  };

  const handleOpenPromote = () => {
    if (!validateCore()) return;
    if (!guardRashFill()) return;
    setConfirmAmount(suggestedAmount.toString());
    setConfirmAmountError("");
    setConfirmMode("promote");
    setConfirmOpen(true);
  };

  const handlePromoteFromEdit = () => {
    if (!editOriginalWatch) return;
    // 第二套锁：日/月亏损触发锁定后禁止补录（封死「观察→补录」后门）
    const lockNow = calcLockState(new Date(), settings);
    if (lockNow.locked) {
      showToast(formatLockMessage(lockNow) + "，补录已被封锁", "error");
      return;
    }
    const orig = editOriginalWatch;
    const id = genId("b");
    const amt = parseAmount(confirmAmount);
    if (!amt.ok) { setConfirmAmountError(amt.error || "金额无效"); return; }
    const amount = amt.value;
    const oddsParsed = parseOddsInput(odds);
    if (!oddsParsed.ok) { setOddsError(oddsParsed.error || "水位无效"); return; }
    const newBet: BetRecord = {
      id,
      type: "bet",
      match: matchName || orig.match,
      homeTeam: homeTeam || orig.homeTeam,
      awayTeam: awayTeam || orig.awayTeam,
      kickoffTime: kickoffTime ? normalizeKickoff(kickoffTime) : orig.kickoffTime,
      bettingDirection: bettingDirection || orig.bettingDirection,
      handicapSide: handicapSide || orig.handicapSide,
      handicapValue: handicapValue || orig.handicapValue,
      grade: finalGrade,
      manualS: canUpgradeS && manualS ? true : undefined,
      totalScore,
      scores,
      deduction,
      bets: [{
        id: genId("bs"),
        type: betType,
        handicapSide: handicapSide || orig.handicapSide,
        handicapValue: handicapValue || orig.handicapValue,
        odds: oddsParsed.value,
        amount,
        betTime: new Date().toISOString(),
      }],
      isDisciplineViolation: true,          // 观察转下注 = 违纪
      violationReason: "观察转下注（原判断应观察不下注）",
      completionStatus: "pristine",
      createdAt: new Date().toISOString(),
      convertedFromWatchId: orig.id,
    };
    promoteWatchToBet(orig.id, newBet);
    setConfirmOpen(false);
    resetAll();
    router.push(`/records?id=${id}`);
  };

  const handleSaveBet = () => {
    const id = genId("b");
    const amt = parseAmount(confirmAmount);
    if (!amt.ok) { setConfirmAmountError(amt.error || "金额无效"); return; }
    const amount = amt.value;
    const oddsParsed = parseOddsInput(odds);
    if (!oddsParsed.ok) { setOddsError(oddsParsed.error || "水位无效"); setConfirmOpen(false); return; }
    if (!kickoffTime) { setKickoffError("请填写开赛时间"); setConfirmOpen(false); return; }
    // 违纪合并：超建议金额 + 行为违纪（连败追损 / 临开赛冲动 / 同场重复）
    const reasons: string[] = [];
    if (amount > suggestedAmount) {
      reasons.push(`超建议金额（建议 ¥${suggestedAmount}，实投 ¥${amount}）`);
    }
    reasons.push(...detectBehavioralViolations({
      amount,
      kickoffISO: normalizeKickoff(kickoffTime),
      homeTeam: homeTeam || "主队",
      awayTeam: awayTeam || "客队",
    }));
    const isViolation = reasons.length > 0;
    const violationReason = reasons.length > 0 ? reasons.join(" + ") : undefined;
    saveBetRecord({
      id,
      type: "bet",
      match: matchName || "未命名比赛",
      homeTeam: homeTeam || "主队",
      awayTeam: awayTeam || "客队",
      kickoffTime: normalizeKickoff(kickoffTime),
      bettingDirection: bettingDirection || "home",
      handicapSide: handicapSide || "home",
      handicapValue,
      grade: finalGrade,
      manualS: canUpgradeS && manualS ? true : undefined,
      totalScore,
      scores,
      deduction,
      openHandicap: openHandicap || undefined,
      openOdds: openOdds && !isNaN(parseFloat(openOdds)) ? parseFloat(openOdds) : undefined,
      closeHandicap: closeHandicap || undefined,
      closeOdds: closeOdds && !isNaN(parseFloat(closeOdds)) ? parseFloat(closeOdds) : undefined,
      bets: [{
        id: genId("bs"),
        type: betType,
        handicapSide: handicapSide || "home",
        handicapValue,
        odds: oddsParsed.value,
        amount,
        betTime: new Date().toISOString(),
      }],
      isDisciplineViolation: isViolation,
      violationReason,
      completionStatus: "pristine",
      createdAt: new Date().toISOString(),
    });
    markScreeningPromoted(id);
    setTodayCount(countToday());
    // 保存后重算封锁状态，如果本单刚把用户推到上限，跳转后至少首页 banner 是对的
    const lockAfter = calcLockState(new Date(), settings);
    if (lockAfter.locked) {
      showToast("⚠ 已触发封锁：" + formatLockMessage(lockAfter), "error");
    }
    resetAll();
    router.push("/records");
  };

  const handleOpenWatch = () => {
    // 观察也要求开赛时间必填，避免记录时间错乱
    if (!kickoffTime) { setKickoffError("请填写开赛时间"); showToast("请先修正红字部分", "error"); return; }
    setKickoffError("");
    setWatchReason(autoWatchReason);
    setWatchOpen(true);
  };

  const handleSaveWatch = () => {
    const id = `a-${Date.now()}`;
    saveAbandonedRecord({
      id,
      type: "abandoned",
      match: matchName || "未命名比赛",
      homeTeam: homeTeam || "主队",
      awayTeam: awayTeam || "客队",
      kickoffTime: normalizeKickoff(kickoffTime),
      bettingDirection: bettingDirection || "home",
      handicapSide: handicapSide || "home",
      handicapValue,
      totalScore,
      abandonReason: watchReason,
      scores,
      deduction,
      completionStatus: "pristine",
      createdAt: new Date().toISOString(),
    });
    markScreeningPromoted(id);
    setTodayCount(countToday());
    resetAll();
    router.push("/records");
  };

  // ─── Edit-mode handlers ───────────────────────────────────────────────────

  const handleOpenEditConfirm = () => {
    if (!validateCore()) return;
    if (isEditingBet && editOriginalBet) {
      setConfirmAmount(String(editOriginalBet.bets[0]?.amount ?? suggestedAmount));
      setConfirmAmountError("");
      setConfirmOpen(true);
    }
  };

  const handleSaveBetEdit = () => {
    if (!editOriginalBet) return;
    const orig = editOriginalBet;
    const amt = parseAmount(confirmAmount);
    if (!amt.ok) { setConfirmAmountError(amt.error || "金额无效"); return; }
    const amount = amt.value;
    const parsedOdds = parseOddsInput(odds);
    if (!parsedOdds.ok) { setOddsError(parsedOdds.error || "水位无效"); setConfirmOpen(false); return; }
    const finalOdds = parsedOdds.value;
    const firstBet = orig.bets[0];
    // 编辑时也跑行为违纪检测（"同场重复"排除自己这条，防照镜子）
    const reasons: string[] = [];
    if (amount > suggestedAmount) {
      reasons.push(
        orig.convertedFromWatchId
          ? "观察转下注（原判断应观察不下注）"
          : `超建议金额（建议 ¥${suggestedAmount}，实投 ¥${amount}）`
      );
    } else if (orig.convertedFromWatchId) {
      // 保留原来的"观察转下注"违纪标签（即使金额没超）
      reasons.push("观察转下注（原判断应观察不下注）");
    }
    reasons.push(...detectBehavioralViolations({
      amount,
      kickoffISO: kickoffTime ? normalizeKickoff(kickoffTime) : orig.kickoffTime,
      homeTeam: homeTeam || orig.homeTeam,
      awayTeam: awayTeam || orig.awayTeam,
      excludeId: orig.id,
    }));
    const isViolation = reasons.length > 0;
    const violationReason = reasons.length > 0 ? reasons.join(" + ") : undefined;
    saveBetRecord({
      ...orig,
      match: matchName || orig.match,
      homeTeam: homeTeam || orig.homeTeam,
      awayTeam: awayTeam || orig.awayTeam,
      kickoffTime: kickoffTime ? normalizeKickoff(kickoffTime) : orig.kickoffTime,
      bettingDirection: bettingDirection || orig.bettingDirection,
      handicapSide: handicapSide || orig.handicapSide,
      handicapValue: handicapValue || orig.handicapValue,
      grade: finalGrade,
      manualS: canUpgradeS && manualS ? true : undefined,
      totalScore,
      scores,
      deduction,
      openHandicap: openHandicap || undefined,
      openOdds: openOdds && !isNaN(parseFloat(openOdds)) ? parseFloat(openOdds) : undefined,
      closeHandicap: closeHandicap || undefined,
      closeOdds: closeOdds && !isNaN(parseFloat(closeOdds)) ? parseFloat(closeOdds) : undefined,
      bets: [
        firstBet
          ? { ...firstBet, type: betType, handicapSide: handicapSide || firstBet.handicapSide,
              handicapValue: handicapValue || firstBet.handicapValue, odds: finalOdds, amount }
          : { id: genId("bs"), type: betType, handicapSide: handicapSide || "home",
              handicapValue: handicapValue || "0", odds: finalOdds, amount, betTime: new Date().toISOString() },
        ...orig.bets.slice(1),
      ],
      isDisciplineViolation: isViolation,
      violationReason,
      // Preserve: id, completionStatus, createdAt, result, convertedFromWatchId
    });
    // 编辑已结算单的金额会反算 PnL → 可能刚好触发/解除封锁。给个即时反馈。
    if (orig.result) {
      const lockAfter = calcLockState(new Date(), settings);
      if (lockAfter.locked) {
        showToast("⚠ 编辑后触发封锁：" + formatLockMessage(lockAfter), "error");
      }
    }
    router.push(`/records?id=${orig.id}`);
  };

  const handleSaveWatchEdit = () => {
    if (!editOriginalWatch) return;
    const orig = editOriginalWatch;
    saveAbandonedRecord({
      ...orig,
      match: matchName || orig.match,
      homeTeam: homeTeam || orig.homeTeam,
      awayTeam: awayTeam || orig.awayTeam,
      kickoffTime: kickoffTime ? normalizeKickoff(kickoffTime) : orig.kickoffTime,
      bettingDirection: bettingDirection || orig.bettingDirection,
      handicapSide: handicapSide || orig.handicapSide,
      handicapValue: handicapValue || orig.handicapValue,
      totalScore,
      abandonReason: watchReason || orig.abandonReason,
      scores,
      deduction,
      // Preserve: id, type, completionStatus, createdAt, actualResult, reviewConclusion, reviewNote, analysisVerdict, promotedToBetId
    });
    router.push(`/records?aid=${orig.id}`);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  const todayBetLimit = dailyBetLimitFor(new Date(), settings);
  const overLimitBet   = todayCount.bets   >= todayBetLimit;
  const overLimitWatch = todayCount.watches >= settings.riskControls.maxDailyWatches;
  const lockState: LockState = useMemo(() => calcLockState(new Date(), settings), [settings, todayCount]);
  const isLocked = lockState.locked;

  return (
    <div className="min-h-screen pb-28">
      <DisciplineDisclaimer mode="always" />
      {toastNode}
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground">
            <ArrowLeft size={15} />
            <span className="text-sm">返回</span>
          </button>
          <span className="font-semibold text-sm">
            {isEditingBet ? "编辑下注记录" : isEditingWatch ? "编辑观察记录" : "纪律审查"}
          </span>
          <div className="w-10" />
        </div>

        {/* Today's counters — hidden in edit mode */}
        {!isEditing && (
          <div className="flex gap-3 px-4 pb-3 text-[10px] text-muted-foreground">
            <span>
              今日下注
              <span className={`font-mono mx-1 ${overLimitBet ? "text-loss" : "text-foreground"}`}>
                {todayCount.bets}/{todayBetLimit}
              </span>
            </span>
            <span>·</span>
            <span>
              今日观察
              <span className={`font-mono mx-1 ${overLimitWatch ? "text-loss" : "text-foreground"}`}>
                {todayCount.watches}/{settings.riskControls.maxDailyWatches}
              </span>
            </span>
          </div>
        )}
        {isEditing && (
          <div className="px-4 pb-3 text-[10px] text-muted-foreground">
            编辑模式 · ID {editBetId || editWatchId}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-6">

        {/* ── Match info ─────────────────────────────────────────── */}
        <section className="space-y-2">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">比赛信息</p>
          <input value={matchName} onChange={(e) => setMatchName(e.target.value)}
            placeholder="比赛标题（如：英超第8轮 曼联 vs 切尔西）"
            className="w-full bg-muted rounded px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/40" />
          <div className="grid grid-cols-2 gap-2">
            <input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)}
              placeholder="主队"
              className="w-full bg-muted rounded px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/40" />
            <input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)}
              placeholder="客队"
              className="w-full bg-muted rounded px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/40" />
          </div>
          <input type="datetime-local" value={kickoffTime}
            onChange={(e) => { setKickoffTime(e.target.value); if (e.target.value) setKickoffError(""); }}
            className={`w-full bg-muted rounded px-3 py-2 text-sm outline-none ${kickoffError ? "ring-1 ring-loss" : ""}`} />
          {kickoffError && <p className="text-[10px] text-loss -mt-1">{kickoffError}</p>}
        </section>

        {/* ── Handicap & direction ───────────────────────────────── */}
        <section className="space-y-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">盘口与方向</p>

          {/* Handicap side */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">让球方</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["home", "away"] as const).map((s) => (
                <button key={s} onClick={() => setHandicapSide(s)}
                  className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors min-w-0 flex flex-col items-center leading-tight ${
                    handicapSide === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="opacity-70 text-[10px]">{s === "home" ? "主让" : "客让"}</span>
                  <span className="truncate max-w-full">{s === "home" ? (homeTeam || "主队") : (awayTeam || "客队")}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Handicap value — low */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">让球数</p>
            <div className="flex flex-wrap gap-1.5">
              {HANDICAP_LOW.map((v) => (
                <button key={v} onClick={() => setHandicapValue(v)}
                  className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
                    handicapValue === v ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {v}
                </button>
              ))}
              <button onClick={() => setShowHighHcp((v) => !v)}
                className="px-3 py-1.5 rounded text-[11px] bg-muted text-muted-foreground flex items-center gap-1">
                <span className={`transition-transform ${showHighHcp ? "rotate-180" : ""}`}>▾</span>
                高让球
              </button>
            </div>
            {showHighHcp && (
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {HANDICAP_HIGH.map((v) => (
                  <button key={v} onClick={() => setHandicapValue(v)}
                    className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
                      handicapValue === v ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Betting direction */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">投注方向</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["home", "away"] as const).map((d) => (
                <button key={d} onClick={() => setBettingDirection(d)}
                  className={`py-1.5 px-2 rounded text-xs font-semibold transition-colors min-w-0 flex flex-col items-center leading-tight ${
                    bettingDirection === d ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="opacity-70 text-[10px]">{d === "home" ? "买主" : "买客"}</span>
                  <span className="truncate max-w-full">{d === "home" ? (homeTeam || "主队") : (awayTeam || "客队")}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Odds */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">港盘水位</p>
            <input value={odds}
              onChange={(e) => {
                setOdds(e.target.value);
                const r = parseOddsInput(e.target.value);
                setOddsError(r.ok ? "" : (r.error || ""));
              }}
              placeholder="0.97"
              inputMode="decimal"
              className={`w-full bg-muted rounded px-3 py-2 text-sm font-mono outline-none placeholder:text-muted-foreground/40 ${oddsError ? "ring-1 ring-loss" : ""}`} />
            {oddsError && <p className="text-[10px] text-loss mt-1">{oddsError}</p>}
          </div>

          {/* 变盘记录（选填） */}
          <div>
            <button
              onClick={() => setShowLineMove((v) => !v)}
              className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md border transition-colors ${
                showLineMove
                  ? "border-foreground/30 bg-muted text-foreground"
                  : "border-dashed border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <span className={`transition-transform ${showLineMove ? "rotate-90" : ""}`}>▸</span>
              {showLineMove ? "收起变盘记录" : "+ 记录变盘（初盘 → 临开赛盘，选填）"}
            </button>
            {showLineMove && (
              <div className="mt-2 space-y-2 border border-border rounded-md p-2.5 bg-muted/30">
                <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
                  填"初盘"与"临开赛盘"可客观记录变盘方向，替代子维度里的主观"变盘倾向"判断。全部选填。
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">初盘让球</p>
                    <input
                      value={openHandicap}
                      onChange={(e) => setOpenHandicap(e.target.value)}
                      placeholder="如 0.5"
                      inputMode="decimal"
                      className="w-full bg-background rounded px-2 py-1.5 text-xs font-mono outline-none placeholder:text-muted-foreground/40 border border-border"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">初盘水位</p>
                    <input
                      value={openOdds}
                      onChange={(e) => setOpenOdds(e.target.value)}
                      placeholder="如 0.95"
                      inputMode="decimal"
                      className="w-full bg-background rounded px-2 py-1.5 text-xs font-mono outline-none placeholder:text-muted-foreground/40 border border-border"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">临开赛让球</p>
                    <input
                      value={closeHandicap}
                      onChange={(e) => setCloseHandicap(e.target.value)}
                      placeholder="如 0.75"
                      inputMode="decimal"
                      className="w-full bg-background rounded px-2 py-1.5 text-xs font-mono outline-none placeholder:text-muted-foreground/40 border border-border"
                    />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">临开赛水位</p>
                    <input
                      value={closeOdds}
                      onChange={(e) => setCloseOdds(e.target.value)}
                      placeholder="如 0.88"
                      inputMode="decimal"
                      className="w-full bg-background rounded px-2 py-1.5 text-xs font-mono outline-none placeholder:text-muted-foreground/40 border border-border"
                    />
                  </div>
                </div>
                {(() => {
                  // 实时提示变盘方向
                  const oh = parseFloat(openHandicap);
                  const ch = parseFloat(closeHandicap);
                  const oo = parseFloat(openOdds);
                  const co = parseFloat(closeOdds);
                  const lineDiff = !isNaN(oh) && !isNaN(ch) ? ch - oh : null;
                  const oddsDiff = !isNaN(oo) && !isNaN(co) ? co - oo : null;
                  if (lineDiff === null && oddsDiff === null) return null;
                  return (
                    <div className="text-[10px] text-muted-foreground leading-relaxed border-t border-border/50 pt-1.5">
                      {lineDiff !== null && (
                        <span>让球 {lineDiff > 0 ? `升盘 +${lineDiff.toFixed(2)}` : lineDiff < 0 ? `降盘 \u2212${Math.abs(lineDiff).toFixed(2)}` : "未变"}</span>
                      )}
                      {lineDiff !== null && oddsDiff !== null && <span className="mx-1 opacity-50">·</span>}
                      {oddsDiff !== null && (
                        <span>水位 {oddsDiff > 0 ? `升 +${oddsDiff.toFixed(2)}` : oddsDiff < 0 ? `降 \u2212${Math.abs(oddsDiff).toFixed(2)}` : "未变"}</span>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Bet type */}
          <div>
            <p className="text-[11px] text-muted-foreground mb-1.5">下注类型</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["pre", "live"] as const).map((t) => (
                <button key={t} onClick={() => setBetType(t)}
                  className={`py-2 rounded text-xs font-semibold transition-colors ${
                    betType === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {t === "pre" ? "赛前" : "滚球"}
                </button>
              ))}
            </div>
          </div>

          {/* Live preview */}
          {preview && (
            <div className="rounded-md border-2 border-foreground/20 bg-muted/30 px-4 py-3">
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">投注预览</p>
              <p className="text-base font-bold font-mono">{preview}</p>
            </div>
          )}
        </section>

        {/* ── Handicap deduction ─────────────────────────────────── */}
        <section className="border border-border rounded-md overflow-hidden">
          <button onClick={() => setDeductionExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">盘口推演</p>
            {deductionExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
          {deductionExpanded && (
            <div className="px-4 pb-4 pt-2 border-t border-border space-y-4">
              {/* Fair range */}
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">合理让球区间</p>
                <SidedHandicapPicker
                  data={deduction.fairRanges}
                  onChange={(next) => setDeduction((p) => ({ ...p, fairRanges: next }))}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                />
              </div>

              {/* Home-win bookie expected */}
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">主队胜 · 庄家应开盘口</p>
                <SidedHandicapPicker
                  data={deduction.homeWinBookieExpected}
                  onChange={(next) => setDeduction((p) => ({ ...p, homeWinBookieExpected: next }))}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                />
              </div>

              {/* Away-win bookie expected */}
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">客队胜 · 庄家应开盘口</p>
                <SidedHandicapPicker
                  data={deduction.awayWinBookieExpected}
                  onChange={(next) => setDeduction((p) => ({ ...p, awayWinBookieExpected: next }))}
                  homeTeam={homeTeam}
                  awayTeam={awayTeam}
                />
              </div>

              {/* Confidence 1-5 stars */}
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">盘口推演信心度</p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {([1, 2, 3, 4, 5] as HandicapConfidence[]).map((n) => {
                      const active = deduction.confidence >= n;
                      return (
                        <button key={n}
                          onClick={() => setDeduction((p) => ({
                            ...p, confidence: p.confidence === n ? 0 : n,
                          }))}
                          className="p-1 active:opacity-60 transition-opacity"
                          aria-label={`置信度 ${n}`}
                        >
                          <Star
                            size={24}
                            strokeWidth={1.5}
                            className={active ? "fill-[#f5c842] text-[#f5c842]" : "text-muted-foreground/40"}
                          />
                        </button>
                      );
                    })}
                  </div>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {deduction.confidence === 0 ? "未评" : CONFIDENCE_LABELS[deduction.confidence]}
                  </span>
                </div>
              </div>

              {/* Suspected trap */}
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">疑似诱盘</p>
                <button onClick={() => setDeduction((p) => ({ ...p, suspectedTrap: !p.suspectedTrap }))}
                  className={`px-3 py-1 rounded text-[11px] font-semibold ${
                    deduction.suspectedTrap ? "bg-warning text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {deduction.suspectedTrap ? "⚠ 已标记" : "未标记"}
                </button>
              </div>

              {/* Personal analysis — prominent */}
              <div>
                <p className="text-[11px] font-bold text-foreground mb-1.5">个人分析</p>
                <textarea rows={4}
                  className="w-full bg-muted rounded px-3 py-2 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
                  placeholder="写下你的判断思路、疑虑点、以及为什么看好这个盘口…"
                  value={deduction.personalAnalysis}
                  onChange={(e) => setDeduction((p) => ({ ...p, personalAnalysis: e.target.value }))}
                />
              </div>
            </div>
          )}
        </section>

        {/* ── Signal summary ─────────────────────────────────────── */}
        {signals.total > 0 && (
          <section className="rounded-md border border-border bg-card px-4 py-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">总体信号</p>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-[#6ea8d8] font-bold">主 {signals.home}</span>
              <span className="text-[#f5a642] font-bold">客 {signals.away}</span>
              <span className="text-muted-foreground">均 {signals.balanced}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">共 {signals.total} 项</span>
            </div>
          </section>
        )}

        {/* ── 5 discipline categories ────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">纪律评分</p>
            <p className="text-[10px] text-muted-foreground font-mono tabular-nums">
              子维度 {filledSubdims}/{totalSubdims}
              <span className={`ml-1 ${fillPct >= 70 ? "text-profit" : fillPct >= 40 ? "text-warning" : "text-loss"}`}>
                {fillPct.toFixed(0)}%
              </span>
            </p>
          </div>
          {/* 完成度条 */}
          <div className="h-1 bg-muted rounded-full overflow-hidden mb-2">
            <div
              className={`h-full transition-all ${fillPct >= 70 ? "bg-profit" : fillPct >= 40 ? "bg-warning" : "bg-loss"}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <div className="space-y-2">
            {SCORE_CATEGORIES.map(({ key, title, badge }) => {
              const cat = scores[key];
              const subdims = SUBDIMS[key] ?? [];
              const filledCount = subdims.filter((sd) => cat.subdims?.[sd.key]).length;
              const localSignals = (() => {
                let h = 0, a = 0;
                for (const sd of subdims) {
                  if (!sd.sidedMapping) continue;
                  const c = cat.subdims?.[sd.key];
                  if (c === "A") h++; else if (c === "B") a++;
                }
                return { h, a };
              })();
              const isOpen = !!expandedCats[key];
              return (
                <div key={key} className="border border-border rounded-md overflow-hidden bg-card">
                  <button onClick={() => toggleCat(key)}
                    className="w-full flex items-center gap-2 px-4 py-3">
                    <span className="text-sm font-semibold flex-1 text-left">{title}</span>
                    {badge === "hard"      && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-loss/15 text-loss">硬门槛</span>}
                    {badge === "semi-hard" && <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-warning/15 text-warning">半硬门槛</span>}
                    {filledCount > 0 && (
                      <span className="text-[9px] text-muted-foreground">
                        已选 {filledCount}/{subdims.length}
                      </span>
                    )}
                    <span className={`text-xs font-bold font-mono shrink-0 ${
                      cat.score === 2 ? "text-profit" : cat.score === 1 ? "text-warning" : "text-muted-foreground"
                    }`}>
                      {cat.score}/2
                    </span>
                    {isOpen ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
                  </button>

                  {isOpen && (
                    <div className="border-t border-border px-4 py-3 space-y-2.5">
                      {/* Subdimensions */}
                      {subdims.map((sd) => {
                        const choice = cat.subdims?.[sd.key] ?? "";
                        return (
                          <div key={sd.key} className="grid grid-cols-[60px_1fr] gap-2 items-center">
                            <p className="text-[11px] text-muted-foreground">{sd.label}</p>
                            <div className="grid grid-cols-3 gap-1">
                              {(["A", "B", "C"] as SubdimChoice[]).map((opt) => {
                                const label = opt === "A" ? sd.optionA : opt === "B" ? sd.optionB : sd.optionC;
                                return (
                                  <button key={opt}
                                    onClick={() => setSubdim(key, sd.key, choice === opt ? "" : opt)}
                                    className={`py-1.5 rounded text-[11px] font-semibold transition-colors ${
                                      choice === opt
                                        ? opt === "A" ? "bg-[#6ea8d8] text-white"
                                        : opt === "B" ? "bg-[#f5a642] text-white"
                                        : "bg-muted-foreground/40 text-white"
                                        : "bg-muted text-muted-foreground"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {/* Local signal summary (if sided mapping present) */}
                      {localSignals.h + localSignals.a > 0 && (
                        <p className="text-[10px] text-muted-foreground pt-1">
                          本项倾向 · 主 {localSignals.h} / 客 {localSignals.a}
                        </p>
                      )}

                      {/* Score buttons */}
                      <div className="pt-2 border-t border-border">
                        <div className="flex items-center justify-between mb-1.5">
                          <p className="text-[11px] text-muted-foreground">本项评分</p>
                          {SUBDIM_QUALITY[key] && (() => {
                            const cap = scoreCapFromSubdims(key, cat.subdims);
                            const hasAnswers = Object.values(cat.subdims || {}).some((v) => v);
                            if (!hasAnswers) return null;
                            return (
                              <span className="text-[10px] text-muted-foreground/70">
                                子维度上限 <span className={cap === 2 ? "text-profit" : cap === 1 ? "text-warning" : "text-loss"}>+{cap}</span>
                              </span>
                            );
                          })()}
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            { v: 2 as const, label: "+2 通过", cls: "bg-profit text-white" },
                            { v: 1 as const, label: "+1 勉强", cls: "bg-warning text-white" },
                            { v: 0 as const, label: "+0 未过", cls: "bg-loss text-white" },
                          ]).map(({ v, label, cls }) => {
                            const cap = SUBDIM_QUALITY[key] ? scoreCapFromSubdims(key, cat.subdims) : 2;
                            const locked = v > cap;
                            return (
                              <button
                                key={v}
                                onClick={() => { if (!locked) setScore(key, v); }}
                                disabled={locked}
                                title={locked ? `子维度上限为 +${cap}，先调整子维度再打更高分` : ""}
                                className={`py-2 rounded text-xs font-bold transition-colors ${
                                  cat.score === v
                                    ? cls
                                    : locked
                                      ? "bg-muted/40 text-muted-foreground/30 cursor-not-allowed line-through"
                                      : "bg-muted text-muted-foreground"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Note */}
                      <textarea rows={2}
                        className="w-full mt-1 bg-muted rounded px-3 py-2 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
                        placeholder="本项备注（可选）..."
                        value={cat.note}
                        onChange={(e) => setNote(key, e.target.value)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Grade summary & actions ────────────────────────────── */}
        <section className="rounded-md border-2 border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">总分</p>
              <p className="text-3xl font-black font-mono mt-0.5">{totalScore}/10</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest">评级</p>
              <p className={`text-3xl font-black mt-0.5 ${
                finalGrade === "S" ? "text-[#f5c842]" :
                finalGrade === "A" ? "text-[#b8a0e8]" :
                finalGrade === "B" ? "text-[#6ea8d8]" :
                "text-warning"
              }`}>{routeToWatch ? "观察" : finalGrade + "级"}</p>
            </div>
          </div>

          {canUpgradeS && (
            <button onClick={() => setManualS((v) => !v)}
              className={`w-full py-2 rounded text-xs font-bold border transition-colors ${
                manualS ? "bg-[#f5c842]/20 border-[#f5c842] text-[#f5c842]" : "bg-muted border-border text-muted-foreground"
              }`}
            >
              {manualS ? "👑 已升级 S 级（点击取消）" : "👑 升级为 S 级（10分可选）"}
            </button>
          )}

          {hardStopped && !isEditing && (
            <p className="text-[11px] text-loss">⚠ 硬门槛未过，强制转入观察</p>
          )}
          {!hardStopped && semiHardStopped && !isEditing && (
            <p className="text-[11px] text-warning">⚠ 半硬门槛（{semiHardChips.join("、")}）：自动降级一档 + 建议金额砍半</p>
          )}
          {reverseWaterWarning && (
            <div className="rounded border border-loss/40 bg-loss/10 px-3 py-2">
              <p className="text-[11px] text-loss font-semibold">⚠ 倒赔嫌疑</p>
              <p className="text-[10px] text-loss/80 mt-0.5">{reverseWaterWarning}</p>
            </div>
          )}
          {/* B7 编辑模式下硬门槛解除的显式提醒 —— 防止通过编辑绕过硬门槛 */}
          {isEditingBet && editOriginalBet && !hardStopped && isHardStopped(editOriginalBet.scores) && (
            <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2">
              <p className="text-[11px] text-warning font-semibold">⚠ 此单原本是硬门槛观察单</p>
              <p className="text-[10px] text-warning/80 mt-0.5">改动后已允许下注，请确认评分调整是基于新信息、而非事后合理化。</p>
            </div>
          )}

          {/* Edit-mode inline watch reason */}
          {isEditingWatch && (
            <div className="pt-1">
              <p className="text-[11px] text-muted-foreground mb-1.5">观察原因</p>
              <textarea rows={2} value={watchReason} onChange={(e) => setWatchReason(e.target.value)}
                className="w-full bg-muted rounded px-3 py-2 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
                placeholder="为什么转入观察..."
              />
            </div>
          )}

          {!isEditing && (
            <>
              {isLocked && (
                <p className="text-[11px] text-loss mt-2 text-center">
                  ⚠ {formatLockMessage(lockState)}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  disabled={!coreReady}
                  onClick={handleOpenWatch}
                  className={`py-3 rounded font-bold text-sm ${
                    coreReady ? "bg-muted text-foreground active:opacity-80" : "bg-muted/50 text-muted-foreground/40"
                  }`}
                >
                  转入观察
                </button>
                <button
                  disabled={!coreReady || routeToWatch || isLocked}
                  onClick={handleOpenConfirm}
                  className={`py-3 rounded font-bold text-sm ${
                    coreReady && !routeToWatch && !isLocked ? "bg-foreground text-background active:opacity-80" : "bg-muted/50 text-muted-foreground/40"
                  }`}
                >
                  {isLocked ? "已锁定" : "保存下注记录"}
                </button>
              </div>
            </>
          )}

          {isEditingBet && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => router.back()}
                className="py-3 rounded font-bold text-sm bg-muted text-foreground active:opacity-80"
              >
                取消
              </button>
              <button
                disabled={!coreReady}
                onClick={handleOpenEditConfirm}
                className={`py-3 rounded font-bold text-sm ${
                  coreReady ? "bg-foreground text-background active:opacity-80" : "bg-muted/50 text-muted-foreground/40"
                }`}
              >
                保存修改
              </button>
            </div>
          )}

          {isEditingWatch && (
            <>
              {editOriginalWatch?.promotedToBetId && (
                <p className="text-[11px] text-warning mt-2 text-center">
                  此观察已补录为下注，无法再次转换
                </p>
              )}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => router.back()}
                  className="py-3 rounded font-bold text-sm bg-muted text-foreground active:opacity-80"
                >
                  取消
                </button>
                <button
                  disabled={!coreReady}
                  onClick={handleSaveWatchEdit}
                  className={`py-3 rounded font-bold text-sm ${
                    coreReady ? "bg-muted text-foreground active:opacity-80" : "bg-muted/50 text-muted-foreground/40"
                  }`}
                >
                  保存观察
                </button>
              </div>
              {!editOriginalWatch?.promotedToBetId && (
                <button
                  disabled={!coreReady || isLocked}
                  onClick={handleOpenPromote}
                  className={`w-full mt-2 py-3 rounded font-bold text-sm ${
                    coreReady && !isLocked ? "bg-foreground text-background active:opacity-80" : "bg-muted/50 text-muted-foreground/40"
                  }`}
                >
                  {isLocked ? "已锁定 · 不可改为下注" : "↑ 改为下注（违纪标记）"}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {/* Confirm bet dialog (used for both new and edit) */}
      {confirmOpen && (() => {
        const origAmount    = editOriginalBet?.bets[0]?.amount ?? 0;
        const amtRes        = parseAmount(confirmAmount || "");
        const parsedAmount  = amtRes.ok ? amtRes.value : 0;
        const amountChanged = isEditingBet && amtRes.ok && parsedAmount !== origAmount;
        const hadResult     = !!editOriginalBet?.result;
        const softWarnings  = amtRes.ok
          ? detectSoftWarnings({
              amount: parsedAmount,
              settings,
              excludeId: isEditingBet ? editOriginalBet?.id : undefined,
            })
          : [];
        return (
          <div className="fixed inset-0 z-50 bg-background/80 flex items-end">
            <div className="w-full bg-card border-t border-border px-4 py-5 space-y-3 max-w-[430px] mx-auto max-h-[85vh] overflow-y-auto">
              <p className="text-sm font-bold">
                {confirmMode === "promote" ? "将观察改为下注（违纪）" : isEditingBet ? "确认修改" : "确认下注"}
              </p>
              {confirmMode === "promote" && (
                <p className="text-[11px] text-warning">
                  这条观察之前是判断为&ldquo;应观察不下注&rdquo;，改为下注将自动标记为违纪单。
                </p>
              )}
              {preview && (
                <div className="rounded-md bg-muted px-4 py-3">
                  <p className="text-base font-bold font-mono">{preview}</p>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">建议金额 ¥{suggestedAmount.toLocaleString()}（{finalGrade} 级）</p>
              <input value={confirmAmount}
                onChange={(e) => {
                  setConfirmAmount(e.target.value);
                  const r = parseAmount(e.target.value);
                  setConfirmAmountError(r.ok ? "" : (r.error || ""));
                }}
                inputMode="decimal"
                className={`w-full bg-muted rounded px-3 py-3 text-lg font-mono outline-none ${confirmAmountError ? "ring-1 ring-loss" : ""}`} />
              {/* 实时显示解析后金额，避免 "1.5 被读成 15" 之类的隐形坑 */}
              {amtRes.ok ? (
                <p className="text-[10px] text-muted-foreground">
                  将保存为 <span className="font-mono text-foreground">¥{parsedAmount.toLocaleString()}</span>
                </p>
              ) : (
                <p className="text-[11px] text-loss">{confirmAmountError || amtRes.error}</p>
              )}
              {!isEditingBet && overLimitBet && (
                <p className="text-[11px] text-loss">⚠ 今日下注已达上限 {todayCount.bets}/{todayBetLimit}</p>
              )}
              {!isEditingBet && isLocked && (
                <p className="text-[11px] text-loss font-semibold">
                  ⚠ {formatLockMessage(lockState)}
                </p>
              )}
              {isEditingBet && amountChanged && !hadResult && (
                <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2">
                  <p className="text-[10px] text-warning font-mono">
                    金额变更：¥{origAmount.toLocaleString()} → ¥{parsedAmount.toLocaleString()}
                    {parsedAmount > origAmount && <span className="ml-2 font-bold">（加仓 +¥{(parsedAmount - origAmount).toLocaleString()}）</span>}
                  </p>
                </div>
              )}
              {isEditingBet && amountChanged && hadResult && (
                <div className="rounded border border-loss/40 bg-loss/10 px-3 py-2">
                  <p className="text-[11px] text-loss font-semibold mb-0.5">⚠ 注意：修改金额会改变历史盈亏</p>
                  <p className="text-[10px] text-loss/80">
                    原金额 ¥{origAmount.toLocaleString()} → 新金额 ¥{parsedAmount.toLocaleString()}，
                    月/年 ROI 与盈亏曲线会回溯更新。
                  </p>
                </div>
              )}
              {softWarnings.length > 0 && (
                <div className="rounded border border-warning/30 bg-warning/10 px-3 py-2 space-y-1">
                  <p className="text-[10px] text-warning font-bold">⚠ 软提示（不阻止下注）</p>
                  {softWarnings.map((w, i) => (
                    <p key={i} className="text-[10px] text-warning/90 leading-snug">· {w}</p>
                  ))}
                </div>
              )}
              {isEditingBet && amountChanged && hadResult && !editAmountWarningShown ? (
                <button onClick={() => setEditAmountWarningShown(true)}
                  className="w-full py-3 rounded font-bold text-sm bg-loss text-white">
                  我已知晓，继续
                </button>
              ) : (
                <button
                  disabled={!amtRes.ok}
                  onClick={
                    confirmMode === "promote" ? handlePromoteFromEdit
                    : isEditingBet ? handleSaveBetEdit
                    : handleSaveBet
                  }
                  className={`w-full py-3 rounded font-bold text-sm ${amtRes.ok ? "bg-foreground text-background" : "bg-muted text-muted-foreground/50"}`}
                >
                  {confirmMode === "promote" ? "确认改为下注" : isEditingBet ? "确认保存修改" : "确认保存下注记录"}
                </button>
              )}
              <button onClick={() => { setConfirmOpen(false); setEditAmountWarningShown(false); }}
                className="w-full py-2 text-xs text-muted-foreground">取消</button>
            </div>
          </div>
        );
      })()}

      {/* Confirm watch dialog */}
      {watchOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-end">
          <div className="w-full bg-card border-t border-border px-4 py-5 space-y-3 max-w-[430px] mx-auto max-h-[85vh] overflow-y-auto">
            <p className="text-sm font-bold">转入观察池</p>
            {hardFailChips.length > 0 && (
              <div className="rounded-md bg-loss/10 border border-loss/30 px-3 py-2">
                <p className="text-[10px] font-bold text-loss mb-1.5">硬门槛未过</p>
                <div className="flex flex-wrap gap-1">
                  {hardFailChips.map((c) => (
                    <span key={c} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-loss/20 text-loss">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">观察原因</p>
            <textarea rows={3} value={watchReason} onChange={(e) => setWatchReason(e.target.value)}
              className="w-full bg-muted rounded px-3 py-2 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
              placeholder="为什么转入观察..."
            />
            {overLimitWatch && (
              <p className="text-[11px] text-warning">⚠ 今日观察已达上限 {todayCount.watches}/{settings.riskControls.maxDailyWatches}</p>
            )}
            <button onClick={handleSaveWatch}
              className="w-full py-3 rounded font-bold text-sm bg-foreground text-background">
              确认转入观察
            </button>
            <button onClick={() => setWatchOpen(false)}
              className="w-full py-2 text-xs text-muted-foreground">取消</button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense>
      <ReviewInner />
    </Suspense>
  );
}
