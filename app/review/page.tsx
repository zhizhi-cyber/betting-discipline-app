"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import BottomNav from "@/components/bottom-nav";
import { saveBetRecord, saveAbandonedRecord, getSettings } from "@/lib/storage";
import type { HandicapValue, ReverseOutcomeProbability } from "@/lib/types";
import { gradeFromScore } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

// Numeric handicap values — used in both match info and deduction module
const HANDICAP_VALUES: HandicapValue[] = ["0", "0.25", "0.5", "0.75", "1", "1.25", "1.5", "2"];

const REVERSE_PROBS: { key: ReverseOutcomeProbability; label: string }[] = [
  { key: "very_low",       label: "可能性极低" },
  { key: "somewhat",       label: "有一定可能" },
  { key: "not_low",        label: "可能性不低" },
  { key: "cannot_exclude", label: "无法排除" },
];


type ScoreKey = "fundamental" | "odds" | "reliability" | "trap" | "bookie";

interface ScoreItem {
  score: 2 | 0 | null;
  selectedTags: string[];
  note: string;
}

type ScoreState = Record<ScoreKey, ScoreItem>;

interface SidedHandicap {
  side: "home" | "away" | "";
  values: HandicapValue[];
}

interface DeductionState {
  fairRanges: SidedHandicap;
  homeWinExpected: SidedHandicap;
  awayWinExpected: SidedHandicap;
  reverseProbability: ReverseOutcomeProbability | "";
  suspectedTrap: boolean;
  doubts: string;
}

const SCORING_ITEMS: {
  key: ScoreKey;
  title: string;
  tags: string[];
  isHardStop?: boolean;
  isSemiHard?: boolean;
}[] = [
  {
    key: "fundamental",
    title: "基本面",
    tags: ["热门过热","强弱分明过头","状态支撑盘口","状态不支撑盘口","伤停影响判断","战意真实可用","历史形象易误导"],
  },
  {
    key: "odds",
    title: "赔率分析",
    tags: ["开盘出发点清晰","应得盘合理","盘口偏浅","盘口偏深","热门过于便宜","高低水有引导"],
  },
  {
    key: "reliability",
    title: "可靠性",
    tags: ["安全边界足够","值得放弃","想得清楚","信息不完整"],
    isSemiHard: true,
  },
  {
    key: "trap",
    title: "诱盘/抽水嫌疑",
    tags: ["无明显嫌疑","存在明显嫌疑"],
  },
  {
    key: "bookie",
    title: "庄家立场复核",
    tags: ["立场清晰","与大众一致但未强化","有明确反向支撑","立场暧昧"],
    isHardStop: true,
  },
];

const GRADE_MAP = {
  abandon: { label: "建议放弃", amount: 0,     amtLabel: "",       textColor: "text-loss",    bg: "bg-loss" },
  C:       { label: "C 级",   amount: 6000,  amtLabel: "¥6k",    textColor: "text-warning", bg: "bg-warning" },
  B:       { label: "B 级",   amount: 8000,  amtLabel: "¥8k",    textColor: "text-[#6ea8d8]", bg: "bg-[#6ea8d8]" },
  A:       { label: "A 级",   amount: 15000, amtLabel: "¥15k",   textColor: "text-[#b8a0e8]", bg: "bg-[#b8a0e8]" },
  S:       { label: "S 级",   amount: 22000, amtLabel: "¥22k",   textColor: "text-[#f5c842]", bg: "bg-[#f5c842]" },
};

function calcGrade(scores: ScoreState, total: number) {
  if (total <= 4) return GRADE_MAP.abandon;
  if (total === 6) return GRADE_MAP.C;
  if (total === 8) return GRADE_MAP.B;
  if (total === 10) {
    const allPass = scores.bookie.score === 2 && scores.reliability.score === 2 && scores.trap.score === 2;
    return allPass ? GRADE_MAP.S : GRADE_MAP.A;
  }
  return GRADE_MAP.abandon;
}

const emptyScore = (): ScoreItem => ({ score: null, selectedTags: [], note: "" });
const emptyScoreState = (): ScoreState => ({
  fundamental: emptyScore(), odds: emptyScore(), reliability: emptyScore(),
  trap: emptyScore(), bookie: emptyScore(),
});
const emptySided = (): SidedHandicap => ({ side: "", values: [] });
const emptyDeduction = (): DeductionState => ({
  fairRanges: emptySided(), homeWinExpected: emptySided(), awayWinExpected: emptySided(),
  reverseProbability: "", suspectedTrap: false, doubts: "",
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const router = useRouter();
  const [league, setLeague] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const matchName = [league, homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : ""].filter(Boolean).join(" ");
  const [kickoffTime, setKickoffTime] = useState("");
  const [handicapSide, setHandicapSide] = useState<"home" | "away" | "">("");
  const [handicapValue, setHandicapValue] = useState("");
  const [betType, setBetType] = useState<"pre" | "live">("pre");
  const [bettingDirection, setBettingDirection] = useState<"home" | "away" | "">("");

  const [deduction, setDeduction] = useState<DeductionState>(emptyDeduction());
  const [deductionExpanded, setDeductionExpanded] = useState(true);

  const [scores, setScores] = useState<ScoreState>(emptyScoreState());
  const [noteVisible, setNoteVisible] = useState<Partial<Record<ScoreKey, boolean>>>({});

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmedOnce, setConfirmedOnce] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const [abandonReason, setAbandonReason] = useState("");

  const totalScore = useMemo(
    () => Object.values(scores).reduce((sum, item) => sum + (item.score ?? 0), 0),
    [scores]
  );
  const scoredCount = Object.values(scores).filter((s) => s.score !== null).length;
  const allScored = scoredCount === 5;
  const isHardStopped = scores.bookie.score === 0;
  const isSemiStopped = scores.reliability.score === 0;
  const deductionFilled = deduction.fairRanges.values.length > 0;
  const canBet = allScored && deductionFilled && !isHardStopped && totalScore >= 6;
  const canAbandon = allScored && deductionFilled;

  const autoAbandonReason = useMemo(() => {
    if (!allScored) return "";
    const failed = SCORING_ITEMS.filter((item) => scores[item.key].score === 0);
    if (failed.length === 0) return `总分不达标（${totalScore}/10）`;
    return failed.map((item) => {
      if (item.isHardStop) return `${item.title}未通过（硬门槛）`;
      if (item.isSemiHard) return `${item.title}未通过（半硬门槛）`;
      return `${item.title}未通过`;
    }).join("；");
  }, [scores, allScored, totalScore]);
  const gradeInfo = useMemo(() => (allScored ? calcGrade(scores, totalScore) : null), [scores, totalScore, allScored]);

  const kickoffWarning = useMemo(() => {
    if (!kickoffTime) return false;
    const diff = (new Date(kickoffTime).getTime() - Date.now()) / 60000;
    return diff > 0 && diff < 15;
  }, [kickoffTime]);

  const suggestedAmount = gradeInfo?.amount ?? 0;
  const enteredAmount = parseInt(confirmAmount.replace(/[^0-9]/g, ""), 10) || 0;
  const isOverSuggested = enteredAmount > suggestedAmount;

  const verdict = (() => {
    if (!allScored)
      return { label: `${scoredCount}/5`, badgeBg: "bg-muted", badgeText: "text-muted-foreground", barBorder: "border-border" };
    if (isHardStopped)
      return { label: "禁止下注", badgeBg: "bg-loss", badgeText: "text-white", barBorder: "border-loss/30" };
    if (totalScore < 6)
      return { label: "建议放弃", badgeBg: "bg-warning/80", badgeText: "text-white", barBorder: "border-warning/30" };
    return { label: "可下注", badgeBg: "bg-profit", badgeText: "text-white", barBorder: "border-profit/30" };
  })();

  const toggleTag = (key: ScoreKey, tag: string) =>
    setScores((p) => ({
      ...p,
      [key]: {
        ...p[key],
        selectedTags: p[key].selectedTags.includes(tag)
          ? p[key].selectedTags.filter((t) => t !== tag)
          : [...p[key].selectedTags, tag],
      },
    }));

  const setScore = (key: ScoreKey, val: 2 | 0) => {
    setScores((p) => ({ ...p, [key]: { ...p[key], score: val } }));
    // Auto-link trap scoring if suspected trap is checked
    if (key === "trap" && val === 0 && deduction.suspectedTrap === false) {
      setDeduction((d) => ({ ...d, suspectedTrap: true }));
    }
  };

  const setNote = (key: ScoreKey, note: string) =>
    setScores((p) => ({ ...p, [key]: { ...p[key], note } }));

  const setSidedSide = (
    field: "fairRanges" | "homeWinExpected" | "awayWinExpected",
    side: "home" | "away",
  ) => setDeduction((d) => ({ ...d, [field]: { ...d[field], side } }));

  const toggleSidedValue = (
    field: "fairRanges" | "homeWinExpected" | "awayWinExpected",
    value: HandicapValue,
  ) => setDeduction((d) => {
    const cur = d[field].values;
    return {
      ...d,
      [field]: {
        ...d[field],
        values: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value],
      },
    };
  });

  const handleClear = () => {
    setLeague(""); setHomeTeam(""); setAwayTeam(""); setKickoffTime("");
    setHandicapSide(""); setHandicapValue(""); setBetType("pre");
    setBettingDirection("");
    setDeduction(emptyDeduction());
    setScores(emptyScoreState());
    setNoteVisible({});
    setConfirmOpen(false); setConfirmAmount(""); setConfirmedOnce(false);
    setAbandonOpen(false); setAbandonReason("");
    setDeductionExpanded(true);
  };

  const handleOpenAbandon = () => {
    setAbandonReason(autoAbandonReason);
    setAbandonOpen(true);
  };

  const handleSaveAbandoned = () => {
    const id = `a-${Date.now()}`;
    const settings = getSettings();
    const allPass = scores.bookie.score === 2 && scores.reliability.score === 2 && scores.trap.score === 2;
    const grade = gradeFromScore(totalScore, allPass);
    saveAbandonedRecord({
      id,
      type: "abandoned",
      match: matchName || "未命名比赛",
      homeTeam,
      awayTeam,
      kickoffTime: kickoffTime || new Date().toISOString(),
      bettingDirection: bettingDirection || "home",
      handicapSide: handicapSide || "home",
      handicapValue,
      totalScore,
      abandonReason,
      scores: {
        fundamental: { score: scores.fundamental.score ?? 0, tags: scores.fundamental.selectedTags, note: scores.fundamental.note },
        odds:        { score: scores.odds.score ?? 0,        tags: scores.odds.selectedTags,        note: scores.odds.note },
        reliability: { score: scores.reliability.score ?? 0, tags: scores.reliability.selectedTags, note: scores.reliability.note },
        trap:        { score: scores.trap.score ?? 0,        tags: scores.trap.selectedTags,        note: scores.trap.note },
        bookie:      { score: scores.bookie.score ?? 0,      tags: scores.bookie.selectedTags,      note: scores.bookie.note },
      },
      deduction: {
        fairRanges: deduction.fairRanges,
        homeWinBookieExpected: deduction.homeWinExpected,
        awayWinBookieExpected: deduction.awayWinExpected,
        reverseProbability: deduction.reverseProbability,
        suspectedTrap: deduction.suspectedTrap,
        doubts: deduction.doubts,
      },
      completionStatus: "pristine",
      createdAt: new Date().toISOString(),
    });
    router.push(`/abandoned/${id}`);
  };

  const handleSaveBet = () => {
    const id = `b-${Date.now()}`;
    const settings = getSettings();
    const allPass = scores.bookie.score === 2 && scores.reliability.score === 2 && scores.trap.score === 2;
    const grade = gradeFromScore(totalScore, allPass);
    const amount = parseInt(confirmAmount.replace(/[^0-9]/g, ""), 10) || settings.gradeAmounts[grade];
    saveBetRecord({
      id,
      type: "bet",
      match: matchName || "未命名比赛",
      homeTeam,
      awayTeam,
      kickoffTime: kickoffTime || new Date().toISOString(),
      bettingDirection: bettingDirection || "home",
      handicapSide: handicapSide || "home",
      handicapValue,
      grade,
      totalScore,
      scores: {
        fundamental: { score: scores.fundamental.score ?? 0, tags: scores.fundamental.selectedTags, note: scores.fundamental.note },
        odds:        { score: scores.odds.score ?? 0,        tags: scores.odds.selectedTags,        note: scores.odds.note },
        reliability: { score: scores.reliability.score ?? 0, tags: scores.reliability.selectedTags, note: scores.reliability.note },
        trap:        { score: scores.trap.score ?? 0,        tags: scores.trap.selectedTags,        note: scores.trap.note },
        bookie:      { score: scores.bookie.score ?? 0,      tags: scores.bookie.selectedTags,      note: scores.bookie.note },
      },
      deduction: {
        fairRanges: deduction.fairRanges,
        homeWinBookieExpected: deduction.homeWinExpected,
        awayWinBookieExpected: deduction.awayWinExpected,
        reverseProbability: deduction.reverseProbability,
        suspectedTrap: deduction.suspectedTrap,
        doubts: deduction.doubts,
      },
      bets: [{
        id: `bs-${Date.now()}`,
        type: betType,
        handicapSide: handicapSide || "home",
        handicapValue,
        odds: 0.85,
        amount,
        betTime: new Date().toISOString(),
      }],
      isDisciplineViolation: false,
      completionStatus: "pristine",
      createdAt: new Date().toISOString(),
    });
    router.push(`/records/${id}`);
  };

  const handleOpenConfirm = () => {
    setConfirmAmount(suggestedAmount.toString());
    setConfirmedOnce(false);
    setConfirmOpen(true);
  };

  return (
    <div className="min-h-screen bg-background pb-40">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-1 text-muted-foreground">
            <ArrowLeft size={15} />
            <span className="text-sm">返回</span>
          </Link>
          <span className="font-semibold text-sm">纪律审查</span>
          <button onClick={handleClear} className="text-[11px] text-muted-foreground/60">清空重填</button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* ── 1. Match Info + Betting Direction ─────────────────── */}
        <section className="space-y-2">
          <Label>比赛基础信息</Label>
          <div className="grid grid-cols-[1fr_auto_1fr] gap-1.5 items-center">
            <input
              className="w-full px-3 py-2 bg-muted rounded-md text-sm outline-none focus:ring-1 focus:ring-foreground/20 placeholder:text-muted-foreground/40"
              placeholder="主队"
              value={homeTeam}
              onChange={(e) => setHomeTeam(e.target.value)}
            />
            <span className="text-[11px] text-muted-foreground text-center font-bold">vs</span>
            <input
              className="w-full px-3 py-2 bg-muted rounded-md text-sm outline-none focus:ring-1 focus:ring-foreground/20 placeholder:text-muted-foreground/40"
              placeholder="客队"
              value={awayTeam}
              onChange={(e) => setAwayTeam(e.target.value)}
            />
          </div>
          <input
            className="w-full px-3 py-1.5 bg-muted rounded-md text-xs outline-none placeholder:text-muted-foreground/40"
            placeholder="联赛（可选，例：英超）"
            value={league}
            onChange={(e) => setLeague(e.target.value)}
          />

          {/* Handicap row */}
          <div className="flex gap-1.5 items-center flex-wrap">
            <span className="text-[11px] text-muted-foreground shrink-0">盘口让球</span>
            {(["home", "away"] as const).map((side) => (
              <button key={side}
                onClick={() => setHandicapSide(side)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${handicapSide === side ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
              >
                {side === "home" ? "主让" : "客让"}
              </button>
            ))}
            <div className="w-px h-3.5 bg-border shrink-0" />
            {HANDICAP_VALUES.map((v) => (
              <button key={v}
                onClick={() => setHandicapValue(v)}
                className={`px-2 py-1 rounded-md text-xs font-mono font-medium transition-colors ${handicapValue === v ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Betting direction */}
          <div className="flex gap-1.5 items-center">
            <span className="text-[11px] text-muted-foreground shrink-0">投注方向</span>
            {(["home", "away"] as const).map((dir) => (
              <button key={dir}
                onClick={() => setBettingDirection(dir)}
                className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors ${bettingDirection === dir ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
              >
                {dir === "home" ? `投主队${homeTeam ? "（" + homeTeam + "）" : ""}` : `投客队${awayTeam ? "（" + awayTeam + "）" : ""}`}
              </button>
            ))}
          </div>

          {/* Time + type */}
          <div className="flex gap-1.5 items-center">
            <input
              type="datetime-local"
              className="flex-1 px-2.5 py-1.5 bg-muted rounded-md text-xs outline-none"
              value={kickoffTime}
              onChange={(e) => setKickoffTime(e.target.value)}
            />
            {(["pre", "live"] as const).map((t) => (
              <button key={t}
                onClick={() => setBetType(t)}
                className={`shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${betType === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
              >
                {t === "pre" ? "赛前" : "滚球"}
              </button>
            ))}
          </div>
        </section>

        {kickoffWarning && (
          <DAlert level="warn" title="临场风险">距开赛不足 15 分钟 · 谨防临场冲动</DAlert>
        )}

        {/* ── 2. Handicap Deduction Module ──────────────────────── */}
        <section className="border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setDeductionExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card"
          >
            <div className="flex items-center gap-2">
              <Label noMargin>盘口推演</Label>
              <span className="text-[10px] text-muted-foreground/50">必填 · 不计分</span>
            </div>
            {deductionExpanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
          </button>

          {deductionExpanded && (
            <div className="px-4 pb-4 space-y-4 border-t border-border">

              {/* Fair handicap ranges */}
              <div className="space-y-2 pt-3">
                <p className="text-[11px] text-muted-foreground">合理让球区间（多选）</p>
                <HandicapMultiSelect
                  side={deduction.fairRanges.side}
                  values={deduction.fairRanges.values}
                  onSideChange={(s) => setSidedSide("fairRanges", s)}
                  onValueToggle={(v) => toggleSidedValue("fairRanges", v)}
                />
              </div>

              {/* Home win bookie expected */}
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">主队赢球 · 庄家应开（多选）</p>
                <HandicapMultiSelect
                  side={deduction.homeWinExpected.side}
                  values={deduction.homeWinExpected.values}
                  onSideChange={(s) => setSidedSide("homeWinExpected", s)}
                  onValueToggle={(v) => toggleSidedValue("homeWinExpected", v)}
                />
              </div>

              {/* Away win bookie expected */}
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">客队赢球 · 庄家应开（多选）</p>
                <HandicapMultiSelect
                  side={deduction.awayWinExpected.side}
                  values={deduction.awayWinExpected.values}
                  onSideChange={(s) => setSidedSide("awayWinExpected", s)}
                  onValueToggle={(v) => toggleSidedValue("awayWinExpected", v)}
                />
              </div>

              {/* Reverse probability */}
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">打出反向结果可能性</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {REVERSE_PROBS.map(({ key, label }) => (
                    <button key={key}
                      onClick={() => setDeduction((d) => ({ ...d, reverseProbability: d.reverseProbability === key ? "" : key }))}
                      className={`py-2 rounded text-xs font-medium transition-colors text-left px-3 ${
                        deduction.reverseProbability === key
                          ? key === "very_low" ? "bg-profit/20 text-profit border border-profit/30"
                          : key === "somewhat" ? "bg-muted text-foreground border border-foreground/20"
                          : key === "not_low"  ? "bg-warning/20 text-warning border border-warning/30"
                          : "bg-loss/20 text-loss border border-loss/30"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Suspected trap */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setDeduction((d) => ({ ...d, suspectedTrap: !d.suspectedTrap }));
                    // Auto-link: if checking trap, auto-set trap score to 0
                    if (!deduction.suspectedTrap && scores.trap.score !== 0) {
                      setScores((p) => ({ ...p, trap: { ...p.trap, score: 0 } }));
                    }
                  }}
                  className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                    deduction.suspectedTrap ? "bg-loss text-white" : "bg-muted border border-border"
                  }`}
                >
                  {deduction.suspectedTrap && <span className="text-[10px]">✓</span>}
                </button>
                <span className="text-xs text-muted-foreground">
                  存在诱盘可能
                  {deduction.suspectedTrap && <span className="ml-1.5 text-loss font-medium">→ 自动标记第4项评分</span>}
                </span>
              </div>

              {/* Doubts */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">疑虑点 <span className="opacity-50">（写下你最担心的地方）</span></p>
                <textarea rows={2}
                  className="w-full bg-muted rounded px-3 py-1.5 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
                  placeholder="例：主力中卫伤情未确认，盘口在开赛前异动..."
                  value={deduction.doubts}
                  onChange={(e) => setDeduction((d) => ({ ...d, doubts: e.target.value }))}
                />
              </div>
            </div>
          )}
        </section>

        {/* ── 3. Scoring Cards ────────────────────────────────────── */}
        <section>
          <Label>五项纪律评分</Label>
          <div className="space-y-0 divide-y divide-border border border-border rounded-md overflow-hidden">
            {SCORING_ITEMS.map((item, idx) => {
              const si = scores[item.key];
              const hardTriggered = item.isHardStop && si.score === 0;
              const semiTriggered = item.isSemiHard && si.score === 0;
              const showNote = noteVisible[item.key] || !!si.note;

              const leftBorderColor =
                si.score === 2 ? "border-l-profit" :
                si.score === 0 ? "border-l-loss" :
                "border-l-border";

              return (
                <div
                  key={item.key}
                  className={`border-l-2 ${leftBorderColor} px-3 py-3 space-y-2.5 transition-colors ${
                    hardTriggered ? "bg-loss/5" : semiTriggered ? "bg-warning/5" : "bg-card"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground font-mono w-3">{idx + 1}</span>
                      <span className="text-sm font-semibold">{item.title}</span>
                      {item.isHardStop && <MicroBadge color="loss">硬门槛</MicroBadge>}
                      {item.isSemiHard && <MicroBadge color="warning">半硬门槛</MicroBadge>}
                    </div>
                    {si.score !== null && (
                      <span className={`text-xs font-bold font-mono ${si.score === 2 ? "text-profit" : "text-loss"}`}>
                        {si.score === 2 ? "+2" : " 0"}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {item.tags.map((tag) => (
                      <button key={tag} onClick={() => toggleTag(item.key, tag)}
                        className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          si.selectedTags.includes(tag)
                            ? "bg-foreground text-background"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-1.5">
                    <button onClick={() => setScore(item.key, 2)}
                      className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors ${
                        si.score === 2 ? "bg-profit text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      通过 +2
                    </button>
                    <button onClick={() => setScore(item.key, 0)}
                      className={`flex-1 py-1.5 rounded text-xs font-semibold transition-colors ${
                        si.score === 0 ? "bg-loss text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      未过 0
                    </button>
                  </div>

                  {showNote ? (
                    <div>
                      <textarea rows={2}
                        autoFocus={!si.note}
                        className="w-full bg-muted rounded px-3 py-1.5 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
                        placeholder="补充说明..."
                        value={si.note}
                        onChange={(e) => setNote(item.key, e.target.value)}
                      />
                      {!si.note && (
                        <button onClick={() => setNoteVisible((p) => ({ ...p, [item.key]: false }))}
                          className="text-[10px] text-muted-foreground mt-1">收起</button>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => setNoteVisible((p) => ({ ...p, [item.key]: true }))}
                      className="text-[11px] text-muted-foreground/50">
                      + 补充说明
                    </button>
                  )}

                  {hardTriggered && (
                    <DAlert level="block" title="硬门槛触发">庄家立场复核未通过 · 下注按钮已锁定</DAlert>
                  )}
                  {semiTriggered && (
                    <DAlert level="warn" title="半硬门槛">可靠性未通过 · 请重新评估是否值得下注</DAlert>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 4. Verdict ────────────────────────────────────────── */}
        {allScored && gradeInfo && (
          <section className={`border rounded-md overflow-hidden ${
            isHardStopped ? "border-loss/30" : totalScore < 6 ? "border-warning/30" :
            gradeInfo === GRADE_MAP.S ? "border-[#f5c842]/30" : "border-border"
          }`}>
            {/* Grade header */}
            <div className={`px-4 py-3 flex items-end justify-between ${
              isHardStopped ? "bg-loss/10" : totalScore < 6 ? "bg-warning/10" :
              gradeInfo === GRADE_MAP.S ? "bg-[#f5c842]/5" : "bg-card"
            }`}>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">审查裁决</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-black font-mono">{totalScore}</span>
                  <span className="text-sm text-muted-foreground">/10</span>
                  <span className={`text-xl font-black ${gradeInfo.textColor}`}>{gradeInfo.label}</span>
                </div>
              </div>
              {gradeInfo.amount > 0 && (
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">建议金额</p>
                  <p className={`text-3xl font-black font-mono ${gradeInfo.textColor}`}>{gradeInfo.amtLabel}</p>
                </div>
              )}
            </div>

            {/* Status bar */}
            <div className={`px-4 py-3 font-bold text-sm text-center ${gradeInfo.bg} ${
              gradeInfo === GRADE_MAP.S || gradeInfo === GRADE_MAP.A ? "text-background" : "text-white"
            }`}>
              {isHardStopped ? "庄家立场复核未通过 · 禁止下注"
              : totalScore < 6 ? "总分不达标 · 建议放弃本场"
              : `审查通过 · ${gradeInfo.label} · ${gradeInfo.amtLabel}`}
            </div>

            {/* S grade special note */}
            {gradeInfo === GRADE_MAP.S && (
              <div className="px-4 py-2 border-t border-[#f5c842]/20 bg-[#f5c842]/5">
                <p className="text-[11px] text-[#f5c842]/80">S 级：全5项通过 · 核心三项（可靠性/诱盘/庄家）均无异议</p>
              </div>
            )}
          </section>
        )}

        {/* ── 5. Action Buttons ──────────────────────────────────── */}
        <div className="space-y-2 pt-1">
          {!allScored ? (
            <>
              <button disabled className="w-full py-3.5 rounded font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed opacity-40">
                保存为下注记录
              </button>
              <button disabled className="w-full py-3 rounded font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed opacity-40">
                保存到放弃池
              </button>
              <p className="text-center text-[11px] text-muted-foreground">完成全部 5 项评分后可操作</p>
            </>
          ) : !deductionFilled ? (
            <>
              <button disabled className="w-full py-3.5 rounded font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed opacity-40">
                保存为下注记录
              </button>
              <button disabled className="w-full py-3 rounded font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed opacity-40">
                保存到放弃池
              </button>
              <p className="text-center text-[11px] text-warning font-medium">⚠ 请先完成盘口推演（必填）</p>
            </>
          ) : canBet ? (
            <>
              {confirmOpen ? (
                <div className="border border-border rounded-md p-4 space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">确认下注金额</p>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono outline-none"
                      value={confirmAmount}
                      onChange={(e) => { setConfirmAmount(e.target.value); setConfirmedOnce(false); }}
                    />
                    <span className="flex items-center text-xs text-muted-foreground shrink-0">元</span>
                  </div>
                  {isOverSuggested && (
                    <DAlert level="warn" title="超出建议金额">
                      已超出 {gradeInfo?.label} 建议金额 {gradeInfo?.amtLabel} · 请确认是否继续
                    </DAlert>
                  )}
                  {isOverSuggested && !confirmedOnce ? (
                    <button
                      onClick={() => setConfirmedOnce(true)}
                      className="w-full py-3 rounded font-bold text-sm bg-warning text-white active:opacity-80"
                    >
                      我确认超额下注
                    </button>
                  ) : (
                    <button onClick={handleSaveBet} className="w-full py-3 rounded font-bold text-sm bg-foreground text-background active:opacity-80">
                      确认保存下注记录
                    </button>
                  )}
                  <button onClick={() => setConfirmOpen(false)} className="w-full py-2 text-xs text-muted-foreground">
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleOpenConfirm}
                  className="w-full py-3.5 rounded font-bold text-sm bg-foreground text-background active:opacity-80"
                >
                  保存为下注记录
                </button>
              )}
              {/* Abandon panel */}
              {abandonOpen ? (
                <div className="border border-border rounded-md p-4 space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">放弃原因</p>
                  <textarea rows={3}
                    className="w-full bg-muted rounded-md px-3 py-2 text-xs outline-none resize-none"
                    value={abandonReason}
                    onChange={(e) => setAbandonReason(e.target.value)}
                  />
                  <button onClick={handleSaveAbandoned} className="w-full py-3 rounded font-bold text-sm bg-foreground text-background active:opacity-80">
                    确认保存到放弃池
                  </button>
                  <button onClick={() => setAbandonOpen(false)} className="w-full py-2 text-xs text-muted-foreground">
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleOpenAbandon}
                  className="w-full py-3 rounded font-bold text-sm border border-loss/40 text-loss active:opacity-80"
                >
                  保存到放弃池
                </button>
              )}
            </>
          ) : (
            <>
              {abandonOpen ? (
                <div className="border border-border rounded-md p-4 space-y-3">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">放弃原因</p>
                  <textarea rows={3}
                    className="w-full bg-muted rounded-md px-3 py-2 text-xs outline-none resize-none"
                    value={abandonReason}
                    onChange={(e) => setAbandonReason(e.target.value)}
                  />
                  <button onClick={handleSaveAbandoned} className="w-full py-3 rounded font-bold text-sm bg-foreground text-background active:opacity-80">
                    确认保存到放弃池
                  </button>
                  <button onClick={() => setAbandonOpen(false)} className="w-full py-2 text-xs text-muted-foreground">
                    取消
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleOpenAbandon}
                  className="w-full py-3.5 rounded font-bold text-sm bg-foreground text-background active:opacity-80"
                >
                  保存到放弃池
                </button>
              )}
              <button disabled className="w-full py-3 rounded font-bold text-sm bg-muted text-muted-foreground cursor-not-allowed opacity-40">
                保存为下注记录
              </button>
              <p className="text-center text-[11px] text-loss font-medium">
                {isHardStopped ? "庄家立场未通过 · 下注已锁定" : "总分不达标 · 建议放弃"}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Floating Verdict Bar ─────────────────────────────────── */}
      {scoredCount > 0 && (
        <div className="fixed bottom-[64px] left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-[390px]">
          <div className={`bg-card/95 backdrop-blur-md border ${verdict.barBorder} rounded-md overflow-hidden flex items-stretch`}>
            <div className="flex items-center gap-3 px-4 py-3 flex-1">
              <span className="text-2xl font-black font-mono leading-none">
                {totalScore}
                <span className="text-xs font-normal text-muted-foreground">/{allScored ? 10 : scoredCount * 2}</span>
              </span>
              {allScored && gradeInfo && (
                <div>
                  <p className={`text-sm font-black leading-none ${gradeInfo.textColor}`}>{gradeInfo.label}</p>
                  {gradeInfo.amount > 0 && (
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">{gradeInfo.amtLabel}</p>
                  )}
                </div>
              )}
            </div>
            <div className={`flex items-center justify-center px-5 text-xs font-black min-w-[88px] ${verdict.badgeBg} ${verdict.badgeText}`}>
              {verdict.label}
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Label({ children, noMargin }: { children: React.ReactNode; noMargin?: boolean }) {
  return (
    <p className={`text-[10px] font-bold text-muted-foreground uppercase tracking-widest ${noMargin ? "" : "mb-2"}`}>
      {children}
    </p>
  );
}

function MicroBadge({ color, children }: { color: "loss" | "warning"; children: React.ReactNode }) {
  return (
    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
      color === "loss" ? "bg-loss/15 text-loss" : "bg-warning/15 text-warning"
    }`}>
      {children}
    </span>
  );
}

function DAlert({ level, title, children }: { level: "warn" | "block"; title: string; children: React.ReactNode }) {
  return (
    <div className={`border-l-2 pl-2.5 pr-2 py-1.5 ${
      level === "block" ? "border-l-loss bg-loss/5 text-loss" : "border-l-warning bg-warning/5 text-warning"
    }`}>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-70">{title}</p>
      <p className="text-[11px] font-medium mt-0.5 leading-relaxed opacity-90">{children}</p>
    </div>
  );
}

function HandicapMultiSelect({
  side,
  values,
  onSideChange,
  onValueToggle,
}: {
  side: "home" | "away" | "";
  values: HandicapValue[];
  onSideChange: (s: "home" | "away") => void;
  onValueToggle: (v: HandicapValue) => void;
}) {
  return (
    <div className="space-y-1.5">
      {/* Side selector */}
      <div className="flex gap-1.5">
        {(["home", "away"] as const).map((s) => (
          <button key={s} onClick={() => onSideChange(s)}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              side === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            {s === "home" ? "主让" : "客让"}
          </button>
        ))}
      </div>
      {/* Value chips */}
      <div className="flex flex-wrap gap-1.5">
        {HANDICAP_VALUES.map((v) => (
          <button key={v} onClick={() => onValueToggle(v)}
            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-colors ${
              values.includes(v) ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
