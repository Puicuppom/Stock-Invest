/** ป๊อปอัปแจ้งผลแบบเดียวกันทุกหน้า (ตัวแสดงอยู่ใน /ptr.js) · ถ้ายังโหลดไม่เสร็จ จะเก็บไว้แสดงทีหลัง */
export function appToast(msg: string) {
  const w = window as Window & { __appToast?: (m: string) => void; __pendingToast?: string };
  if (w.__appToast) w.__appToast(msg);
  else w.__pendingToast = msg;
}
export const nowHHMM = () => new Date().toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
