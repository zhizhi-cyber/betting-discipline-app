"use client";

import { Target, Trophy, Shield, Flame, Eye, AlertCircle, Sparkles } from "lucide-react";
import type { BetRecord, AbandonedRecord } from "@/lib/types";
import { calcRecordsAnalytics, calcGradeWinRates } from "@/lib/storage";

const GRADE_COLORS: Record<string, string> = {
  S: "text-[#f5c842]", A: "text-[#b8a0e8]", B: "text-[#6ea8d8]", C: "text-warning",
};

/**
 * Records-page analytics: overview bar + handicap ROI bars + error top3
 * + watch-pool conversion. Reads a pre-filtered list so it works across
 * week / month / year views.
 */
export default function AnalyticsPanel({
  bets, watches,
}: {
  bets: BetRecord[];
  watches: AbandonedRecord[];
}) {
  if (bets.length === 0 && watches.length === 0) return null;

  const a = calcRecordsAnalytics(bets, watches);
  const gradeRates = calcGradeWinRates(bets);
  const anyGradeSample = gradeRates.some((g) => g.sample > 0);

  return (
    <div className="space-y-3">
      {/* Overview strip — 4 compact tiles */}
      <div className="grid grid-cols-4 gap-2">
        <OverviewTile
          icon={<Trophy size={11} strokeWidth={2} />}
          label="盘面胜率"
          value={a.settledCount > 0 ? `${a.winRate.toFixed(0)}%` : "—"}
          accent={a.settledCount > 0 ? (a.winRate >= 50 ? "profit" : "loss") : "muted"}
        />
        <OverviewTile
          icon={<Target size={11} strokeWidth={2} />}
          label="ROI"
          value={a.effectiveBet > 0 ? `${a.roi >= 0 ? "+" : ""}${a.roi.toFixed(0)}%` : "—"}
          accent={a.effectiveBet > 0 ? (a.roi >= 0 ? "profit" : "loss") : "muted"}
        />
        <OverviewTile
          icon={<Shield size={11} strokeWidth={2} />}
          label="纪律"
          value={bets.length > 0 ? `${a.disciplineScore.toFixed(0)}%` : "—"}
          accent={bets.length > 0 ? (a.disciplineScore >= 80 ? "profit" : "warning") : "muted"}
        />
        <OverviewTile
          icon={<Flame size={11} strokeWidth={2} className={a.streak.type === "win" ? "" : a.streak.type === "loss" ? "opacity-60" : "opacity-30"} />}
          label={a.streak.type === "loss" ? "连亏" : "连胜"}
          value={a.streak.count > 0 ? String(a.streak.count) : "—"}
          accent={a.streak.type === "win" ? "profit" : a.streak.type === "loss" ? "loss" : "muted"}
        />
      </div>

      {/* Grade win-rate breakdown — 4 tiles (S A B C) */}
      {anyGradeSample && (
        <GlassCard title="信心级别胜率" icon={<Sparkles size={10} strokeWidth={2} />}>
          <div className="grid grid-cols-4 gap-2">
            {gradeRates.map((g) => {
              const hasSample = g.sample > 0;
              const rateCls = !hasSample ? "text-muted-foreground/40"
                : g.rate >= 50 ? "text-profit" : "text-loss";
              return (
                <div key={g.grade} className="text-center">
                  <p className={`text-[11px] font-black ${GRADE_COLORS[g.grade]}`}>{g.grade}</p>
                  <p className={`text-sm font-black font-mono tabular-nums mt-0.5 ${rateCls}`}>
                    {hasSample ? `${g.rate.toFixed(0)}%` : "—"}
                  </p>
                  <p className="text-[9px] text-muted-foreground/70 font-mono mt-0.5">
                    {hasSample ? `${g.sample}场` : "无样本"}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="text-[9px] text-muted-foreground/50 mt-2">赢半计 0.5 · 走盘不计入</p>
        </GlassCard>
      )}

      {/* Handicap ROI + Error top — two column */}
      {(a.handicapRoi.length > 0 || a.errorTop.length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {a.handicapRoi.length > 0 && (
            <GlassCard title="盘口 ROI" icon={<Target size={10} strokeWidth={2} />}>
              <div className="space-y-1.5">
                {a.handicapRoi.slice(0, 3).map((h) => {
                  const max = Math.max(...a.handicapRoi.map((x) => Math.abs(x.roi)), 1);
                  const width = Math.min(100, (Math.abs(h.roi) / max) * 100);
                  const color = h.roi >= 0 ? "bg-profit" : "bg-loss";
                  return (
                    <div key={h.label} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-mono text-foreground/80">{h.label}</span>
                        <span className={`font-mono tabular-nums font-semibold ${h.roi >= 0 ? "text-profit" : "text-loss"}`}>
                          {h.roi >= 0 ? "+" : ""}{h.roi.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {a.errorTop.length > 0 && (
            <GlassCard title="失误类型" icon={<AlertCircle size={10} strokeWidth={2} />}>
              <div className="space-y-1">
                {a.errorTop.slice(0, 3).map((e) => (
                  <div key={e.err} className="flex items-center justify-between text-[10px]">
                    <span className="text-foreground/80 truncate pr-1">{e.err}</span>
                    <span className="font-mono tabular-nums text-loss font-semibold shrink-0">{e.count} 次</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* Watch conversion */}
      {(a.watchConversion.watchedThenAbandoned.count > 0 || a.watchConversion.watchedThenBet.count > 0) && (
        <GlassCard title="观察池转化" icon={<Eye size={10} strokeWidth={2} />}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] text-muted-foreground">观察后放弃</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-sm font-black font-mono tabular-nums text-profit">
                  {a.watchConversion.watchedThenAbandoned.rate.toFixed(0)}%
                </span>
                <span className="text-[9px] text-muted-foreground">正确</span>
              </div>
              <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                {a.watchConversion.watchedThenAbandoned.correct}/{a.watchConversion.watchedThenAbandoned.count}
              </p>
            </div>
            <div>
              <p className="text-[9px] text-muted-foreground">观察后补录</p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className={`text-sm font-black font-mono tabular-nums ${a.watchConversion.watchedThenBet.rate >= 50 ? "text-profit" : "text-loss"}`}>
                  {a.watchConversion.watchedThenBet.count > 0 ? `${a.watchConversion.watchedThenBet.rate.toFixed(0)}%` : "—"}
                </span>
                <span className="text-[9px] text-muted-foreground">命中</span>
              </div>
              <p className="text-[9px] text-muted-foreground/60 mt-0.5">
                {a.watchConversion.watchedThenBet.win}/{a.watchConversion.watchedThenBet.count}
              </p>
            </div>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

function OverviewTile({
  icon, label, value, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "profit" | "loss" | "warning" | "muted";
}) {
  const valueCls = accent === "profit" ? "text-profit"
    : accent === "loss" ? "text-loss"
    : accent === "warning" ? "text-warning"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-white/[0.05] bg-card/30 backdrop-blur-xl px-2 py-2">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground/80 uppercase tracking-wider">
        <span className="text-muted-foreground/70">{icon}</span>
        <span>{label}</span>
      </div>
      <p className={`text-sm font-black font-mono tabular-nums mt-0.5 ${valueCls}`}>{value}</p>
    </div>
  );
}

function GlassCard({
  title, icon, children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-card/30 backdrop-blur-xl px-3 py-2.5">
      <div className="flex items-center gap-1 text-[9px] text-muted-foreground/80 uppercase tracking-wider mb-2">
        {icon && <span className="text-muted-foreground/70">{icon}</span>}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}
