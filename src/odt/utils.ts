export const SVG_VIEWPORT_WIDTH = 7200;
export const SVG_VIEWPORT_HEIGHT = 7200;

export function spaces(num: number) {
  return '                                                                '.substring(0, num || 0);
}

export function inchesToSpaces(value): number {
  if (!value) {
    return 0;
  }
  if (value.endsWith('in')) {
    return Math.floor(parseFloat(value.substring(0, value.length - 2)) / 0.125);
  }
  return 0;
}


export function inchesToPixels(value): number {
  if (!value) {
    return 0;
  }
  if (value.endsWith('in')) {
    return Math.floor(200 * parseFloat(value.substring(0, value.length - 2)));
  }
  if (value.endsWith('em')) {
    return Math.floor(parseFloat(value.substring(0, value.length - 2)) / 0.125);
  }
  return 0;
}

export function fixCharacters(text) {
  return text
    .replace(/’/g, '\'')
    .replace(/“/g, '"')
    .replace(/”/g, '"')
    // eslint-disable-next-line no-control-regex
    .replace(/\x0b/g, ' ')
    .replace(/\u201d/g, '"')
    .replace(/\u201c/g, '"');
}
