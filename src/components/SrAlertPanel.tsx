import type { SrAlertSettings } from "@/hooks/useSrAlerts";

interface SrAlertPanelProps {
  settings: SrAlertSettings;
  permission: NotificationPermission | "unsupported";
  srMode: "swing" | "pivot";
  onToggle: (enabled: boolean) => void;
  onToleranceChange: (percent: number) => void;
}

const TOLERANCE_OPTIONS = [0.5, 1, 1.5, 2];

export default function SrAlertPanel({
  settings,
  permission,
  srMode,
  onToggle,
  onToleranceChange,
}: SrAlertPanelProps) {
  const modeLabel = srMode === "swing" ? "ถือยาว (Swing)" : "เทรดสั้น (Pivot)";

  return (
    <section className="alert-card">
      <div className="alert-header">
        <div>
          <h3 className="section-title">แจ้งเตือน แนวรับ/ต้าน</h3>
          <p className="fv-subtitle">เช็คทุก 3 นาที · โหมด {modeLabel}</p>
        </div>
        <label className="alert-toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="alert-toggle-ui" aria-hidden />
        </label>
      </div>

      <div className="alert-tolerance">
        <span className="alert-tolerance-label">แจ้งเมื่อใกล้ระดับ</span>
        <div className="alert-tolerance-options">
          {TOLERANCE_OPTIONS.map((value) => (
            <button
              key={value}
              type="button"
              className={`alert-tolerance-btn${
                settings.tolerancePercent === value ? " active" : ""
              }`}
              onClick={() => onToleranceChange(value)}
              disabled={!settings.enabled}
            >
              ±{value}%
            </button>
          ))}
        </div>
      </div>

      {permission === "denied" && (
        <p className="alert-note alert-note-warn">
          เบราว์เซอร์บล็อกการแจ้งเตือน — เปิดใน Settings ของเบราว์เซอร์
        </p>
      )}

      <p className="hint-text alert-hint">
        ตรวจทุกหุ้นใน Watchlist · แจ้งซ้ำระดับเดิมไม่เกินทุก 6 ชม. ·
        ต้องเปิดแอp/แท็บค้างไว้
      </p>
    </section>
  );
}
