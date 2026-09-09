/** Масштаб полоски для одной таблицы: пикселей на единицу, k = min(maxK, available / vmax). */
export function barScale(
  values: readonly (number | null | undefined)[],
  available: number,
  maxK = 20,
): number {
  let vmax = 0;
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value) && value > vmax)
      vmax = value;
  }
  if (vmax <= 0) return maxK;
  return Math.min(maxK, Math.max(0, available) / vmax);
}

/**
 * Шаг делений в пикселях: одно деление = одна единица значения, то есть ровно k.
 * Если k меньше minPx, зазоры слились бы в пунктир — делений нет (0).
 */
export function tickPx(k: number, minPx = 3): number {
  return k >= minPx ? k : 0;
}

/** Значение на 1000 символов; null, если объём неизвестен или нулевой. */
export function perThousand(value: number | null, chars: number | null): number | null {
  if (typeof value !== 'number' || typeof chars !== 'number' || !(chars > 0))
    return null;
  return value / (chars / 1000);
}
