/**
 * Debounce function to limit the rate at which a function can fire.
 * @param fn The function to debounce
 * @param wait The wait time in milliseconds
 * @returns A debounced version of the function
 */
export const debounce = <T extends unknown[]>(fn: (...args: T) => void, wait = 150) => {
  let t: ReturnType<typeof setTimeout>;
  return function debounced(this: unknown, ...args: T) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
};

/**
 * Format bytes into human readable string (B, KB, MB, GB).
 * @param bytes The number of bytes
 * @returns Formatted string
 */
export const formatBytes = (bytes: number | string | undefined | null): string => {
  const b = Number(bytes || 0);
  if (!Number.isFinite(b) || b <= 0) return '';
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (b >= GB) return `${(b / GB).toFixed(2)} GB`;
  if (b >= MB) return `${(b / MB).toFixed(2)} MB`;
  if (b >= KB) return `${(b / KB).toFixed(0)} KB`;
  return `${b} B`;
};
