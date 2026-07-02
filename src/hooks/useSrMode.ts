import { useCallback, useEffect, useState } from "react";
import type { SrMode } from "@/lib/types";

export const SR_MODE_KEY = "stock-sr-mode";

export function useSrMode() {
  const [mode, setModeState] = useState<SrMode>("swing");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SR_MODE_KEY);
      if (saved === "swing" || saved === "pivot") {
        setModeState(saved);
      }
    } catch {
      // ignore
    }
    setLoaded(true);
  }, []);

  const setMode = useCallback((next: SrMode) => {
    setModeState(next);
    try {
      localStorage.setItem(SR_MODE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  return { mode, setMode, loaded };
}
