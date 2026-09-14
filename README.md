# InvestPui

เว็บวิเคราะห์หุ้น SET/US และจัดสัดส่วนพอร์ตในโปรเจกต์เดียว สร้างด้วย Next.js, React และ TypeScript

## ฟังก์ชัน

- **วิเคราะห์หุ้น** (`/`): Watchlist, กราฟราคา, แนวรับ/แนวต้านแบบ Pivot และ Swing, ประเมิน Fair Value จากหลายโมเดล และแผนซื้อขาย
- **ปรับพอร์ต** (`/rebalance`): จัดกลุ่มสินทรัพย์ กำหนดสัดส่วนเป้าหมาย ติดตามกำไร และคำนวณปรับพอร์ต
- เก็บ Watchlist และพอร์ตใน localStorage โดยแยกข้อมูลกัน
- รองรับการซิงค์พอร์ตผ่าน Supabase ที่ตั้งค่าเพิ่มเติมได้

## เริ่มใช้งาน

ใช้ Node.js 22 LTS และ npm

```bash
npm ci
npm run dev
```

เปิด [localhost:3000](http://localhost:3000) ใช้งานแบบบันทึกในเครื่องได้ทันทีโดยไม่ต้องตั้งค่า Supabase

หากต้องการซิงค์ ให้คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกค่าของคุณ ดู [การตั้งค่าซิงค์](docs/rebalance-sync.md)

## คำสั่ง

| คำสั่ง | การทำงาน |
| --- | --- |
| `npm run dev` | เปิดเซิร์ฟเวอร์พัฒนา |
| `npm run check` | ตรวจ ESLint, TypeScript และไวยากรณ์ JavaScript ของ ReBalance |
| `npm run build` | สร้าง production build |
| `npm start` | เปิด production build หลัง build สำเร็จ |

เซิร์ฟเวอร์ต้องเชื่อมต่อ Yahoo Finance ได้ และขั้นตอน build ต้องดาวน์โหลด Google Fonts ได้ หากพบ `fetch failed` ให้ตรวจเครือข่ายหรือข้อจำกัด sandbox ของเซิร์ฟเวอร์

## โครงสร้าง

```text
src/
  app/
    page.tsx                  หน้าวิเคราะห์หุ้น
    rebalance/page.tsx        หน้าปรับพอร์ต
    api/
      stock/route.ts          API ราคาเพื่อใช้ใน ReBalance
      stock/[symbol]/         API ข้อมูลหุ้นและกราฟ
      rebalance-config/       ส่งค่าซิงค์ที่เปิดเผยต่อเบราว์เซอร์
  components/                 ส่วนประกอบหน้าเว็บและเมนู
  hooks/                      การจัดการสถานะและ Watchlist
  lib/                        ดึงข้อมูลและคำนวณการวิเคราะห์
public/
  rebalance-app/
    index.html                โครงหน้า ReBalance
    styles.css                รูปแบบหน้า ReBalance
    app.js                    การคำนวณ จัดการพอร์ต และซิงค์
  icon.svg
  manifest.json
scripts/                      สคริปต์ช่วยเปรียบเทียบ Fair Value
docs/                        คู่มือ GitHub และการตั้งค่าซิงค์
.env.example                  ตัวอย่างการตั้งค่า ไม่มีค่าจริง
```

ReBalance เปิดภายใน iframe เพื่อแยก CSS และสคริปต์จากหน้าวิเคราะห์หุ้น โดยใช้ API ของ Next.js ตัวเดียวกัน ไม่ต้องใช้โฟลเดอร์ ReBalanceStock ต้นฉบับ

## นำขึ้น GitHub และ Deploy

ทำตาม [คู่มือ GitHub](docs/github.md) โปรเจกต์ต้องใช้โฮสต์ที่รัน Next.js ฝั่งเซิร์ฟเวอร์ได้ เช่น Vercel หรือ Node.js server เพราะมี API จึงใช้ GitHub Pages โดยตรงไม่ได้

เมื่อใช้ Vercel ให้ Import repository แล้วตั้ง Environment Variables หากต้องการซิงค์ จากนั้น Deploy โดยใช้ค่า Next.js ที่ระบบตรวจพบ

## ข้อมูลและข้อจำกัด

- หุ้นไทยใช้ตลาด BKK เช่น PTT; หุ้นสหรัฐใช้ US เช่น AAPL ชื่อซ้ำกันได้ จึงต้องเลือกตลาดให้ถูกต้อง
- ราคาอ้างอิงราคาปิดล่าสุดจาก Yahoo Finance อาจล่าช้า ไม่ใช่ราคาสดสำหรับส่งคำสั่งซื้อขาย
- Fair Value เป็นผลคำนวณของเครื่องมือ ไม่รับรองว่าตรงกับบริการภายนอก
- localStorage แยกตามเว็บไซต์/โดเมน ข้อมูลจากเว็บเดิมจึงไม่ย้ายเองเมื่อเปลี่ยนโดเมน
- ระบบซิงค์เดิมไม่มีล็อกอิน อ่านรายละเอียดก่อนเปิดใช้งานในเว็บไซต์สาธารณะ
- เครื่องมือนี้ใช้ประกอบการวิเคราะห์ ไม่ใช่คำแนะนำการลงทุน
