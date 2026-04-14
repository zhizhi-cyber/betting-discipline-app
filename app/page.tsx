"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Settings } from "lucide-react";
import {
  mockStats,
  mockDetailedRecords,
  mockAbandonedRecords,
  getTotalPnl,
  getTotalBetAmount,
  type Outcome,
  type ReviewConclusion,
} from "@/lib/mock-data";
import BottomNav from "@/components/bottom-nav";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric", weekday: "short" });
}

function getMonthRange() {
  if (typeof window === "undefined") return "";
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}年${m}月1日 – ${m}月${lastDay}日`;
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
  const {
    thisMonthPnl, thisMonthBetAmount, thisMonthRoi,
    monthlyTarget, weeklyTarget, thisWeekPnl,
    hitRate, disciplineRate, pendingReviewCount,
    streak, results, today,
  } = mockStats;

  const [monthRange, setMonthRange] = useState("");
  const [thisMonthCount, setThisMonthCount] = useState(mockStats.totalMatches);
  useEffect(() => {
    setMonthRange(getMonthRange());
    const n = new Date();
    setThisMonthCount(mockDetailedRecords.filter(r => {
      const d = new Date(r.kickoffTime);
      return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
    }).length);
  }, []);

  const monthProgress = Math.min(Math.max(Math.round((thisMonthPnl / monthlyTarget) * 100), 0), 100);
  const monthGap = monthlyTarget - thisMonthPnl;

  return (
    <div className="min-h-screen bg-background pb-28">

      {/* ── Pending Review Alert ────────────────────────────────── */}
      {pendingReviewCount > 0 && (
        <Link href="/records" className="block">
          <div className="bg-loss/10 border-b border-loss/20 px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-loss animate-pulse shrink-0" />
              <p className="text-xs font-semibold text-loss">
                {pendingReviewCount} 场比赛待复盘
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

      {/* ── Hero: Current Month PnL ─────────────────────────────── */}
      <div className="px-4 pt-2 pb-5 border-b border-border">
        <p className="text-[10px] text-muted-foreground/60 mb-1">{monthRange}</p>
        <div className={`text-5xl font-black font-mono leading-none tracking-tight ${thisMonthPnl >= 0 ? "text-profit" : "text-loss"}`}>
          {thisMonthPnl >= 0 ? "+" : ""}{thisMonthPnl.toLocaleString()}
        </div>
        <div className="flex items-center gap-3 mt-2.5">
          <StatTriple label="本月投注" value={`¥${(thisMonthBetAmount / 1000).toFixed(0)}k`} />
          <span className="text-border">|</span>
          <StatTriple
            label="本月ROI"
            value={`${thisMonthRoi >= 0 ? "+" : ""}${thisMonthRoi}%`}
            valueClass={thisMonthRoi >= 0 ? "text-profit" : "text-loss"}
          />
          <span className="text-border">|</span>
          <StatTriple label="本月场次" value={`${thisMonthCount}场`} />
        </div>
      </div>

      <div className="px-4 space-y-0">

        {/* ── Goals ───────────────────────────────────────────────── */}
        <div className="py-4 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">目标进度</p>

          {/* Monthly goal */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">月度目标</span>
              <span className="text-[11px] font-mono text-muted-foreground">¥{monthlyTarget.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">当前</span>
              <span className={`text-[11px] font-bold font-mono ${thisMonthPnl >= 0 ? "text-profit" : "text-loss"}`}>
                {thisMonthPnl >= 0 ? "+" : ""}{thisMonthPnl.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">还差</span>
              <span className={`text-[11px] font-mono ${monthGap > 0 ? "text-warning" : "text-profit"}`}>
                {monthGap > 0 ? `¥${monthGap.toLocaleString()}` : "已达成"}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-px mt-1">
              <div
                className="h-px rounded-full bg-profit transition-all"
                style={{ width: `${monthProgress}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-right">{monthProgress}%</p>
          </div>

          {/* Weekly goal */}
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">本周目标 ¥{weeklyTarget.toLocaleString()}</span>
            <span className={`text-[11px] font-bold font-mono ${thisWeekPnl >= 0 ? "text-profit" : "text-loss"}`}>
              {thisWeekPnl >= 0 ? "+" : ""}{thisWeekPnl.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ── Today Alert ─────────────────────────────────────────── */}
        {today.matches >= 2 && (
          <div className="border-l-2 border-l-warning pl-3 py-3 mt-4">
            <p className="text-[10px] font-black text-warning uppercase tracking-widest">今日警告</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              今日已下注 {today.matches} 场 · 再下一场请确认是否真是高质量机会
            </p>
          </div>
        )}

        {/* ── Today Status ─────────────────────────────────────────── */}
        <div className="py-4 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">今日状态</p>
          <div className="grid grid-cols-3 gap-0 divide-x divide-border">
            <div className="text-center pr-3">
              <p className="text-[10px] text-muted-foreground">已下注</p>
              <p className="text-3xl font-black font-mono mt-1 leading-none">{today.matches}</p>
              <p className="text-[10px] text-muted-foreground mt-1">场</p>
            </div>
            <div className="text-center px-3">
              <p className="text-[10px] text-muted-foreground">今日总额</p>
              <p className="text-3xl font-black font-mono mt-1 leading-none">
                {(today.totalAmount / 1000).toFixed(0)}k
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">元</p>
            </div>
            <div className="text-center pl-3">
              <p className="text-[10px] text-muted-foreground">剩余额度</p>
              <p className="text-3xl font-black font-mono mt-1 leading-none text-profit">
                {(today.remainingQuota / 1000).toFixed(0)}k
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">元</p>
            </div>
          </div>
        </div>

        {/* ── Core Stats ───────────────────────────────────────────── */}
        <div className="py-4 border-b border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">累计数据</p>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="text-[10px] text-muted-foreground">命中率（本月）</p>
              <p className="text-2xl font-black font-mono mt-0.5 leading-none">{hitRate}%</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">纪律执行率</p>
              <p className={`text-2xl font-black font-mono mt-0.5 leading-none ${disciplineRate >= 80 ? "text-profit" : "text-warning"}`}>
                {disciplineRate}%
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">连红 / 连黑</p>
              <p className={`text-2xl font-black font-mono mt-0.5 leading-none ${streak.type === "win" ? "text-profit" : "text-loss"}`}>
                {streak.type === "win" ? `+${streak.count}` : `-${streak.count}`}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">胜负分布</p>
              <div className="flex items-center gap-1 mt-0.5">
                {[
                  { label: "胜", count: results.win,      color: "text-profit" },
                  { label: "赢半", count: results.halfWin,  color: "text-profit" },
                  { label: "走", count: results.push,     color: "text-neutral" },
                  { label: "输半", count: results.halfLoss, color: "text-loss" },
                  { label: "负", count: results.loss,     color: "text-loss" },
                ].map(({ label, count, color }) => (
                  <span key={label} className={`text-[10px] font-mono ${color}`}>{count}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <div className="py-4 space-y-2.5">
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
            <Link href="/records?tab=abandoned" className="flex-1 py-2.5 text-center text-xs font-medium text-muted-foreground border border-border rounded-lg">
              放弃池
            </Link>
          </div>
        </div>

        {/* ── Recent Bets ──────────────────────────────────────────── */}
        <div className="border-t border-border pt-4 pb-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">最近下注</p>
            <Link href="/records" className="text-[10px] text-muted-foreground underline underline-offset-2">全部</Link>
          </div>
          <div className="space-y-0 divide-y divide-border">
            {mockDetailedRecords.slice(0, 3).map((r) => {
              const pnl = getTotalPnl(r);
              const outcome = r.result?.outcome;
              const betAmt = getTotalBetAmount(r);
              return (
                <Link key={r.id} href={`/records/${r.id}`}>
                  <div className="flex items-center gap-3 py-3 first:pt-0 active:opacity-60 transition-opacity">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black shrink-0 ${GRADE_COLORS[r.grade]}`}>{r.grade}</span>
                        <p className="text-xs font-semibold truncate">{r.match}</p>
                        {r.isDisciplineViolation && (
                          <span className="text-[9px] px-1 py-0.5 rounded bg-warning/15 text-warning shrink-0">违纪</span>
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
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Recent Abandoned ─────────────────────────────────────── */}
        <div className="border-t border-border pt-4 pb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">最近放弃</p>
            <Link href="/records?tab=abandoned" className="text-[10px] text-muted-foreground underline underline-offset-2">全部</Link>
          </div>
          <div className="space-y-0 divide-y divide-border">
            {mockAbandonedRecords.slice(0, 2).map((a) => (
              <Link key={a.id} href={`/abandoned/${a.id}`}>
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
                    {a.actualResult && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        赛果 {a.actualResult === "win" ? "赢" : a.actualResult === "loss" ? "输" : a.actualResult === "push" ? "走" : "—"}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

      </div>

      <BottomNav />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTriple({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold font-mono mt-0.5 leading-none ${valueClass}`}>{value}</p>
    </div>
  );
}
