const isWideCodePoint = (value: number) =>
  value >= 0x1100 &&
  (value <= 0x115f ||
    value === 0x2329 ||
    value === 0x232a ||
    (value >= 0x2e80 && value <= 0x3247 && value !== 0x303f) ||
    (value >= 0x3250 && value <= 0x4dbf) ||
    (value >= 0x4e00 && value <= 0xa4c6) ||
    (value >= 0xa960 && value <= 0xa97c) ||
    (value >= 0xac00 && value <= 0xd7a3) ||
    (value >= 0xf900 && value <= 0xfaff) ||
    (value >= 0xfe10 && value <= 0xfe19) ||
    (value >= 0xfe30 && value <= 0xfe6b) ||
    (value >= 0xff01 && value <= 0xff60) ||
    (value >= 0xffe0 && value <= 0xffe6) ||
    (value >= 0x1b000 && value <= 0x1b001) ||
    (value >= 0x1f200 && value <= 0x1f251) ||
    (value >= 0x20000 && value <= 0x3fffd));

export const truncateTextByWidth = (
  value: string,
  limit: number,
  suffix = '',
) => {
  let width = 0;
  let result = '';

  for (const char of value) {
    const charWidth = isWideCodePoint(char.codePointAt(0) ?? 0) ? 2 : 1;
    if (width + charWidth > limit) {
      return `${result}${suffix}`;
    }

    result += char;
    width += charWidth;
  }

  return value;
};
