"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Trash2, Star } from "lucide-react";
import type { Outcome, BetRecord, AnalysisVerdict, ScoreData } from "@/lib/types";
import { calcPnl, getTotalBetAmount, SUBDIMS, formatBetPreview } from "@/lib/types";
import { getBetRecords, saveBetRecord, deleteBetRecord } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

const GRADE_COLORS: Record<string, string> = {
  S: "text-[#f5c842]", A: "text-[#b8a0e8]", B: "text-[#6ea8d8]", C: "text-warning",
};

const OUTCOMES: { key: Outcome; label: string }[] = [
  { key: "win",       label: "赢全" },
  { key: "half_win",  label: "赢半" },
  { key: "push",      label: "走水" },
  { key: "half_loss", label: "输半" },
  { key: "loss",      label: "输全" },
];

const SCORE_LABELS: Record<string, string> = {
  fundamental: "基本面",
  odds:        "赔率/盘口分析",
  reliability: "可靠性",
  trap:        "诱盘/抽水",
  bookie:      "庄家立场",
};

const ALL_ERROR_OPTIONS = [
  "基本面误判",
  "赔率/盘口理解错误",
  "庄家立场判断错误",
  "情绪下注/追单",
  "不该下却下了",
  "应转观察却下了",
];

const VERDICT_OPTIONS: { key: AnalysisVerdict; label: string; cls: string }[] = [
  { key: "accurate", label: "事后印证：准",   cls: "bg-profit text-white" },
  { key: "passable", label: "事后印证：勉强", cls: "bg-muted-foreground text-white" },
  { key: "off",      label: "事后印证：偏",   cls: "bg-loss text-white" },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
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

  const autoErrors = useMemo(() => {
    if (!record) return [];
    const auto: string[] = [];
    if (record.scores.fundamental.score === 0) auto.push("基本面误判");
    if (record.scores.odds.score === 0) auto.push("赔率/盘口理解错误");
    if (record.scores.bookie.score === 0) auto.push("庄家立场判断错误");
    if (record.scores.trap.score === 0 && !auto.includes("不该下却下了")) auto.push("不该下却下了");
    return auto;
  }, [record]);

  const [scoresExpanded, setScoresExpanded] = useState(false);
  const [deductionExpanded, setDeductionExpanded] = useState(true);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [checkedErrors, setCheckedErrors] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const [analysisVerdict, setAnalysisVerdict] = useState<AnalysisVerdict | null>(null);

  useEffect(() => {
    if (record) {
      setSelectedOutcome(record.result?.outcome ?? null);
      setCheckedErrors(record.result?.errors?.length ? record.result.errors : autoErrors);
      setReviewNote(record.result?.reviewNote ?? "");
      setAnalysisVerdict(record.result?.analysisVerdict ?? null);
    }
  }, [record, autoErrors]);

  const totalPnl = useMemo(() => {
    if (!selectedOutcome || !record) return null;
    return record.bets.reduce((sum, bet) => sum + calcPnl(bet.amount, bet.odds, selectedOutcome), 0);
  }, [selectedOutcome, record]);

  const totalBetAmt = record ? getTotalBetAmount(record) : 0;

  const toggleError = (err: string) =>
    setCheckedErrors((prev) => prev.includes(err) ? prev.filter((e) => e !== err) : [...prev, err]);

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

  const hasDeduction = record.deduction &&
    (record.deduction.fairRanges.values.length > 0 ||
     record.deduction.homeWinBookieExpected.values.length > 0 ||
     record.deduction.awayWinBookieExpected.values.length > 0 ||
     record.deduction.personalAnalysis ||
     record.deduction.confidence > 0);

  return (
    <div className="min-h-screen bg-background pb-28">
      {toastNode}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground">
            <ArrowLeft size={15} />
            <span className="text-sm">记录</span>
          </button>
          <span className="font-semibold text-sm truncate max-w-[120px]">单场详情</span>
          <div className="flex items-center gap-2">
            {record.isDisciplineViolation && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/15 text-warning font-bold">违纪</span>
            )}
            <span className={`text-xs font-black ${GRADE_COLORS[record.grade]}`}>{record.grade}级</span>
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
            <button onClick={() => { deleteBetRecord(record.id); router.push("/records"); }}
              className="w-full py-3 rounded font-bold text-sm bg-loss text-white">
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

          {totalPnl !== null && (
            <div className={`mt-4 text-4xl font-black font-mono ${totalPnl > 0 ? "text-profit" : totalPnl < 0 ? "text-loss" : "text-neutral"}`}>
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
                {record.deduction.fairRanges.values.length > 0 && (
                  <SidedHandicapView label="合理让球区间" data={record.deduction.fairRanges} />
                )}
                {record.deduction.homeWinBookieExpected.values.length > 0 && (
                  <SidedHandicapView label="主队胜 · 庄家应开盘口" data={record.deduction.homeWinBookieExpected} />
                )}
                {record.deduction.awayWinBookieExpected.values.length > 0 && (
                  <SidedHandicapView label="客队胜 · 庄家应开盘口" data={record.deduction.awayWinBookieExpected} />
                )}
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
                {record.deduction.personalAnalysis && (
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[10px] font-bold text-foreground mb-1">个人分析</p>
                    <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{record.deduction.personalAnalysis}</p>
                  </div>
                )}
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
                    <p className="text-xs font-semibold font-mono mt-0.5">¥{bet.amount.toLocaleString()}</p>
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
              <p className={`text-4xl font-black font-mono mt-1 ${
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
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">赛后复盘</p>

            {/* Analysis verdict */}
            {record.deduction.personalAnalysis && (
              <div className="rounded-md border border-border bg-card p-3 mb-3">
                <p className="text-[10px] font-bold text-foreground mb-1.5">个人分析回看</p>
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

            {autoErrors.length > 0 && checkedErrors.some((e) => autoErrors.includes(e)) && (
              <p className="text-[10px] text-muted-foreground/60 mb-2">↓ 根据0分项自动预选，可取消</p>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_ERROR_OPTIONS.map((err) => (
                <button key={err} onClick={() => toggleError(err)}
                  className={`px-3 py-2.5 rounded text-xs font-medium text-left leading-tight transition-colors ${
                    checkedErrors.includes(err)
                      ? autoErrors.includes(err)
                        ? "bg-loss/30 text-loss border border-loss/40"
                        : "bg-loss/20 text-loss border border-loss/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {err}
                  {autoErrors.includes(err) && checkedErrors.includes(err) && (
                    <span className="text-[8px] ml-1 opacity-60">自动</span>
                  )}
                </button>
              ))}
            </div>
            <textarea rows={3}
              className="w-full mt-3 bg-muted rounded-md px-3 py-2 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
              placeholder="复盘备注（可选）..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
            <button
              onClick={() => {
                if (!record || !selectedOutcome) return;
                const isCleanWin = (selectedOutcome === "win" || selectedOutcome === "half_win" || selectedOutcome === "push") && autoErrors.length === 0;
                const hasReflection = reviewNote.trim().length > 0 || checkedErrors.length > 0;
                const updated: BetRecord = {
                  ...record,
                  result: {
                    outcome: selectedOutcome,
                    errors: checkedErrors,
                    reviewNote,
                    analysisVerdict: analysisVerdict ?? undefined,
                  },
                  completionStatus: isCleanWin || hasReflection ? "complete" : "pending_improve",
                };
                saveBetRecord(updated);
                setRecord(updated);
                showToast("复盘已保存", "success");
              }}
              className="w-full mt-2 py-3 rounded font-bold text-sm bg-foreground text-background active:opacity-80 transition-opacity"
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

function SidedHandicapView({ label, data }: {
  label: string;
  data: { side: "home" | "away" | ""; values: string[] };
}) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1">
        {data.side && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
            {data.side === "home" ? "主让" : "客让"}
          </span>
        )}
        {data.values.map((v) => (
          <span key={v} className="text-[10px] px-2 py-0.5 rounded bg-muted font-mono text-muted-foreground">{v}</span>
        ))}
      </div>
    </div>
  );
}
