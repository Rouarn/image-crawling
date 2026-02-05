/**
 * 防抖函数，用于限制函数触发频率
 * @param fn 要防抖的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export const debounce = <T extends unknown[]>(fn: (...args: T) => void, wait = 150) => {
  let t: ReturnType<typeof setTimeout>;
  return function debounced(this: unknown, ...args: T) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
};

/**
 * 将字节数格式化为人类可读的字符串 (B, KB, MB, GB)
 * @param bytes 字节数
 * @returns 格式化后的字符串
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
