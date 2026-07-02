# Stock S/R Analyzer

เว็บวิเคราะห์แนวรับ–แนวต้านหุ้น **SET (ไทย)** และ **US** ออกแบบให้ใช้บนมือถือ

## ฟีเจอร์

- เพิ่ม/ลบหุ้นใน Watchlist (เก็บใน localStorage)
- ดึงข้อมูล OHLCV จาก Yahoo Finance
- **Analyst Target** — เป้านักวิเคราะห์ 12 เดือน (Yahoo ≈ Investing.com)
- **Pivot Points** — R1–R3, S1–S3, Pivot
- **Swing High/Low** — โซนแนวรับ/แนวต้านบนกราฟ
- กราฟแท่งเทียน (TradingView Lightweight Charts)
- PWA — Add to Home Screen บนมือถือ

## เริ่มใช้งาน

```bash
npm install
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

## Deploy บน Vercel (ฟรี)

1. Push โปรเจกต์ขึ้น GitHub
2. ไปที่ [vercel.com](https://vercel.com) → **Add New Project**
3. Import repo นี้ → Deploy
4. ได้ URL เช่น `https://your-app.vercel.app`

## การใช้งาน

| ตลาด | ตัวอย่าง | หมายเหตุ |
|------|----------|----------|
| **BKK** | `PTT`, `KBANK`, `META` | หุ้น SET |
| **US** | `AAPL`, `META`, `TSLA` | NASDAQ/NYSE |

**ต้องเลือกตลาด BKK หรือ US ตอนเพิ่มหุ้น** — ชื่อซ้ำกันได้ เช่น META (BKK) กับ META (US) คนละตัว

## โครงสร้าง

```
src/
  app/api/stock/[symbol]/   # API ดึงข้อมูลหุ้น
  components/               # UI components
  hooks/useWatchlist.ts     # Watchlist + localStorage
  lib/                      # Pivot, Swing, symbol resolver
```

## หมายเหตุ

เครื่องมือนี้ใช้เพื่อวิเคราะห์เท่านั้น **ไม่ใช่คำแนะนำการลงทุน**

ข้อมูลจาก Yahoo Finance อาจมี delay — ใช้สำหรับการศึกษาและวิเคราะห์เบื้องต้น
