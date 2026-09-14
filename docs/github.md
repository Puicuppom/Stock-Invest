# นำโปรเจกต์ขึ้น GitHub

โฟลเดอร์ที่ใช้คือ Stock ทั้งโฟลเดอร์ โดย repository นี้ตั้ง origin เป็น https://github.com/Puicuppom/Stock-Invest.git อยู่แล้ว

## ก่อนอัปโหลด

1. เปิด Terminal ในโฟลเดอร์ Stock
2. รัน `npm ci`, `npm run check` และ `npm run build`
3. รัน `git status --short` และ `git diff` เพื่อตรวจสิ่งที่จะเปลี่ยน
4. ตรวจว่า `.env.local` ไม่อยู่ในรายการที่จะ commit ด้วย `git check-ignore .env.local`

`.gitignore` ตั้งค่าให้ไม่อัปโหลด node_modules, .next, .env.local, log และไฟล์ผลทดสอบแล้ว ให้เก็บ package-lock.json และ .env.example ไว้ใน Git

## ส่งขึ้น repository เดิม

```bash
git remote -v
git branch --show-current
git add .
git diff --cached --stat
git diff --cached --check
git commit -m "Integrate ReBalance and organize project"
git push -u origin HEAD
```

ตรวจ diff ที่ stage แล้วก่อน commit ด้วย โดยเฉพาะค่าตั้งค่าและข้อมูลส่วนตัว คำสั่ง push จะส่ง branch ปัจจุบันขึ้น origin หากเป็น branch แยก ให้เปิด Pull Request บน GitHub เพื่อรวมเข้ากับ branch หลัก

## ใช้ repository ใหม่

สร้าง repository ว่างบน GitHub แล้วเปลี่ยน origin ด้วย `git remote set-url origin <URL_REPOSITORY_ใหม่>` ก่อนใช้คำสั่ง push ด้านบน

## Deploy

- Vercel: Import repository, เลือก Next.js, ตั้ง Environment Variables ตาม .env.example หากต้องการซิงค์ แล้ว Deploy
- Node.js server: รัน `npm ci`, `npm run build`, `npm start` และอนุญาตการเชื่อมต่อภายนอกสำหรับ Yahoo Finance
- GitHub Pages: ไม่รองรับ API ฝั่งเซิร์ฟเวอร์ของโปรเจกต์นี้โดยตรง
