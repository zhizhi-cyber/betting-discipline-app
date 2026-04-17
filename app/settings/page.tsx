"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DEFAULT_SETTINGS, getSettings, saveSettings, type AppSettings } from "@/lib/storage";
import BottomNav from "@/components/bottom-nav";
import { useToast } from "@/components/toast";

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
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
              label="每日下注上限"
              value={settings.riskControls.maxDailyMatches}
              suffix="场"
              desc="纪律要求：1-3 场；观察池不占用此额度"
              onChange={(v) => update("riskControls")("maxDailyMatches", v)}
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
              desc="亏损超过此金额停止下注"
              onChange={(v) => update("riskControls")("dailyLossLimit", v)}
            />
            <SettingRow
              label="月度最大回撤"
              value={settings.riskControls.monthlyMaxDrawdown}
              prefix="¥"
              desc="月度亏损超过此金额停止"
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
