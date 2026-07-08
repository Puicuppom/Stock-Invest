import { useEffect, useRef, useState } from "react";

/** Lift compact modals above the mobile software keyboard. */
export function useKeyboardAwareModal(active: boolean) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [offsetY, setOffsetY] = useState(0);

  useEffect(() => {
    if (!active) {
      setOffsetY(0);
      return;
    }

    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const panel = panelRef.current;
      if (!panel) return;

      const margin = 12;
      const visibleTop = vv.offsetTop + margin;
      const visibleBottom = vv.offsetTop + vv.height - margin;
      const rect = panel.getBoundingClientRect();

      let lift = 0;
      if (rect.bottom > visibleBottom) {
        lift = rect.bottom - visibleBottom;
      }
      const topAfterLift = rect.top - lift;
      if (topAfterLift < visibleTop) {
        lift = Math.max(0, rect.top - visibleTop);
      }

      setOffsetY(Math.round(lift));
    };

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("focusin", update);

    const timer = window.setTimeout(update, 50);

    return () => {
      window.clearTimeout(timer);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("focusin", update);
      setOffsetY(0);
    };
  }, [active]);

  return { panelRef, offsetY };
}
