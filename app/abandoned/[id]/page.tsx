"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { mockAbandonedRecords, type ReviewConclusion } from "@/lib/mock-data";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

export function generateStaticParams() {
  return mockAbandonedRecords.map((r) => ({ id: r.id }));
}

// ─── Constants ────────────────────────────────────────────────────────────────

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

const ACTUAL_RESULTS: { key: string; label: string }[] = [
  { key: "win",     label: "赢了" },
  { key: "loss",    label: "输了" },
  { key: "push",    label: "走了" },
  { key: "unknown", label: "未知" },
];

const CONCLUSIONS: { key: ReviewConclusion; label: string; desc: string; color: string }[] = [
  {
    key: "abandon_correct",
    label: "放弃得对",
    desc: "信息不足以支撑下注，赛果也印证了这一点",
    color: "text-profit border-profit/30 bg-profit/5",
  },
  {
    key: "abandon_wrong",
    label: "放弃错了",
    desc: "赛果证明当时判断有偏差，信息其实足够",
    color: "text-loss border-loss/30 bg-loss/5",
  },
  {
    key: "no_regret",
    label: "仍不该后悔",
    desc: "即使赢了，当时的信息也不支撑下注，纪律执行正确",
    color: "text-[#6ea8d8] border-[#6ea8d8]/30 bg-[#6ea8d8]/5",
  },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AbandonedDetailPage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const record = mockAbandonedRecords.find((r) => r.id === id);

  const { show: showToast, node: toastNode } = useToast();

  const [scoresExpanded, setScoresExpanded] = useState(true);
  const [deductionExpanded, setDeductionExpanded] = useState(false);
  const [actualResult, setActualResult] = useState(record?.actualResult ?? "");
  const [conclusion, setConclusion] = useState<ReviewConclusion | "">(record?.reviewConclusion ?? "");
  const [reviewNote, setReviewNote] = useState(record?.reviewNote ?? "");

  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">记录不存在</p>
          <Link href="/records?tab=abandoned" className="text-xs underline mt-2 block text-muted-foreground">返回放弃池</Link>
        </div>
      </div>
    );
  }

  const handicapLabel = `${record.handicapSide === "home" ? "主让" : "客让"} ${record.handicapValue}`;
  const hasDeduction = record.deduction &&
    (record.deduction.fairRanges.values.length > 0 || record.deduction.doubts);

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
          <span className="font-semibold text-sm">放弃详情</span>
          <span className="text-[10px] text-muted-foreground">已放弃</span>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* ── Match + Abandon Reason ────────────────────────────── */}
        <div className="border-b border-border pb-4">
          <p className="text-base font-bold">{record.match}</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {record.homeTeam} vs {record.awayTeam}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Chip label="让球" value={handicapLabel} />
            <Chip label="投注方向" value={record.bettingDirection === "home" ? `主队（${record.homeTeam}）` : `客队（${record.awayTeam}）`} />
            <Chip label="评分" value={`${record.totalScore}/10`} />
            <Chip label="开赛" value={fmtDateTime(record.kickoffTime)} />
          </div>
          <div className="mt-3 border-l-2 border-l-loss pl-3 py-1.5">
            <p className="text-[9px] font-black text-loss uppercase tracking-widest">放弃原因</p>
            <p className="text-xs text-loss/80 mt-0.5">{record.abandonReason}</p>
          </div>
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

        {/* ── Discipline Score Review ─────────────────────────────── */}
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
              {(Object.entries(record.scores) as [string, typeof record.scores.fundamental][]).map(([key, item]) => {
                const isZero = item.score === 0;
                return (
                  <div key={key}
                    className={`flex items-start gap-3 px-4 py-3 border-l-2 ${
                      isZero ? "border-l-loss bg-loss/5" : "border-l-profit bg-card"
                    }`}
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
                            <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${
                              isZero ? "bg-loss/10 text-loss border-loss/20" : "bg-muted text-muted-foreground border-transparent"
                            }`}>{t}</span>
                          ))}
                        </div>
                      )}
                      {item.note && <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{item.note}</p>}
                    </div>
                    <span className={`text-xs font-bold font-mono shrink-0 ${isZero ? "text-loss" : "text-profit"}`}>
                      {isZero ? "0 未过" : "+2 通过"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Actual Result ─────────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">放弃后赛果</p>
          <div className="flex gap-1.5">
            {ACTUAL_RESULTS.map(({ key, label }) => (
              <button key={key} onClick={() => setActualResult(key)}
                className={`flex-1 py-2 rounded text-xs font-semibold transition-colors ${
                  actualResult === key
                    ? key === "win"   ? "bg-profit text-white"
                    : key === "loss"  ? "bg-loss text-white"
                    : key === "push"  ? "bg-neutral text-white"
                    : "bg-muted text-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Review Conclusion ─────────────────────────────────── */}
        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">回看结论</p>
          <div className="space-y-2">
            {CONCLUSIONS.map(({ key, label, desc, color }) => (
              <button key={key} onClick={() => setConclusion(key)}
                className={`w-full rounded border-2 px-4 py-3 text-left transition-colors ${
                  conclusion === key ? color : "border-border bg-card text-foreground"
                }`}
              >
                <p className="text-sm font-bold">{label}</p>
                <p className="text-[11px] mt-0.5 opacity-70 leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>

          {conclusion && (
            <textarea rows={3}
              className="w-full mt-3 bg-muted rounded-md px-3 py-2 text-xs outline-none resize-none placeholder:text-muted-foreground/40"
              placeholder="复盘补充（可选）..."
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          )}

          <button
            disabled={!conclusion}
            onClick={() => conclusion && showToast("回看结论已保存", "success")}
            className={`w-full mt-3 py-3 rounded font-bold text-sm transition-opacity ${
              conclusion ? "bg-foreground text-background active:opacity-80" : "bg-muted text-muted-foreground cursor-not-allowed opacity-40"
            }`}
          >
            保存回看结论
          </button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-muted rounded px-2.5 py-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}
