"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ArrowLeft, LayoutList, CalendarDays } from "lucide-react";
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
import { getBetRecords, getAbandonedRecords } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import RecordDetail from "./[id]/RecordDetail";
import AbandonedDetail from "../abandoned/[id]/AbandonedDetail";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDateGroup(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(items: UnifiedRecord[]): { date: string; dayKey: string; items: UnifiedRecord[] }[] {
  const map = new Map<string, UnifiedRecord[]>();
  for (const item of items) {
    const key = item.kickoffTime.slice(0, 10);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, items]) => ({
      dayKey,
      date: fmtDateGroup(items[0].kickoffTime),
      items: items.sort((a, b) => b.kickoffTime.localeCompare(a.kickoffTime)),
    }));
}

function filterByMonth(items: UnifiedRecord[], year: number, month: number): UnifiedRecord[] {
  return items.filter((r) => {
    const d = new Date(r.kickoffTime);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
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
  abandon_correct: "放弃得对", abandon_wrong: "放弃错了", no_regret: "仍不后悔",
};

const GRADE_COLORS: Record<string, string> = {
  S: "text-[#f5c842]", A: "text-[#b8a0e8]", B: "text-[#6ea8d8]", C: "text-warning",
};

// ─── Completion Indicator ─────────────────────────────────────────────────────

function CompletionDot({ status }: { status: string }) {
  if (status === "pending_review") return <span className="w-2 h-2 rounded-full bg-loss block shrink-0 animate-pulse" />;
  if (status === "pending_improve") return <span className="w-2 h-2 rounded-full bg-warning block shrink-0" />;
  if (status === "complete") return <span className="text-[10px] text-profit leading-none shrink-0">✓</span>;
  return <span className="w-2 h-2 rounded-full bg-border block shrink-0" />;
}

// ─── Bet Row ──────────────────────────────────────────────────────────────────

function BetRow({ r }: { r: BetRecord }) {
  const router = useRouter();
  const pnl = getTotalPnl(r);
  const outcome = r.result?.outcome;
  const betAmt = getTotalBetAmount(r);

  const leftBorder =
    r.isDisciplineViolation ? "border-l-warning" :
    outcome === undefined ? "border-l-border" :
    pnl !== null && pnl > 0 ? "border-l-profit" :
    pnl !== null && pnl < 0 ? "border-l-loss" :
    "border-l-border";

  return (
    <button onClick={() => router.push(`/records?id=${r.id}`)} className="w-full text-left">
      <div className={`flex items-center gap-3 px-3 py-3 bg-card active:opacity-60 transition-opacity border-l-2 ${leftBorder} rounded-sm`}>
        <CompletionDot status={r.completionStatus} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
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
            {fmtTime(r.kickoffTime)}
          </p>
          {r.result?.errors && r.result.errors.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {r.result.errors.slice(0, 3).map((e) => (
                <span key={e} className="text-[9px] px-1.5 py-0.5 rounded bg-loss/10 text-loss border border-loss/20">{e}</span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 min-w-[48px]">
          {outcome ? (
            <>
              <p className="text-[10px] text-muted-foreground">{OUTCOME_LABELS[outcome]}</p>
              {pnl !== null && (
                <p className={`text-sm font-black font-mono mt-0.5 ${pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-neutral"}`}>
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
        <CompletionDot status={a.completionStatus} />
        <div className="flex-1 min-w-0 opacity-55">
          <p className="text-xs truncate">{a.match}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            放弃
            <span className="mx-1 opacity-30">·</span>
            {a.handicapSide === "home" ? "主让" : "客让"}{a.handicapValue}
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

// ─── Year View ────────────────────────────────────────────────────────────────

function YearView({
  year,
  setYear,
  allBetRecords,
  allAbandonedRecords,
  onMonthClick,
}: {
  year: number;
  setYear: (y: number) => void;
  allBetRecords: BetRecord[];
  allAbandonedRecords: AbandonedRecord[];
  onMonthClick: (month: number) => void;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();

  const yearBets = useMemo(() => allBetRecords.filter((r) => new Date(r.kickoffTime).getFullYear() === year), [allBetRecords, year]);
  const yearAbandoned = useMemo(() => allAbandonedRecords.filter((r) => new Date(r.kickoffTime).getFullYear() === year), [allAbandonedRecords, year]);
  const yearStats = useMemo(() => calcBetStats(yearBets), [yearBets]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const bets = allBetRecords.filter((r) => {
        const d = new Date(r.kickoffTime);
        return d.getFullYear() === year && d.getMonth() + 1 === m;
      });
      const aband = allAbandonedRecords.filter((r) => {
        const d = new Date(r.kickoffTime);
        return d.getFullYear() === year && d.getMonth() + 1 === m;
      });
      const stats = calcBetStats(bets);
      return { month: m, bets, aband, stats };
    });
  }, [allBetRecords, allAbandonedRecords, year]);

  const hasAnyData = yearBets.length > 0 || yearAbandoned.length > 0;

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-muted-foreground"><ArrowLeft size={16} /></Link>
          <span className="font-semibold text-sm flex-1">记录</span>
        </div>

        {/* Year nav */}
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

        {/* Year total bar */}
        <div className="flex items-center gap-0 divide-x divide-border border-t border-border">
          <div className="flex-1 px-3 py-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">年度盈亏</p>
            <p className={`text-sm font-black font-mono mt-0.5 ${yearStats.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
              {yearStats.totalBet > 0 ? (yearStats.totalPnl >= 0 ? "+" : "") + yearStats.totalPnl.toLocaleString() : "—"}
            </p>
          </div>
          <div className="flex-1 px-3 py-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">ROI</p>
            <p className={`text-sm font-black font-mono mt-0.5 ${yearStats.roi >= 0 ? "text-profit" : "text-loss"}`}>
              {yearStats.totalBet > 0 ? `${yearStats.roi >= 0 ? "+" : ""}${yearStats.roi.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div className="flex-1 px-3 py-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">下注场</p>
            <p className="text-sm font-black font-mono mt-0.5">{yearBets.length}</p>
          </div>
          <div className="flex-1 px-3 py-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">放弃场</p>
            <p className="text-sm font-black font-mono mt-0.5">{yearAbandoned.length}</p>
          </div>
        </div>
      </div>

      {/* Month list */}
      <div className="px-4 py-3">
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
                          <span className="text-[10px] text-muted-foreground/60">{aband.length}场放弃</span>
                        )}
                        {hasPnl && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            投¥{(stats.totalBet / 1000).toFixed(0)}k
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
  viewMode: "month" | "year";
  setViewMode: (v: "month" | "year") => void;
  allBetRecords: BetRecord[];
  allAbandonedRecords: AbandonedRecord[];
}) {
  const allUnified: UnifiedRecord[] = useMemo(() => [
    ...allBetRecords,
    ...allAbandonedRecords,
  ], [allBetRecords, allAbandonedRecords]);

  const monthItems = useMemo(() => filterByMonth(allUnified, year, month), [allUnified, year, month]);
  const monthBets = useMemo(() => monthItems.filter((r): r is BetRecord => r.type === "bet"), [monthItems]);
  const groups = useMemo(() => groupByDate(monthItems), [monthItems]);
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
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link href="/" className="text-muted-foreground"><ArrowLeft size={16} /></Link>
          <span className="font-semibold text-sm flex-1">记录</span>
          <button
            onClick={() => setViewMode(viewMode === "month" ? "year" : "month")}
            className="text-muted-foreground p-1"
            title={viewMode === "month" ? "切换年视图" : "切换月视图"}
          >
            {viewMode === "month" ? <CalendarDays size={16} /> : <LayoutList size={16} />}
          </button>
        </div>

        {/* Month nav */}
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

        {/* Month summary bar */}
        <div className="flex items-center gap-0 divide-x divide-border border-t border-border">
          <div className="flex-1 px-3 py-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">本月盈亏</p>
            <p className={`text-sm font-black font-mono mt-0.5 ${stats.totalPnl >= 0 ? "text-profit" : "text-loss"}`}>
              {stats.totalPnl >= 0 ? "+" : ""}{stats.totalPnl.toLocaleString()}
            </p>
          </div>
          <div className="flex-1 px-3 py-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">投注</p>
            <p className="text-sm font-black font-mono mt-0.5">
              {stats.totalBet > 0 ? `¥${(stats.totalBet / 1000).toFixed(0)}k` : "—"}
            </p>
          </div>
          <div className="flex-1 px-3 py-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">ROI</p>
            <p className={`text-sm font-black font-mono mt-0.5 ${stats.roi >= 0 ? "text-profit" : "text-loss"}`}>
              {stats.totalBet > 0 ? `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%` : "—"}
            </p>
          </div>
          <div className="flex-1 px-3 py-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">场次</p>
            <p className="text-sm font-black font-mono mt-0.5">{monthBets.length}</p>
          </div>
        </div>
      </div>

      {pendingCount > 0 && (
        <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-2 rounded bg-loss/10 border border-loss/20">
          <span className="w-1.5 h-1.5 rounded-full bg-loss animate-pulse shrink-0" />
          <p className="text-xs text-loss">{pendingCount} 场比赛待复盘</p>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 pt-3 pb-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-loss block shrink-0" />
          <span className="text-[10px] text-muted-foreground">待复盘</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-warning block shrink-0" />
          <span className="text-[10px] text-muted-foreground">待完善</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-profit leading-none">✓</span>
          <span className="text-[10px] text-muted-foreground">已完成</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-border block shrink-0" />
          <span className="text-[10px] text-muted-foreground">未开始</span>
        </div>
      </div>

      <div className="px-4 py-3">
        {groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <p className="text-sm text-muted-foreground">{year}年{month}月暂无记录</p>
            <Link href="/review" className="text-xs text-muted-foreground underline underline-offset-2">开始纪律审查</Link>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(({ date, dayKey, items }) => {
              const dayBets = items.filter((r): r is BetRecord => r.type === "bet" && !!r.result);
              const dayPnl = dayBets.reduce((s, r) => {
                const pnl = r.bets.reduce((bs, b) => bs + calcPnl(b.amount, b.odds, r.result!.outcome), 0);
                return s + pnl;
              }, 0);
              const hasPnl = dayBets.length > 0;
              return (
                <div key={dayKey}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{date}</p>
                    {hasPnl && (
                      <p className={`text-[10px] font-bold font-mono ${dayPnl >= 0 ? "text-profit" : "text-loss"}`}>
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
        )}
      </div>

      <BottomNav />
    </div>
  );
}

// ─── Inner (uses useSearchParams) ────────────────────────────────────────────

function RecordsInner() {
  const searchParams = useSearchParams();
  const betId = searchParams.get("id");
  const abanId = searchParams.get("aid");

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [viewMode, setViewMode] = useState<"month" | "year">("month");
  const [allBetRecords, setAllBetRecords] = useState<BetRecord[]>([]);
  const [allAbandonedRecords, setAllAbandonedRecords] = useState<AbandonedRecord[]>([]);

  useEffect(() => {
    setAllBetRecords(getBetRecords());
    setAllAbandonedRecords(getAbandonedRecords());
  }, [betId, abanId]); // Re-fetch when coming back from detail

  if (betId) return <RecordDetail id={betId} />;
  if (abanId) return <AbandonedDetail id={abanId} />;

  if (viewMode === "year") {
    return (
      <YearView
        year={year}
        setYear={setYear}
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
