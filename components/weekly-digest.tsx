"use client";

import { useMemo } from "react";
import { X, TrendingUp } from "lucide-react";
import { calcWeekStats, calcRecordsAnalytics } from "@/lib/storage";
import { matchDayStart, weekStart, type BetRecord, type AbandonedRecord } from "@/lib/types";

/**
 * 周简报弹窗 — 周日晚 22:00 之后 首次打开 app 弹一次。
 * 内容：本周 PnL / 场次 / 胜率 / ROI / 违纪次数 / Top 3 失误 / 与上周对比。
 * 调用方决定何时 mount 以及关闭回调（关闭时调用 markWeeklyDigestSeen）。
 */
export default function WeeklyDigest({
  allBets,
  allWatches,
  onClose,
}: {
  allBets: BetRecord[];
  allWatches: AbandonedRecord[];
  onClose: () => void;
}) {
  const now = new Date();
  const thisMonday = weekStart(now);
  const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);

  const { thisWeek, lastWeek, weekBets, weekWatches } = useMemo(() => {
    const thisStart = new Date(thisMonday); thisStart.setHours(10, 0, 0, 0);
    const thisEnd = new Date(thisStart); thisEnd.setDate(thisEnd.getDate() + 7);
    const lastStart = new Date(lastMonday); lastStart.setHours(10, 0, 0, 0);
    const lastEnd = new Date(lastStart); lastEnd.setDate(lastEnd.getDate() + 7);

    const inRange = (iso: string, s: Date, e: Date) => {
      const a = matchDayStart(iso);
      return a >= s && a < e;
    };

    const wb = allBets.filter((r) => inRange(r.kickoffTime, thisStart, thisEnd));
    const ww = allWatches.filter((r) => inRange(r.kickoffTime, thisStart, thisEnd));

    return {
      thisWeek: calcWeekStats(thisMonday),
      lastWeek: calcWeekStats(lastMonday),
      weekBets: wb,
      weekWatches: ww,
    };
  }, [allBets, allWatches, thisMonday, lastMonday]);

  const analytics = useMemo(() => calcRecordsAnalytics(weekBets, weekWatches), [weekBets, weekWatches]);

  const pnlDelta = thisWeek.totalPnl - lastWeek.totalPnl;
  const roiDelta = thisWeek.roi - lastWeek.roi;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full max-w-[430px] bg-background rounded-xl border border-border shadow-2xl max-h-[90dvh] overflow-y-auto">
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold">📊 本周简报</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {thisMonday.getMonth() + 1}/{thisMonday.getDate()} – {(() => { const e = new Date(thisMonday); e.setDate(e.getDate() + 6); return `${e.getMonth() + 1}/${e.getDate()}`; })()}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground p-1"><X size={16} /></button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* Hero: 本周 PnL */}
          <div className="rounded-lg bg-card p-4 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">本周盈亏</p>
            <p className={`text-3xl font-black font-mono tabular-nums mt-1 ${
              thisWeek.totalBet === 0 ? "text-muted-foreground"
              : thisWeek.totalPnl > 0 ? "text-profit" : thisWeek.totalPnl < 0 ? "text-loss" : "text-muted-foreground"
            }`}>
              {thisWeek.totalBet === 0 ? "—" : (thisWeek.totalPnl >= 0 ? "+" : "\u2212") + "¥" + Math.abs(thisWeek.totalPnl).toLocaleString()}
            </p>
            {thisWeek.totalBet > 0 && lastWeek.totalBet > 0 && (
              <p className="text-[10px] mt-1 font-mono">
                <span className="text-muted-foreground">vs 上周 </span>
                <span className={pnlDelta >= 0 ? "text-profit" : "text-loss"}>
                  {pnlDelta >= 0 ? "+" : "\u2212"}¥{Math.abs(pnlDelta).toLocaleString()}
                </span>
              </p>
            )}
          </div>

          {/* 3 big stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded bg-card/60 p-2 text-center">
              <p className="text-[9px] text-muted-foreground">场次</p>
              <p className="text-base font-black font-mono mt-0.5">{thisWeek.total}</p>
            </div>
            <div className="rounded bg-card/60 p-2 text-center">
              <p className="text-[9px] text-muted-foreground">盘面胜率</p>
              <p className={`text-base font-black font-mono mt-0.5 ${
                analytics.settledCount > 0 ? (analytics.winRate >= 50 ? "text-profit" : "text-loss") : "text-muted-foreground"
              }`}>
                {analytics.settledCount > 0 ? `${analytics.winRate.toFixed(0)}%` : "—"}
              </p>
            </div>
            <div className="rounded bg-card/60 p-2 text-center">
              <p className="text-[9px] text-muted-foreground">ROI</p>
              <p className={`text-base font-black font-mono mt-0.5 ${
                thisWeek.totalBet > 0 ? (thisWeek.roi >= 0 ? "text-profit" : "text-loss") : "text-muted-foreground"
              }`}>
                {thisWeek.totalBet > 0 ? `${thisWeek.roi >= 0 ? "+" : ""}${thisWeek.roi.toFixed(0)}%` : "—"}
              </p>
              {thisWeek.totalBet > 0 && lastWeek.totalBet > 0 && (
                <p className={`text-[9px] font-mono mt-0.5 ${roiDelta >= 0 ? "text-profit/70" : "text-loss/70"}`}>
                  {roiDelta >= 0 ? "+" : ""}{roiDelta.toFixed(0)}%
                </p>
              )}
            </div>
          </div>

          {/* 违纪 */}
          <div className="rounded bg-card/60 px-3 py-2 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">违纪次数</span>
            <span className={`text-sm font-black font-mono ${analytics.violationCount === 0 ? "text-profit" : "text-warning"}`}>
              {analytics.violationCount}
              <span className="text-[10px] text-muted-foreground/70 font-normal ml-1">/ {thisWeek.total}</span>
            </span>
          </div>

          {/* Top errors */}
          {analytics.errorTop.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-muted-foreground mb-1.5 uppercase tracking-wider">主要失误</p>
              <div className="space-y-1">
                {analytics.errorTop.slice(0, 3).map((e) => (
                  <div key={e.err} className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded bg-card/60">
                    <span className="text-foreground/80 truncate pr-2">{e.err}</span>
                    <span className="font-mono tabular-nums text-loss font-semibold">{e.count} 次</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 一句话总评 */}
          <div className="rounded border border-border bg-card/40 px-3 py-2 text-[11px] text-foreground/80 leading-relaxed">
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp size={11} className="text-muted-foreground" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">一句话总评</span>
            </div>
            {thisWeek.totalBet === 0 ? (
              <p>本周没有下注记录。</p>
            ) : analytics.violationCount > thisWeek.total * 0.3 ? (
              <p>违纪率偏高（&gt;30%），下周先管住手再谈盈利。</p>
            ) : analytics.winRate >= 55 && thisWeek.roi >= 5 ? (
              <p>胜率和 ROI 都不错，保持节奏，别乱加仓。</p>
            ) : thisWeek.roi < -10 ? (
              <p>本周 ROI 偏弱，下周减场次、提质量，别追损。</p>
            ) : (
              <p>表现平稳，继续按纪律出手。</p>
            )}
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 rounded bg-foreground text-background text-sm font-semibold"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}
