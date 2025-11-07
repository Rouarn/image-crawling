// 工具与常用选择器缓存
export const $doc = $(document);
export const $win = $(window);
export const $body = $(document.body);

export const debounce = (fn, wait = 150) => {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
};

export const formatBytes = (bytes) => {
  const b = Number(bytes || 0);
  if (!isFinite(b) || b <= 0) return "";
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  if (b >= GB) return `${(b / GB).toFixed(2)} GB`;
  if (b >= MB) return `${(b / MB).toFixed(2)} MB`;
  if (b >= KB) return `${(b / KB).toFixed(0)} KB`;
  return `${b} B`;
};

/** 渲染骨架屏占位（使用 jQuery） */
export function renderSkeleton(box, count = 8) {
  if (!box) return;
  const $box = $(box);
  let html = "";
  for (let i = 0; i < count; i++) {
    html +=
      '<div class="thumb">' +
      '<div class="skeleton skeleton-thumb"></div>' +
      '<div class="skeleton" style="height:12px;border-radius:6px;margin-top:8px"></div>' +
      '</div>';
  }
  $box.html(html);
}