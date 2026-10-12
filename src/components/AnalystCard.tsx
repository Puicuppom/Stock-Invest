import type { FairValueResult } from "@/lib/types";

const KEY_TH: Record<string, { text: string; tone: "buy" | "hold" | "sell" }> = {
  strong_buy: { text: "ซื้อแรง", tone: "buy" },
  buy: { text: "ซื้อ", tone: "buy" },
  hold: { text: "ถือต่อ", tone: "hold" },
  underperform: { text: "แย่กว่าตลาด", tone: "sell" },
  sell: { text: "ขาย", tone: "sell" },
};

/** เป้าราคา + คำแนะนำนักวิเคราะห์ (แบบ Dime) */
export default function AnalystCard({ value, price, currency }: { value: FairValueResult; price: number; currency: string }) {
  const mean = value.analystTarget;
  const range = value.analystRange;
  const v = value.analystView;
  const buy = v ? v.strongBuy + v.buy : 0, hold = v?.hold ?? 0, sell = v ? v.sell + v.strongSell : 0;
  const total = buy + hold + sell;
  if (mean == null && !total) return null;
  const up = mean != null && price > 0 ? (mean / price - 1) * 100 : null;
  const key = v?.key ? KEY_TH[v.key] : total ? (buy >= hold && buy >= sell ? KEY_TH.buy : sell > hold ? KEY_TH.sell : KEY_TH.hold) : null;
  const lo = range ? Math.min(range.low, price) : null, hi = range ? Math.max(range.high, price) : null;
  // จำกัดให้อยู่ในแถบ (บางครั้งเป้าเฉลี่ยของ Yahoo หลุดช่วงต่ำสุด–สูงสุด)
  const pos = (x: number) => (lo != null && hi != null && hi > lo ? Math.min(100, Math.max(0, ((x - lo) / (hi - lo)) * 100)) : 50);
  const f = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const people = v?.opinions ?? total;
  return (
    <section className="an-card">
      <div className="an-head">
        <span>เป้าราคานักวิเคราะห์</span>
        {people ? <small>{people} คน</small> : null}
      </div>
      {mean != null && (
        <div className="an-mean">
          <b>{f(mean)}</b><small>{currency}</small>
          {up != null && <em className={up >= 0 ? "up" : "down"}>{up >= 0 ? "+" : ""}{up.toFixed(1)}%</em>}
          <span className="an-mean-label">เฉลี่ย</span>
        </div>
      )}
      {range && lo != null && hi != null && (
        <div className="an-range">
          <div className="an-track">
            <i className="an-fill" style={{ left: `${pos(range.low)}%`, width: `${pos(range.high) - pos(range.low)}%` }} />
            {mean != null && <i className="an-tick" style={{ left: `${pos(mean)}%` }} title={`เฉลี่ย ${f(mean)}`} />}
            <i className="an-now" style={{ left: `${pos(price)}%` }} title={`ราคาปัจจุบัน ${f(price)}`} />
          </div>
          <div className="an-range-labels">
            <span>ต่ำสุด <b>{f(range.low)}</b></span>
            <span className="an-now-label">ราคาตอนนี้ {f(price)}</span>
            <span>สูงสุด <b>{f(range.high)}</b></span>
          </div>
        </div>
      )}
      {total > 0 && (
        <div className="an-rec">
          <div className="an-rec-top">
            <span>คำแนะนำ</span>
            {key && <b className={`an-key ${key.tone}`}>{key.text}</b>}
          </div>
          <div className="an-bar" aria-label={`ซื้อ ${buy} ถือ ${hold} ขาย ${sell}`}>
            {buy > 0 && <i className="buy" style={{ flex: buy }} />}
            {hold > 0 && <i className="hold" style={{ flex: hold }} />}
            {sell > 0 && <i className="sell" style={{ flex: sell }} />}
          </div>
          <div className="an-legend">
            <span className="buy">ซื้อ {Math.round(buy / total * 100)}% <small>({buy})</small></span>
            <span className="hold">ถือต่อ {Math.round(hold / total * 100)}% <small>({hold})</small></span>
            <span className="sell">ขาย {Math.round(sell / total * 100)}% <small>({sell})</small></span>
          </div>
        </div>
      )}
    </section>
  );
}
