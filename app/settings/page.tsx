"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Upload, Trash2 } from "lucide-react";
import { DEFAULT_SETTINGS, getSettings, saveSettings, exportAllData, importAllData, resetAllData, type AppSettings } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const { show: showToast, node: toastNode } = useToast();

  useEffect(() => {
    setSettings(getSettings());
  }, []);

  const update = <K extends keyof AppSettings>(section: K) =>
    (field: keyof AppSettings[K], value: number | string) => {
      setSettings((prev: AppSettings) => ({
        ...prev,
        [section]: { ...prev[section], [field]: value },
      }));
    };

  const handleSave = () => {
    saveSettings(settings);
    showToast("设置已保存", "success");
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    try {
      const data = exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      a.href = url;
      a.download = `dayingjia-backup-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`已导出 ${data.bets.length} 条下注 + ${data.watches.length} 条观察`, "success");
    } catch {
      showToast("导出失败", "error");
    }
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const mode = confirm(
        "选择导入方式:\n\n确定 = 覆盖(清空现有数据后导入)\n取消 = 合并(按ID合并,导入的优先)"
      ) ? "replace" : "merge";
      const r = importAllData(payload, mode);
      showToast(`已导入 ${r.bets} 下注 + ${r.watches} 观察`, "success");
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      showToast((e as Error).message || "导入失败", "error");
    }
  };

  return (
    <div className="min-h-screen pb-28">
      {toastNode}

      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-1 text-muted-foreground">
            <ArrowLeft size={15} />
            <span className="text-sm">返回</span>
          </Link>
          <span className="font-semibold text-sm">设置</span>
          <button onClick={handleSave} className="text-xs font-bold text-profit">保存</button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-6">

        {/* ── Goals ────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>目标设置</SectionLabel>
          <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
            <SettingRow
              label="周度盈利目标"
              value={settings.goals.weeklyTarget}
              prefix="¥"
              onChange={(v) => update("goals")("weeklyTarget", v)}
            />
            <SettingRow
              label="月度盈利目标"
              value={settings.goals.monthlyTarget}
              prefix="¥"
              onChange={(v) => update("goals")("monthlyTarget", v)}
            />
            <SettingRow
              label="年度盈利目标"
              value={settings.goals.yearlyTarget}
              prefix="¥"
              onChange={(v) => update("goals")("yearlyTarget", v)}
            />
          </div>
        </section>

        {/* ── Risk Controls ─────────────────────────────────────────── */}
        <section>
          <SectionLabel>风控设置</SectionLabel>
          <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
            <SettingRow
              label="每日下注上限（周中）"
              value={settings.riskControls.maxDailyMatchesWeekday ?? settings.riskControls.maxDailyMatches}
              suffix="场"
              desc="周一至周五每日上限"
              onChange={(v) => {
                update("riskControls")("maxDailyMatchesWeekday", v);
                update("riskControls")("maxDailyMatches", v);
              }}
              isInteger
            />
            <SettingRow
              label="每日下注上限（周末）"
              value={settings.riskControls.maxDailyMatchesWeekend ?? 3}
              suffix="场"
              desc="周六周日每日上限"
              onChange={(v) => update("riskControls")("maxDailyMatchesWeekend", v)}
              isInteger
            />
            <SettingRow
              label="每日观察上限"
              value={settings.riskControls.maxDailyWatches}
              suffix="场"
              desc="观察池独立上限，避免过度关注"
              onChange={(v) => update("riskControls")("maxDailyWatches", v)}
              isInteger
            />
            <SettingRow
              label="单日亏损线"
              value={settings.riskControls.dailyLossLimit}
              prefix="¥"
              desc="当日累计亏损达到后，剩余场次强制走观察"
              onChange={(v) => update("riskControls")("dailyLossLimit", v)}
            />
            <SettingRow
              label="月度亏损上限"
              value={settings.riskControls.monthlyMaxDrawdown}
              prefix="¥"
              desc="当月累计亏损达到后，强制锁 7 天（跨月重置）"
              onChange={(v) => update("riskControls")("monthlyMaxDrawdown", v)}
            />
          </div>
        </section>

        {/* ── Grade Amounts ─────────────────────────────────────────── */}
        <section>
          <SectionLabel>建议下注金额</SectionLabel>
          <p className="text-[10px] text-muted-foreground/60 mb-3">各等级默认建议金额，可在纪律审查时调整</p>
          <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
            {(["C", "B", "A", "S"] as const).map((grade) => (
              <SettingRow
                key={grade}
                label={`${grade} 级`}
                labelClass={
                  grade === "S" ? "text-[#f5c842] font-black" :
                  grade === "A" ? "text-[#b8a0e8] font-black" :
                  grade === "B" ? "text-[#6ea8d8] font-black" :
                  "text-warning font-black"
                }
                value={settings.gradeAmounts[grade]}
                prefix="¥"
                onChange={(v) => update("gradeAmounts")(grade, v)}
              />
            ))}
          </div>
        </section>

        {/* ── Display Prefs ────────────────────────────────────────── */}
        <section>
          <SectionLabel>展示偏好</SectionLabel>
          <div className="border border-border rounded-md overflow-hidden">
            <div className="px-4 py-3 bg-card">
              <p className="text-xs font-medium mb-2">首页默认时间范围</p>
              <div className="flex gap-1.5">
                {(["week", "month", "year", "all"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => update("displayPrefs")("defaultTimeRange", opt)}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      settings.displayPrefs.defaultTimeRange === opt
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {opt === "week" ? "本周" : opt === "month" ? "本月" : opt === "year" ? "本年" : "全部"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Backup ───────────────────────────────────────────────── */}
        <section>
          <SectionLabel>数据备份</SectionLabel>
          <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
            <button
              onClick={handleExport}
              className="w-full px-4 py-3 bg-card flex items-center justify-between active:opacity-70"
            >
              <div className="flex items-center gap-2">
                <Download size={14} className="text-muted-foreground" />
                <span className="text-xs font-medium">导出为 JSON 文件</span>
              </div>
              <span className="text-[10px] text-muted-foreground">下载到本机</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-3 bg-card flex items-center justify-between active:opacity-70"
            >
              <div className="flex items-center gap-2">
                <Upload size={14} className="text-muted-foreground" />
                <span className="text-xs font-medium">从 JSON 文件恢复</span>
              </div>
              <span className="text-[10px] text-muted-foreground">选择备份</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-2 leading-relaxed">
            重装应用前请先导出备份。重装后在新图标里打开此页,点"从 JSON 文件恢复"即可。
          </p>
        </section>

        {/* ── Danger Zone ──────────────────────────────────────────── */}
        <section>
          <SectionLabel>危险操作</SectionLabel>
          <div className="border-2 rounded-md overflow-hidden" style={{ borderColor: "#e03535" }}>
            <button
              onClick={() => { setResetPhrase(""); setResetConfirm(true); }}
              className="w-full px-4 py-3 flex items-center justify-between active:opacity-70"
              style={{ background: "#e0353514" }}
            >
              <div className="flex items-center gap-2">
                <Trash2 size={14} style={{ color: "#e03535" }} />
                <span className="text-xs font-bold" style={{ color: "#e03535" }}>重置所有数据</span>
              </div>
              <span className="text-[10px] font-semibold" style={{ color: "#e03535" }}>⚠ 不可恢复</span>
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/70 mt-2 leading-relaxed">
            清空所有下注 / 观察记录和设置，恢复到全新状态。<span style={{ color: "#e03535" }} className="font-semibold">请务必先导出备份</span>，否则数据将永久丢失。
          </p>
        </section>

        {resetConfirm && (
          <div className="fixed inset-0 z-50 bg-background/80 flex items-end" onClick={() => setResetConfirm(false)}>
            <div
              className="w-full border-t-2 px-4 py-5 space-y-3 max-w-[430px] mx-auto"
              style={{ background: "var(--card)", borderTopColor: "#e03535" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "#e0353520" }}
                >
                  <Trash2 size={16} style={{ color: "#e03535" }} />
                </div>
                <p className="text-sm font-bold" style={{ color: "#e03535" }}>确认重置所有数据？</p>
              </div>
              <div
                className="text-xs leading-relaxed p-3 rounded space-y-1"
                style={{ background: "#e0353510", border: "1px solid #e0353540" }}
              >
                <p className="font-semibold" style={{ color: "#e03535" }}>此操作无法撤销</p>
                <p className="text-muted-foreground">将清空：所有下注记录、观察记录、弃场记录、复盘笔记，以及全部自定义设置。</p>
                <p className="text-muted-foreground">若未导出备份，数据将永久丢失。</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5">请输入 <span className="font-bold" style={{ color: "#e03535" }}>确认清空</span> 以继续：</p>
                <input
                  type="text"
                  value={resetPhrase}
                  onChange={(e) => setResetPhrase(e.target.value)}
                  placeholder="确认清空"
                  className="w-full px-3 py-2 rounded text-sm bg-muted outline-none"
                  style={resetPhrase === "确认清空" ? { border: "1px solid #e03535" } : {}}
                />
              </div>
              <button
                onClick={() => {
                  if (resetPhrase !== "确认清空") return;
                  resetAllData();
                  setResetConfirm(false);
                  setTimeout(() => location.reload(), 300);
                }}
                disabled={resetPhrase !== "确认清空"}
                className="w-full py-3 rounded font-bold text-sm text-white transition-opacity"
                style={{
                  background: "#e03535",
                  opacity: resetPhrase === "确认清空" ? 1 : 0.35,
                }}
              >
                永久清空所有数据
              </button>
              <button onClick={() => setResetConfirm(false)} className="w-full py-2 text-xs text-muted-foreground">
                取消（推荐）
              </button>
            </div>
          </div>
        )}

        {/* ── About ────────────────────────────────────────────────── */}
        <section>
          <SectionLabel>关于</SectionLabel>
          <div className="border border-border rounded-md overflow-hidden divide-y divide-border">
            <div className="px-4 py-3 bg-card flex items-center justify-between">
              <span className="text-xs text-muted-foreground">产品名称</span>
              <span className="text-xs font-semibold">大赢家</span>
            </div>
            <div className="px-4 py-3 bg-card flex items-center justify-between">
              <span className="text-xs text-muted-foreground">覆盖范围</span>
              <span className="text-xs font-semibold">足球亚盘让球</span>
            </div>
            <div className="px-4 py-3 bg-card flex items-center justify-between">
              <span className="text-xs text-muted-foreground">数据存储</span>
              <span className="text-xs font-semibold">本地</span>
            </div>
            <div className="px-4 py-3 bg-card flex items-center justify-between">
              <span className="text-xs text-muted-foreground">颜色约定</span>
              <span className="text-xs">
                <span className="text-profit font-bold">红=盈利/通过</span>
                <span className="mx-1.5 text-border">·</span>
                <span className="text-loss font-bold">绿=亏损/禁止</span>
              </span>
            </div>
          </div>
        </section>

        <button
          onClick={handleSave}
          className="w-full py-3.5 rounded font-bold text-sm bg-foreground text-background active:opacity-80 transition-opacity"
        >
          保存所有设置
        </button>

      </div>

      <BottomNav />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-3">{children}</p>
  );
}

function SettingRow({
  label, labelClass = "", value, prefix, suffix, desc, onChange, isInteger,
}: {
  label: string;
  labelClass?: string;
  value: number;
  prefix?: string;
  suffix?: string;
  desc?: string;
  onChange: (v: number) => void;
  isInteger?: boolean;
}) {
  return (
    <div className="px-4 py-3 bg-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className={`text-xs font-medium ${labelClass}`}>{label}</p>
          {desc && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{desc}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {prefix && <span className="text-xs text-muted-foreground">{prefix}</span>}
          <input
            type="number"
            className="w-24 text-right bg-muted px-2 py-1 rounded text-xs font-mono outline-none"
            value={value}
            min={0}
            step={isInteger ? 1 : 100}
            onChange={(e) => {
              const v = isInteger ? parseInt(e.target.value) : parseFloat(e.target.value);
              if (!isNaN(v) && v >= 0) onChange(v);
            }}
          />
          {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
        </div>
      </div>
    </div>
  );
}
