"use client";

import { useMemo } from "react";

// Red/green PnL bars: one bar per period (day or week).
// 盈利红 (#e03535) / 亏损绿 (#2a9d5c) — Chinese market convention (locked).

interface Bar {
  key: string;
  pnl: number;
}

export default function PnlBars({
  data,
  height = 64,
  className = "",
}: {
  data: Bar[];
  height?: number;
  className?: string;
}) {
  const maxAbs = useMemo(
    () => Math.max(1, ...data.map((d) => Math.abs(d.pnl))),
    [data]
  );

  if (data.length === 0) {
    return (
      <div className={className} style={{ height }}>
        <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/40">
          暂无数据
        </div>
      </div>
    );
  }

  const half = height / 2;
  const profitColor = "#e03535";
  const lossColor = "#2a9d5c";

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {/* zero line */}
      <div
        className="absolute left-0 right-0 border-t border-border/40"
        style={{ top: half }}
      />
      <div className="absolute inset-0 flex items-stretch">
        {data.map((d) => {
          const h = (Math.abs(d.pnl) / maxAbs) * (half - 1);
          const isProfit = d.pnl > 0;
          const isLoss = d.pnl < 0;
          return (
            <div key={d.key} className="flex-1 relative min-w-0" style={{ paddingLeft: 0.5, paddingRight: 0.5 }}>
              {isProfit && (
                <div
                  className="absolute left-0.5 right-0.5 rounded-[1px]"
                  style={{ bottom: half, height: h, background: profitColor, opacity: 0.88 }}
                />
              )}
              {isLoss && (
                <div
                  className="absolute left-0.5 right-0.5 rounded-[1px]"
                  style={{ top: half, height: h, background: lossColor, opacity: 0.88 }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
