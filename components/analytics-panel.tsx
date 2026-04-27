"use client";

import { useState } from "react";
import { Target, Trophy, Shield, Flame, Eye, AlertCircle, Sparkles, Clock, Moon, X } from "lucide-react";
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
  const [disciplineOpen, setDisciplineOpen] = useState(false);
  const [showAllHcp, setShowAllHcp] = useState(false);
  if (bets.length === 0 && watches.length === 0) return null;

  const a = calcRecordsAnalytics(bets, watches);
  const gradeRates = calcGradeWinRates(bets);
  const anyGradeSample = gradeRates.some((g) => g.sample > 0);

  // 纪律违纪原因 roll-up
  const violationBreakdown: { reason: string; count: number }[] = (() => {
    const map = new Map<string, number>();
    for (const r of bets) {
      if (!r.isDisciplineViolation || !r.violationReason) continue;
      // violationReason 是 "a + b" 这种拼接，拆成独立项
      for (const raw of r.violationReason.split(" + ")) {
        const key = raw.replace(/（.*?）/g, "").trim() || raw;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
  })();

  return (
    <div className="space-y-3">
      {/* Overview strip — 4 compact tiles */}
      <div className="grid grid-cols-4 gap-2">
        <OverviewTile
          icon={<Trophy size={11} strokeWidth={2} />}
          label="盘面胜率"
          value={a.settledCount > 0 ? `${a.winRate.toFixed(0)}%` : "—"}
          accent={a.settledCount > 0 ? (a.winRate >= 50 ? "profit" : "loss") : "muted"}
          footnote="赢半计 0.5 · 走盘剔除"
        />
        <OverviewTile
          icon={<Target size={11} strokeWidth={2} />}
          label="ROI"
          value={a.effectiveBet > 0 ? `${a.roi >= 0 ? "+" : ""}${a.roi.toFixed(0)}%` : "—"}
          accent={a.effectiveBet > 0 ? (a.roi >= 0 ? "profit" : "loss") : "muted"}
        />
        <button
          type="button"
          onClick={() => bets.length > 0 && setDisciplineOpen(true)}
          className="text-left"
          disabled={bets.length === 0}
        >
          <OverviewTile
            icon={<Shield size={11} strokeWidth={2} />}
            label="纪律"
            value={bets.length > 0 ? `${a.disciplineScore.toFixed(0)}%` : "—"}
            accent={bets.length > 0 ? (a.disciplineScore >= 80 ? "profit" : "warning") : "muted"}
            footnote={bets.length > 0 ? "点击看详情 →" : undefined}
          />
        </button>
        <OverviewTile
          icon={<Flame size={11} strokeWidth={2} className={a.streak.type === "win" ? "" : a.streak.type === "loss" ? "opacity-60" : "opacity-30"} />}
          label={a.streak.type === "loss" ? "连亏" : "连胜"}
          value={a.streak.count > 0 ? String(a.streak.count) : "—"}
          accent={a.streak.type === "win" ? "profit" : a.streak.type === "loss" ? "loss" : "muted"}
        />
      </div>

      {/* 盘面结果分布 */}
      {a.settledCount > 0 && (
        <GlassCard title="盘面结果分布" icon={<Trophy size={10} strokeWidth={2} />}>
          <OutcomeBreakdown a={a.outcomeBreakdown} settled={a.settledCount} />
        </GlassCard>
      )}

      {/* 按纪律 vs 违纪 对照 */}
      {bets.length > 0 && (a.disciplineCompare.disciplined.count > 0 || a.disciplineCompare.violated.count > 0) && (
        <GlassCard title="按纪律 vs 违纪" icon={<Shield size={10} strokeWidth={2} />}>
          <DisciplineCompare dc={a.disciplineCompare} />
        </GlassCard>
      )}

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
                    {hasSample ? `${g.sample % 1 === 0 ? g.sample : g.sample.toFixed(1)}场` : "无样本"}
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
                {(() => {
                  const visible = showAllHcp ? a.handicapRoi : a.handicapRoi.slice(0, 5);
                  const max = Math.max(...a.handicapRoi.map((x) => Math.abs(x.roi)), 1);
                  return visible.map((h) => {
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
                  });
                })()}
                {a.handicapRoi.length > 5 && (
                  <button
                    onClick={() => setShowAllHcp((v) => !v)}
                    className="text-[10px] text-muted-foreground/80 hover:text-foreground transition-colors mt-1"
                  >
                    {showAllHcp ? "收起" : `展开全部 ${a.handicapRoi.length} 个盘口`}
                  </button>
                )}
              </div>
            </GlassCard>
          )}

          {a.errorTop.length > 0 && (
            <GlassCard title="失误类型（加权）" icon={<AlertCircle size={10} strokeWidth={2} />}>
              <div className="space-y-1">
                {a.errorTop.slice(0, 3).map((e) => {
                  const sLabel = e.weight === 3 ? "重" : e.weight === 2 ? "中" : "轻";
                  const sColor = e.weight === 3 ? "text-loss" : e.weight === 2 ? "text-warning" : "text-muted-foreground";
                  return (
                    <div key={e.err} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1 min-w-0 pr-1">
                        <span className={`text-[8px] font-bold px-1 rounded border border-current/30 ${sColor}`}>{sLabel}</span>
                        <span className="text-foreground/80 truncate">{e.err}</span>
                      </div>
                      <span className="font-mono tabular-nums text-loss font-semibold shrink-0">{e.count} 次</span>
                    </div>
                  );
                })}
                {a.avgErrorSeverity !== null && (
                  <p className="text-[9px] text-muted-foreground/60 mt-1 font-mono">
                    平均严重度 {a.avgErrorSeverity.toFixed(2)} / 3
                  </p>
                )}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      {/* 赛前时长分桶 ROI：早盘/近赛/临盘 */}
      {(a.leadBuckets.early.count + a.leadBuckets.near.count + a.leadBuckets.last.count) > 0 && (
        <GlassCard title="赛前时长分桶" icon={<Clock size={10} strokeWidth={2} />}>
          <div className="grid grid-cols-3 gap-2">
            <LeadBucket label="早盘" sub=">4h" data={a.leadBuckets.early} />
            <LeadBucket label="近赛" sub="1-4h" data={a.leadBuckets.near} />
            <LeadBucket label="临盘" sub="<1h" data={a.leadBuckets.last} />
          </div>
          {a.avgLeadMinutes !== null && (
            <p className="text-[9px] text-muted-foreground/60 mt-2 font-mono">
              平均 {formatLead(a.avgLeadMinutes)} · {a.avgLeadMinutes < 30 ? "偏临盘" : a.avgLeadMinutes < 120 ? "节奏偏紧" : "准备较充分"}
            </p>
          )}
        </GlassCard>
      )}

      {/* 深夜单 */}
      {a.lateNight.count > 0 && (
        <GlassCard title="深夜单 (0-6点)" icon={<Moon size={10} strokeWidth={2} />}>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-black font-mono tabular-nums">{a.lateNight.count}</span>
            <span className="text-[9px] text-muted-foreground">场</span>
          </div>
          {a.lateNight.settled > 0 && (
            <p className="text-[9px] text-muted-foreground/70 mt-0.5 font-mono tabular-nums">
              胜{a.lateNight.winRate.toFixed(0)}% · ROI {a.lateNight.roi >= 0 ? "+" : ""}{a.lateNight.roi.toFixed(0)}%
            </p>
          )}
        </GlassCard>
      )}

      {/* 纪律分详情 drawer */}
      {disciplineOpen && (
        <div className="fixed inset-0 z-[55] flex items-end" onClick={() => setDisciplineOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-[430px] mx-auto bg-background rounded-t-2xl border-t border-border px-4 py-5 space-y-3 max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">纪律分详情</p>
              <button onClick={() => setDisciplineOpen(false)} className="text-muted-foreground">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded bg-card/60 p-2 text-center">
                <p className="text-[9px] text-muted-foreground">总单数</p>
                <p className="text-sm font-black font-mono mt-0.5">{bets.length}</p>
              </div>
              <div className="rounded bg-card/60 p-2 text-center">
                <p className="text-[9px] text-muted-foreground">违纪</p>
                <p className="text-sm font-black font-mono mt-0.5 text-warning">{a.violationCount}</p>
              </div>
              <div className="rounded bg-card/60 p-2 text-center">
                <p className="text-[9px] text-muted-foreground">合规</p>
                <p className="text-sm font-black font-mono mt-0.5 text-profit">{bets.length - a.violationCount}</p>
              </div>
            </div>

            <div className="rounded bg-card/60 px-3 py-2">
              <div className="flex items-baseline justify-between">
                <p className="text-[10px] text-muted-foreground">纪律分 = 合规 ÷ 总单数</p>
                <p className={`text-lg font-black font-mono ${a.disciplineScore >= 80 ? "text-profit" : "text-warning"}`}>
                  {a.disciplineScore.toFixed(0)}%
                </p>
              </div>
              <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden">
                <div
                  className={a.disciplineScore >= 80 ? "bg-profit h-full" : "bg-warning h-full"}
                  style={{ width: `${a.disciplineScore}%` }}
                />
              </div>
            </div>

            {violationBreakdown.length > 0 ? (
              <div>
                <p className="text-[10px] font-bold text-muted-foreground mb-1.5">违纪原因分布</p>
                <div className="space-y-1">
                  {violationBreakdown.map((v) => (
                    <div key={v.reason} className="flex items-center justify-between text-[11px] px-2 py-1.5 rounded bg-card/60">
                      <span className="text-foreground/80 truncate pr-2">{v.reason}</span>
                      <span className="font-mono tabular-nums text-warning font-semibold shrink-0">{v.count} 次</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground/70 text-center py-4">本区间无违纪记录</p>
            )}

            <div className="text-[10px] text-muted-foreground/60 leading-relaxed space-y-0.5 pt-1">
              <p>· 违纪原因包括：超建议金额、临开赛冲动、连败追损、同场重复、观察转下注等</p>
              <p>· 纪律分 ≥ 80% 视为良好；&lt; 80% 需要警惕</p>
            </div>
          </div>
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

function LeadBucket({
  label, sub, data,
}: {
  label: string;
  sub: string;
  data: { count: number; settled: number; winRate: number; roi: number };
}) {
  const has = data.settled > 0;
  const roiCls = !has ? "text-muted-foreground/50"
    : data.roi > 0 ? "text-profit" : data.roi < 0 ? "text-loss" : "text-muted-foreground";
  return (
    <div className="rounded bg-card/50 px-2 py-1.5 text-center">
      <p className="text-[9px] font-bold">{label}</p>
      <p className="text-[8px] text-muted-foreground/60 font-mono">{sub}</p>
      <p className={`text-xs font-black font-mono tabular-nums mt-1 ${roiCls}`}>
        {has ? `${data.roi >= 0 ? "+" : ""}${data.roi.toFixed(0)}%` : "—"}
      </p>
      <p className="text-[8px] text-muted-foreground/60 mt-0.5 font-mono">
        {data.count} 场{has ? ` · 胜${data.winRate.toFixed(0)}%` : ""}
      </p>
    </div>
  );
}

function formatLead(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} 小时` : `${h}h ${m}m`;
}

function OverviewTile({
  icon, label, value, accent, footnote,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "profit" | "loss" | "warning" | "muted";
  footnote?: string;
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
      {footnote && <p className="text-[8px] text-muted-foreground/50 mt-0.5 leading-tight">{footnote}</p>}
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

// ── 盘面结果分布 ─────────────────────────────────────────────
function OutcomeBreakdown({
  a, settled,
}: {
  a: { win: number; halfWin: number; push: number; halfLoss: number; loss: number };
  settled: number;
}) {
  const items: { key: string; label: string; value: number; cls: string; bar: string }[] = [
    { key: "win",      label: "赢",   value: a.win,      cls: "text-profit",          bar: "bg-profit" },
    { key: "halfWin",  label: "赢半", value: a.halfWin,  cls: "text-profit/80",       bar: "bg-profit/70" },
    { key: "push",     label: "走",   value: a.push,     cls: "text-muted-foreground", bar: "bg-muted-foreground/40" },
    { key: "halfLoss", label: "输半", value: a.halfLoss, cls: "text-loss/80",         bar: "bg-loss/70" },
    { key: "loss",     label: "输",   value: a.loss,     cls: "text-loss",            bar: "bg-loss" },
  ];
  return (
    <div>
      {/* 堆叠条 */}
      <div className="flex h-2 rounded overflow-hidden bg-muted mb-2">
        {items.map((it) =>
          it.value > 0 ? (
            <div key={it.key} className={it.bar} style={{ width: `${(it.value / settled) * 100}%` }} />
          ) : null
        )}
      </div>
      {/* 5 列数字 */}
      <div className="grid grid-cols-5 gap-1">
        {items.map((it) => (
          <div key={it.key} className="text-center">
            <p className="text-[9px] text-muted-foreground">{it.label}</p>
            <p className={`text-sm font-black font-mono tabular-nums ${it.cls}`}>{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 按纪律 vs 违纪 ───────────────────────────────────────────
function DisciplineCompare({
  dc,
}: {
  dc: {
    disciplined: { count: number; settled: number; winRate: number; roi: number; totalPnl: number };
    violated:    { count: number; settled: number; winRate: number; roi: number; totalPnl: number };
  };
}) {
  const rows: { k: "disciplined" | "violated"; label: string; emoji: string; d: typeof dc.disciplined; accent: string }[] = [
    { k: "disciplined", label: "按纪律", emoji: "✓", d: dc.disciplined, accent: "text-profit" },
    { k: "violated",    label: "违纪",   emoji: "⚠", d: dc.violated,    accent: "text-warning" },
  ];
  const roiDelta = dc.disciplined.settled > 0 && dc.violated.settled > 0
    ? dc.disciplined.roi - dc.violated.roi
    : null;
  return (
    <div className="space-y-2">
      {rows.map(({ k, label, emoji, d, accent }) => {
        const hasSettled = d.settled > 0;
        const winCls = !hasSettled ? "text-muted-foreground/40" : d.winRate >= 50 ? "text-profit" : "text-loss";
        const roiCls = !hasSettled ? "text-muted-foreground/40" : d.roi >= 0 ? "text-profit" : "text-loss";
        return (
          <div key={k} className="flex items-center gap-2 rounded bg-card/40 px-2 py-2">
            <div className={`text-[10px] font-bold w-14 shrink-0 ${accent}`}>
              <span className="mr-1">{emoji}</span>{label}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono shrink-0 w-10">
              {d.count} 场
            </div>
            <div className="flex-1 grid grid-cols-2 gap-1 text-center">
              <div>
                <p className="text-[9px] text-muted-foreground">胜率</p>
                <p className={`text-xs font-black font-mono tabular-nums ${winCls}`}>
                  {hasSettled ? `${d.winRate.toFixed(0)}%` : "—"}
                </p>
              </div>
              <div>
                <p className="text-[9px] text-muted-foreground">ROI</p>
                <p className={`text-xs font-black font-mono tabular-nums ${roiCls}`}>
                  {hasSettled ? `${d.roi >= 0 ? "+" : ""}${d.roi.toFixed(0)}%` : "—"}
                </p>
              </div>
            </div>
          </div>
        );
      })}
      {roiDelta != null && (
        <p className="text-[10px] text-center text-muted-foreground">
          按纪律比违纪 ROI{" "}
          <span className={roiDelta >= 0 ? "text-profit font-semibold" : "text-loss font-semibold"}>
            {roiDelta >= 0 ? "高" : "低"} {Math.abs(roiDelta).toFixed(0)}%
          </span>
        </p>
      )}
    </div>
  );
}
