// Reference JS cascade for Judge v2.1: a port of judge/cascade.py that Spec 2's runtime builds on.
// fast/second expose scoreWithSpans(message, ruleTexts) -> [{ p, span: [start, end] | null }] with offsets as
// JS string (UTF-16) indices. `second` may be null, a scorer, or a lazy loader () => Promise<scorer>; a loaded
// scorer is disposed after idleUnloadMs without a routed rule so the extension does not hold it in memory.

const CHARS_PER_TOKEN = 4;

// confirm = { fastMin, secondMin } switches to the precision-first policy: block only when the fast model flags
// and the second model confirms; otherwise bands route the uncertain middle to the second model.
// Optional warn tier { warnFastMin, warnSecondMin } inside confirm: a rule that is not blocked but clears the looser
// thresholds is reported with warn: true (the user is warned and may still send).
export function createCascade({ fast, second = null, bands = { low: 0.1, high: 0.9 }, windowTokens = 400,
                                secondTimeoutMs = 2500, idleUnloadMs = 300000, confirm = null, maxWindows = 1 }) {
  const windowChars = windowTokens * CHARS_PER_TOKEN;
  const lazy = typeof second === "function";
  let loaded = lazy ? null : second;
  let idleTimer = null;

  async function getSecond() {
    if (!lazy) return loaded;
    if (!loaded) loaded = await second();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (loaded && typeof loaded.dispose === "function") loaded.dispose();
      loaded = null;
    }, idleUnloadMs);
    return loaded;
  }

  function windowFor(message, span) {
    if (message.length <= windowChars) return [0, message.length];
    const mid = span ? Math.floor((span[0] + span[1]) / 2) : 0;
    const a = Math.max(0, Math.min(mid - Math.floor(windowChars / 2), message.length - windowChars));
    return [a, a + windowChars];
  }

  // Second-opinion windows, the one holding the fast model's span first. A message that fits in maxWindows windows
  // is tiled evenly (overlapping) so every character is checked; a longer one gets the window around the span, then
  // the windows that add the most unseen text. Mirrors judge/cascade.py _windows.
  function windowsFor(message, span) {
    const n = message.length, w = windowChars, k = Math.max(1, maxWindows);
    if (n <= w) return [[0, n]];
    const mid = span ? Math.floor((span[0] + span[1]) / 2) : 0;
    if (n <= k * w) {
      const m = Math.ceil(n / w);
      const tiles = [...Array(m)].map((_, i) => { const s = pyRound((i * (n - w)) / (m - 1)); return [s, s + w]; });
      const dist = (t) => (t[0] <= mid && mid < t[1] ? 0 : w) + Math.abs(Math.floor((t[0] + t[1]) / 2) - mid);
      let first = tiles[0];
      for (const t of tiles) if (dist(t) < dist(first)) first = t;
      return [first, ...tiles.filter((t) => t !== first)];
    }
    const out = [windowFor(message, span)];
    const seen = new Uint8Array(n);
    seen.fill(1, out[0][0], out[0][1]);
    const starts = [...new Set([...Array(Math.ceil(n / Math.floor(w / 2))).keys()]
      .map((i) => Math.min(i * Math.floor(w / 2), n - w)))].sort((x, y) => x - y);
    while (out.length < k) {
      let best = -1, bestGain = 0;
      for (const s of starts) {
        let g = 0;
        for (let i = s; i < s + w; i++) g += 1 - seen[i];
        if (g > bestGain) { best = s; bestGain = g; }
      }
      if (best < 0) break;
      out.push([best, best + w]);
      seen.fill(1, best, best + w);
    }
    return out;
  }

  // Python's round(): halves go to the even neighbour, so both runtimes cut identical windows.
  function pyRound(x) {
    const f = Math.floor(x), d = x - f;
    if (d > 0.5) return f + 1;
    if (d < 0.5) return f;
    return f % 2 === 0 ? f : f + 1;
  }

  function withTimeout(promise) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), secondTimeoutMs); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function entry(message, ruleId, violated, p, span, warn = false) {
    const s = (violated || warn) && span ? { start: span[0], end: span[1], text: message.slice(span[0], span[1]) } : null;
    const confidence = violated === null ? null : Math.round((violated ? p : 1 - p) * 1e4) / 1e4;
    return { rule_id: ruleId, violated, warn, confidence, span: s };
  }

  async function judge(message, rules) {
    const t0 = performance.now();
    if (!message || rules.length === 0) {
      return { violated: false, warn: false, decided_by: "fast", latency_ms: 0, pending: false,
               rules: rules.map((r) => entry(message, r.id, false, 0, null)) };
    }
    const fastOut = await fast.scoreWithSpans(message, rules.map((r) => r.text));
    const entries = [];
    let usedSecond = false, pending = false;
    for (let i = 0; i < rules.length; i++) {
      const { p, span } = fastOut[i];
      if (confirm) {
        const hasWarn = confirm.warnFastMin != null && confirm.warnSecondMin != null;
        const canBlock = p >= confirm.fastMin;
        const canWarn = hasWarn && p >= confirm.warnFastMin;
        if (!canBlock && !canWarn) { entries.push(entry(message, rules[i].id, false, p, null)); continue; }
        const stopAt = canBlock ? confirm.secondMin : confirm.warnSecondMin;
        usedSecond = true;
        try {
          const scorer = await getSecond();
          if (!scorer) throw new Error("second opinion unavailable");
          let best = { p: 0, span: null }, hit = null;
          for (const [a, b] of windowsFor(message, span)) {
            const [res] = await withTimeout(scorer.scoreWithSpans(message.slice(a, b), [rules[i].text]));
            const s = res.span ? [res.span[0] + a, res.span[1] + a] : null;
            if (res.p >= stopAt) { hit = { p: res.p, span: s ?? span }; break; }
            if (res.p > best.p) best = { p: res.p, span: s };
          }
          const out = hit ?? best;
          const block = canBlock && out.p >= confirm.secondMin;
          const warn = !block && canWarn && out.p >= confirm.warnSecondMin;
          entries.push(entry(message, rules[i].id, block, out.p, out.span ?? span, warn));
        } catch {
          pending = true;
          entries.push(entry(message, rules[i].id, null, p, null));
        }
        continue;
      }
      if (p < bands.low) entries.push(entry(message, rules[i].id, false, p, null));
      else if (p >= bands.high) entries.push(entry(message, rules[i].id, true, p, span));
      else {
        usedSecond = true;
        try {
          const scorer = await getSecond();
          if (!scorer) throw new Error("second opinion unavailable");
          const [a, b] = windowFor(message, span);
          const [res] = await withTimeout(scorer.scoreWithSpans(message.slice(a, b), [rules[i].text]));
          const span2 = res.span ? [res.span[0] + a, res.span[1] + a] : null;
          entries.push(entry(message, rules[i].id, res.p >= 0.5, res.p, span2));
        } catch {
          pending = true;
          entries.push(entry(message, rules[i].id, null, p, null));
        }
      }
    }
    return { violated: entries.some((e) => e.violated === true), warn: entries.some((e) => e.warn), decided_by: usedSecond ? "second_opinion" : "fast",
             latency_ms: Math.round(performance.now() - t0), pending, rules: entries };
  }

  return { judge };
}
