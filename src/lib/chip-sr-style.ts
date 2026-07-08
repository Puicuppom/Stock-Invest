export function chipSrClass(
  nearResistance: boolean,
  nearSupport: boolean
): string {
  if (nearResistance && nearSupport) return "chip-near-both";
  if (nearResistance) return "chip-near-res";
  if (nearSupport) return "chip-near-sup";
  return "";
}

export function chipSrAriaLabel(
  nearResistance: boolean,
  nearSupport: boolean
): string | undefined {
  if (nearResistance && nearSupport) return "ใกล้แนวต้านและแนวรับ";
  if (nearResistance) return "ใกล้แนวต้าน";
  if (nearSupport) return "ใกล้แนวรับ";
  return undefined;
}
