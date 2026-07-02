import { useCallback, useEffect, useState } from "react";

export const SR_ALERT_SETTINGS_KEY = "stock-sr-alert-settings";
export const SR_ALERT_COOLDOWN_KEY = "stock-sr-alert-cooldown";

export interface SrAlertSettings {
  enabled: boolean;
  tolerancePercent: number;
}

const DEFAULT_SETTINGS: SrAlertSettings = {
  enabled: false,
  tolerancePercent: 1,
};

const COOLDOWN_MS = 6 * 60 * 60 * 1000;

function loadSettings(): SrAlertSettings {
  try {
    const raw = localStorage.getItem(SR_ALERT_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<SrAlertSettings>;
    return {
      enabled: parsed.enabled === true,
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

function loadCooldowns(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SR_ALERT_COOLDOWN_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

export function srAlertCooldownKey(
  stockId: string,
  kind: "support" | "resistance",
  levelPrice: number
): string {
  return `${stockId}:${kind}:${levelPrice.toFixed(2)}`;
}

export function useSrAlerts() {
  const [settings, setSettingsState] = useState<SrAlertSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");

  useEffect(() => {
    setSettingsState(loadSettings());
    if (typeof Notification !== "undefined") {
      setPermission(Notification.permission);
    }
    setLoaded(true);
  }, []);

  const persistSettings = useCallback((next: SrAlertSettings) => {
    setSettingsState(next);
    localStorage.setItem(SR_ALERT_SETTINGS_KEY, JSON.stringify(next));
  }, []);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        persistSettings({ ...settings, enabled: false });
        return true;
      }

      if (typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
          const result = await Notification.requestPermission();
          setPermission(result);
          if (result !== "granted") {
            persistSettings({ ...settings, enabled: false });
            return false;
          }
        } else if (Notification.permission === "denied") {
          return false;
        }
      }

      persistSettings({ ...settings, enabled: true });
      return true;
    },
    [persistSettings, settings]
  );

  const setTolerance = useCallback(
    (tolerancePercent: number) => {
      persistSettings({ ...settings, tolerancePercent });
    },
    [persistSettings, settings]
  );

  const shouldNotify = useCallback((key: string): boolean => {
    const cooldowns = loadCooldowns();
    const last = cooldowns[key];
    if (last != null && Date.now() - last < COOLDOWN_MS) {
      return false;
    }
    cooldowns[key] = Date.now();
    localStorage.setItem(SR_ALERT_COOLDOWN_KEY, JSON.stringify(cooldowns));
    return true;
  }, []);

  return {
    settings,
    loaded,
    permission,
    setEnabled,
    setTolerance,
    shouldNotify,
  };
}

export function pushBrowserNotification(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, tag: "stock-sr-alert" });
  } catch {
    // ignore unsupported contexts
  }
}
