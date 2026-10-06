import { analyzeReversal, type ReversalSignal } from "@/lib/reversal";
import type { StockData } from "@/lib/types";

const ICON = { yes: "✓", partial: "●", no: "✗" } as const;
const STATE_LABEL = { yes: "ผ่าน", partial: "เริ่มเห็น", no: "ยังไม่มี" } as const;

function SignalRow({ signal }: { signal: ReversalSignal }) {
  return (
    <li className={`rev-row rev-${signal.state}`}>
      <span className="rev-icon" aria-label={STATE_LABEL[signal.state]}>{ICON[signal.state]}</span>
      <div>
        <p className="rev-label">{signal.label}</p>
        <p className="rev-detail">{signal.detail}</p>
      </div>
    </li>
  );
}

export default function ReversalCard({ data }: { data: StockData }) {
  const result = analyzeReversal(data);
  if (!result) return null;
  const early = result.signals.filter(s => s.group === "early");
  const confirm = result.signals.filter(s => s.group === "confirm");
  return (
    <section className="reversal-card">
      <div className="trade-plan-header">
        <div>
          <h3 className="section-title">สัญญาณกลับตัวขึ้น</h3>
          <p className="fv-subtitle">จากราคาปิดรายวัน · คะแนน {result.score}/7</p>
        </div>
        <span className={`rev-verdict rev-verdict-${result.verdictKind}`}>{result.verdict}</span>
      </div>
      {result.context && <p className="rev-context">{result.context}</p>}
      <p className="rev-group">สัญญาณเริ่มต้น · มักเกิดแถวจุดต่ำ</p>
      <ul className="rev-list">{early.map(s => <SignalRow key={s.label} signal={s} />)}</ul>
      <p className="rev-group">สัญญาณยืนยัน · เกิดหลังราคาเริ่มกลับตัว</p>
      <ul className="rev-list">{confirm.map(s => <SignalRow key={s.label} signal={s} />)}</ul>
      <p className="rev-foot">✓ ผ่าน = 1 คะแนน · ● เริ่มเห็น = 0.5 · ไม่มีสัญญาณใดแม่นทุกครั้ง ควรใช้คู่กับจุดตัดขาดทุนใต้แนวรับ</p>
    </section>
  );
}
