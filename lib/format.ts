// ─── Input parsing & money formatting helpers ────────────────────────────────
// Centralized here so review / abandoned / records pages all validate identically.

export interface ParseResult<T> {
  ok: boolean;
  value: T;
  error?: string;
}

/**
 * 解析金额输入。允许小数（¥1.5 保留为 1.5，不再被当成 15）。
 * 规则：
 * - 去掉千分位逗号、¥ 符号、两端空白
 * - 必须是正数
 * - 上限 99,999,999 防极端值
 */
export function parseAmount(raw: string): ParseResult<number> {
  const cleaned = (raw || "").replace(/[¥,\s]/g, "");
  if (cleaned === "") return { ok: false, value: 0, error: "请输入金额" };
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, value: 0, error: "金额格式不对（只能是数字）" };
  }
  const n = parseFloat(cleaned);
  if (isNaN(n)) return { ok: false, value: 0, error: "金额格式不对" };
  if (n <= 0) return { ok: false, value: 0, error: "金额必须大于 0" };
  if (n > 99_999_999) return { ok: false, value: 0, error: "金额太大" };
  // 小数保留 2 位
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/**
 * 解析港盘水位。亚盘港盘水位通常 0.5 ~ 1.2 之间；放宽到 (0, 5]。
 */
export function parseOddsInput(raw: string): ParseResult<number> {
  const cleaned = (raw || "").trim();
  if (cleaned === "") return { ok: false, value: 0, error: "请输入水位" };
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return { ok: false, value: 0, error: "水位格式不对" };
  }
  const n = parseFloat(cleaned);
  if (isNaN(n)) return { ok: false, value: 0, error: "水位格式不对" };
  if (n <= 0) return { ok: false, value: 0, error: "水位必须大于 0" };
  if (n > 5) return { ok: false, value: 0, error: "水位超出合理范围" };
  return { ok: true, value: Math.round(n * 1000) / 1000 };
}

/**
 * 短格式金额显示，用于日历格、小空间等。
 * 例：
 *   1234    → "+1.2k"
 *   25000   → "+2.5万"
 *   250000  → "+25万"
 *   -4264   → "-4.3k"（注意用 ASCII 负号，避免字体里渲染成长破折号）
 * 负号统一使用 U+2212 MINUS SIGN，避免 CJK 字体把 U+002D 渲染成宽破折号。
 */
export function formatMoneyShort(n: number, opts: { withSign?: boolean } = {}): string {
  const withSign = opts.withSign ?? true;
  if (n === 0) return "0";
  const abs = Math.abs(n);
  const sign = n < 0 ? "\u2212" : (withSign ? "+" : "");
  if (abs >= 10000) {
    const wan = abs / 10000;
    // 1 位小数，省掉多余 ".0"
    const s = wan >= 100 ? wan.toFixed(0) : wan.toFixed(1).replace(/\.0$/, "");
    return `${sign}${s}万`;
  }
  if (abs >= 1000) {
    const k = abs / 1000;
    const s = k.toFixed(1).replace(/\.0$/, "");
    return `${sign}${s}k`;
  }
  return `${sign}${Math.round(abs)}`;
}

/**
 * 带符号的整数显示，用 U+2212 做负号（避免被 CJK 字体渲染得像破折号）。
 * 例：-4264 → "−4,264"；1200 → "+1,200"；0 → "±0"
 */
export function formatSigned(n: number): string {
  if (n === 0) return "±0";
  const abs = Math.abs(n).toLocaleString();
  return n < 0 ? `\u2212${abs}` : `+${abs}`;
}
