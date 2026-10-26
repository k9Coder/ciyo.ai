// Reference JS cascade for Judge v2.1: a port of judge/cascade.py that Spec 2's runtime builds on.
// fast/second expose scoreWithSpans(message, ruleTexts) -> [{ p, span: [start, end] | null }] with offsets as
// JS string (UTF-16) indices. `second` may be null, a scorer, or a lazy loader () => Promise<scorer>; a loaded
// scorer is disposed after idleUnloadMs without a routed rule so the extension does not hold it in memory.

const CHARS_PER_TOKEN = 4;

// confirm = { fastMin, secondMin } switches to the precision-first policy: block only when the fast model flags
// and the second model confirms; otherwise bands route the uncertain middle to the second model.
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

  // The window around the fast model's span first, then the rest of the message left to right.
  function windowsFor(message, span) {
    const first = windowFor(message, span);
    const out = [first];
    if (message.length <= windowChars) return out;
    for (let a = 0; a < message.length; a += windowChars) {
      const b = Math.min(a + windowChars, message.length);
      const overlap = Math.max(0, Math.min(b, first[1]) - Math.max(a, first[0]));
      if (overlap <= Math.floor(windowChars / 2)) out.push([a, b]);
    }
    return out.slice(0, maxWindows);
  }

  function withTimeout(promise) {
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), secondTimeoutMs); });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function entry(message, ruleId, violated, p, span) {
    const s = violated && span ? { start: span[0], end: span[1], text: message.slice(span[0], span[1]) } : null;
    const confidence = violated === null ? null : Math.round((violated ? p : 1 - p) * 1e4) / 1e4;
    return { rule_id: ruleId, violated, confidence, span: s };
  }

  async function judge(message, rules) {
    const t0 = performance.now();
    if (!message || rules.length === 0) {
      return { violated: false, decided_by: "fast", latency_ms: 0, pending: false,
               rules: rules.map((r) => entry(message, r.id, false, 0, null)) };
    }
    const fastOut = await fast.scoreWithSpans(message, rules.map((r) => r.text));
    const entries = [];
    let usedSecond = false, pending = false;
    for (let i = 0; i < rules.length; i++) {
      const { p, span } = fastOut[i];
      if (confirm) {
        if (p < confirm.fastMin) { entries.push(entry(message, rules[i].id, false, p, null)); continue; }
        usedSecond = true;
        try {
          const scorer = await getSecond();
          if (!scorer) throw new Error("second opinion unavailable");
          let best = { p: 0, span: null }, hit = null;
          for (const [a, b] of windowsFor(message, span)) {
            const [res] = await withTimeout(scorer.scoreWithSpans(message.slice(a, b), [rules[i].text]));
            const s = res.span ? [res.span[0] + a, res.span[1] + a] : null;
            if (res.p >= confirm.secondMin) { hit = { p: res.p, span: s ?? span }; break; }
            if (res.p > best.p) best = { p: res.p, span: s };
          }
          const out = hit ?? best;
          entries.push(entry(message, rules[i].id, hit !== null, out.p, out.span));
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
    return { violated: entries.some((e) => e.violated === true), decided_by: usedSecond ? "second_opinion" : "fast",
             latency_ms: Math.round(performance.now() - t0), pending, rules: entries };
  }

  return { judge };
}
