import { useEffect, useState } from "react";

interface Props {
  /** Re-resolved on every layout pass: hosts replace their composer node. */
  findComposer: () => HTMLElement | null;
  paused: boolean;
}

const GAP_PX = 8;
const RELAYOUT_MS = 500;

/**
 * Small "Pretzel on" chip pinned to the top-right corner of the prompt input,
 * so users can see protection is active without opening the popup. It never
 * takes pointer events, so it cannot interfere with the host page.
 */
export function StatusChip({ findComposer, paused }: Props) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    let frame = 0;
    const layout = () => {
      frame = 0;
      const el = findComposer();
      const rect = el?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
        setPos((p) => (p === null ? p : null));
        return;
      }
      const top = Math.round(rect.top - GAP_PX - 24);
      const right = Math.round(window.innerWidth - rect.right);
      setPos((p) => (p && p.top === top && p.right === right ? p : { top: Math.max(top, 4), right }));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(layout); };

    layout();
    const interval = setInterval(schedule, RELAYOUT_MS);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  }, [findComposer]);

  if (!pos) return null;
  return (
    <div
      className={`mykka-chip${paused ? " mykka-chip-paused" : ""}`}
      style={{ top: pos.top, right: pos.right }}
      role="status"
    >
      <span className="mykka-chip-dot" />
      {paused ? "Pretzel paused" : "Pretzel on"}
    </div>
  );
}
