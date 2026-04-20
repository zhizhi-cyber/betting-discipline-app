"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, Trash2, Sparkles } from "lucide-react";
import { matchDayKey, matchDayStart, normalizeKickoff } from "@/lib/types";
import {
  getScreeningPool,
  saveScreeningItem,
  deleteScreeningItem,
  clearScreeningPool,
  screeningBucket,
  isScreeningStale,
  type ScreeningItem,
} from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

type Ans = "A" | "B" | "C";

const Q_LABELS: Record<string, string> = {
  reliability: "可靠吗",
  trap: "有陷阱吗",
  bookie: "庄家立场明吗",
};

// A/B/C 语义（统一到 A=好 / B=最差 / C=中性可疑），与 types.ts SUBDIM_QUALITY 保持一致
const ANSWER_LABELS: Record<string, Record<Ans, string>> = {
  reliability: { A: "清楚", B: "不清楚", C: "部分" },
  trap: { A: "无", B: "有", C: "可疑" },
  bookie: { A: "没疑虑", B: "有疑虑", C: "暧昧" },
};

function bucketStyle(b: "dig" | "gray" | "pass") {
  switch (b) {
    case "dig":  return { cls: "text-profit", bg: "bg-profit/10 border-profit/30", label: "深挖", emoji: "🟢" };
    case "gray": return { cls: "text-warning", bg: "bg-warning/10 border-warning/30", label: "灰色", emoji: "🟡" };
    case "pass": return { cls: "text-loss", bg: "bg-loss/10 border-loss/30", label: "放弃", emoji: "🔴" };
  }
}

export default function ScreeningPage() {
  const router = useRouter();
  const { show, node } = useToast();

  // ─── 三问表单 ──────────────────────────────────────────
  const [matchName, setMatchName] = useState("");
  const [homeTeam, setHomeTeam] = useState("");
  const [awayTeam, setAwayTeam] = useState("");
  const [kickoff, setKickoff] = useState("");
  const [r, setR] = useState<Ans | null>(null);
  const [t, setT] = useState<Ans | null>(null);
  const [b, setB] = useState<Ans | null>(null);
  const [note, setNote] = useState("");

  // ─── 候选池 ─────────────────────────────────────────────
  const [pool, setPool] = useState<ScreeningItem[]>([]);
  const [passExpanded, setPassExpanded] = useState(false);

  useEffect(() => {
    setPool(getScreeningPool());
  }, []);

  const todayKey = matchDayKey(new Date());
  const now = useMemo(() => new Date(), []);
  // 过期条件：>24h 未深挖 & 非 pass。过期的从"今日"挪到"历史（已过期）"。
  const today = useMemo(
    () => pool.filter((p) => p.matchDayKey === todayKey && !isScreeningStale(p, now)),
    [pool, todayKey, now]
  );
  const earlier = useMemo(
    () => pool.filter((p) => p.matchDayKey !== todayKey || isScreeningStale(p, now)),
    [pool, todayKey, now]
  );

  const todayGroups = useMemo(() => {
    return {
      dig: today.filter((x) => x.bucket === "dig"),
      gray: today.filter((x) => x.bucket === "gray"),
      pass: today.filter((x) => x.bucket === "pass"),
    };
  }, [today]);

  const canSave = r !== null && t !== null && b !== null;

  const resetForm = () => {
    setMatchName(""); setHomeTeam(""); setAwayTeam(""); setKickoff("");
    setR(null); setT(null); setB(null); setNote("");
  };

  const handleSave = () => {
    if (!canSave) return;
    const bucket = screeningBucket(r, t, b);
    const item: ScreeningItem = {
      id: `sc-${Date.now()}`,
      createdAt: new Date().toISOString(),
      matchDayKey: kickoff ? matchDayKey(normalizeKickoff(kickoff)) : matchDayKey(new Date()),
      matchName: matchName || undefined,
      homeTeam: homeTeam || undefined,
      awayTeam: awayTeam || undefined,
      kickoffTime: kickoff ? normalizeKickoff(kickoff) : undefined,
      reliability: r, trap: t, bookie: b, bucket,
      note: note || undefined,
    };
    saveScreeningItem(item);
    setPool(getScreeningPool());
    resetForm();
    const btext = bucket === "dig" ? "🟢 深挖" : bucket === "gray" ? "🟡 灰色" : "🔴 放弃";
    show(`已入候选池：${btext}`, "success");
  };

  const handleDelete = (id: string) => {
    deleteScreeningItem(id);
    setPool(getScreeningPool());
  };

  const handleDig = (item: ScreeningItem) => {
    // 带着 screening id 跳到复盘页，复盘页会读取并预填 3 个子维度
    router.push(`/review?screening=${item.id}`);
  };

  const handleClearAll = () => {
    if (!confirm("确定清空所有候选池记录？")) return;
    clearScreeningPool();
    setPool([]);
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
          <span className="font-semibold text-sm">今日扫盘</span>
          <button onClick={handleClearAll} className="text-[11px] text-muted-foreground">清空</button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* ── 三问表单 ────────────────────────────────── */}
        <section className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={13} className="text-profit" />
            <p className="text-xs font-bold">三问分档</p>
          </div>
          <p className="text-[10px] text-muted-foreground/70 -mt-1">
            快筛一场比赛，全 A = 深挖 / 有 B = 放弃 / 其它 = 灰色待观察
          </p>

          {/* 比赛信息（可选） */}
          <div className="grid grid-cols-2 gap-2">
            <input
              value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)}
              placeholder="主队（选填）"
              className="bg-muted rounded px-2 py-2 text-xs outline-none"
            />
            <input
              value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)}
              placeholder="客队（选填）"
              className="bg-muted rounded px-2 py-2 text-xs outline-none"
            />
          </div>
          <input
            value={matchName} onChange={(e) => setMatchName(e.target.value)}
            placeholder="比赛名（选填，如 英超 周六 22:00）"
            className="w-full bg-muted rounded px-2 py-2 text-xs outline-none"
          />
          <input
            type="datetime-local"
            value={kickoff} onChange={(e) => setKickoff(e.target.value)}
            className="w-full bg-muted rounded px-2 py-2 text-xs outline-none"
          />

          {/* 三问 */}
          {(["reliability", "trap", "bookie"] as const).map((k) => {
            const cur = k === "reliability" ? r : k === "trap" ? t : b;
            const setFn = k === "reliability" ? setR : k === "trap" ? setT : setB;
            return (
              <div key={k}>
                <p className="text-[11px] font-semibold text-foreground/90 mb-1.5">{Q_LABELS[k]}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["A", "B", "C"] as Ans[]).map((opt) => {
                    const active = cur === opt;
                    const colorCls = opt === "A"
                      ? (active ? "bg-profit text-white border-profit" : "border-profit/30 text-profit")
                      : opt === "B"
                      ? (active ? "bg-loss text-white border-loss" : "border-loss/30 text-loss")
                      : (active ? "bg-warning text-white border-warning" : "border-warning/30 text-warning");
                    return (
                      <button
                        key={opt}
                        onClick={() => setFn(opt)}
                        className={`py-2 rounded border text-[11px] font-semibold transition-colors ${colorCls} ${active ? "" : "bg-card/60"}`}
                      >
                        {opt} · {ANSWER_LABELS[k][opt]}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="一句话备注（选填）"
            className="w-full bg-muted rounded px-2 py-2 text-xs outline-none resize-none"
          />

          <button
            onClick={handleSave}
            disabled={!canSave}
            className={`w-full py-2.5 rounded text-sm font-bold ${canSave ? "bg-foreground text-background" : "bg-muted text-muted-foreground/50"}`}
          >
            入候选池
          </button>
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

          {/* 深挖 */}
          {todayGroups.dig.length > 0 && (
            <BucketBlock bucket="dig" items={todayGroups.dig} onDig={handleDig} onDelete={handleDelete} />
          )}

          {/* 灰色 */}
          {todayGroups.gray.length > 0 && (
            <BucketBlock bucket="gray" items={todayGroups.gray} onDig={handleDig} onDelete={handleDelete} />
          )}

          {/* Pass — 折叠 */}
          {todayGroups.pass.length > 0 && (
            <div className="rounded-lg border border-loss/20 bg-loss/5">
              <button
                onClick={() => setPassExpanded((v) => !v)}
                className="w-full px-3 py-2 flex items-center justify-between"
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span>🔴</span>
                  <span className="font-semibold text-loss">今日 pass {todayGroups.pass.length} 场</span>
                </div>
                {passExpanded ? <ChevronDown size={13} className="text-loss" /> : <ChevronRight size={13} className="text-loss" />}
              </button>
              {passExpanded && (
                <div className="px-2 pb-2 space-y-1.5">
                  {todayGroups.pass.map((x) => (
                    <ScreeningRow key={x.id} item={x} onDig={handleDig} onDelete={handleDelete} compact />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 历史候选池（非今日） ─────────────────────── */}
        {earlier.length > 0 && (
          <section>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
              历史候选（{earlier.length}）
            </p>
            <div className="space-y-1.5">
              {earlier.slice(0, 30).map((x) => (
                <ScreeningRow key={x.id} item={x} onDig={handleDig} onDelete={handleDelete} compact />
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
  bucket, items, onDig, onDelete,
}: {
  bucket: "dig" | "gray" | "pass";
  items: ScreeningItem[];
  onDig: (item: ScreeningItem) => void;
  onDelete: (id: string) => void;
}) {
  const s = bucketStyle(bucket);
  return (
    <div className={`rounded-lg border px-2 py-2 space-y-1.5 ${s.bg}`}>
      <p className={`text-[11px] font-bold px-1 ${s.cls}`}>{s.emoji} {s.label}（{items.length}）</p>
      {items.map((x) => (
        <ScreeningRow key={x.id} item={x} onDig={onDig} onDelete={onDelete} />
      ))}
    </div>
  );
}

function ScreeningRow({
  item, onDig, onDelete, compact,
}: {
  item: ScreeningItem;
  onDig: (item: ScreeningItem) => void;
  onDelete: (id: string) => void;
  compact?: boolean;
}) {
  const title = item.matchName || [item.homeTeam, item.awayTeam].filter(Boolean).join(" vs ") || "未命名比赛";
  const kick = item.kickoffTime
    ? new Date(item.kickoffTime).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", month: "numeric", day: "numeric" })
    : null;
  const stale = isScreeningStale(item);
  return (
    <div className={`flex items-center gap-2 bg-card/80 rounded px-2 py-2 ${stale ? "opacity-60" : ""}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold truncate">{title}</p>
          {stale && (
            <span className="shrink-0 text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-semibold">已过期</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] font-mono text-muted-foreground/80">
          <span className="text-profit/80">可靠{item.reliability}</span>
          <span>·</span>
          <span className="text-warning/80">陷阱{item.trap}</span>
          <span>·</span>
          <span className="text-[#b8a0e8]/90">庄{item.bookie}</span>
          {kick && <><span>·</span><span>{kick}</span></>}
        </div>
        {!compact && item.note && (
          <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{item.note}</p>
        )}
        {item.promotedToBetId && (
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">已深挖完复盘</p>
        )}
      </div>
      {!item.promotedToBetId && item.bucket !== "pass" && (
        <button
          onClick={() => onDig(item)}
          className="shrink-0 px-2 py-1 rounded bg-foreground text-background text-[10px] font-semibold"
        >
          深挖
        </button>
      )}
      <button
        onClick={() => onDelete(item.id)}
        className="shrink-0 p-1 text-muted-foreground/60"
        aria-label="删除"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
