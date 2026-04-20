"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, Trash2, Sparkles, Star, Pencil, X } from "lucide-react";
import {
  matchDayKey,
  normalizeKickoff,
  formatSidedHandicap,
  emptyDeduction,
  type HandicapValue,
  type SidedHandicap,
  type HandicapDeduction,
  type BettingDirection,
} from "@/lib/types";
import {
  getScreeningPool,
  saveScreeningItem,
  deleteScreeningItem,
  clearScreeningPool,
  isScreeningStale,
  suggestBucketFromDeduction,
  type ScreeningItem,
} from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

const HANDICAP_LOW: HandicapValue[] = ["0", "0.25", "0.5", "0.75", "1", "1.25", "1.5"];
const HANDICAP_HIGH: HandicapValue[] = ["1.75", "2", "2.25", "2.5", "2.75", "3"];

const CONFIDENCE_LABELS: Record<number, string> = {
  1: "几乎没把握", 2: "不太有把握", 3: "基本有把握", 4: "比较有信心", 5: "极有信心",
};

function bucketStyle(b: "dig" | "gray" | "pass") {
  switch (b) {
    case "dig":  return { cls: "text-profit", bg: "bg-profit/10 border-profit/30", label: "深挖", emoji: "🟢" };
    case "gray": return { cls: "text-warning", bg: "bg-warning/10 border-warning/30", label: "灰色", emoji: "🟡" };
    case "pass": return { cls: "text-loss", bg: "bg-loss/10 border-loss/30", label: "放弃", emoji: "🔴" };
  }
}

// ─── Sided handicap picker (与 review 页保持同口径) ────────────────────────────
function SidedHandicapPicker({
  data, onChange, homeTeam, awayTeam,
}: {
  data: SidedHandicap;
  onChange: (next: SidedHandicap) => void;
  homeTeam: string;
  awayTeam: string;
}) {
  const hasHighSelected = data.values.some((v) => HANDICAP_HIGH.includes(v));
  const [showHigh, setShowHigh] = useState(hasHighSelected);
  useEffect(() => { if (hasHighSelected) setShowHigh(true); }, [hasHighSelected]);

  const toggleValue = (v: HandicapValue) => {
    const sel = data.values.includes(v);
    onChange({ ...data, values: sel ? data.values.filter((x) => x !== v) : [...data.values, v] });
  };

  const preview = formatSidedHandicap(data, homeTeam, awayTeam);
  const hasSide = !!data.side;
  const hasValues = data.values.length > 0;

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        {(["home", "away"] as const).map((s) => (
          <button key={s}
            onClick={() => onChange({ ...data, side: s })}
            className={`py-1.5 px-2 rounded text-[11px] font-semibold min-w-0 flex flex-col items-center leading-tight ${
              data.side === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
            }`}
          >
            <span className="opacity-70 text-[10px]">{s === "home" ? "主让" : "客让"}</span>
            <span className="truncate max-w-full">{s === "home" ? (homeTeam || "主队") : (awayTeam || "客队")}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {HANDICAP_LOW.map((v) => {
          const sel = data.values.includes(v);
          return (
            <button key={v} onClick={() => toggleValue(v)}
              className={`px-2.5 py-1 rounded text-[11px] font-mono ${
                sel ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
              }`}
            >{v}</button>
          );
        })}
        <button onClick={() => setShowHigh((v) => !v)}
          className="px-2.5 py-1 rounded text-[10px] bg-muted text-muted-foreground flex items-center gap-1">
          <span className={`transition-transform ${showHigh ? "rotate-180" : ""}`}>▾</span>高
        </button>
      </div>
      {showHigh && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {HANDICAP_HIGH.map((v) => {
            const sel = data.values.includes(v);
            return (
              <button key={v} onClick={() => toggleValue(v)}
                className={`px-2.5 py-1 rounded text-[11px] font-mono ${
                  sel ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                }`}
              >{v}</button>
            );
          })}
        </div>
      )}
      {preview ? (
        <div className="mt-2 rounded bg-foreground/5 border border-foreground/10 px-2.5 py-1.5">
          <p className="text-[11px] font-mono text-foreground/90">{preview}</p>
        </div>
      ) : (hasSide || hasValues) ? (
        <p className="mt-2 text-[10px] text-muted-foreground/60">
          {hasSide ? "· 还需选择让球数值" : "· 还需选择让球方"}
        </p>
      ) : null}
    </>
  );
}

export default function ScreeningPage() {
  const router = useRouter();
  const { show, node } = useToast();

  // ─── Form state ─────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [matchName, setMatchName] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [note, setNote] = useState("");

  const [handicapSide, setHandicapSide] = useState<"home" | "away" | "">("");
  const [handicapValue, setHandicapValue] = useState<HandicapValue | "">("");
  const [bettingDirection, setBettingDirection] = useState<BettingDirection | "">("");

  const [deduction, setDeduction] = useState<HandicapDeduction>(emptyDeduction());

  const [showLineMove, setShowLineMove] = useState(false);
  const [openHandicap, setOpenHandicap] = useState("");
  const [openOdds, setOpenOdds] = useState("");
  const [closeHandicap, setCloseHandicap] = useState("");
  const [closeOdds, setCloseOdds] = useState("");

  const [bucket, setBucket] = useState<"dig" | "gray" | "pass" | "">("");

  // 推荐 bucket
  const suggested = useMemo(() => suggestBucketFromDeduction(deduction), [deduction]);

  // ─── Pool ───────────────────────────────────────────
  const [pool, setPool] = useState<ScreeningItem[]>([]);
  const [passExpanded, setPassExpanded] = useState(false);

  useEffect(() => { setPool(getScreeningPool()); }, []);

  const todayKey = matchDayKey(new Date());
  const now = useMemo(() => new Date(), []);
  const today = useMemo(
    () => pool.filter((p) => p.matchDayKey === todayKey && !isScreeningStale(p, now)),
    [pool, todayKey, now]
  );
  const earlier = useMemo(
    () => pool.filter((p) => p.matchDayKey !== todayKey || isScreeningStale(p, now)),
    [pool, todayKey, now]
  );
  const todayGroups = useMemo(() => ({
    dig: today.filter((x) => x.bucket === "dig"),
    gray: today.filter((x) => x.bucket === "gray"),
    pass: today.filter((x) => x.bucket === "pass"),
  }), [today]);

  const resetForm = () => {
    setEditingId(null);
    setMatchName(""); setHomeTeam(""); setAwayTeam(""); setKickoff(""); setNote("");
    setHandicapSide(""); setHandicapValue(""); setBettingDirection("");
    setDeduction(emptyDeduction());
    setShowLineMove(false);
    setOpenHandicap(""); setOpenOdds(""); setCloseHandicap(""); setCloseOdds("");
    setBucket("");
  };

  const loadForEdit = (item: ScreeningItem) => {
    setEditingId(item.id);
    setMatchName(item.matchName ?? "");
    setHomeTeam(item.homeTeam ?? "");
    setAwayTeam(item.awayTeam ?? "");
    setKickoff(item.kickoffTime ? toDateTimeLocalValue(item.kickoffTime) : "");
    setNote(item.note ?? "");
    setHandicapSide(item.handicapSide ?? "");
    setHandicapValue((item.handicapValue as HandicapValue) ?? "");
    setBettingDirection(item.bettingDirection ?? "");
    setDeduction(item.deduction ?? emptyDeduction());
    const hasLM = !!(item.openHandicap || item.openOdds || item.closeHandicap || item.closeOdds);
    setShowLineMove(hasLM);
    setOpenHandicap(item.openHandicap ?? "");
    setOpenOdds(item.openOdds != null ? String(item.openOdds) : "");
    setCloseHandicap(item.closeHandicap ?? "");
    setCloseOdds(item.closeOdds != null ? String(item.closeOdds) : "");
    setBucket(item.bucket);
    // 滚动到顶部方便编辑
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const canSave = bucket !== "";

  const handleSave = () => {
    if (!canSave) return;
    const id = editingId ?? `sc-${Date.now()}`;
    const existing = editingId ? pool.find((x) => x.id === editingId) : undefined;
    const item: ScreeningItem = {
      id,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      matchDayKey: kickoff
        ? matchDayKey(normalizeKickoff(kickoff))
        : (existing?.matchDayKey ?? matchDayKey(new Date())),
      matchName: matchName || undefined,
      homeTeam: homeTeam || undefined,
      awayTeam: awayTeam || undefined,
      kickoffTime: kickoff ? normalizeKickoff(kickoff) : undefined,
      handicapSide: handicapSide || undefined,
      handicapValue: (handicapValue || undefined) as HandicapValue | undefined,
      bettingDirection: bettingDirection || undefined,
      deduction,
      openHandicap: openHandicap || undefined,
      openOdds: openOdds && !isNaN(parseFloat(openOdds)) ? parseFloat(openOdds) : undefined,
      closeHandicap: closeHandicap || undefined,
      closeOdds: closeOdds && !isNaN(parseFloat(closeOdds)) ? parseFloat(closeOdds) : undefined,
      bucket: bucket as "dig" | "gray" | "pass",
      note: note || undefined,
      promotedToBetId: existing?.promotedToBetId,
    };
    saveScreeningItem(item);
    setPool(getScreeningPool());
    const wasEditing = !!editingId;
    resetForm();
    const btext = item.bucket === "dig" ? "🟢 深挖" : item.bucket === "gray" ? "🟡 灰色" : "🔴 放弃";
    show(wasEditing ? `已更新：${btext}` : `已入候选池：${btext}`, "success");
  };

  const handleDelete = (id: string) => {
    deleteScreeningItem(id);
    setPool(getScreeningPool());
    if (editingId === id) resetForm();
  };

  const handleDig = (item: ScreeningItem) => {
    router.push(`/review?screening=${item.id}`);
  };

  const handleClearAll = () => {
    if (!confirm("确定清空所有候选池记录？")) return;
    clearScreeningPool();
    setPool([]);
    resetForm();
    show("候选池已清空", "success");
  };

  return (
    <div className="min-h-screen pb-28">
      {node}

      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-1 text-muted-foreground">
            <ArrowLeft size={15} />
            <span className="text-sm">返回</span>
          </Link>
          <span className="font-semibold text-sm">{editingId ? "编辑扫盘" : "今日扫盘"}</span>
          <button onClick={handleClearAll} className="text-[11px] text-muted-foreground">清空</button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* ── 扫盘表单（盘口推演） ─────────────────────────── */}
        <section className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <Sparkles size={13} className="text-profit" />
              <p className="text-xs font-bold">{editingId ? "编辑扫盘" : "新增扫盘"}</p>
            </div>
            {editingId && (
              <button onClick={resetForm} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <X size={11} /> 取消编辑
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground/70 -mt-1">
            快筛时做盘口推演；深挖时这部分自动复刻到复盘页。
          </p>

          {/* 比赛信息 */}
          <div className="grid grid-cols-2 gap-2">
            <input value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)}
              placeholder="主队（选填）" className="bg-muted rounded px-2 py-2 text-xs outline-none" />
            <input value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)}
              placeholder="客队（选填）" className="bg-muted rounded px-2 py-2 text-xs outline-none" />
          </div>
          <input value={matchName} onChange={(e) => setMatchName(e.target.value)}
            placeholder="比赛名（选填，如 英超 周六 22:00）"
            className="w-full bg-muted rounded px-2 py-2 text-xs outline-none" />
          <input type="datetime-local" value={kickoff} onChange={(e) => setKickoff(e.target.value)}
            className="w-full bg-muted rounded px-2 py-2 text-xs outline-none" />

          {/* 实际盘口 */}
          <div>
            <p className="text-[11px] font-semibold text-foreground/90 mb-1.5">实际盘口</p>
            <div className="grid grid-cols-2 gap-1.5 mb-1.5">
              {(["home", "away"] as const).map((s) => (
                <button key={s} onClick={() => setHandicapSide(s)}
                  className={`py-1.5 px-2 rounded text-[11px] font-semibold min-w-0 flex flex-col items-center leading-tight ${
                    handicapSide === s ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <span className="opacity-70 text-[10px]">{s === "home" ? "主让" : "客让"}</span>
                  <span className="truncate max-w-full">{s === "home" ? (homeTeam || "主队") : (awayTeam || "客队")}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[...HANDICAP_LOW, ...HANDICAP_HIGH].map((v) => (
                <button key={v} onClick={() => setHandicapValue(v)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono ${
                    handicapValue === v ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >{v}</button>
              ))}
            </div>
          </div>

          {/* 下注方向 */}
          <div>
            <p className="text-[11px] font-semibold text-foreground/90 mb-1.5">打算押</p>
            <div className="grid grid-cols-2 gap-1.5">
              {(["home", "away"] as const).map((d) => (
                <button key={d} onClick={() => setBettingDirection(d)}
                  className={`py-1.5 px-2 rounded text-[11px] font-semibold truncate ${
                    bettingDirection === d ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
                  }`}
                >{d === "home" ? (homeTeam || "主队") + " 胜" : (awayTeam || "客队") + " 胜"}</button>
              ))}
            </div>
          </div>

          {/* 盘口推演 */}
          <div className="rounded border border-border bg-card/40 p-3 space-y-3">
            <p className="text-[11px] font-bold text-foreground/90">盘口推演</p>

            <div>
              <p className="text-[10px] text-muted-foreground mb-1">合理区间</p>
              <SidedHandicapPicker
                data={deduction.fairRanges}
                onChange={(next) => setDeduction((p) => ({ ...p, fairRanges: next }))}
                homeTeam={homeTeam} awayTeam={awayTeam}
              />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">主胜庄家应开</p>
              <SidedHandicapPicker
                data={deduction.homeWinBookieExpected}
                onChange={(next) => setDeduction((p) => ({ ...p, homeWinBookieExpected: next }))}
                homeTeam={homeTeam} awayTeam={awayTeam}
              />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">客胜庄家应开</p>
              <SidedHandicapPicker
                data={deduction.awayWinBookieExpected}
                onChange={(next) => setDeduction((p) => ({ ...p, awayWinBookieExpected: next }))}
                homeTeam={homeTeam} awayTeam={awayTeam}
              />
            </div>

            {/* 信心度 */}
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">信心度</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => {
                  const active = deduction.confidence >= n;
                  return (
                    <button key={n}
                      onClick={() => setDeduction((p) => ({ ...p, confidence: (p.confidence === n ? 0 : n) as HandicapDeduction["confidence"] }))}
                      className={active ? "text-warning" : "text-muted-foreground/40"}
                    >
                      <Star size={16} fill={active ? "currentColor" : "none"} />
                    </button>
                  );
                })}
                <span className="text-[10px] text-muted-foreground ml-2">
                  {deduction.confidence === 0 ? "未评" : CONFIDENCE_LABELS[deduction.confidence]}
                </span>
              </div>
            </div>

            {/* 疑似陷阱 */}
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">疑似陷阱</p>
              <button onClick={() => setDeduction((p) => ({ ...p, suspectedTrap: !p.suspectedTrap }))}
                className={`px-2 py-1 rounded text-[10px] font-semibold ${
                  deduction.suspectedTrap ? "bg-warning text-white" : "bg-muted text-muted-foreground"
                }`}
              >{deduction.suspectedTrap ? "⚠ 已标记" : "未标记"}</button>
            </div>

            <div>
              <p className="text-[10px] text-muted-foreground mb-1">个人分析（选填）</p>
              <textarea rows={2} value={deduction.personalAnalysis}
                onChange={(e) => setDeduction((p) => ({ ...p, personalAnalysis: e.target.value }))}
                placeholder="一句话说说你的判断"
                className="w-full bg-muted rounded px-2 py-2 text-xs outline-none resize-none"
              />
            </div>
          </div>

          {/* 变盘（折叠） */}
          <div className="rounded border border-border bg-card/40">
            <button onClick={() => setShowLineMove((v) => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-[11px]">
              <span className="font-semibold">变盘（选填）</span>
              <span>{showLineMove ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
            </button>
            {showLineMove && (
              <div className="px-3 pb-3 grid grid-cols-2 gap-2">
                <input value={openHandicap} onChange={(e) => setOpenHandicap(e.target.value)}
                  placeholder="初盘让球" className="bg-muted rounded px-2 py-1.5 text-xs outline-none" />
                <input value={openOdds} onChange={(e) => setOpenOdds(e.target.value)}
                  placeholder="初盘水位" className="bg-muted rounded px-2 py-1.5 text-xs outline-none" />
                <input value={closeHandicap} onChange={(e) => setCloseHandicap(e.target.value)}
                  placeholder="终盘让球" className="bg-muted rounded px-2 py-1.5 text-xs outline-none" />
                <input value={closeOdds} onChange={(e) => setCloseOdds(e.target.value)}
                  placeholder="终盘水位" className="bg-muted rounded px-2 py-1.5 text-xs outline-none" />
              </div>
            )}
          </div>

          {/* Bucket 手选 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] font-semibold text-foreground/90">入池分档</p>
              {bucket === "" && (
                <button onClick={() => setBucket(suggested)}
                  className="text-[10px] text-muted-foreground underline underline-offset-2">
                  用推荐：{bucketStyle(suggested).emoji} {bucketStyle(suggested).label}
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["dig", "gray", "pass"] as const).map((b) => {
                const s = bucketStyle(b);
                const active = bucket === b;
                const activeCls = b === "dig"
                  ? "bg-profit text-white border-profit"
                  : b === "gray" ? "bg-warning text-white border-warning"
                  : "bg-loss text-white border-loss";
                const idleCls = b === "dig"
                  ? "border-profit/30 text-profit"
                  : b === "gray" ? "border-warning/30 text-warning"
                  : "border-loss/30 text-loss";
                return (
                  <button key={b} onClick={() => setBucket(b)}
                    className={`py-2 rounded border text-[11px] font-semibold ${active ? activeCls : `bg-card/60 ${idleCls}`}`}
                  >{s.emoji} {s.label}</button>
                );
              })}
            </div>
          </div>

          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="一句话备注（选填）"
            className="w-full bg-muted rounded px-2 py-2 text-xs outline-none resize-none" />

          <button onClick={handleSave} disabled={!canSave}
            className={`w-full py-2.5 rounded text-sm font-bold ${canSave ? "bg-foreground text-background" : "bg-muted text-muted-foreground/50"}`}
          >{editingId ? "保存修改" : "入候选池"}</button>
        </section>

        {/* ── 今日候选池 ─────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              今日候选池（{today.length}）
            </p>
            {today.length === 0 && (
              <span className="text-[10px] text-muted-foreground/60">暂无记录</span>
            )}
          </div>

          {todayGroups.dig.length > 0 && (
            <BucketBlock bucket="dig" items={todayGroups.dig}
              onDig={handleDig} onDelete={handleDelete} onEdit={loadForEdit} editingId={editingId} />
          )}
          {todayGroups.gray.length > 0 && (
            <BucketBlock bucket="gray" items={todayGroups.gray}
              onDig={handleDig} onDelete={handleDelete} onEdit={loadForEdit} editingId={editingId} />
          )}
          {todayGroups.pass.length > 0 && (
            <div className="rounded-lg border border-loss/20 bg-loss/5">
              <button onClick={() => setPassExpanded((v) => !v)}
                className="w-full px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[11px]">
                  <span>🔴</span>
                  <span className="font-semibold text-loss">今日 pass {todayGroups.pass.length} 场</span>
                </div>
                {passExpanded ? <ChevronDown size={13} className="text-loss" /> : <ChevronRight size={13} className="text-loss" />}
              </button>
              {passExpanded && (
                <div className="px-2 pb-2 space-y-1.5">
                  {todayGroups.pass.map((x) => (
                    <ScreeningRow key={x.id} item={x}
                      onDig={handleDig} onDelete={handleDelete} onEdit={loadForEdit}
                      editingId={editingId} compact />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {earlier.length > 0 && (
          <section>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              历史候选（{earlier.length}）
            </p>
            <div className="space-y-1.5">
              {earlier.slice(0, 30).map((x) => (
                <ScreeningRow key={x.id} item={x}
                  onDig={handleDig} onDelete={handleDelete} onEdit={loadForEdit}
                  editingId={editingId} compact />
              ))}
            </div>
          </section>
        )}
      </div>

      <BottomNav />
    </div>
  );
}

function BucketBlock({
  bucket, items, onDig, onDelete, onEdit, editingId,
}: {
  bucket: "dig" | "gray" | "pass";
  items: ScreeningItem[];
  onDig: (item: ScreeningItem) => void;
  onDelete: (id: string) => void;
  onEdit: (item: ScreeningItem) => void;
  editingId: string | null;
}) {
  const s = bucketStyle(bucket);
  return (
    <div className={`rounded-lg border px-2 py-2 space-y-1.5 ${s.bg}`}>
      <p className={`text-[11px] font-bold px-1 ${s.cls}`}>{s.emoji} {s.label}（{items.length}）</p>
      {items.map((x) => (
        <ScreeningRow key={x.id} item={x}
          onDig={onDig} onDelete={onDelete} onEdit={onEdit} editingId={editingId} />
      ))}
    </div>
  );
}

function ScreeningRow({
  item, onDig, onDelete, onEdit, editingId, compact,
}: {
  item: ScreeningItem;
  onDig: (item: ScreeningItem) => void;
  onDelete: (id: string) => void;
  onEdit: (item: ScreeningItem) => void;
  editingId: string | null;
  compact?: boolean;
}) {
  const title = item.matchName || [item.homeTeam, item.awayTeam].filter(Boolean).join(" vs ") || "未命名比赛";
  const kick = item.kickoffTime
    ? new Date(item.kickoffTime).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" })
    : null;
  const stale = isScreeningStale(item);
  const isEditing = editingId === item.id;
  const conf = item.deduction?.confidence ?? 0;
  const trap = item.deduction?.suspectedTrap;
  const hasNew = !!item.deduction;
  return (
    <div className={`flex items-center gap-2 bg-card/80 rounded px-2 py-2 ${stale ? "opacity-60" : ""} ${isEditing ? "ring-1 ring-foreground/30" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold truncate">{title}</p>
          {isEditing && (
            <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-foreground text-background font-semibold">编辑中</span>
          )}
          {stale && !isEditing && (
            <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-semibold">已过期</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] font-mono text-muted-foreground/80">
          {hasNew ? (
            <>
              <span className="text-warning/80">信心{conf === 0 ? "—" : conf}</span>
              {trap && <><span>·</span><span className="text-loss/80">疑陷阱</span></>}
              {item.deduction?.fairRanges && item.deduction.fairRanges.values.length > 0 && (
                <><span>·</span><span className="truncate">合理 {item.deduction.fairRanges.values.join("/")}</span></>
              )}
            </>
          ) : (
            <>
              {item.reliability && <span className="text-profit/80">可靠{item.reliability}</span>}
              {item.trap && <><span>·</span><span className="text-warning/80">陷阱{item.trap}</span></>}
              {item.bookie && <><span>·</span><span className="text-[#b8a0e8]/90">庄{item.bookie}</span></>}
            </>
          )}
          {kick && <><span>·</span><span>{kick}</span></>}
        </div>
        {!compact && item.note && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{item.note}</p>
        )}
        {item.promotedToBetId && (
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">已深挖完复盘</p>
        )}
      </div>
      {!item.promotedToBetId && (
        <button onClick={() => onEdit(item)}
          className="shrink-0 p-1.5 text-muted-foreground/80"
          aria-label="编辑"
        ><Pencil size={12} /></button>
      )}
      {!item.promotedToBetId && item.bucket !== "pass" && (
        <button onClick={() => onDig(item)}
          className="shrink-0 px-2 py-1 rounded bg-foreground text-background text-[10px] font-semibold"
        >深挖</button>
      )}
      <button onClick={() => onDelete(item.id)}
        className="shrink-0 p-1 text-muted-foreground/60" aria-label="删除"
      ><Trash2 size={12} /></button>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────
function toDateTimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
