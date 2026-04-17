"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Settings, ChevronRight, Target, Activity, TrendingUp } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { motion, useMotionValue, useTransform, animate } from "motion/react";
import { getTotalPnl, getTotalBetAmount, type Outcome, type ReviewConclusion, type BetRecord, type AbandonedRecord } from "@/lib/mock-data";
import { getBetRecords, getAbandonedRecords, getSettings, calcMonthStats, calcYearStats, calcWeekStats, calcAllTimeStats, syncPendingReview, countToday } from "@/lib/storage";
import { calcPnl, weekStart, weekEnd, matchDayKey, matchDayStart } from "@/lib/types";
// Hero combines PnL and goal tracking; home orchestrates glass UI accented with sparkline + halo.
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
  abandon_correct: "观察得对", abandon_wrong: "观察错了", no_regret: "仍不后悔",
};

const GRADE_COLORS: Record<string, string> = {
  S: "text-[#f5c842]", A: "text-[#b8a0e8]", B: "text-[#6ea8d8]", C: "text-warning",
};

type TimeRange = "week" | "month" | "year" | "all";

// ─── Count-up number ──────────────────────────────────────────────────────────

function CountUp({ value, className }: { value: number; className?: string }) {
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => {
    const n = Math.round(v);
    return (n > 0 ? "+" : n === 0 ? "" : "") + n.toLocaleString();
  });
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.7, ease: "easeOut" });
    return controls.stop;
  }, [value, mv]);
  return <motion.span className={className}>{rounded}</motion.span>;
}

// ─── Progress Ring ────────────────────────────────────────────────────────────

function ProgressRing({ percent, size = 72, color }: { percent: number; size?: number; color: string }) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = circ - (clamped / 100) * circ;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke="currentColor" strokeWidth={stroke} fill="none"
          className="text-border/50"
        />
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-mono font-black text-foreground" style={{ fontSize: size * 0.26 }}>
          {Math.round(clamped)}%
        </span>
      </div>
    </div>
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

  // Initial load
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

  // Yesterday's activity — based on match-day boundary (10:00)
  const todayDayKey = useMemo(() => matchDayKey(new Date()), []);
  const yesterdayKey = useMemo(() => {
    const a = matchDayStart(new Date());
    a.setDate(a.getDate() - 1);
    // a is at 10am of yesterday; derive yyyy-mm-dd
    const y = a.getFullYear();
    const m = String(a.getMonth() + 1).padStart(2, "0");
    const d = String(a.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);
  const yesterdayDate = useMemo(() => {
    const [y, m, d] = yesterdayKey.split("-").map((n) => parseInt(n, 10));
    return new Date(y, m - 1, d);
  }, [yesterdayKey]);

  const yesterdayStats = useMemo(() => {
    const bets = allBets.filter((r) => matchDayKey(r.kickoffTime) === yesterdayKey);
    const watches = allAbandoned.filter((r) => matchDayKey(r.kickoffTime) === yesterdayKey);
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

  // Sparkline — daily PnL (running sum) grouped by match-day over window
  const sparkData = useMemo(() => {
    let days = 7;
    if (timeRange === "month") days = 30;
    else if (timeRange === "year") days = 90;
    else if (timeRange === "all") days = 90;

    const anchor = matchDayStart(new Date());
    const daily: { key: string; pnl: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${y}-${m}-${dd}`;
      let dayPnl = 0;
      for (const r of allBets) {
        if (!r.result) continue;
        if (matchDayKey(r.kickoffTime) !== key) continue;
        dayPnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
      }
      daily.push({ key, pnl: dayPnl });
    }
    let running = 0;
    return daily.map((d) => ({ ...d, cum: (running += d.pnl) }));
  }, [allBets, timeRange]);

  const hasSparkData = sparkData.some((d) => d.pnl !== 0);

  const rangeStatLabel = timeRange === "week" ? "本周" : timeRange === "month" ? "本月" : timeRange === "year" ? "本年" : "历史";
  const overBet = todayCount.bets >= dailyLimits.bets;
  const overWatch = todayCount.watches >= dailyLimits.watches;

  const hasTarget = target > 0 && timeRange !== "all";
  const progress = hasTarget ? Math.max(0, Math.min(100, (stats.totalPnl / target) * 100)) : 0;
  const gap = target - stats.totalPnl;
  const isProfit = stats.totalPnl >= 0;
  const profitColor = "#e03535";  // 盈利红 (locked)
  const lossColor = "#2a9d5c";    // 亏损绿 (locked)

  void todayDayKey; // reserved for future "today" card

  return (
    <div className="min-h-screen pb-28">

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

      {/* ── Hero: PnL + Goal (frosted) ────────────────────────── */}
      <div className="px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-card/40 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
        >
          {/* Sparkline as ambient bottom layer */}
          {hasSparkData && (
            <div className="absolute inset-x-0 bottom-0 h-20 pointer-events-none opacity-50">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={sparkData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isProfit ? profitColor : lossColor} stopOpacity={0.3} />
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
            <div className="flex items-center gap-0.5 bg-background/40 backdrop-blur rounded-full p-0.5 w-fit mb-3 border border-white/[0.04]">
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

            {/* Top row: big PnL + target info (left) · Progress ring (right) */}
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                {/* Number halo */}
                <div className="relative">
                  <div
                    className="absolute inset-0 blur-3xl opacity-40 -z-[1]"
                    style={{
                      background: `radial-gradient(closest-side, ${isProfit ? profitColor : lossColor}, transparent 70%)`,
                    }}
                  />
                  <CountUp
                    value={stats.totalPnl}
                    className={`block text-[44px] font-black font-mono tabular-nums leading-none tracking-tight ${isProfit ? "text-profit" : "text-loss"}`}
                  />
                </div>
                {hasTarget ? (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Target size={11} strokeWidth={2} className="text-muted-foreground/70" />
                    <span>
                      目标 <span className="font-mono text-foreground/80">¥{target.toLocaleString()}</span>
                      <span className="mx-1.5 opacity-30">·</span>
                      {gap > 0
                        ? <>还差 <span className={`font-mono font-semibold ${isProfit ? "text-foreground" : "text-loss"}`}>¥{Math.abs(gap).toLocaleString()}</span></>
                        : <span className="text-profit font-semibold">已达标 +¥{Math.abs(gap).toLocaleString()}</span>
                      }
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground/60">全部历史 · 无目标</p>
                )}
              </div>
              {hasTarget && (
                <ProgressRing percent={progress} size={68} color={profitColor} />
              )}
            </div>

            {/* Stats row with icons */}
            <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/[0.04]">
              <StatCell
                icon={<Activity size={11} strokeWidth={2} />}
                label={`${rangeStatLabel}投注`}
                value={stats.totalBet > 0 ? `¥${(stats.totalBet / 1000).toFixed(0)}k` : "—"}
              />
              <StatCell
                icon={<TrendingUp size={11} strokeWidth={2} />}
                label="ROI"
                value={stats.totalBet > 0 ? `${stats.roi >= 0 ? "+" : ""}${stats.roi}%` : "—"}
                valueCls={stats.roi >= 0 ? "text-profit" : "text-loss"}
              />
              <StatCell
                label="场次"
                value={String(stats.count)}
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Yesterday Activity ─────────────────────────────────── */}
      {(yesterdayStats.bets > 0 || yesterdayStats.watches > 0) && (
        <div className="px-4 pt-3">
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
            whileTap={{ scale: 0.98 }}
            onClick={() => router.push(`/records?date=${yesterdayKey}&view=week`)}
            className="w-full text-left rounded-xl border border-white/[0.05] bg-card/30 backdrop-blur-xl hover:bg-card/50 transition-colors px-4 py-3 flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">昨日动态</p>
                <p className="text-[10px] text-muted-foreground/60 font-mono">
                  {yesterdayDate.getMonth() + 1}月{yesterdayDate.getDate()}日
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
            className="flex items-center justify-center gap-2 w-full py-3.5 bg-foreground text-background rounded-xl font-bold text-sm active:opacity-80 transition-opacity shadow-lg shadow-black/20"
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
        <div className="pt-4 pb-2 border-t border-border/60">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em]">RECENT BETS · 最近下注</p>
            <Link href="/records" className="text-[10px] text-muted-foreground underline underline-offset-2">全部</Link>
          </div>
          {recentBets.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 py-3">暂无下注记录</p>
          ) : (
            <div className="space-y-0 divide-y divide-border/50">
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
        <div className="border-t border-border/60 pt-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.18em]">RECENT WATCH · 最近观察</p>
            <Link href="/records" className="text-[10px] text-muted-foreground underline underline-offset-2">全部</Link>
          </div>
          {recentAbandoned.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 py-3">暂无观察记录</p>
          ) : (
            <div className="space-y-0 divide-y divide-border/50">
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

// ─── StatCell ─────────────────────────────────────────────────────────────────

function StatCell({
  icon, label, value, valueCls,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  valueCls?: string;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground uppercase tracking-wider">
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
        <span>{label}</span>
      </div>
      <p className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${valueCls ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
