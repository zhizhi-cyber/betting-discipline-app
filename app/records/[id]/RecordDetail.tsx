"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Trash2, Star, Pencil } from "lucide-react";
import type { Outcome, BetRecord, AnalysisVerdict, ScoreData, SidedHandicap } from "@/lib/types";
import { calcPnl, getTotalBetAmount, SUBDIMS, formatBetPreview, formatSidedHandicap, ERROR_OPTIONS, ERROR_TAXONOMY, POSITIVE_TAXONOMY, parseKickoff, DECISION_RATING_LABELS, errorWeightOf, positiveWeightOf } from "@/lib/types";
import { getBetRecords, saveBetRecord, deleteBetRecord, getAbandonedRecords } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

const GRADE_COLORS: Record<string, string> = {
  S: "text-[#f5c842]", A: "text-[#b8a0e8]", B: "text-[#6ea8d8]", C: "text-warning",
};

const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: "win",       label: "赢盘" },
  { key: "half_win",  label: "赢半盘" },
  { key: "push",      label: "走盘" },
  { key: "half_loss", label: "输半盘" },
  { key: "loss",      label: "输盘" },
];

const SCORE_LABELS: Record<string, string> = {
  fundamental: "基本面",
  odds:        "赔率/盘口分析",
  reliability: "可靠性",
  trap:        "诱盘/抽水",
  bookie:      "庄家立场",
};

const VERDICT_OPTIONS: { key: AnalysisVerdict; label: string; cls: string }[] = [
  { key: "accurate", label: "事后印证：准",   cls: "bg-profit text-white" },
  { key: "passable", label: "事后印证：勉强", cls: "bg-muted-foreground text-white" },
  { key: "off",      label: "事后印证：偏",   cls: "bg-loss text-white" },
];

function fmtDateTime(iso: string) {
  return parseKickoff(iso).toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function RecordDetail({ id: propId }: { id?: string }) {
  const params = useParams();
  const router = useRouter();
  const id = propId ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const [record, setRecord] = useState<BetRecord | undefined>(undefined);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  useEffect(() => {
    const found = getBetRecords().find((r) => r.id === id);
    setRecord(found);
  }, [id]);

  const { show: showToast, node: toastNode } = useToast();

  const [scoresExpanded, setScoresExpanded] = useState(false);
  const [deductionExpanded, setDeductionExpanded] = useState(true);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [checkedErrors, setCheckedErrors] = useState<string[]>([]);
  const [checkedPositives, setCheckedPositives] = useState<string[]>([]);
  const [decisionRating, setDecisionRating] = useState<number>(0);
  const [reviewNote, setReviewNote] = useState("");
  const [analysisVerdict, setAnalysisVerdict] = useState<AnalysisVerdict | null>(null);
  const [scoreHome, setScoreHome] = useState<string>("");
  const [scoreAway, setScoreAway] = useState<string>("");

  useEffect(() => {
    if (record) {
      setSelectedOutcome(record.result?.outcome ?? null);
      // No auto-preselect: empty unless previously saved
      setCheckedErrors(record.result?.errors ?? []);
      setCheckedPositives(record.result?.positiveNotes ?? []);
      setDecisionRating(record.result?.decisionRating ?? 0);
      setReviewNote(record.result?.reviewNote ?? "");
      setAnalysisVerdict(record.result?.analysisVerdict ?? null);
      // 观察→下注 的比分同步：若本下注尚未填比分但源观察已有赛果，预填
      let homeInit = record.result?.finalScore?.home;
      let awayInit = record.result?.finalScore?.away;
      if ((homeInit == null || awayInit == null) && "convertedFromWatchId" in record && record.convertedFromWatchId) {
        const src = getAbandonedRecords().find((w) => w.id === record.convertedFromWatchId);
        if (src?.finalScore) {
          if (homeInit == null) homeInit = src.finalScore.home;
          if (awayInit == null) awayInit = src.finalScore.away;
        }
      }
      setScoreHome(homeInit != null ? String(homeInit) : "");
      setScoreAway(awayInit != null ? String(awayInit) : "");
    }
  }, [record]);

  const totalPnl = useMemo(() => {
    if (!selectedOutcome || !record) return null;
    return record.bets.reduce((sum, bet) => sum + calcPnl(bet.amount, bet.odds, selectedOutcome), 0);
  }, [selectedOutcome, record]);

  const totalBetAmt = record ? getTotalBetAmount(record) : 0;

  const toggleError = (err: string) =>
    setCheckedErrors((prev) => prev.includes(err) ? prev.filter((e) => e !== err) : [...prev, err]);

  const togglePositive = (note: string) =>
    setCheckedPositives((prev) => prev.includes(note) ? prev.filter((n) => n !== note) : [...prev, note]);

  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">记录不存在</p>
          <Link href="/records" className="text-xs underline mt-2 block text-muted-foreground">返回列表</Link>
        </div>
      </div>
    );
  }

  const betSlip = record.bets[0];
  const preview = betSlip ? formatBetPreview({
    teamName: record.bettingDirection === "home" ? record.homeTeam : record.awayTeam,
    handicapSide: record.handicapSide,
    handicapValue: record.handicapValue,
    bettingDirection: record.bettingDirection,
    odds: betSlip.odds,
  }) : "";

  const sidedFilled = (s: { homeValues: unknown[]; awayValues: unknown[] }) =>
    s.homeValues.length > 0 || s.awayValues.length > 0;
  const hasDeduction = record.deduction &&
    (sidedFilled(record.deduction.fairRanges) ||
     sidedFilled(record.deduction.homeWinBookieExpected) ||
     sidedFilled(record.deduction.awayWinBookieExpected) ||
     record.deduction.personalAnalysis ||
     record.deduction.confidence > 0);

  const finalScore = record.result?.finalScore;

  return (
    <div className="min-h-screen pb-28">
      {toastNode}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground">
            <ArrowLeft size={15} />
            <span className="text-sm">返回</span>
          </button>
          <span className="font-semibold text-sm truncate max-w-[120px]">单场详情</span>
          <div className="flex items-center gap-2">
            {record.isDisciplineViolation && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-bold">违纪</span>
            )}
            <span className={`text-xs font-black ${GRADE_COLORS[record.grade]}`}>{record.grade}级</span>
            <button onClick={() => router.push(`/review?edit=${record.id}`)} className="text-muted-foreground p-1" aria-label="编辑">
              <Pencil size={14} />
            </button>
            <button onClick={() => setDeleteConfirm(true)} className="text-muted-foreground/50 p-1 -mr-1">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-end">
          <div className="w-full bg-card border-t border-border px-4 py-5 space-y-3 max-w-[430px] mx-auto">
            <p className="text-sm font-bold">确认删除这条记录？</p>
            <p className="text-xs text-muted-foreground">删除后无法恢复</p>
            <button
              onClick={() => {
                deleteBetRecord(record.id);
                // 通过 sessionStorage 让下一个页面的 records 列表能弹 toast
                try { sessionStorage.setItem("bda_flash", "下注记录已删除"); } catch {}
                router.push("/records");
              }}
              className="w-full py-3 rounded font-bold text-sm bg-loss text-white"
            >
              确认删除
            </button>
            <button onClick={() => setDeleteConfirm(false)} className="w-full py-2 text-xs text-muted-foreground">
              取消
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-5">
        {/* Hero */}
        <div className="border-b border-border pb-4">
          <p className="text-base font-bold">{record.match}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {record.homeTeam} vs {record.awayTeam}
          </p>
          {finalScore && (
            <p className="text-sm font-mono text-foreground mt-1">
              <span className="text-muted-foreground">比分</span>
              <span className="mx-2 font-bold tabular-nums">{finalScore.home} : {finalScore.away}</span>
            </p>
          )}
          {preview && (
            <div className="mt-2 rounded-md bg-muted px-3 py-2 inline-block">
              <p className="text-sm font-bold font-mono">{preview}</p>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Chip label="评分" value={`${record.totalScore}/10`} />
            <Chip label="开赛" value={fmtDateTime(record.kickoffTime)} />
            <Chip label="金额" value={`¥${betSlip?.amount.toLocaleString() ?? "-"}`} />
          </div>
          {record.isDisciplineViolation && record.violationReason && (
            <div className="mt-2 flex items-start gap-1.5 px-2.5 py-1.5 rounded bg-warning/10 border border-warning/30">
              <span className="text-[10px] font-bold text-warning shrink-0 leading-relaxed">违纪原因</span>
              <span className="text-[11px] text-foreground/80 leading-relaxed">{record.violationReason}</span>
            </div>
          )}

          {totalPnl !== null && (
            <div className={`mt-4 text-4xl font-black font-mono tabular-nums ${totalPnl > 0 ? "text-profit" : totalPnl < 0 ? "text-loss" : "text-neutral"}`}>
              {totalPnl > 0 ? "+" : ""}{totalPnl === 0 ? "±0" : totalPnl.toLocaleString()}
            </div>
          )}
          {totalPnl !== null && totalBetAmt > 0 && (
            <p className="text-[11px] text-muted-foreground mt-1">
              投注 ¥{totalBetAmt.toLocaleString()}
              <span className="mx-1 opacity-30">·</span>
              回报率 {totalPnl >= 0 ? "+" : ""}{((totalPnl / totalBetAmt) * 100).toFixed(1)}%
            </p>
          )}
        </div>

        {/* 变盘记录 */}
        {(record.openHandicap || record.openOdds != null || record.closeHandicap || record.closeOdds != null) && (
          <div className="border border-border rounded-md overflow-hidden bg-card">
            <div className="px-4 py-2.5 border-b border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">变盘记录</p>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="text-muted-foreground">
                  初盘：
                  <span className="font-mono text-foreground">
                    {record.openHandicap || "—"}
                    {record.openOdds != null && ` @${record.openOdds}`}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  临开赛：
                  <span className="font-mono text-foreground">
                    {record.closeHandicap || "—"}
                    {record.closeOdds != null && ` @${record.closeOdds}`}
                  </span>
                </div>
              </div>
              {(() => {
                const oh = record.openHandicap ? parseFloat(record.openHandicap) : NaN;
                const ch = record.closeHandicap ? parseFloat(record.closeHandicap) : NaN;
                const oo = record.openOdds ?? NaN;
                const co = record.closeOdds ?? NaN;
                const lineDiff = !isNaN(oh) && !isNaN(ch) ? ch - oh : null;
                const oddsDiff = !isNaN(oo) && !isNaN(co) ? co - oo : null;
                if (lineDiff === null && oddsDiff === null) return null;
                return (
                  <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/50">
                    {lineDiff !== null && (
                      <span>让球：{lineDiff > 0 ? `升盘 +${lineDiff.toFixed(2)}` : lineDiff < 0 ? `降盘 \u2212${Math.abs(lineDiff).toFixed(2)}` : "未变"}</span>
                    )}
                    {lineDiff !== null && oddsDiff !== null && <span className="mx-1.5 opacity-40">·</span>}
                    {oddsDiff !== null && (
                      <span>水位：{oddsDiff > 0 ? `升 +${oddsDiff.toFixed(2)}` : oddsDiff < 0 ? `降 \u2212${Math.abs(oddsDiff).toFixed(2)}` : "未变"}</span>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Handicap deduction */}
        {hasDeduction && (
          <div className="border border-border rounded-md overflow-hidden">
            <button onClick={() => setDeductionExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-card">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">盘口推演</p>
              {deductionExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {deductionExpanded && (
              <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
                <SidedHandicapView label="合理让球区间" data={record.deduction.fairRanges} homeTeam={record.homeTeam} awayTeam={record.awayTeam} />
                <SidedHandicapView label="主队胜 · 庄家应开盘口" data={record.deduction.homeWinBookieExpected} homeTeam={record.homeTeam} awayTeam={record.awayTeam} />
                <SidedHandicapView label="客队胜 · 庄家应开盘口" data={record.deduction.awayWinBookieExpected} homeTeam={record.homeTeam} awayTeam={record.awayTeam} />
                {record.deduction.confidence > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground">推演信心度</p>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map((n) => (
                        <Star key={n} size={12} strokeWidth={1.5}
                          className={n <= record.deduction.confidence ? "fill-[#f5c842] text-[#f5c842]" : "text-muted-foreground/30"} />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{record.deduction.confidence}/5</span>
                  </div>
                )}
                {record.deduction.suspectedTrap && (
                  <p className="text-[10px] text-warning font-medium">⚠ 记录了诱盘可能</p>
                )}
                {/* 个人分析 intentionally omitted here — shown once in "个人分析回看" below */}
              </div>
            )}
          </div>
        )}

        {/* Scores */}
        <div className="border border-border rounded-md overflow-hidden">
          <button onClick={() => setScoresExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">纪律评分回顾</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-muted-foreground">{record.totalScore}/10</span>
              {scoresExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </div>
          </button>
          {scoresExpanded && (
            <div className="divide-y divide-border border-t border-border">
              {(Object.entries(record.scores) as [keyof ScoreData, typeof record.scores.fundamental][]).map(([key, item]) => {
                const subdims = SUBDIMS[key] ?? [];
                return (
                  <div key={key} className={`px-4 py-3 border-l-2 ${
                    item.score === 2 ? "border-l-profit" : item.score === 1 ? "border-l-warning" : "border-l-loss bg-loss/5"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold">{SCORE_LABELS[key]}</p>
                      <span className={`text-xs font-bold font-mono ${
                        item.score === 2 ? "text-profit" : item.score === 1 ? "text-warning" : "text-loss"
                      }`}>{item.score}/2</span>
                    </div>
                    {item.subdims && Object.keys(item.subdims).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {subdims.map((sd) => {
                          const c = item.subdims[sd.key];
                          if (!c) return null;
                          const label = c === "A" ? sd.optionA : c === "B" ? sd.optionB : sd.optionC;
                          return (
                            <span key={sd.key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {sd.label}·{label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {item.note && <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{item.note}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bet slips */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">子单列表</p>
          <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
            {record.bets.map((bet, idx) => (
              <div key={bet.id} className="px-4 py-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-mono">#{idx + 1}</span>
                    <span className="text-xs font-semibold">{bet.type === "pre" ? "赛前单" : "滚球单"}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{fmtDateTime(bet.betTime)}</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] text-muted-foreground">盘口</p>
                    <p className="text-xs font-semibold mt-0.5">{bet.handicapSide === "home" ? "主让" : "客让"} {bet.handicapValue}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">港盘水位</p>
                    <p className="text-xs font-semibold font-mono mt-0.5">{bet.odds}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">金额</p>
                    <p className="text-sm font-bold font-mono tabular-nums mt-0.5">¥{bet.amount.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Result & settlement */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">结果与结算</p>
          <div className="flex gap-1.5 mb-3">
            {OUTCOMES.map(({ key, label }) => (
              <button key={key} onClick={() => setSelectedOutcome(key)}
                className={`flex-1 py-2 rounded text-xs font-semibold transition-colors ${
                  selectedOutcome === key
                    ? key === "win" || key === "half_win" ? "bg-profit text-white"
                    : key === "push" ? "bg-neutral text-white"
                    : "bg-loss text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >{label}</button>
            ))}
          </div>

          {selectedOutcome ? (
            <div className={`rounded-md p-4 text-center border ${
              totalPnl === null ? "border-border bg-card"
              : totalPnl > 0  ? "border-profit/30 bg-profit/5"
              : totalPnl < 0  ? "border-loss/30 bg-loss/5"
              : "border-border bg-card"
            }`}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">结算盈亏</p>
              <p className={`text-4xl font-black font-mono tabular-nums mt-1 ${
                totalPnl === null ? "text-muted-foreground"
                : totalPnl > 0   ? "text-profit"
                : totalPnl < 0   ? "text-loss"
                : "text-neutral"
              }`}>
                {totalPnl === null ? "—" : totalPnl > 0 ? `+${totalPnl.toLocaleString()}` : totalPnl === 0 ? "±0" : totalPnl.toLocaleString()}
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">请选择比赛结果</p>
            </div>
          )}
        </div>

        {/* Post-match review */}
        {selectedOutcome && (
          <div className="space-y-4">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">赛后复盘</p>

            {/* Final score input */}
            <div className="rounded-md border border-border bg-card p-3">
              <p className="text-[11px] font-bold text-foreground mb-2">最终比分</p>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-14 truncate">{record.homeTeam}</span>
                <input
                  type="number" min={0} inputMode="numeric"
                  value={scoreHome}
                  onChange={(e) => setScoreHome(e.target.value)}
                  className="w-12 bg-muted rounded px-2 py-1.5 text-sm font-mono tabular-nums text-center outline-none"
                />
                <span className="text-muted-foreground font-bold">:</span>
                <input
                  type="number" min={0} inputMode="numeric"
                  value={scoreAway}
                  onChange={(e) => setScoreAway(e.target.value)}
                  className="w-12 bg-muted rounded px-2 py-1.5 text-sm font-mono tabular-nums text-center outline-none"
                />
                <span className="text-[10px] text-muted-foreground w-14 truncate">{record.awayTeam}</span>
                <span className="text-[10px] text-muted-foreground/50 ml-auto">可选</span>
              </div>
            </div>

            {/* Analysis verdict (on personal analysis) */}
            {record.deduction.personalAnalysis && (
              <div className="rounded-md border border-border bg-card p-3">
                <p className="text-[11px] font-bold text-foreground mb-1.5">个人分析回看</p>
                <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap mb-2">{record.deduction.personalAnalysis}</p>
                <p className="text-[10px] text-muted-foreground mb-1.5">事后印证</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {VERDICT_OPTIONS.map(({ key, label, cls }) => (
                    <button key={key} onClick={() => setAnalysisVerdict(analysisVerdict === key ? null : key)}
                      className={`py-2 rounded text-[11px] font-bold ${
                        analysisVerdict === key ? cls : "bg-muted text-muted-foreground"
                      }`}
                    >{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Positive notes — 按大类分组（镜像失误结构） */}
            <div>
              <p className="text-[11px] font-bold text-foreground mb-2">哪里做得好（多选）</p>
              <div className="space-y-2">
                {POSITIVE_TAXONOMY.map((grp) => (
                  <div key={grp.category}>
                    <p className="text-[10px] text-muted-foreground/70 mb-1">{grp.category}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {grp.items.map((note) => {
                        const w = positiveWeightOf(note);
                        const sev = w === 3 ? "重" : w === 2 ? "中" : "轻";
                        const sevCls = w === 3 ? "text-profit" : w === 2 ? "text-warning" : "text-muted-foreground";
                        return (
                          <button key={note} onClick={() => togglePositive(note)}
                            className={`px-2.5 py-1.5 rounded text-[11px] font-medium leading-tight transition-colors inline-flex items-center gap-1 ${
                              checkedPositives.includes(note)
                                ? "bg-profit/15 text-profit border border-profit/30"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <span className={`text-[8px] font-bold px-1 rounded border border-current/40 ${checkedPositives.includes(note) ? "" : sevCls}`}>{sev}</span>
                            {note}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* 旧数据里有但不在新分类里的扁平项，保留可取消 */}
                {(() => {
                  const known = new Set(POSITIVE_TAXONOMY.flatMap((g) => g.items));
                  const legacy = checkedPositives.filter((n) => !known.has(n));
                  if (legacy.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[10px] text-muted-foreground/70 mb-1">历史选项</p>
                      <div className="flex flex-wrap gap-1.5">
                        {legacy.map((note) => (
                          <button key={note} onClick={() => togglePositive(note)}
                            className="px-2.5 py-1.5 rounded text-[11px] bg-profit/15 text-profit border border-profit/30"
                          >{note}</button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Errors — 按大类分组 */}
            <div>
              <p className="text-[11px] font-bold text-foreground mb-2">哪里做得不好（多选）</p>
              <div className="space-y-2">
                {ERROR_TAXONOMY.map((grp) => (
                  <div key={grp.category}>
                    <p className="text-[10px] text-muted-foreground/70 mb-1">{grp.category}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {grp.items.map((err) => {
                        const w = errorWeightOf(err);
                        const sev = w === 3 ? "重" : w === 2 ? "中" : "轻";
                        const sevCls = w === 3 ? "text-loss" : w === 2 ? "text-warning" : "text-muted-foreground";
                        return (
                          <button key={err} onClick={() => toggleError(err)}
                            className={`px-2.5 py-1.5 rounded text-[11px] font-medium leading-tight transition-colors inline-flex items-center gap-1 ${
                              checkedErrors.includes(err)
                                ? "bg-loss/15 text-loss border border-loss/30"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            <span className={`text-[8px] font-bold px-1 rounded border border-current/40 ${checkedErrors.includes(err) ? "" : sevCls}`}>{sev}</span>
                            {err}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {/* 旧数据里有但不在新分类里的扁平项，保留可取消 */}
                {(() => {
                  const known = new Set(ERROR_TAXONOMY.flatMap((g) => g.items));
                  const legacy = checkedErrors.filter((e) => !known.has(e));
                  if (legacy.length === 0) return null;
                  return (
                    <div>
                      <p className="text-[10px] text-muted-foreground/70 mb-1">历史选项</p>
                      <div className="flex flex-wrap gap-1.5">
                        {Array.from(new Set([...legacy, ...ERROR_OPTIONS])).map((err) => (
                          <button key={err} onClick={() => toggleError(err)}
                            className={`px-2.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                              checkedErrors.includes(err)
                                ? "bg-loss/15 text-loss border border-loss/30"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {err}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Decision rating — red stars (盈利色, different from yellow confidence stars) */}
            <div className="rounded-md border border-border bg-card p-3">
              <div className="flex items-baseline justify-between mb-1.5">
                <p className="text-[11px] font-bold text-foreground">本场决策总评</p>
                <span className="text-[10px] text-muted-foreground/60">非必要</span>
              </div>
              <p className="text-[10px] text-muted-foreground/70 mb-2">
                1 差 · 2 勉强 · 3 尚可 · 4 良好 · 5 优秀
              </p>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => {
                    const active = decisionRating >= n;
                    return (
                      <button key={n}
                        onClick={() => setDecisionRating(decisionRating === n ? 0 : n)}
                        className="p-1 active:opacity-60 transition-opacity"
                        aria-label={`决策评分 ${n}`}
                      >
                        <Star size={22} strokeWidth={1.5}
                          className={active ? "fill-profit text-profit" : "text-muted-foreground/40"} />
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] text-muted-foreground ml-1">
                  {decisionRating === 0 ? "未评" : `${decisionRating}/5 · ${DECISION_RATING_LABELS[decisionRating]}`}
                </span>
              </div>
            </div>

            {/* Review note */}
            <textarea rows={3}
              className="w-full bg-muted rounded-md px-3 py-2 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
              placeholder="复盘备注（可选）..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />

            <button
              onClick={() => {
                if (!record || !selectedOutcome) return;
                const hasReflection =
                  reviewNote.trim().length > 0 ||
                  checkedErrors.length > 0 ||
                  checkedPositives.length > 0 ||
                  decisionRating > 0 ||
                  !!analysisVerdict ||
                  (scoreHome !== "" && scoreAway !== "");
                const isCleanWin =
                  (selectedOutcome === "win" || selectedOutcome === "half_win" || selectedOutcome === "push") &&
                  checkedErrors.length === 0;
                const parsedHome = scoreHome === "" ? undefined : parseInt(scoreHome, 10);
                const parsedAway = scoreAway === "" ? undefined : parseInt(scoreAway, 10);
                const finalScore = (parsedHome !== undefined && !isNaN(parsedHome) &&
                                    parsedAway !== undefined && !isNaN(parsedAway))
                  ? { home: parsedHome, away: parsedAway }
                  : undefined;
                const updated: BetRecord = {
                  ...record,
                  result: {
                    outcome: selectedOutcome,
                    errors: checkedErrors,
                    reviewNote,
                    analysisVerdict: analysisVerdict ?? undefined,
                    finalScore,
                    positiveNotes: checkedPositives.length > 0 ? checkedPositives : undefined,
                    decisionRating: decisionRating > 0 ? decisionRating : undefined,
                  },
                  completionStatus: isCleanWin || hasReflection ? "complete" : "pending_improve",
                };
                saveBetRecord(updated);
                setRecord(updated);
                showToast("复盘已保存", "success");
              }}
              className="w-full py-3 rounded font-bold text-sm bg-foreground text-background active:opacity-80 transition-opacity"
            >
              保存复盘
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-muted rounded px-2.5 py-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

function SidedHandicapView({
  label, data, homeTeam, awayTeam,
}: {
  label: string;
  data: SidedHandicap;
  homeTeam: string;
  awayTeam: string;
}) {
  const text = formatSidedHandicap(data, homeTeam, awayTeam);
  if (!text) return null;  // Incomplete → hide entirely (must select both team AND values)
  return (
    <div className="flex items-baseline gap-2">
      <p className="text-[10px] text-muted-foreground shrink-0">{label}</p>
      <p className="text-[12px] font-mono font-semibold text-foreground flex-1">{text}</p>
    </div>
  );
}
