// 进度日志工具：统一显示/隐藏/清空与渲染逻辑
export const progressLog = {
  getBox() {
    return $("#progress");
  },
  show() {
    const $box = this.getBox();
    const $modal = $("#progress-modal");
    if ($box.length === 0 || $modal.length === 0) return;
    $box.removeClass("hidden").css("display", "");
    $modal.addClass("show").attr({ "aria-hidden": "false", "aria-modal": "true" });
  },
  hide() {
    const $box = this.getBox();
    const $modal = $("#progress-modal");
    if ($box.length === 0 || $modal.length === 0) return;
    $box.addClass("hidden").css("display", "none");
    $modal.removeClass("show").attr({ "aria-hidden": "true", "aria-modal": "false" });
  },
  clear() {
    const $box = this.getBox();
    if ($box.length === 0) return;
    $box.empty();
  },
  nowStr() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  },
  icons: {
    plan: "🗂️",
    page: "📄",
    fallback: "🛡️",
    page_done: "✅",
    discover: "🔎",
    complete: "🎉",
    error: "⚠️",
  },
  append(type, msg) {
    const $box = this.getBox();
    if ($box.length === 0) return;
    const nearBottom = $box.prop("scrollTop") + $box.prop("clientHeight") >= $box.prop("scrollHeight") - 8;
    const $row = $("<div/>").addClass(`log-item log-${type}`);
    const $icon = $("<span/>").addClass("icon").text(this.icons[type] || "ℹ️");
    const $text = $("<span/>").addClass("text").text(String(msg || ""));
    const $time = $("<span/>").addClass("time").text(this.nowStr());
    $row.append($icon, $text, $time);
    $box.append($row);
    const maxItems = 300;
    while ($box.children().length > maxItems) {
      $box.children().first().remove();
    }
    if (nearBottom) {
      $box.prop("scrollTop", $box.prop("scrollHeight"));
    }
  },
};

// 进度模态关闭交互
export function setupProgressModal() {
  const $progressModal = $("#progress-modal");
  const $progressCloseBtn = $progressModal.find(".close");
  const closeProgress = () => progressLog.hide();
  if ($progressCloseBtn.length) $progressCloseBtn.on("click", closeProgress);
  if ($progressModal.length) {
    $progressModal.on("click", ev => {
      if (ev.target === $progressModal.get(0)) closeProgress();
    });
  }
}