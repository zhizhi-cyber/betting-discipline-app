"use client";

import { useMemo, useRef, useState, useEffect } from "react";

// PnL bar chart + cumulative line overlay.
// 盈利红 (#e03535) / 亏损绿 (#2a9d5c) — locked per Chinese market convention.
// Features: left Y-axis (per-period PnL), right Y-axis (cumulative PnL),
// X-axis date labels, tap-to-show tooltip, optional zoom + horizontal scroll.

export interface PnlBar {
  key: string; // YYYY-MM-DD
  pnl: number;
}

type Granularity = "day" | "week";

interface Props {
  data: PnlBar[];
  height?: number;
  /** Show cumulative line overlay on secondary axis. */
  showCumulative?: boolean;
  /** Enable horizontal scroll + zoom buttons + pinch-zoom. */
  zoomable?: boolean;
  /** Bar granularity affects X-axis labeling. Auto-detected by key distance. */
  granularity?: Granularity;
  className?: string;
}

const PROFIT = "#e03535";
const LOSS = "#2a9d5c";
const CUM = "#f5c842";

function fmtShort(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return `${n < 0 ? "-" : ""}${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
}

function fmtMoney(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}¥${Math.abs(Math.round(n)).toLocaleString()}`;
}

function parseKey(k: string): Date {
  // YYYY-MM-DD
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export default function PnlBars({
  data,
  height = 140,
  showCumulative = true,
  zoomable = false,
  granularity,
  className = "",
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-detect granularity: if consecutive keys are ≥6 days apart → week
  const gran: Granularity = useMemo(() => {
    if (granularity) return granularity;
    if (data.length < 2) return "day";
    const a = parseKey(data[0].key).getTime();
    const b = parseKey(data[1].key).getTime();
    return (b - a) / 86400000 >= 6 ? "week" : "day";
  }, [data, granularity]);

  const cumulative = useMemo(() => {
    let sum = 0;
    return data.map((d) => (sum += d.pnl));
  }, [data]);

  const maxAbsPnl = useMemo(
    () => Math.max(1, ...data.map((d) => Math.abs(d.pnl))),
    [data]
  );
  const maxAbsCum = useMemo(
    () => Math.max(1, ...cumulative.map((v) => Math.abs(v))),
    [cumulative]
  );

  // Pinch-zoom on touch
  useEffect(() => {
    if (!zoomable) return;
    const el = scrollRef.current;
    if (!el) return;
    let initDist = 0;
    let initZoom = 1;
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        initDist = Math.hypot(dx, dy);
        initZoom = zoom;
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initDist > 0) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.hypot(dx, dy);
        const next = Math.max(1, Math.min(5, initZoom * (d / initDist)));
        setZoom(next);
        e.preventDefault();
      }
    };
    const onEnd = () => { initDist = 0; };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
    };
  }, [zoomable, zoom]);

  if (data.length === 0) {
    return (
      <div className={className} style={{ height }}>
        <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/40">
          暂无数据
        </div>
      </div>
    );
  }

  const padLeft = 34;
  const padRight = showCumulative ? 38 : 10;
  const padTop = 8;
  const padBottom = 18;
  // SVG layout width stretches to container; use a large virtual viewBox for crisp scaling.
  const baseInnerW = 320;
  const innerW = baseInnerW * zoom;
  const totalW = innerW + padLeft + padRight;
  const innerH = height - padTop - padBottom;
  const half = innerH / 2;
  const midY = padTop + half;

  const bandW = innerW / data.length;
  const barW = Math.max(2, Math.min(18, bandW * 0.65));

  // Y-axis ticks: 3 ticks (+max, 0, -max)
  const leftTicks = [maxAbsPnl, 0, -maxAbsPnl];
  const rightTicks = [maxAbsCum, 0, -maxAbsCum];

  // X-axis labels
  const xLabels: { idx: number; label: string }[] = [];
  if (gran === "day") {
    // Mark 1st of month + roughly every 5 or 7 days depending on span
    const span = data.length;
    const step = span <= 10 ? 1 : span <= 35 ? 5 : 7;
    data.forEach((d, i) => {
      const dt = parseKey(d.key);
      const isFirst = dt.getDate() === 1;
      if (isFirst || i === 0 || i === data.length - 1 || i % step === 0) {
        xLabels.push({
          idx: i,
          label: isFirst ? `${dt.getMonth() + 1}/1` : `${dt.getMonth() + 1}/${dt.getDate()}`,
        });
      }
    });
  } else {
    // Week: label every month boundary (first week whose Monday falls in new month)
    let lastMonth = -1;
    data.forEach((d, i) => {
      const dt = parseKey(d.key);
      if (dt.getMonth() !== lastMonth) {
        xLabels.push({ idx: i, label: `${dt.getMonth() + 1}月` });
        lastMonth = dt.getMonth();
      }
    });
  }

  const tickCls = "fill-muted-foreground/70";
  const gridCls = "stroke-border/40";

  // Cumulative polyline points
  const cumPoints = showCumulative
    ? cumulative
        .map((v, i) => {
          const cx = padLeft + bandW * (i + 0.5);
          const cy = midY - (v / maxAbsCum) * half;
          return `${cx.toFixed(1)},${cy.toFixed(1)}`;
        })
        .join(" ")
    : "";

  const active = activeIdx != null ? data[activeIdx] : null;
  const activeCum = activeIdx != null ? cumulative[activeIdx] : 0;

  return (
    <div className={className}>
      {zoomable && (
        <div className="flex items-center justify-between mb-1">
          <div className="text-[9px] text-muted-foreground/60">双指缩放 · 滑动查看</div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(2)))}
              className="w-5 h-5 rounded border border-border text-[11px] leading-none flex items-center justify-center text-muted-foreground active:opacity-60"
              aria-label="zoom out"
            >−</button>
            <span className="text-[9px] font-mono tabular-nums text-muted-foreground w-8 text-center">
              {zoom.toFixed(1)}x
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(5, +(z + 0.5).toFixed(2)))}
              className="w-5 h-5 rounded border border-border text-[11px] leading-none flex items-center justify-center text-muted-foreground active:opacity-60"
              aria-label="zoom in"
            >+</button>
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className={zoomable ? "overflow-x-auto overflow-y-hidden" : ""}
        style={{ touchAction: zoomable ? "pan-x" : undefined, WebkitOverflowScrolling: "touch" }}
      >
        <svg
          width={zoomable ? totalW : "100%"}
          height={height}
          viewBox={`0 0 ${totalW} ${height}`}
          preserveAspectRatio={zoomable ? "xMinYMid meet" : "none"}
          style={{ display: "block" }}
        >
          {/* Horizontal grid lines (max, zero, min) */}
          {leftTicks.map((t, i) => {
            const y = midY - (t / maxAbsPnl) * half;
            return (
              <line
                key={`grid-${i}`}
                x1={padLeft}
                x2={padLeft + innerW}
                y1={y}
                y2={y}
                className={gridCls}
                strokeDasharray={t === 0 ? "" : "2 3"}
                strokeWidth={t === 0 ? 1 : 0.5}
              />
            );
          })}

          {/* Left Y-axis labels (per-period PnL) */}
          {leftTicks.map((t, i) => {
            const y = midY - (t / maxAbsPnl) * half;
            return (
              <text
                key={`lt-${i}`}
                x={padLeft - 4}
                y={y + 3}
                textAnchor="end"
                className={`text-[9px] ${tickCls} font-mono`}
              >
                {t === 0 ? "0" : (t > 0 ? "+" : "") + fmtShort(t)}
              </text>
            );
          })}

          {/* Right Y-axis labels (cumulative) */}
          {showCumulative && rightTicks.map((t, i) => {
            const y = midY - (t / maxAbsCum) * half;
            return (
              <text
                key={`rt-${i}`}
                x={padLeft + innerW + 4}
                y={y + 3}
                textAnchor="start"
                className={`text-[9px] font-mono`}
                fill={CUM}
                opacity={0.75}
              >
                {t === 0 ? "0" : (t > 0 ? "+" : "") + fmtShort(t)}
              </text>
            );
          })}

          {/* Bars */}
          {data.map((d, i) => {
            if (d.pnl === 0) return null;
            const cx = padLeft + bandW * (i + 0.5);
            const h = (Math.abs(d.pnl) / maxAbsPnl) * (half - 1);
            const isProfit = d.pnl > 0;
            return (
              <rect
                key={d.key}
                x={cx - barW / 2}
                y={isProfit ? midY - h : midY}
                width={barW}
                height={Math.max(1, h)}
                fill={isProfit ? PROFIT : LOSS}
                opacity={activeIdx === null || activeIdx === i ? 0.9 : 0.45}
                rx={1}
              />
            );
          })}

          {/* Cumulative polyline */}
          {showCumulative && data.length > 1 && (
            <polyline
              points={cumPoints}
              fill="none"
              stroke={CUM}
              strokeWidth={1.4}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.92}
            />
          )}
          {/* Cumulative dots */}
          {showCumulative && data.map((_, i) => {
            const cx = padLeft + bandW * (i + 0.5);
            const cy = midY - (cumulative[i] / maxAbsCum) * half;
            return (
              <circle
                key={`cd-${i}`}
                cx={cx}
                cy={cy}
                r={activeIdx === i ? 2.5 : 1.2}
                fill={CUM}
                opacity={activeIdx === null || activeIdx === i ? 0.95 : 0.3}
              />
            );
          })}

          {/* Invisible tap-hit rects */}
          {data.map((d, i) => {
            const cx = padLeft + bandW * (i + 0.5);
            return (
              <rect
                key={`hit-${i}`}
                x={cx - bandW / 2}
                y={padTop}
                width={bandW}
                height={innerH}
                fill="transparent"
                onClick={() => setActiveIdx((cur) => (cur === i ? null : i))}
                style={{ cursor: "pointer" }}
              />
            );
          })}

          {/* X-axis labels */}
          {xLabels.map(({ idx, label }) => {
            const cx = padLeft + bandW * (idx + 0.5);
            return (
              <text
                key={`xl-${idx}`}
                x={cx}
                y={height - 4}
                textAnchor="middle"
                className={`text-[9px] ${tickCls} font-mono`}
              >
                {label}
              </text>
            );
          })}

          {/* Active highlight vertical line */}
          {activeIdx != null && (
            <line
              x1={padLeft + bandW * (activeIdx + 0.5)}
              x2={padLeft + bandW * (activeIdx + 0.5)}
              y1={padTop}
              y2={padTop + innerH}
              stroke="currentColor"
              strokeWidth={0.5}
              opacity={0.3}
              className="text-muted-foreground"
            />
          )}
        </svg>
      </div>

      {/* Tooltip strip */}
      {active && (
        <div className="mt-1 flex items-center justify-between text-[10px] font-mono tabular-nums">
          <span className="text-muted-foreground">{active.key}</span>
          <div className="flex items-center gap-2">
            <span className={active.pnl > 0 ? "text-profit" : active.pnl < 0 ? "text-loss" : "text-muted-foreground"}>
              当期 {fmtMoney(active.pnl)}
            </span>
            {showCumulative && (
              <span style={{ color: CUM }}>
                累计 {fmtMoney(activeCum)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
