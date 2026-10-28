/** ไอคอนเส้นมน (ใช้ร่วมกันทั้งแอป) */
export function StarIcon({ filled = false, size = 22 }: { filled?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 3.6c.3 0 .6.2.7.5l2.1 4.3 4.7.7c.7.1 1 1 .5 1.4l-3.4 3.3.8 4.7c.1.7-.6 1.2-1.2.9L12 17.2l-4.2 2.2c-.6.3-1.3-.2-1.2-.9l.8-4.7-3.4-3.3c-.5-.5-.2-1.3.5-1.4l4.7-.7 2.1-4.3c.1-.3.4-.5.7-.5z" />
    </svg>
  );
}

export function PlusIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
