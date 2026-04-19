"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import {
  getTotalPnl,
  getTotalBetAmount,
  type Outcome,
  type ReviewConclusion,
  type BetRecord,
  type AbandonedRecord,
  type UnifiedRecord,
  calcPnl,
} from "@/lib/mock-data";
import { weekStart, weekEnd, matchDayKey, matchDayStart, formatMatchDayLabel, formatBetDirection, parseKickoff } from "@/lib/types";
import { getBetRecords, getAbandonedRecords, getSettings, saveSettings } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import AnalyticsPanel from "@/components/analytics-panel";
import PnlBars from "@/components/pnl-bars";
import RecordDetail from "./[id]/RecordDetail";
import AbandonedDetail from "../abandoned/[id]/AbandonedDetail";

type ViewMode = "week" | "month" | "year";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(iso: string) {
  return parseKickoff(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function fmtMd(d: Date) {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Group by match-day (10am → next 10am boundary)
function groupByDate(items: UnifiedRecord[]): { date: string; dayKey: string; items: UnifiedRecord[] }[] {
  const map = new Map<string, UnifiedRecord[]>();
  for (const item of items) {
    const key = matchDayKey(item.kickoffTime);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, items]) => ({
      dayKey,
      date: formatMatchDayLabel(dayKey),
      items: items.sort((a, b) => b.kickoffTime.localeCompare(a.kickoffTime)),
    }));
}

function filterByMonth(items: UnifiedRecord[], year: number, month: number): UnifiedRecord[] {
  // Month based on match-day attribution (10am boundary)
  return items.filter((r) => {
    const a = matchDayStart(r.kickoffTime);
    return a.getFullYear() === year && a.getMonth() + 1 === month;
  });
}

function filterByWeek(items: UnifiedRecord[], anchor: Date): UnifiedRecord[] {
  // Week window: Monday 10:00 → next Monday 10:00
  const ws = weekStart(anchor);
  ws.setHours(10, 0, 0, 0);
  const end = new Date(ws);
  end.setDate(end.getDate() + 7);
  return items.filter((r) => {
    const a = matchDayStart(r.kickoffTime);
    return a >= ws && a < end;
  });
}

// Daily PnL bars for a calendar month (1 bar per day; grouped by match-day).
function dailyBarsForMonth(bets: BetRecord[], year: number, month: number): { key: string; pnl: number }[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const out: { key: string; pnl: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const k = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    let pnl = 0;
    for (const r of bets) {
      if (!r.result) continue;
      if (matchDayKey(r.kickoffTime) !== k) continue;
      pnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
    }
    out.push({ key: k, pnl });
  }
  return out;
}

// Weekly PnL bars for a calendar year — 52 ISO weeks anchored to Monday.
function weeklyBarsForYear(bets: BetRecord[], year: number): { key: string; pnl: number }[] {
  // Find first Monday ≥ Jan 1 of year's ISO scheme; use simple approach: 52 weeks starting from first Monday of the year
  const jan1 = new Date(year, 0, 1);
  const dow = jan1.getDay();
  const diffToMon = dow === 0 ? 1 : (8 - dow) % 7;
  const firstMon = new Date(year, 0, 1 + diffToMon);
  firstMon.setHours(10, 0, 0, 0);
  const out: { key: string; pnl: number }[] = [];
  for (let w = 0; w < 52; w++) {
    const start = new Date(firstMon);
    start.setDate(start.getDate() + w * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const k = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    let pnl = 0;
    for (const r of bets) {
      if (!r.result) continue;
      const a = matchDayStart(r.kickoffTime);
      if (a < start || a >= end) continue;
      pnl += r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
    }
    out.push({ key: k, pnl });
  }
  return out;
}

function calcBetStats(bets: BetRecord[]) {
  let totalBet = 0;
  let totalPnl = 0;
  let settled = 0;
  for (const r of bets) {
    const amt = r.bets.reduce((s, b) => s + b.amount, 0);
    totalBet += amt;
    if (r.result) {
      const pnl = r.bets.reduce((s, b) => s + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
      totalPnl += pnl;
      settled++;
    }
  }
  const roi = totalBet > 0 ? (totalPnl / totalBet) * 100 : 0;
  return { totalBet, totalPnl, roi, settled };
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const OUTCOME_LABELS: Record<Outcome, string> = {
  win: "胜", half_win: "赢半", push: "走", half_loss: "输半", loss: "负",
};

const CONCLUSION_LABELS: Record<ReviewConclusion, string> = {
  abandon_correct: "观察得对", abandon_wrong: "观察错了", no_regret: "仍不后悔",
};

const GRADE_COLORS: Record<string, string> = {
  S: "text-[#f5c842]", A: "text-[#b8a0e8]", B: "text-[#6ea8d8]", C: "text-warning",
};

// ─── Completion Indicator ─────────────────────────────────────────────────────
// For pending states: shows a dot; for completed bets/watches, pass outcome
// and render a semantic mark (red ✓ = 对, green ✗ = 错, gray — = 走, gray ✓ = 仍不后悔).

function CompletionDot({ status }: { status: string }) {
  if (status === "pending_review") return <span className="w-2 h-2 rounded-full bg-loss block shrink-0 animate-pulse" />;
  if (status === "pending_improve") return <span className="w-2 h-2 rounded-full bg-warning block shrink-0" />;
  if (status === "complete") return <span className="text-[11px] text-profit leading-none shrink-0">✓</span>;
  return <span className="w-2 h-2 rounded-full bg-border block shrink-0" />;
}

// For a settled bet: win/half_win → red ✓; loss/half_loss → green ✗; push → gray —
function BetOutcomeMark({ outcome }: { outcome?: Outcome }) {
  if (!outcome) return null;
  if (outcome === "win" || outcome === "half_win")
    return <span className="text-[13px] font-black text-profit leading-none shrink-0" aria-label="对">✓</span>;
  if (outcome === "loss" || outcome === "half_loss")
    return <span className="text-[13px] font-black text-loss leading-none shrink-0" aria-label="错">✗</span>;
  // push
  return <span className="text-[13px] font-black text-muted-foreground leading-none shrink-0" aria-label="走">—</span>;
}

// For a reviewed watch: abandon_correct → red ✓; abandon_wrong → green ✗; no_regret → gray ✓
function WatchOutcomeMark({ conclusion }: { conclusion?: ReviewConclusion }) {
  if (!conclusion) return null;
  if (conclusion === "abandon_correct")
    return <span className="text-[13px] font-black text-profit leading-none shrink-0" aria-label="对">✓</span>;
  if (conclusion === "abandon_wrong")
    return <span className="text-[13px] font-black text-loss leading-none shrink-0" aria-label="错">✗</span>;
  // no_regret
  return <span className="text-[13px] font-black text-muted-foreground leading-none shrink-0" aria-label="仍不后悔">✓</span>;
}

// ─── Bet Row ──────────────────────────────────────────────────────────────────

function BetRow({ r }: { r: BetRecord }) {
  const router = useRouter();
  const pnl = getTotalPnl(r);
  const outcome = r.result?.outcome;
  const betAmt = getTotalBetAmount(r);
  const finalScore = r.result?.finalScore;

  const leftBorder =
    r.isDisciplineViolation ? "border-l-warning" :
    outcome === undefined ? "border-l-border" :
    pnl !== null && pnl > 0 ? "border-l-profit" :
    pnl !== null && pnl < 0 ? "border-l-loss" :
    "border-l-border";

  return (
    <button onClick={() => router.push(`/records?id=${r.id}`)} className="w-full text-left">
      <div className={`flex items-center gap-3 px-3 py-3 bg-card active:opacity-60 transition-opacity border-l-2 ${leftBorder} rounded-sm`}>
        {outcome ? <BetOutcomeMark outcome={outcome} /> : <CompletionDot status={r.completionStatus} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-black shrink-0 ${GRADE_COLORS[r.grade]}`}>{r.grade}</span>
            <p className="text-xs font-semibold truncate">{r.match}</p>
            {finalScore && (
              <span className="text-[10px] font-mono tabular-nums text-foreground/80 shrink-0 bg-muted px-1.5 py-0.5 rounded">
                {finalScore.home}:{finalScore.away}
              </span>
            )}
            {r.isDisciplineViolation && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-warning/15 text-warning shrink-0">违纪</span>
            )}
          </div>
          {(r.homeTeam || r.awayTeam) && (
            <p className="text-[11px] text-foreground/70 mt-0.5 truncate">
              <span className="font-medium">{r.homeTeam || "主队"}</span>
              <span className="mx-1 text-muted-foreground/50">vs</span>
              <span className="font-medium">{r.awayTeam || "客队"}</span>
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">
            <span className="text-foreground/80 font-medium">
              {formatBetDirection({
                homeTeam: r.homeTeam,
                awayTeam: r.awayTeam,
                bettingDirection: r.bettingDirection,
                handicapSide: r.handicapSide,
                handicapValue: r.handicapValue,
              })}
            </span>
            <span className="mx-1 opacity-30">·</span>
            <span className="text-sm font-mono font-semibold tabular-nums text-foreground/90">¥{betAmt.toLocaleString()}</span>
            <span className="mx-1 opacity-30">·</span>
            {fmtTime(r.kickoffTime)}
          </p>
          {r.result?.errors && r.result.errors.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {r.result.errors.slice(0, 3).map((e) => (
                <span key={e} className="text-[9px] px-1.5 py-0.5 rounded bg-loss/10 text-loss border border-loss/20">{e}</span>
              ))}
            </div>
          )}
          {r.result?.positiveNotes && r.result.positiveNotes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {r.result.positiveNotes.slice(0, 3).map((p) => (
                <span key={p} className="text-[9px] px-1.5 py-0.5 rounded bg-profit/10 text-profit border border-profit/20">{p}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 min-w-[48px]">
          {outcome ? (
            <>
              <p className="text-[10px] text-muted-foreground">{OUTCOME_LABELS[outcome]}</p>
              {pnl !== null && (
                <p className={`text-sm font-black font-mono tabular-nums mt-0.5 ${pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-neutral"}`}>
                  {pnl > 0 ? "+" : ""}{pnl === 0 ? "±0" : pnl.toLocaleString()}
                </p>
              )}
            </>
          ) : (
            <p className={`text-[10px] font-medium ${r.completionStatus === "pending_review" ? "text-loss" : "text-warning"}`}>
              {r.completionStatus === "pending_review" ? "待复盘" : "待结算"}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Abandoned Row ────────────────────────────────────────────────────────────

function AbandonedRow({ a }: { a: AbandonedRecord }) {
  const router = useRouter();
  return (
    <button onClick={() => router.push(`/records?aid=${a.id}`)} className="w-full text-left">
      <div className="flex items-center gap-3 px-3 py-2.5 bg-card/60 active:opacity-60 transition-opacity border-l-2 border-l-muted rounded-sm">
        {a.reviewConclusion ? <WatchOutcomeMark conclusion={a.reviewConclusion} /> : <CompletionDot status={a.completionStatus} />}
        <div className="flex-1 min-w-0 opacity-55">
          <div className="flex items-center gap-1.5">
            <p className="text-xs truncate">{a.match}</p>
            {a.finalScore && (
              <span className="text-[10px] font-mono tabular-nums text-foreground/80 shrink-0 bg-muted px-1.5 py-0.5 rounded">
                {a.finalScore.home}:{a.finalScore.away}
              </span>
            )}
          </div>
          {(a.homeTeam || a.awayTeam) && (
            <p className="text-[11px] text-foreground/70 mt-0.5 truncate">
              <span>{a.homeTeam || "主队"}</span>
              <span className="mx-1 text-muted-foreground/50">vs</span>
              <span>{a.awayTeam || "客队"}</span>
            </p>
          )}
          <p className="text-[10px] text-muted-foreground mt-0.5">
            观察
            <span className="mx-1 opacity-30">·</span>
            <span className="text-foreground/80">
              {formatBetDirection({
                homeTeam: a.homeTeam,
                awayTeam: a.awayTeam,
                bettingDirection: a.bettingDirection,
                handicapSide: a.handicapSide,
                handicapValue: a.handicapValue,
              })}
            </span>
            <span className="mx-1 opacity-30">·</span>
            {a.totalScore}/10
            <span className="mx-1 opacity-30">·</span>
            {fmtTime(a.kickoffTime)}
          </p>
        </div>
        <div className="text-right shrink-0 opacity-70">
          {a.reviewConclusion ? (
            <p className={`text-[10px] font-bold ${
              a.reviewConclusion === "abandon_correct" ? "text-profit" :
              a.reviewConclusion === "no_regret"       ? "text-[#6ea8d8]" : "text-loss"
            }`}>{CONCLUSION_LABELS[a.reviewConclusion]}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground">未复盘</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── View Toggle ──────────────────────────────────────────────────────────────

function ViewToggle({ viewMode, setViewMode }: { viewMode: ViewMode; setViewMode: (v: ViewMode) => void }) {
  const opts: { k: ViewMode; label: string }[] = [
    { k: "week", label: "周" },
    { k: "month", label: "月" },
    { k: "year", label: "年" },
  ];
  return (
    <div className="flex items-center gap-0.5 bg-card rounded-sm p-0.5">
      {opts.map(({ k, label }) => (
        <button
          key={k}
          onClick={() => setViewMode(k)}
          className={`text-[11px] font-medium px-2.5 py-1 rounded-sm transition-colors ${
            viewMode === k ? "bg-background text-foreground" : "text-muted-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Groups renderer (shared) ─────────────────────────────────────────────────

function GroupedList({ items, highlightDate }: { items: UnifiedRecord[]; highlightDate?: string }) {
  const groups = useMemo(() => groupByDate(items), [items]);

  // Scroll to highlighted date section on mount
  useEffect(() => {
    if (!highlightDate) return;
    const el = document.querySelector(`[data-day-key="${highlightDate}"]`);
    if (el) {
      (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [highlightDate, groups]);

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <p className="text-sm text-muted-foreground">暂无记录</p>
        <Link href="/review" className="text-xs text-muted-foreground underline underline-offset-2">开始纪律审查</Link>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {groups.map(({ date, dayKey, items }) => {
        const dayBets = items.filter((r): r is BetRecord => r.type === "bet" && !!r.result);
        const dayPnl = dayBets.reduce((s, r) => {
          const pnl = r.bets.reduce((bs, b) => bs + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
          return s + pnl;
        }, 0);
        const hasPnl = dayBets.length > 0;
        const isHighlighted = highlightDate === dayKey;
        const betCount = items.filter((r) => r.type === "bet").length;
        const watchCount = items.filter((r) => r.type === "abandoned").length;
        return (
          <div key={dayKey} data-day-key={dayKey}
            className={isHighlighted ? "rounded-md ring-2 ring-foreground/20 bg-foreground/[0.02] p-2 -m-2" : ""}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <p className="text-[11px] font-bold text-foreground uppercase tracking-wider">{date}</p>
                <span className="text-[10px] text-muted-foreground/60">
                  {betCount > 0 && `${betCount}下注`}
                  {betCount > 0 && watchCount > 0 && " · "}
                  {watchCount > 0 && `${watchCount}观察`}
                </span>
              </div>
              {hasPnl && (
                <p className={`text-[11px] font-black font-mono tabular-nums ${dayPnl >= 0 ? "text-profit" : "text-loss"}`}>
                  {dayPnl >= 0 ? "+" : ""}{dayPnl.toLocaleString()}
                </p>
              )}
            </div>
            <div className="space-y-px">
              {items.map((r) =>
                r.type === "bet" ? <BetRow key={r.id} r={r} /> : <AbandonedRow key={r.id} a={r} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Stats Bar (shared) ───────────────────────────────────────────────────────

function StatsBar({ stats, matchCount, watchCount, pnlLabel }: {
  stats: { totalBet: number; totalPnl: number; roi: number };
  matchCount: number;
  watchCount: number;
  pnlLabel: string;
}) {
  // ROI is shown in AnalyticsPanel below — keep this strip to 3 tiles
  return (
    <div className="flex items-center gap-0 divide-x divide-border border-t border-border">
      <div className="flex-1 px-3 py-2.5 text-center">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{pnlLabel}</p>
        <p className={`text-sm font-black font-mono mt-0.5 ${stats.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
          {stats.totalBet > 0 ? (stats.totalPnl >= 0 ? "+" : "") + stats.totalPnl.toLocaleString() : "—"}
        </p>
      </div>
      <div className="flex-1 px-3 py-2.5 text-center">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">下注</p>
        <p className="text-sm font-black font-mono mt-0.5">{matchCount}</p>
      </div>
      <div className="flex-1 px-3 py-2.5 text-center">
        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">观察</p>
        <p className="text-sm font-black font-mono mt-0.5">{watchCount}</p>
      </div>
    </div>
  );
}

// ─── Week View ────────────────────────────────────────────────────────────────

function WeekView({
  weekAnchor,
  setWeekAnchor,
  viewMode,
  setViewMode,
  allBetRecords,
  allAbandonedRecords,
  highlightDate,
}: {
  weekAnchor: Date;
  setWeekAnchor: (d: Date) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  allBetRecords: BetRecord[];
  allAbandonedRecords: AbandonedRecord[];
  highlightDate?: string;
}) {
  const allUnified: UnifiedRecord[] = useMemo(
    () => [...allBetRecords, ...allAbandonedRecords],
    [allBetRecords, allAbandonedRecords]
  );
  const weekItems = useMemo(() => filterByWeek(allUnified, weekAnchor), [allUnified, weekAnchor]);
  const weekBets = useMemo(() => weekItems.filter((r): r is BetRecord => r.type === "bet"), [weekItems]);
  const weekWatches = useMemo(() => weekItems.filter((r): r is AbandonedRecord => r.type === "abandoned"), [weekItems]);
  const stats = useMemo(() => calcBetStats(weekBets), [weekBets]);

  const wStart = weekStart(weekAnchor);
  const wEnd = weekEnd(weekAnchor);

  function prevWeek() {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() - 7);
    setWeekAnchor(d);
  }
  function nextWeek() {
    const d = new Date(weekAnchor);
    d.setDate(d.getDate() + 7);
    if (weekStart(d).getTime() > weekStart(new Date()).getTime()) return;
    setWeekAnchor(d);
  }
  const isCurrentWeek = weekStart(weekAnchor).getTime() === weekStart(new Date()).getTime();

  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-muted-foreground"><ArrowLeft size={16} /></Link>
          <span className="font-semibold text-sm flex-1">记录</span>
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <button onClick={prevWeek} className="p-1 text-muted-foreground"><ChevronLeft size={16} /></button>
          <span className="text-sm font-semibold">{fmtMd(wStart)} – {fmtMd(wEnd)}</span>
          <button
            onClick={nextWeek}
            disabled={isCurrentWeek}
            className={`p-1 ${isCurrentWeek ? "text-muted-foreground/20" : "text-muted-foreground"}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <StatsBar stats={stats} matchCount={weekBets.length} watchCount={weekWatches.length} pnlLabel="本周盈亏" />
      </div>

      <div className="px-4 py-3 space-y-4">
        <AnalyticsPanel bets={weekBets} watches={weekWatches} />
        <GroupedList items={weekItems} highlightDate={highlightDate} />
      </div>

      <BottomNav />
    </div>
  );
}

// ─── Year View ────────────────────────────────────────────────────────────────

function YearView({
  year,
  setYear,
  viewMode,
  setViewMode,
  allBetRecords,
  allAbandonedRecords,
  onMonthClick,
}: {
  year: number;
  setYear: (y: number) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  allBetRecords: BetRecord[];
  allAbandonedRecords: AbandonedRecord[];
  onMonthClick: (month: number) => void;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const yearBets = useMemo(() => allBetRecords.filter((r) => parseKickoff(r.kickoffTime).getFullYear() === year), [allBetRecords, year]);
  const yearAbandoned = useMemo(() => allAbandonedRecords.filter((r) => parseKickoff(r.kickoffTime).getFullYear() === year), [allAbandonedRecords, year]);
  const yearStats = useMemo(() => calcBetStats(yearBets), [yearBets]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const bets = allBetRecords.filter((r) => {
        const d = parseKickoff(r.kickoffTime);
        return d.getFullYear() === year && d.getMonth() + 1 === m;
      });
      const aband = allAbandonedRecords.filter((r) => {
        const d = parseKickoff(r.kickoffTime);
        return d.getFullYear() === year && d.getMonth() + 1 === m;
      });
      const stats = calcBetStats(bets);
      return { month: m, bets, aband, stats };
    });
  }, [allBetRecords, allAbandonedRecords, year]);

  const hasAnyData = yearBets.length > 0 || yearAbandoned.length > 0;

  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-muted-foreground"><ArrowLeft size={16} /></Link>
          <span className="font-semibold text-sm flex-1">记录</span>
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <button onClick={() => setYear(year - 1)} className="p-1 text-muted-foreground">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm font-semibold">{year}年 年度汇总</span>
          <button
            onClick={() => setYear(year + 1)}
            disabled={year >= currentYear}
            className={`p-1 ${year >= currentYear ? "text-muted-foreground/20" : "text-muted-foreground"}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <StatsBar stats={yearStats} matchCount={yearBets.length} watchCount={yearAbandoned.length} pnlLabel="年度盈亏" />
      </div>

      <div className="px-4 py-3 space-y-4">
        {yearStats.settled > 0 && (
          <div className="border border-border rounded-md bg-card/40 px-3 pt-2 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                周K · {year}年每周盈亏
              </p>
              <div className="flex items-center gap-2 text-[9px] font-mono tabular-nums">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-profit" />盈</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-loss" />亏</span>
                <span className="flex items-center gap-1"><span className="w-2 h-px" style={{ background: "#f5c842" }} />累计</span>
              </div>
            </div>
            <PnlBars data={weeklyBarsForYear(yearBets, year)} height={160} zoomable />
          </div>
        )}
        {hasAnyData && <AnalyticsPanel bets={yearBets} watches={yearAbandoned} />}
        {!hasAnyData ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">{year}年暂无记录</p>
            <Link href="/review" className="text-xs text-muted-foreground underline underline-offset-2">开始纪律审查</Link>
          </div>
        ) : (
          <div className="space-y-px">
            {months.map(({ month, bets, aband, stats }) => {
              if (bets.length === 0 && aband.length === 0) return null;
              const hasPnl = stats.totalBet > 0;
              return (
                <button
                  key={month}
                  onClick={() => onMonthClick(month)}
                  className="w-full text-left"
                >
                  <div className="flex items-center px-3 py-3 bg-card active:opacity-60 transition-opacity rounded-sm">
                    <div className="w-10 shrink-0">
                      <p className="text-xs font-bold text-muted-foreground">{month}月</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">{bets.length}场下注</span>
                        {aband.length > 0 && (
                          <span className="text-[10px] text-muted-foreground/60">{aband.length}场观察</span>
                        )}
                        {hasPnl && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            投¥{stats.totalBet.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 min-w-[72px]">
                      {hasPnl ? (
                        <>
                          <p className={`text-sm font-black font-mono ${stats.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
                            {stats.totalPnl >= 0 ? "+" : ""}{stats.totalPnl.toLocaleString()}
                          </p>
                          <p className={`text-[10px] font-mono ${stats.roi >= 0 ? "text-profit/70" : "text-loss/70"}`}>
                            {stats.roi >= 0 ? "+" : ""}{stats.roi.toFixed(1)}%
                          </p>
                        </>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">待结算</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

// ─── Month List View ──────────────────────────────────────────────────────────

function MonthListView({
  year,
  month,
  setYear,
  setMonth,
  viewMode,
  setViewMode,
  allBetRecords,
  allAbandonedRecords,
}: {
  year: number;
  month: number;
  setYear: (y: number) => void;
  setMonth: (m: number) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  allBetRecords: BetRecord[];
  allAbandonedRecords: AbandonedRecord[];
}) {
  const allUnified: UnifiedRecord[] = useMemo(() => [
    ...allBetRecords,
    ...allAbandonedRecords,
  ], [allBetRecords, allAbandonedRecords]);

  const monthItems = useMemo(() => filterByMonth(allUnified, year, month), [allUnified, year, month]);
  const monthBets = useMemo(() => monthItems.filter((r): r is BetRecord => r.type === "bet"), [monthItems]);
  const monthWatches = useMemo(() => monthItems.filter((r): r is AbandonedRecord => r.type === "abandoned"), [monthItems]);
  const stats = useMemo(() => calcBetStats(monthBets), [monthBets]);

  const pendingCount = monthBets.filter((r) => r.completionStatus === "pending_review").length;

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    const n = new Date();
    if (year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth() + 1)) return;
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
  }

  const isCurrentMonth = (() => { const n = new Date(); return year === n.getFullYear() && month === n.getMonth() + 1; })();

  return (
    <div className="min-h-screen pb-28">
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-muted-foreground"><ArrowLeft size={16} /></Link>
          <span className="font-semibold text-sm flex-1">记录</span>
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>

        <div className="flex items-center justify-between px-4 pb-3">
          <button onClick={prevMonth} className="p-1 text-muted-foreground"><ChevronLeft size={16} /></button>
          <span className="text-sm font-semibold">{year}年{month}月</span>
          <button
            onClick={nextMonth}
            disabled={isCurrentMonth}
            className={`p-1 ${isCurrentMonth ? "text-muted-foreground/20" : "text-muted-foreground"}`}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <StatsBar stats={stats} matchCount={monthBets.length} watchCount={monthWatches.length} pnlLabel="本月盈亏" />
      </div>

      {pendingCount > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded bg-loss/10 border border-loss/20">
          <span className="w-1.5 h-1.5 rounded-full bg-loss animate-pulse shrink-0" />
          <p className="text-xs text-loss">{pendingCount} 场比赛待复盘</p>
        </div>
      )}

      <div className="px-4 py-3 space-y-4">
        {stats.settled > 0 && (
          <div className="border border-border rounded-md bg-card/40 px-3 pt-2 pb-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                日K · {month}月每日盈亏
              </p>
              <div className="flex items-center gap-2 text-[9px] font-mono tabular-nums">
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-profit" />盈</span>
                <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-sm bg-loss" />亏</span>
                <span className="flex items-center gap-1"><span className="w-2 h-px" style={{ background: "#f5c842" }} />累计</span>
              </div>
            </div>
            <PnlBars data={dailyBarsForMonth(monthBets, year, month)} height={140} zoomable />
          </div>
        )}
        <AnalyticsPanel bets={monthBets} watches={monthWatches} />
        <GroupedList items={monthItems} />
      </div>

      <BottomNav />
    </div>
  );
}

// ─── Inner (uses useSearchParams) ────────────────────────────────────────────

function RecordsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const betId = searchParams.get("id");
  const abanId = searchParams.get("aid");
  const dateParam = searchParams.get("date");  // YYYY-MM-DD, from home "yesterday activity"

  const [viewMode, setViewModeState] = useState<ViewMode>("month");
  const [viewLoaded, setViewLoaded] = useState(false);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [weekAnchor, setWeekAnchor] = useState<Date>(now);
  const [allBetRecords, setAllBetRecords] = useState<BetRecord[]>([]);
  const [allAbandonedRecords, setAllAbandonedRecords] = useState<AbandonedRecord[]>([]);

  useEffect(() => {
    const s = getSettings();
    const persisted = s.displayPrefs.recordsView;
    const urlView = searchParams.get("view");
    // Priority: ?date= forces week view; else ?view= override; else persisted
    if (dateParam) {
      setViewModeState("week");
      const d = new Date(dateParam + "T12:00:00");
      if (!isNaN(d.getTime())) setWeekAnchor(d);
    } else if (urlView === "week" || urlView === "month" || urlView === "year") {
      setViewModeState(urlView);
    } else if (persisted) {
      setViewModeState(persisted);
    }
    setViewLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setViewMode = (v: ViewMode) => {
    setViewModeState(v);
    const s = getSettings();
    saveSettings({ ...s, displayPrefs: { ...s.displayPrefs, recordsView: v } });
    router.replace(`/records?view=${v}`);
  };

  useEffect(() => {
    setAllBetRecords(getBetRecords());
    setAllAbandonedRecords(getAbandonedRecords());
  }, [betId, abanId]);

  if (betId) return <RecordDetail id={betId} />;
  if (abanId) return <AbandonedDetail id={abanId} />;
  if (!viewLoaded) return <div className="min-h-screen bg-background" />;

  if (viewMode === "week") {
    return (
      <WeekView
        weekAnchor={weekAnchor}
        setWeekAnchor={setWeekAnchor}
        viewMode={viewMode}
        setViewMode={setViewMode}
        allBetRecords={allBetRecords}
        allAbandonedRecords={allAbandonedRecords}
        highlightDate={dateParam ?? undefined}
      />
    );
  }

  if (viewMode === "year") {
    return (
      <YearView
        year={year}
        setYear={setYear}
        viewMode={viewMode}
        setViewMode={setViewMode}
        allBetRecords={allBetRecords}
        allAbandonedRecords={allAbandonedRecords}
        onMonthClick={(m) => { setMonth(m); setViewMode("month"); }}
      />
    );
  }

  return (
    <MonthListView
      year={year}
      month={month}
      setYear={setYear}
      setMonth={setMonth}
      viewMode={viewMode}
      setViewMode={setViewMode}
      allBetRecords={allBetRecords}
      allAbandonedRecords={allAbandonedRecords}
    />
  );
}

// ─── Page (wraps in Suspense for useSearchParams) ─────────────────────────────

export default function RecordsPage() {
  return (
    <Suspense>
      <RecordsInner />
    </Suspense>
  );
}
