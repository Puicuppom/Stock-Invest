import { useCallback, useEffect, useState } from "react";

export const SR_TAG_SETTINGS_KEY = "stock-sr-tag-settings";

export interface SrTagSettings {
  tolerancePercent: number;
}

const DEFAULT_SETTINGS: SrTagSettings = {
  tolerancePercent: 1,
};

const TOLERANCE_OPTIONS = [0.5, 1, 1.5, 2] as const;

function loadSettings(): SrTagSettings {
  try {
    const raw = localStorage.getItem(SR_TAG_SETTINGS_KEY);
    if (!raw) {
      const legacy = localStorage.getItem("stock-sr-alert-settings");
      if (legacy) {
        const parsed = JSON.parse(legacy) as { tolerancePercent?: number };
        if (
          typeof parsed.tolerancePercent === "number" &&
          parsed.tolerancePercent > 0
        ) {
          return { tolerancePercent: parsed.tolerancePercent };
        }
      }
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<SrTagSettings>;
    return {
      tolerancePercent:
        typeof parsed.tolerancePercent === "number" &&
        parsed.tolerancePercent > 0
          ? parsed.tolerancePercent
          : DEFAULT_SETTINGS.tolerancePercent,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSrTagSettings() {
  const [settings, setSettingsState] = useState<SrTagSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSettingsState(loadSettings());
    setLoaded(true);
  }, []);

  const setTolerance = useCallback((tolerancePercent: number) => {
    const next = { tolerancePercent };
    setSettingsState(next);
    localStorage.setItem(SR_TAG_SETTINGS_KEY, JSON.stringify(next));
  }, []);

  return {
    settings,
    loaded,
    setTolerance,
    toleranceOptions: TOLERANCE_OPTIONS,
  };
}
