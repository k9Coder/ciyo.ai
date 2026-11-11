// TypeScript port of models/judge-v2/bench/cascade.mjs (itself a port of judge/cascade.py).
// Behaviour must stay identical to the Python cascade the thresholds were chosen with; the only additions are
// fast_p / second_p / windows on each rule entry, which the shadow runner records.

export type Span = [number, number];

export interface ScoreOut { p: number; span: Span | null }

export interface Scorer {
  /** Calibrated probability per rule plus the character span (UTF-16 offsets) of the offending text. */
  scoreWithSpans(message: string, rules: string[]): Promise<ScoreOut[]>;
  dispose?(): void;
}

export interface ConfirmPolicy { fastMin: number; secondMin: number; warnFastMin?: number; warnSecondMin?: number }

export interface CascadeRule { id: string; text: string }

export interface RuleEntry {
  rule_id: string;
  /** null = pending (second opinion timed out or unavailable). */
  violated: boolean | null;
  warn: boolean;
  confidence: number | null;
  span: { start: number; end: number; text: string } | null;
  fast_p: number;
  second_p: number | null;
  windows: number;
}

export interface CascadeResult {
  violated: boolean;
  warn: boolean;
  decided_by: "fast" | "second_opinion";
  latency_ms: number;
  pending: boolean;
  rules: RuleEntry[];
}

export interface CascadeOptions {
  fast: Scorer;
  second?: Scorer | (() => Promise<Scorer>) | null;
  bands?: { low: number; high: number };
  windowTokens?: number;
  secondTimeoutMs?: number;
  idleUnloadMs?: number;
  confirm?: ConfirmPolicy | null;
  maxWindows?: number;
}

export interface Cascade { judge(message: string, rules: CascadeRule[]): Promise<CascadeResult> }

/** Thresholds locked on dev2 (models/judge-v2/artifacts/policy.json, README "v2.2"). */
export const LOCKED_POLICY = {
  confirm: { fastMin: 0.85, secondMin: 0.85, warnFastMin: 0.43, warnSecondMin: 0.7 },
  windowTokens: 150,
  maxWindows: 3,
} as const;

const CHARS_PER_TOKEN = 4;

// Python's round(): halves go to the even neighbour, so both runtimes cut identical windows.
function pyRound(x: number): number {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export function createCascade({ fast, second = null, bands = { low: 0.1, high: 0.9 }, windowTokens = 400,
                                secondTimeoutMs = 2500, idleUnloadMs = 300000, confirm = null, maxWindows = 1 }: CascadeOptions): Cascade {
  const windowChars = windowTokens * CHARS_PER_TOKEN;
  const lazy = typeof second === "function";
  let loaded: Scorer | null = lazy ? null : (second as Scorer | null);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  async function getSecond(): Promise<Scorer | null> {
    if (!lazy) return loaded;
    if (!loaded) loaded = await (second as () => Promise<Scorer>)();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (loaded && typeof loaded.dispose === "function") loaded.dispose();
      loaded = null;
    }, idleUnloadMs);
    return loaded;
  }

  function windowFor(message: string, span: Span | null): Span {
    if (message.length <= windowChars) return [0, message.length];
    const mid = span ? Math.floor((span[0] + span[1]) / 2) : 0;
    const a = Math.max(0, Math.min(mid - Math.floor(windowChars / 2), message.length - windowChars));
    return [a, a + windowChars];
  }

  // Second-opinion windows, the one holding the fast model's span first. A message that fits in maxWindows windows
  // is tiled evenly (overlapping) so every character is checked; a longer one gets the window around the span, then
  // the windows that add the most unseen text. Mirrors judge/cascade.py _windows.
  function windowsFor(message: string, span: Span | null): Span[] {
    const n = message.length, w = windowChars, k = Math.max(1, maxWindows);
    if (n <= w) return [[0, n]];
    const mid = span ? Math.floor((span[0] + span[1]) / 2) : 0;
    if (n <= k * w) {
      const m = Math.ceil(n / w);
      const tiles: Span[] = [...Array(m)].map((_, i) => { const s = pyRound((i * (n - w)) / (m - 1)); return [s, s + w]; });
      const dist = (t: Span) => (t[0] <= mid && mid < t[1] ? 0 : w) + Math.abs(Math.floor((t[0] + t[1]) / 2) - mid);
      let first = tiles[0]!;
      for (const t of tiles) if (dist(t) < dist(first)) first = t;
      return [first, ...tiles.filter((t) => t !== first)];
    }
    const out: Span[] = [windowFor(message, span)];
    const seen = new Uint8Array(n);
    seen.fill(1, out[0]![0], out[0]![1]);
    const half = Math.floor(w / 2);
    const starts = [...new Set([...Array(Math.ceil(n / half)).keys()].map((i) => Math.min(i * half, n - w)))].sort((x, y) => x - y);
    while (out.length < k) {
      let best = -1, bestGain = 0;
      for (const s of starts) {
        let g = 0;
        for (let i = s; i < s + w; i++) g += 1 - seen[i]!;
        if (g > bestGain) { best = s; bestGain = g; }
      }
      if (best < 0) break;
      out.push([best, best + w]);
      seen.fill(1, best, best + w);
    }
    return out;
  }

  function withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), secondTimeoutMs); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function entry(message: string, ruleId: string, violated: boolean | null, p: number, span: Span | null,
                 extra: { fast_p: number; second_p: number | null; windows: number }, warn = false): RuleEntry {
    const s = (violated || warn) && span ? { start: span[0], end: span[1], text: message.slice(span[0], span[1]) } : null;
    const confidence = violated === null ? null : Math.round((violated ? p : 1 - p) * 1e4) / 1e4;
    return { rule_id: ruleId, violated, warn, confidence, span: s, ...extra };
  }

  async function judge(message: string, rules: CascadeRule[]): Promise<CascadeResult> {
    const t0 = performance.now();
    if (!message || rules.length === 0) {
      return { violated: false, warn: false, decided_by: "fast", latency_ms: 0, pending: false,
               rules: rules.map((r) => entry(message, r.id, false, 0, null, { fast_p: 0, second_p: null, windows: 0 })) };
    }
    const fastOut = await fast.scoreWithSpans(message, rules.map((r) => r.text));
    const entries: RuleEntry[] = [];
    let usedSecond = false, pending = false;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]!;
      const { p, span } = fastOut[i]!;
      const fastOnly = { fast_p: p, second_p: null, windows: 0 };
      if (confirm) {
        const hasWarn = confirm.warnFastMin != null && confirm.warnSecondMin != null;
        const canBlock = p >= confirm.fastMin;
        const canWarn = hasWarn && p >= confirm.warnFastMin!;
        if (!canBlock && !canWarn) { entries.push(entry(message, rule.id, false, p, null, fastOnly)); continue; }
        const stopAt = canBlock ? confirm.secondMin : confirm.warnSecondMin!;
        usedSecond = true;
        let windows = 0;
        try {
          const scorer = await getSecond();
          if (!scorer) throw new Error("second opinion unavailable");
          let best: ScoreOut = { p: 0, span: null }, hit: ScoreOut | null = null;
          for (const [a, b] of windowsFor(message, span)) {
            windows++;
            const [res] = await withTimeout(scorer.scoreWithSpans(message.slice(a, b), [rule.text]));
            const s: Span | null = res!.span ? [res!.span[0] + a, res!.span[1] + a] : null;
            if (res!.p >= stopAt) { hit = { p: res!.p, span: s ?? span }; break; }
            if (res!.p > best.p) best = { p: res!.p, span: s };
          }
          const out = hit ?? best;
          const block = canBlock && out.p >= confirm.secondMin;
          const warn = !block && canWarn && out.p >= confirm.warnSecondMin!;
          entries.push(entry(message, rule.id, block, out.p, out.span ?? span, { fast_p: p, second_p: out.p, windows }, warn));
        } catch {
          pending = true;
          entries.push(entry(message, rule.id, null, p, null, { fast_p: p, second_p: null, windows }));
        }
        continue;
      }
      if (p < bands.low) entries.push(entry(message, rule.id, false, p, null, fastOnly));
      else if (p >= bands.high) entries.push(entry(message, rule.id, true, p, span, fastOnly));
      else {
        usedSecond = true;
        try {
          const scorer = await getSecond();
          if (!scorer) throw new Error("second opinion unavailable");
          const [a, b] = windowFor(message, span);
          const [res] = await withTimeout(scorer.scoreWithSpans(message.slice(a, b), [rule.text]));
          const span2: Span | null = res!.span ? [res!.span[0] + a, res!.span[1] + a] : null;
          entries.push(entry(message, rule.id, res!.p >= 0.5, res!.p, span2, { fast_p: p, second_p: res!.p, windows: 1 }));
        } catch {
          pending = true;
          entries.push(entry(message, rule.id, null, p, null, { fast_p: p, second_p: null, windows: 1 }));
        }
      }
    }
    return { violated: entries.some((e) => e.violated === true), warn: entries.some((e) => e.warn),
             decided_by: usedSecond ? "second_opinion" : "fast",
             latency_ms: Math.round(performance.now() - t0), pending, rules: entries };
  }

  return { judge };
}
