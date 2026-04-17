"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Settings, ChevronRight } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { motion } from "motion/react";
import { getTotalPnl, getTotalBetAmount, type Outcome, type ReviewConclusion, type BetRecord, type AbandonedRecord } from "@/lib/mock-data";
import { getBetRecords, getAbandonedRecords, getSettings, calcMonthStats, calcYearStats, calcWeekStats, calcAllTimeStats, syncPendingReview, countToday } from "@/lib/storage";
import { calcPnl, weekStart, weekEnd } from "@/lib/types";
import BottomNav from "@/components/bottom-nav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" });
}

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const OUTCOME_LABELS: Record<Outcome, string> = {
  win: "胜", half_win: "赢半", push: "走", half_loss: "输半", loss: "负",
};

const OUTCOME_PNL_COLOR: Record<Outcome, string> = {
  win: "text-profit", half_win: "text-profit", push: "text-neutral",
  half_loss: "text-loss", loss: "text-loss",
};

const CONCLUSION_LABELS: Record<ReviewConclusion, string> = {
  abandon_correct: "观察得对", abandon_wrong: "观察错了", no_regret: "仍不后悔",
};

const GRADE_COLORS: Record<string, string> = {
  S: "text-[#f5c842]", A: "text-[#b8a0e8]", B: "text-[#6ea8d8]", C: "text-warning",
};

type TimeRange = "week" | "month" | "year" | "all";

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ percent, size = 64, color }: { percent: number; size?: number; color: string }) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circ - (clamped / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius}
        stroke="currentColor" strokeWidth={stroke} fill="none"
        className="text-border"
      />
      <circle cx={size / 2} cy={size / 2} r={radius}
        stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 600ms ease-out" }}
      />
      <text x="50%" y="50%"
        dominantBaseline="central" textAnchor="middle"
        className="fill-foreground font-mono font-black"
        fontSize={size * 0.26}
      >{Math.round(clamped)}%</text>
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("month");
  const [rangeLabel, setRangeLabel] = useState("");
  const [recentBets, setRecentBets] = useState<BetRecord[]>([]);
  const [recentAbandoned, setRecentAbandoned] = useState<AbandonedRecord[]>([]);
  const [stats, setStats] = useState({ totalPnl: 0, totalBet: 0, roi: 0, count: 0, pendingReviewCount: 0 });
  const [target, setTarget] = useState(0);
  const [todayCount, setTodayCount] = useState({ bets: 0, watches: 0 });
  const [dailyLimits, setDailyLimits] = useState({ bets: 3, watches: 3 });
  const [allBets, setAllBets] = useState<BetRecord[]>([]);
  const [allAbandoned, setAllAbandoned] = useState<AbandonedRecord[]>([]);

  // Initial load: settings + records + default time range
  useEffect(() => {
    syncPendingReview();
    const settings = getSettings();
    setTimeRange(settings.displayPrefs.defaultTimeRange);
    setDailyLimits({
      bets: settings.riskControls.maxDailyMatches,
      watches: settings.riskControls.maxDailyWatches,
    });
    setTodayCount(countToday());
    setAllBets(getBetRecords());
    setAllAbandoned(getAbandonedRecords());
    setMounted(true);
  }, []);

  // Recompute stats / target / label when range changes
  useEffect(() => {
    if (!mounted) return;
    const settings = getSettings();
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;

    let s;
    let t = 0;
    if (timeRange === "week") {
      s = calcWeekStats(now);
      t = settings.goals.weeklyTarget;
      const ws = weekStart(now);
      const we = weekEnd(now);
      const fmt = (d: Date) => `${d.getMonth() + 1}月${d.getDate()}日`;
      setRangeLabel(`本周 ${fmt(ws)} – ${fmt(we)}`);
    } else if (timeRange === "month") {
      s = calcMonthStats(y, m);
      t = settings.goals.monthlyTarget;
      const lastDay = new Date(y, m, 0).getDate();
      setRangeLabel(`${y}年${m}月1日 – ${m}月${lastDay}日`);
    } else if (timeRange === "year") {
      s = calcYearStats(y);
      t = settings.goals.yearlyTarget;
      setRangeLabel(`${y}年度`);
    } else {
      s = calcAllTimeStats();
      t = 0;
      setRangeLabel("全部历史");
    }

    setTarget(t);
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
  }, [timeRange, mounted]);

  // Yesterday's activity
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }, []);
  const yesterdayKey = useMemo(() => isoDay(yesterday), [yesterday]);

  const yesterdayStats = useMemo(() => {
    const sameDay = (iso: string) => isoDay(new Date(iso)) === yesterdayKey;
    const bets = allBets.filter((r) => sameDay(r.kickoffTime));
    const watches = allAbandoned.filter((r) => sameDay(r.kickoffTime));
    let pnl = 0;
    let settled = 0, unsettled = 0;
    for (const r of bets) {
      if (r.result) {
        settled++;
        pnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
      } else {
        unsettled++;
      }
    }
    return { bets: bets.length, watches: watches.length, pnl, settled, unsettled };
  }, [allBets, allAbandoned, yesterdayKey]);

  // Sparkline data: running sum of daily PnL over last N days based on timeRange
  const sparkData = useMemo(() => {
    const now = new Date();
    let days = 7;
    if (timeRange === "month") days = 30;
    else if (timeRange === "year") days = 90;
    else if (timeRange === "all") days = 90;

    const daily: { day: string; pnl: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      let dayPnl = 0;
      for (const r of allBets) {
        if (!r.result) continue;
        const kt = new Date(r.kickoffTime);
        if (kt >= d && kt <= end) {
          dayPnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
        }
      }
      daily.push({ day: isoDay(d), pnl: dayPnl });
    }
    // Cumulative
    let running = 0;
    return daily.map((d) => ({ ...d, cum: (running += d.pnl) }));
  }, [allBets, timeRange]);

  const hasSparkData = sparkData.some((d) => d.pnl !== 0);

  const rangeStatLabel = timeRange === "week" ? "本周" : timeRange === "month" ? "本月" : timeRange === "year" ? "本年" : "历史";
  const overBet = todayCount.bets >= dailyLimits.bets;
  const overWatch = todayCount.watches >= dailyLimits.watches;

  // Goal progress (red if on-track, muted if behind, red if exceeded)
  const hasTarget = target > 0 && timeRange !== "all";
  const progress = hasTarget ? Math.max(0, Math.min(100, (stats.totalPnl / target) * 100)) : 0;
  const gap = target - stats.totalPnl;
  const isProfit = stats.totalPnl >= 0;
  const profitColor = "#e03535";  // red = profit (locked)
  const lossColor = "#2a9d5c";    // green = loss (locked)

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
      <div className="flex items-center justify-between px-4 pt-6 pb-3">
        <p className="text-[11px] text-muted-foreground uppercase tracking-[0.2em]">纪律盘 · 足球亚盘</p>
        <Link href="/settings" className="text-muted-foreground p-1 -mr-1">
          <Settings size={16} strokeWidth={1.5} />
        </Link>
      </div>

      {/* ── Hero: PnL + Goal (merged card) ────────────────────── */}
      <div className="px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="relative rounded-2xl overflow-hidden border border-border/60 bg-gradient-to-br from-card via-card to-background"
        >
          {/* Subtle sparkline background */}
          {hasSparkData && (
            <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none opacity-60">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isProfit ? profitColor : lossColor} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={isProfit ? profitColor : lossColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Area type="monotone" dataKey="cum" stroke={isProfit ? profitColor : lossColor}
                    strokeWidth={1.5} fill="url(#sparkFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="relative px-5 pt-4 pb-5">
            {/* Time range tabs */}
            <div className="flex items-center gap-0.5 bg-background/50 backdrop-blur rounded-full p-0.5 w-fit mb-3">
              {(["week", "month", "year", "all"] as const).map((r) => (
                <button key={r} onClick={() => setTimeRange(r)}
                  className={`text-[11px] font-semibold px-3 py-1 rounded-full transition-colors ${
                    timeRange === r ? "bg-foreground text-background" : "text-muted-foreground"
                  }`}
                >
                  {r === "week" ? "周" : r === "month" ? "月" : r === "year" ? "年" : "全部"}
                </button>
              ))}
            </div>

            <p className="text-[10px] text-muted-foreground/70 mb-1">{rangeLabel}</p>

            <div className="flex items-end gap-4">
              <div className="flex-1 min-w-0">
                <div className={`text-[44px] font-black font-mono tabular-nums leading-none tracking-tight ${stats.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
                  {stats.totalPnl >= 0 ? "+" : ""}{stats.totalPnl.toLocaleString()}
                </div>
                {hasTarget && (
                  <p className="text-[11px] text-muted-foreground mt-2">
                    目标 <span className="font-mono text-foreground/80">¥{target.toLocaleString()}</span>
                    <span className="mx-1.5 opacity-30">·</span>
                    {gap > 0
                      ? <>还差 <span className={`font-mono font-semibold ${stats.totalPnl >= 0 ? "text-foreground" : "text-loss"}`}>¥{Math.abs(gap).toLocaleString()}</span></>
                      : <span className="text-profit font-semibold">已达标 +¥{Math.abs(gap).toLocaleString()}</span>
                    }
                  </p>
                )}
              </div>
              {hasTarget && (
                <ProgressRing percent={progress} size={72} color={profitColor} />
              )}
            </div>

            {/* Stats row */}
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border/50">
              <div className="flex-1">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{rangeStatLabel}投注</p>
                <p className="text-sm font-bold font-mono tabular-nums mt-0.5">
                  {stats.totalBet > 0 ? `¥${(stats.totalBet / 1000).toFixed(0)}k` : "—"}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">ROI</p>
                <p className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${stats.roi >= 0 ? "text-profit" : "text-loss"}`}>
                  {stats.totalBet > 0 ? `${stats.roi >= 0 ? "+" : ""}${stats.roi}%` : "—"}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-[9px] text-muted-foreground uppercase tracking-wider">场次</p>
                <p className="text-sm font-bold font-mono tabular-nums mt-0.5">{stats.count}</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Yesterday Activity (conditional) ─────────────────── */}
      {(yesterdayStats.bets > 0 || yesterdayStats.watches > 0) && (
        <div className="px-4 pt-4">
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05, ease: "easeOut" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push(`/records?date=${yesterdayKey}&view=week`)}
            className="w-full text-left rounded-xl border border-border/60 bg-card/50 hover:bg-card transition-colors px-4 py-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">昨日动态</p>
                <p className="text-[10px] text-muted-foreground/60 font-mono">
                  {yesterday.getMonth() + 1}月{yesterday.getDate()}日
                </p>
              </div>
              <div className="flex items-baseline gap-2 mt-1.5">
                {yesterdayStats.bets > 0 && (
                  <span className="text-xs font-semibold">
                    <span className="font-mono tabular-nums">{yesterdayStats.bets}</span> 下注
                  </span>
                )}
                {yesterdayStats.watches > 0 && (
                  <span className="text-xs font-semibold text-muted-foreground">
                    <span className="font-mono tabular-nums">{yesterdayStats.watches}</span> 观察
                  </span>
                )}
                {yesterdayStats.unsettled > 0 && (
                  <span className="text-[10px] text-warning">（{yesterdayStats.unsettled} 未结算）</span>
                )}
              </div>
            </div>
            {yesterdayStats.settled > 0 && (
              <div className={`text-right font-mono tabular-nums font-black text-base ${yesterdayStats.pnl >= 0 ? "text-profit" : "text-loss"}`}>
                {yesterdayStats.pnl >= 0 ? "+" : ""}{yesterdayStats.pnl.toLocaleString()}
              </div>
            )}
            <ChevronRight size={16} className="text-muted-foreground/50 shrink-0" />
          </motion.button>
        </div>
      )}

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2 space-y-2.5">
        <motion.div whileTap={{ scale: 0.98 }}>
          <Link
            href="/review"
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-foreground text-background rounded-xl font-bold text-sm active:opacity-80 transition-opacity"
          >
            <Plus size={15} strokeWidth={3} />
            开始纪律审查
          </Link>
        </motion.div>
        <div className="flex items-center gap-3 pt-1 text-[11px] text-muted-foreground">
          <span>
            今日下注
            <span className={`font-mono mx-1 tabular-nums ${overBet ? "text-loss" : "text-foreground"}`}>
              {todayCount.bets}/{dailyLimits.bets}
            </span>
          </span>
          <span className="opacity-30">·</span>
          <span>
            今日观察
            <span className={`font-mono mx-1 tabular-nums ${overWatch ? "text-loss" : "text-foreground"}`}>
              {todayCount.watches}/{dailyLimits.watches}
            </span>
          </span>
        </div>
      </div>

      <div className="px-4 space-y-0">

        {/* ── Recent Bets ──────────────────────────────────────────── */}
        <div className="pt-4 pb-2 border-t border-border">
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
                const finalScore = r.result?.finalScore;
                return (
                  <button key={r.id} onClick={() => router.push(`/records?id=${r.id}`)} className="w-full text-left">
                    <div className="flex items-center gap-3 py-3 first:pt-0 active:opacity-60 transition-opacity">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-black shrink-0 ${GRADE_COLORS[r.grade]}`}>{r.grade}</span>
                          <p className="text-xs font-semibold truncate">{r.match}</p>
                          {finalScore && (
                            <span className="text-[10px] font-mono tabular-nums text-foreground/70 shrink-0 bg-muted px-1.5 py-0.5 rounded">
                              {finalScore.home}:{finalScore.away}
                            </span>
                          )}
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
                              <p className={`text-sm font-black font-mono tabular-nums mt-0.5 ${OUTCOME_PNL_COLOR[outcome]}`}>
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
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">最近观察</p>
            <Link href="/records" className="text-[10px] text-muted-foreground underline underline-offset-2">全部</Link>
          </div>
          {recentAbandoned.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 py-3">暂无观察记录</p>
          ) : (
            <div className="space-y-0 divide-y divide-border">
              {recentAbandoned.map((a) => (
                <button key={a.id} onClick={() => router.push(`/records?aid=${a.id}`)} className="w-full text-left">
                  <div className="flex items-center gap-3 py-3 first:pt-0 active:opacity-60 transition-opacity">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold truncate opacity-60">{a.match}</p>
                        {a.finalScore && (
                          <span className="text-[10px] font-mono tabular-nums text-foreground/60 shrink-0 bg-muted px-1.5 py-0.5 rounded">
                            {a.finalScore.home}:{a.finalScore.away}
                          </span>
                        )}
                      </div>
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
