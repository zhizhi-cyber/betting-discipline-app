"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronUp, Trash2, Star, Pencil } from "lucide-react";
import type { ReviewConclusion, AbandonedRecord, AnalysisVerdict, ScoreData, BetRecord, SidedHandicap } from "@/lib/types";
import { SUBDIMS, formatBetPreview, formatSidedHandicap } from "@/lib/types";
import { getAbandonedRecords, saveAbandonedRecord, deleteAbandonedRecord, promoteWatchToBet, getSettings, countToday } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

const SCORE_LABELS: Record<string, string> = {
  fundamental: "基本面",
  odds:        "赔率/盘口分析",
  reliability: "可靠性",
  trap:        "诱盘/抽水",
  bookie:      "庄家立场",
};

const ACTUAL_RESULTS: { key: string; label: string }[] = [
  { key: "win",     label: "赢了" },
  { key: "loss",    label: "输了" },
  { key: "push",    label: "走了" },
  { key: "unknown", label: "未知" },
];

const CONCLUSIONS: { key: ReviewConclusion; label: string; desc: string; color: string }[] = [
  { key: "abandon_correct", label: "观察得对", desc: "信息不足以支撑下注，赛果也印证了这一点", color: "text-profit border-profit/30 bg-profit/5" },
  { key: "abandon_wrong",   label: "观察错了", desc: "赛果证明当时判断有偏差，信息其实足够", color: "text-loss border-loss/30 bg-loss/5" },
  { key: "no_regret",       label: "仍不该后悔", desc: "即使赢了，当时信息也不支撑下注，纪律执行正确", color: "text-[#6ea8d8] border-[#6ea8d8]/30 bg-[#6ea8d8]/5" },
];

const VERDICT_OPTIONS: { key: AnalysisVerdict; label: string; cls: string }[] = [
  { key: "accurate", label: "事后印证：准",   cls: "bg-profit text-white" },
  { key: "passable", label: "事后印证:勉强", cls: "bg-muted-foreground text-white" },
  { key: "off",      label: "事后印证：偏",   cls: "bg-loss text-white" },
];

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("zh-CN", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AbandonedDetail({ id: propId }: { id?: string }) {
  const params = useParams();
  const router = useRouter();
  const id = propId ?? (Array.isArray(params.id) ? params.id[0] : params.id);
  const [record, setRecord] = useState<AbandonedRecord | undefined>(undefined);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteAmount, setPromoteAmount] = useState("");
  const [promoteOdds, setPromoteOdds] = useState("0.97");

  useEffect(() => {
    const found = getAbandonedRecords().find((r) => r.id === id);
    setRecord(found);
  }, [id]);

  const { show: showToast, node: toastNode } = useToast();

  const [scoresExpanded, setScoresExpanded] = useState(false);
  const [deductionExpanded, setDeductionExpanded] = useState(true);
  const [actualResult, setActualResult] = useState("");
  const [conclusion, setConclusion] = useState<ReviewConclusion | "">("");
  const [reviewNote, setReviewNote] = useState("");
  const [analysisVerdict, setAnalysisVerdict] = useState<AnalysisVerdict | null>(null);
  const [scoreHome, setScoreHome] = useState<string>("");
  const [scoreAway, setScoreAway] = useState<string>("");

  const settings = useMemo(() => getSettings(), []);
  const today = useMemo(() => countToday(), []);

  useEffect(() => {
    if (record) {
      setActualResult(record.actualResult ?? "");
      setConclusion(record.reviewConclusion ?? "");
      setReviewNote(record.reviewNote ?? "");
      setAnalysisVerdict(record.analysisVerdict ?? null);
      setScoreHome(record.finalScore?.home != null ? String(record.finalScore.home) : "");
      setScoreAway(record.finalScore?.away != null ? String(record.finalScore.away) : "");
    }
  }, [record]);

  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">记录不存在</p>
          <Link href="/records" className="text-xs underline mt-2 block text-muted-foreground">返回记录</Link>
        </div>
      </div>
    );
  }

  const teamName = record.bettingDirection === "home" ? record.homeTeam : record.awayTeam;
  const heroPreview = formatBetPreview({
    teamName, handicapSide: record.handicapSide, handicapValue: record.handicapValue,
    bettingDirection: record.bettingDirection, odds: 0,
  }).replace(/ @0$/, "");

  const promotePreview = formatBetPreview({
    teamName, handicapSide: record.handicapSide, handicapValue: record.handicapValue,
    bettingDirection: record.bettingDirection, odds: parseFloat(promoteOdds) || 0.97,
  });

  const hasDeduction = record.deduction &&
    (record.deduction.fairRanges.values.length > 0 ||
     record.deduction.homeWinBookieExpected.values.length > 0 ||
     record.deduction.awayWinBookieExpected.values.length > 0 ||
     record.deduction.personalAnalysis ||
     record.deduction.confidence > 0);

  const alreadyPromoted = !!record.promotedToBetId;
  const overBetLimit = today.bets >= settings.riskControls.maxDailyMatches;
  const finalScore = record.finalScore;

  const handlePromote = () => {
    if (!record) return;
    const amount = parseInt(promoteAmount.replace(/[^0-9]/g, ""), 10) || settings.gradeAmounts.C;
    const odds = parseFloat(promoteOdds) || 0.97;
    const newBetId = `b-${Date.now()}`;
    const newBet: BetRecord = {
      id: newBetId,
      type: "bet",
      match: record.match,
      homeTeam: record.homeTeam,
      awayTeam: record.awayTeam,
      kickoffTime: record.kickoffTime,
      bettingDirection: record.bettingDirection,
      handicapSide: record.handicapSide,
      handicapValue: record.handicapValue,
      grade: "C",
      totalScore: record.totalScore,
      scores: record.scores,
      deduction: record.deduction,
      bets: [{
        id: `bs-${Date.now()}`,
        type: "pre",
        handicapSide: record.handicapSide,
        handicapValue: record.handicapValue,
        odds,
        amount,
        betTime: new Date().toISOString(),
      }],
      isDisciplineViolation: true,
      completionStatus: "pristine",
      createdAt: new Date().toISOString(),
      convertedFromWatchId: record.id,
    };
    promoteWatchToBet(record.id, newBet);
    setPromoteOpen(false);
    router.push(`/records?id=${newBetId}`);
  };

  return (
    <div className="min-h-screen bg-background pb-28">
      {toastNode}

      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="flex items-center gap-1 text-muted-foreground">
            <ArrowLeft size={15} />
            <span className="text-sm">记录</span>
          </button>
          <span className="font-semibold text-sm">观察详情</span>
          <div className="flex items-center gap-1">
            <button onClick={() => router.push(`/review?editWatch=${record.id}`)} className="text-muted-foreground p-1" aria-label="编辑">
              <Pencil size={14} />
            </button>
            <button onClick={() => setDeleteConfirm(true)} className="text-muted-foreground/50 p-1 -mr-1">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-end">
          <div className="w-full bg-card border-t border-border px-4 py-5 space-y-3 max-w-[430px] mx-auto">
            <p className="text-sm font-bold">确认删除这条记录？</p>
            <p className="text-xs text-muted-foreground">删除后无法恢复</p>
            <button onClick={() => { deleteAbandonedRecord(record.id); router.push("/records"); }}
              className="w-full py-3 rounded font-bold text-sm bg-loss text-white">
              确认删除
            </button>
            <button onClick={() => setDeleteConfirm(false)} className="w-full py-2 text-xs text-muted-foreground">取消</button>
          </div>
        </div>
      )}

      {promoteOpen && (
        <div className="fixed inset-0 z-50 bg-background/80 flex items-end">
          <div className="w-full bg-card border-t border-border px-4 py-5 space-y-3 max-w-[430px] mx-auto">
            <p className="text-sm font-bold">补录为下注记录</p>
            <div className="rounded-md bg-muted px-4 py-3">
              <p className="text-base font-bold font-mono">{promotePreview}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">水位</p>
              <input value={promoteOdds} onChange={(e) => setPromoteOdds(e.target.value)}
                inputMode="decimal"
                className="w-full bg-muted rounded px-3 py-2 text-sm font-mono outline-none" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">金额</p>
              <input value={promoteAmount} onChange={(e) => setPromoteAmount(e.target.value)}
                inputMode="numeric"
                placeholder={`建议 ¥${settings.gradeAmounts.C.toLocaleString()}`}
                className="w-full bg-muted rounded px-3 py-3 text-lg font-mono outline-none placeholder:text-muted-foreground/40" />
            </div>
            {overBetLimit && (
              <p className="text-[11px] text-loss">⚠ 今日下注已达上限 {today.bets}/{settings.riskControls.maxDailyMatches}，仍要补录？</p>
            )}
            <p className="text-[10px] text-muted-foreground">补录为下注会标记为&ldquo;违纪单&rdquo;，提醒你这次绕过了观察纪律。</p>
            <button onClick={handlePromote}
              className="w-full py-3 rounded font-bold text-sm bg-foreground text-background">
              确认补录为下注
            </button>
            <button onClick={() => setPromoteOpen(false)}
              className="w-full py-2 text-xs text-muted-foreground">取消</button>
          </div>
        </div>
      )}

      <div className="px-4 py-4 space-y-5">
        <div className="border-b border-border pb-4">
          <p className="text-base font-bold">{record.match}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{record.homeTeam} vs {record.awayTeam}</p>
          {finalScore && (
            <p className="text-sm font-mono text-foreground mt-1">
              <span className="text-muted-foreground">比分</span>
              <span className="mx-2 font-bold tabular-nums">{finalScore.home} : {finalScore.away}</span>
            </p>
          )}
          <div className="mt-2 rounded-md bg-muted px-3 py-2 inline-block">
            <p className="text-sm font-bold font-mono">{heroPreview}</p>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Chip label="评分" value={`${record.totalScore}/10`} />
            <Chip label="开赛" value={fmtDateTime(record.kickoffTime)} />
          </div>
          {record.abandonReason && (
            <div className="mt-3 border-l-2 border-l-warning pl-3 py-1.5">
              <p className="text-[9px] font-black text-warning uppercase tracking-widest">观察原因</p>
              <p className="text-xs text-foreground/80 mt-0.5">{record.abandonReason}</p>
            </div>
          )}

          {!alreadyPromoted && (
            <button onClick={() => setPromoteOpen(true)}
              className="mt-3 w-full py-2.5 rounded text-sm font-semibold border border-border bg-card text-foreground active:opacity-70">
              ↑ 补录为下注记录
            </button>
          )}
          {alreadyPromoted && (
            <p className="mt-3 text-[11px] text-muted-foreground">↑ 已补录为下注记录</p>
          )}
        </div>

        {hasDeduction && (
          <div className="border border-border rounded-md overflow-hidden">
            <button onClick={() => setDeductionExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-card">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">盘口推演</p>
              {deductionExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {deductionExpanded && (
              <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
                <SidedHandicapView label="合理让球区间" data={record.deduction.fairRanges} homeTeam={record.homeTeam} awayTeam={record.awayTeam} />
                <SidedHandicapView label="主队胜 · 庄家应开盘口" data={record.deduction.homeWinBookieExpected} homeTeam={record.homeTeam} awayTeam={record.awayTeam} />
                <SidedHandicapView label="客队胜 · 庄家应开盘口" data={record.deduction.awayWinBookieExpected} homeTeam={record.homeTeam} awayTeam={record.awayTeam} />
                {record.deduction.confidence > 0 && (
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground">推演信心度</p>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map((n) => (
                        <Star key={n} size={12} strokeWidth={1.5}
                          className={n <= record.deduction.confidence ? "fill-[#f5c842] text-[#f5c842]" : "text-muted-foreground/30"} />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{record.deduction.confidence}/5</span>
                  </div>
                )}
                {record.deduction.suspectedTrap && (
                  <p className="text-[10px] text-warning font-medium">⚠ 记录了诱盘可能</p>
                )}
                {record.deduction.personalAnalysis && (
                  <div className="rounded-md bg-muted/40 px-3 py-2">
                    <p className="text-[10px] font-bold text-foreground mb-1">个人分析</p>
                    <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">{record.deduction.personalAnalysis}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="border border-border rounded-md overflow-hidden">
          <button onClick={() => setScoresExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">纪律评分回顾</p>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold font-mono text-muted-foreground">{record.totalScore}/10</span>
              {scoresExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </div>
          </button>
          {scoresExpanded && (
            <div className="divide-y divide-border border-t border-border">
              {(Object.entries(record.scores) as [keyof ScoreData, typeof record.scores.fundamental][]).map(([key, item]) => {
                const subdims = SUBDIMS[key] ?? [];
                return (
                  <div key={key} className={`px-4 py-3 border-l-2 ${
                    item.score === 2 ? "border-l-profit" : item.score === 1 ? "border-l-warning" : "border-l-loss bg-loss/5"
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold">{SCORE_LABELS[key]}</p>
                      <span className={`text-xs font-bold font-mono ${
                        item.score === 2 ? "text-profit" : item.score === 1 ? "text-warning" : "text-loss"
                      }`}>{item.score}/2</span>
                    </div>
                    {item.subdims && Object.keys(item.subdims).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {subdims.map((sd) => {
                          const c = item.subdims[sd.key];
                          if (!c) return null;
                          const label = c === "A" ? sd.optionA : c === "B" ? sd.optionB : sd.optionC;
                          return (
                            <span key={sd.key} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {sd.label}·{label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {item.note && <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{item.note}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Final score input */}
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-[11px] font-bold text-foreground mb-2">最终比分</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-14 truncate">{record.homeTeam}</span>
            <input
              type="number" min={0} inputMode="numeric"
              value={scoreHome}
              onChange={(e) => setScoreHome(e.target.value)}
              className="w-12 bg-muted rounded px-2 py-1.5 text-sm font-mono tabular-nums text-center outline-none"
            />
            <span className="text-muted-foreground font-bold">:</span>
            <input
              type="number" min={0} inputMode="numeric"
              value={scoreAway}
              onChange={(e) => setScoreAway(e.target.value)}
              className="w-12 bg-muted rounded px-2 py-1.5 text-sm font-mono tabular-nums text-center outline-none"
            />
            <span className="text-[10px] text-muted-foreground w-14 truncate">{record.awayTeam}</span>
            <span className="text-[10px] text-muted-foreground/50 ml-auto">可选</span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">观察期赛果</p>
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
              >{label}</button>
            ))}
          </div>
        </div>

        {record.deduction.personalAnalysis && (
          <div className="rounded-md border border-border bg-card p-3">
            <p className="text-[10px] font-bold text-foreground mb-1.5">个人分析回看</p>
            <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap mb-2">{record.deduction.personalAnalysis}</p>
            <p className="text-[10px] text-muted-foreground mb-1.5">事后印证</p>
            <div className="grid grid-cols-3 gap-1.5">
              {VERDICT_OPTIONS.map(({ key, label, cls }) => (
                <button key={key} onClick={() => setAnalysisVerdict(analysisVerdict === key ? null : key)}
                  className={`py-2 rounded text-[11px] font-bold ${
                    analysisVerdict === key ? cls : "bg-muted text-muted-foreground"
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
        )}

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
            onClick={() => {
              if (!conclusion || !record) return;
              const parsedHome = scoreHome === "" ? undefined : parseInt(scoreHome, 10);
              const parsedAway = scoreAway === "" ? undefined : parseInt(scoreAway, 10);
              const finalScore = (parsedHome !== undefined && !isNaN(parsedHome) &&
                                  parsedAway !== undefined && !isNaN(parsedAway))
                ? { home: parsedHome, away: parsedAway }
                : undefined;
              const updated: AbandonedRecord = {
                ...record,
                actualResult: (actualResult || undefined) as AbandonedRecord["actualResult"],
                reviewConclusion: conclusion,
                reviewNote,
                analysisVerdict: analysisVerdict ?? undefined,
                finalScore,
                completionStatus: "complete",
              };
              saveAbandonedRecord(updated);
              setRecord(updated);
              showToast("回看结论已保存", "success");
            }}
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

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-muted rounded px-2.5 py-1">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  );
}

function SidedHandicapView({
  label, data, homeTeam, awayTeam,
}: {
  label: string;
  data: SidedHandicap;
  homeTeam: string;
  awayTeam: string;
}) {
  const text = formatSidedHandicap(data, homeTeam, awayTeam);
  if (!text) return null;
  return (
    <div className="flex items-baseline gap-2">
      <p className="text-[10px] text-muted-foreground shrink-0">{label}</p>
      <p className="text-[12px] font-mono font-semibold text-foreground flex-1">{text}</p>
    </div>
  );
}
