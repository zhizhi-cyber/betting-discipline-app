"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Settings } from "lucide-react";
import { getTotalPnl, getTotalBetAmount, type Outcome, type ReviewConclusion, type BetRecord, type AbandonedRecord } from "@/lib/mock-data";
import { getBetRecords, getAbandonedRecords, getSettings, calcMonthStats, calcYearStats, calcAllTimeStats, syncPendingReview } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" });
}

const OUTCOME_LABELS: Record<Outcome, string> = {
  win: "胜", half_win: "赢半", push: "走", half_loss: "输半", loss: "负",
};

const OUTCOME_PNL_COLOR: Record<Outcome, string> = {
  win: "text-profit", half_win: "text-profit", push: "text-neutral",
  half_loss: "text-loss", loss: "text-loss",
};

const CONCLUSION_LABELS: Record<ReviewConclusion, string> = {
  abandon_correct: "放弃得对", abandon_wrong: "放弃错了", no_regret: "仍不后悔",
};

const GRADE_COLORS: Record<string, string> = {
  S: "text-[#f5c842]", A: "text-[#b8a0e8]", B: "text-[#6ea8d8]", C: "text-warning",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [rangeLabel, setRangeLabel] = useState("");
  const [recentBets, setRecentBets] = useState<BetRecord[]>([]);
  const [recentAbandoned, setRecentAbandoned] = useState<AbandonedRecord[]>([]);
  const [stats, setStats] = useState({ totalPnl: 0, totalBet: 0, roi: 0, count: 0, pendingReviewCount: 0 });
  const [weeklyTarget, setWeeklyTarget] = useState(5000);
  const [monthlyTarget, setMonthlyTarget] = useState(20000);
  const [timeRange, setTimeRange] = useState<"month" | "year" | "all">("month");

  useEffect(() => {
    syncPendingReview();

    const settings = getSettings();
    const range = settings.displayPrefs.defaultTimeRange;
    setTimeRange(range);
    setWeeklyTarget(settings.goals.weeklyTarget);
    setMonthlyTarget(settings.goals.monthlyTarget);

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    let s;
    if (range === "month") {
      s = calcMonthStats(y, m);
      const lastDay = new Date(y, m, 0).getDate();
      setRangeLabel(`${y}年${m}月1日 – ${m}月${lastDay}日`);
    } else if (range === "year") {
      s = calcYearStats(y);
      setRangeLabel(`${y}年度`);
    } else {
      s = calcAllTimeStats();
      setRangeLabel("全部历史");
    }

    setStats({
      totalPnl: s.totalPnl,
      totalBet: s.totalBet,
      roi: Math.round(s.roi * 10) / 10,
      count: s.total,
      pendingReviewCount: s.pendingReviewCount,
    });

    const bets = getBetRecords().sort(
      (a, b) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime()
    );
    setRecentBets(bets.slice(0, 3));

    const abandoned = getAbandonedRecords().sort(
      (a, b) => new Date(b.kickoffTime).getTime() - new Date(a.kickoffTime).getTime()
    );
    setRecentAbandoned(abandoned.slice(0, 2));
  }, []);

  const rangeStatLabel = timeRange === "month" ? "本月" : timeRange === "year" ? "本年" : "历史";

  const monthProgress = Math.min(Math.max(Math.round((stats.totalPnl / monthlyTarget) * 100), 0), 100);
  const monthGap = monthlyTarget - stats.totalPnl;

  return (
    <div className="min-h-screen bg-background pb-28">

      {/* ── Pending Review Alert ────────────────────────────────── */}
      {stats.pendingReviewCount > 0 && (
        <Link href="/records" className="block">
          <div className="bg-loss/10 border-b border-loss/20 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-loss animate-pulse shrink-0" />
              <p className="text-xs font-semibold text-loss">
                {stats.pendingReviewCount} 场比赛待复盘
              </p>
            </div>
            <span className="text-[10px] text-loss/70 underline">去填写</span>
          </div>
        </Link>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-6 pb-1">
        <p className="text-[11px] text-muted-foreground uppercase tracking-widest">纪律盘 · 足球亚盘</p>
        <Link href="/settings" className="text-muted-foreground p-1 -mr-1">
          <Settings size={16} strokeWidth={1.5} />
        </Link>
      </div>

      {/* ── Hero: PnL ───────────────────────────────────────────── */}
      <div className="px-4 pt-2 pb-5 border-b border-border">
        <p className="text-[10px] text-muted-foreground/60 mb-1">{rangeLabel}</p>
        <div className={`text-5xl font-black font-mono leading-none tracking-tight ${stats.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
          {stats.totalPnl >= 0 ? "+" : ""}{stats.totalPnl.toLocaleString()}
        </div>
        <div className="flex items-center gap-3 mt-2.5">
          <StatTriple label={`${rangeStatLabel}投注`} value={stats.totalBet > 0 ? `¥${(stats.totalBet / 1000).toFixed(0)}k` : "—"} />
          <span className="text-border">|</span>
          <StatTriple
            label={`${rangeStatLabel}ROI`}
            value={stats.totalBet > 0 ? `${stats.roi >= 0 ? "+" : ""}${stats.roi}%` : "—"}
            valueClass={stats.roi >= 0 ? "text-profit" : "text-loss"}
          />
          <span className="text-border">|</span>
          <StatTriple label={`${rangeStatLabel}场次`} value={`${stats.count}场`} />
        </div>
      </div>

      <div className="px-4 space-y-0">

        {/* ── Goals ───────────────────────────────────────────────── */}
        <div className="py-4 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">目标进度</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">月度目标</span>
              <span className="text-[11px] font-mono text-muted-foreground">¥{monthlyTarget.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">当前</span>
              <span className={`text-[11px] font-bold font-mono ${stats.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
                {stats.totalPnl >= 0 ? "+" : ""}{stats.totalPnl.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">还差</span>
              <span className={`text-[11px] font-mono ${monthGap > 0 ? "text-warning" : "text-profit"}`}>
                {monthGap > 0 ? `¥${monthGap.toLocaleString()}` : "已达成 ✓"}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-px mt-1">
              <div className="h-px rounded-full bg-profit transition-all" style={{ width: `${monthProgress}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground text-right">{monthProgress}%</p>
          </div>
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">本周目标 ¥{weeklyTarget.toLocaleString()}</span>
            <span className="text-[11px] text-muted-foreground">—</span>
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <div className="py-4 space-y-2.5 border-b border-border">
          <Link
            href="/review"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-foreground text-background rounded-lg font-bold text-sm active:opacity-80 transition-opacity"
          >
            <Plus size={15} strokeWidth={3} />
            开始纪律审查
          </Link>
          <div className="flex gap-2">
            <Link href="/records" className="flex-1 py-2.5 text-center text-xs font-medium text-muted-foreground border border-border rounded-lg">
              全部记录
            </Link>
            <Link href="/records" className="flex-1 py-2.5 text-center text-xs font-medium text-muted-foreground border border-border rounded-lg">
              放弃池
            </Link>
          </div>
        </div>

        {/* ── Recent Bets ──────────────────────────────────────────── */}
        <div className="pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">最近下注</p>
            <Link href="/records" className="text-[10px] text-muted-foreground underline underline-offset-2">全部</Link>
          </div>
          {recentBets.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 py-3">暂无下注记录</p>
          ) : (
            <div className="space-y-0 divide-y divide-border">
              {recentBets.map((r) => {
                const pnl = getTotalPnl(r);
                const outcome = r.result?.outcome;
                const betAmt = getTotalBetAmount(r);
                return (
                  <button key={r.id} onClick={() => router.push(`/records?id=${r.id}`)} className="w-full text-left">
                    <div className="flex items-center gap-3 py-3 first:pt-0 active:opacity-60 transition-opacity">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black shrink-0 ${GRADE_COLORS[r.grade]}`}>{r.grade}</span>
                          <p className="text-xs font-semibold truncate">{r.match}</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {r.bettingDirection === "home" ? "投主" : "投客"}
                          <span className="mx-1 opacity-30">·</span>
                          {r.handicapSide === "home" ? "主让" : "客让"}{r.handicapValue}
                          <span className="mx-1 opacity-30">·</span>
                          ¥{(betAmt / 1000).toFixed(0)}k
                          <span className="mx-1 opacity-30">·</span>
                          {fmtDate(r.kickoffTime)}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {outcome ? (
                          <>
                            <p className="text-[10px] text-muted-foreground">{OUTCOME_LABELS[outcome]}</p>
                            {pnl !== null && (
                              <p className={`text-sm font-black font-mono mt-0.5 ${OUTCOME_PNL_COLOR[outcome]}`}>
                                {pnl > 0 ? "+" : ""}{pnl === 0 ? "±0" : pnl.toLocaleString()}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-[10px] text-warning">待复盘</p>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Recent Abandoned ─────────────────────────────────────── */}
        <div className="border-t border-border pt-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">最近放弃</p>
            <Link href="/records" className="text-[10px] text-muted-foreground underline underline-offset-2">全部</Link>
          </div>
          {recentAbandoned.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 py-3">暂无放弃记录</p>
          ) : (
            <div className="space-y-0 divide-y divide-border">
              {recentAbandoned.map((a) => (
                <button key={a.id} onClick={() => router.push(`/records?aid=${a.id}`)} className="w-full text-left">
                  <div className="flex items-center gap-3 py-3 first:pt-0 active:opacity-60 transition-opacity">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate opacity-60">{a.match}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 opacity-60">
                        {a.bettingDirection === "home" ? "投主" : "投客"}
                        <span className="mx-1 opacity-30">·</span>
                        {a.handicapSide === "home" ? "主让" : "客让"}{a.handicapValue}
                        <span className="mx-1 opacity-30">·</span>
                        {fmtDate(a.kickoffTime)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      {a.reviewConclusion && (
                        <p className={`text-[10px] font-bold ${
                          a.reviewConclusion === "abandon_correct" ? "text-profit" :
                          a.reviewConclusion === "no_regret" ? "text-[#6ea8d8]" : "text-loss"
                        }`}>
                          {CONCLUSION_LABELS[a.reviewConclusion]}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

      </div>

      <BottomNav />
    </div>
  );
}

function StatTriple({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold font-mono mt-0.5 leading-none ${valueClass}`}>{value}</p>
    </div>
  );
}
