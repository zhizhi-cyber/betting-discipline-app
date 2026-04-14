"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { calcPnl, getTotalBetAmount, type Outcome, type BetRecord } from "@/lib/mock-data";
import { getBetRecords, saveBetRecord, deleteBetRecord } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

// ─── Constants ────────────────────────────────────────────────────────────────

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
  odds:        "赔率分析",
  reliability: "可靠性",
  trap:        "诱盘/抽水嫌疑",
  bookie:      "庄家立场复核",
};

const REVERSE_PROB_LABELS: Record<string, string> = {
  very_low:       "可能性极低",
  somewhat:       "有一定可能",
  not_low:        "可能性不低",
  cannot_exclude: "无法排除",
};

const ALL_ERROR_OPTIONS = [
  "基本面误判",
  "赔率/盘口理解错误",
  "庄家立场判断错误",
  "情绪下注/追单",
  "不该下却下了",
  "应放弃却没放弃",
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecordDetail() {
  const params = useParams();
  const router = useRouter();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
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
    if (record.scores.trap.score === 0) {
      if (!auto.includes("不该下却下了")) auto.push("不该下却下了");
    }
    return auto;
  }, [record]);

  const [scoresExpanded, setScoresExpanded] = useState(false);
  const [deductionExpanded, setDeductionExpanded] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
  const [checkedErrors, setCheckedErrors] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");

  // Sync state when record loads
  useEffect(() => {
    if (record) {
      setSelectedOutcome(record.result?.outcome ?? null);
      setCheckedErrors(record.result?.errors?.length ? record.result.errors : autoErrors);
      setReviewNote(record.result?.reviewNote ?? "");
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

  const handicapLabel = `${record.handicapSide === "home" ? "主让" : "客让"} ${record.handicapValue}`;
  const hasDeduction = record.deduction &&
    (record.deduction.fairRanges.values.length > 0 ||
     record.deduction.homeWinBookieExpected.values.length > 0 ||
     record.deduction.doubts);

  return (
    <div className="min-h-screen bg-background pb-28">
      {toastNode}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/records" className="flex items-center gap-1 text-muted-foreground">
            <ArrowLeft size={15} />
            <span className="text-sm">记录</span>
          </Link>
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

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-end">
          <div className="w-full bg-card border-t border-border px-4 py-5 space-y-3">
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

        {/* ── Hero ────────────────────────────────────────────────── */}
        <div className="border-b border-border pb-4">
          <p className="text-base font-bold">{record.match}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {record.homeTeam} vs {record.awayTeam}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Chip label="让球" value={handicapLabel} />
            <Chip label="投注" value={record.bettingDirection === "home" ? `主队（${record.homeTeam}）` : `客队（${record.awayTeam}）`} />
            <Chip label="评分" value={`${record.totalScore}/10`} />
            <Chip label="开赛" value={fmtDateTime(record.kickoffTime)} />
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

        {/* ── Handicap Deduction (collapsible, read-only) ─────────── */}
        {hasDeduction && (
          <div className="border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setDeductionExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-card"
            >
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">盘口推演</p>
              {deductionExpanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
            </button>
            {deductionExpanded && (
              <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
                {record.deduction.fairRanges.values.length > 0 && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1.5">合理让球区间</p>
                    <div className="flex flex-wrap gap-1">
                      {record.deduction.fairRanges.side && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          {record.deduction.fairRanges.side === "home" ? "主让" : "客让"}
                        </span>
                      )}
                      {record.deduction.fairRanges.values.map((v) => (
                        <span key={v} className="text-[10px] px-2 py-0.5 rounded bg-muted font-mono text-muted-foreground">
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {record.deduction.reverseProbability && (
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground">反向结果概率</p>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {REVERSE_PROB_LABELS[record.deduction.reverseProbability] ?? record.deduction.reverseProbability}
                    </span>
                  </div>
                )}
                {record.deduction.suspectedTrap && (
                  <p className="text-[10px] text-warning font-medium">⚠ 记录了诱盘可能</p>
                )}
                {record.deduction.doubts && (
                  <div>
                    <p className="text-[10px] text-muted-foreground mb-1">疑虑点</p>
                    <p className="text-xs text-muted-foreground/80 leading-relaxed">{record.deduction.doubts}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Discipline Score Review (collapsible) ──────────────── */}
        <div className="border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setScoresExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card"
          >
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">纪律评分回顾</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-muted-foreground">{record.totalScore}/10</span>
              {scoresExpanded ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
            </div>
          </button>
          {scoresExpanded && (
            <div className="divide-y divide-border border-t border-border">
              {(Object.entries(record.scores) as [string, typeof record.scores.fundamental][]).map(([key, item]) => (
                <div key={key}
                  className={`flex items-start gap-3 px-4 py-3 ${item.score === 0 ? "border-l-2 border-l-loss bg-loss/5" : "border-l-2 border-l-profit bg-card"}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold">{SCORE_LABELS[key]}</p>
                      {key === "bookie" && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-loss/15 text-loss">硬门槛</span>
                      )}
                      {key === "reliability" && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-warning/15 text-warning">半硬门槛</span>
                      )}
                    </div>
                    {item.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.tags.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{t}</span>
                        ))}
                      </div>
                    )}
                    {item.note && <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{item.note}</p>}
                  </div>
                  <span className={`text-xs font-bold font-mono shrink-0 ${item.score === 2 ? "text-profit" : "text-loss"}`}>
                    {item.score === 2 ? "+2" : " 0"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Bet Slips ────────────────────────────────────────────── */}
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

        {/* ── Result & Settlement ──────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">结果与结算</p>
          <div className="flex gap-1.5 mb-3">
            {OUTCOMES.map(({ key, label }) => (
              <button key={key} onClick={() => setSelectedOutcome(key)}
                className={`flex-1 py-2 rounded text-xs font-semibold transition-colors ${
                  selectedOutcome === key
                    ? key === "win" || key === "half_win"
                      ? "bg-profit text-white"
                      : key === "push"
                        ? "bg-neutral text-white"
                        : "bg-loss text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
              </button>
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
              {record.bets.length === 1 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  ¥{record.bets[0].amount.toLocaleString()} × {record.bets[0].odds}
                  {(selectedOutcome === "half_win" || selectedOutcome === "half_loss") ? " × 0.5" : ""}
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">请选择比赛结果</p>
            </div>
          )}
        </div>

        {/* ── Post-match Review ────────────────────────────────────── */}
        {selectedOutcome && (
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">赛后复盘</p>
            {autoErrors.length > 0 && checkedErrors.some((e) => autoErrors.includes(e)) && (
              <p className="text-[10px] text-muted-foreground/60 mb-2">
                ↓ 根据0分项自动预选，可取消
              </p>
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
                const updated: BetRecord = {
                  ...record,
                  result: { outcome: selectedOutcome, errors: checkedErrors, reviewNote },
                  completionStatus: reviewNote || checkedErrors.length > 0 ? "complete" : "pending_improve",
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
