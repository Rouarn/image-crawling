import { formatBytes } from "./utils.js";

/** 预览模态交互与渲染 */
export function setupPreview() {
  const $modal = $("#preview-modal");
  const $modalImg = $("#preview-img");
  const $closeBtn = $modal.find(".close");
  const $prevBtn = $("#preview-prev");
  const $nextBtn = $("#preview-next");
  const $nameEl = $("#preview-name");
  const $indexEl = $("#preview-index");
  const $sizeEl = $("#preview-size");
  const $openEl = $("#preview-open");
  const $memEl = $("#preview-mem");

  let previewState = { list: [], index: -1 };
  const collectVisibleThumbs = () => $("#images .thumb:visible").toArray();
  const updatePreview = () => {
    const el = previewState.list[previewState.index];
    if (!el) return;
    const $el = $(el);
    const src = $el.find("img").attr("src");
    const name = String($el.data("name") || $el.find("img").attr("alt") || "");
    const expectedName = name;
    $modalImg.attr("src", src);
    if ($nameEl.length) $nameEl.text(name);
    if ($indexEl.length) $indexEl.text(`${previewState.index + 1}/${previewState.list.length}`);
    if ($openEl.length) $openEl.attr("href", src);
    if ($sizeEl.length) $sizeEl.text("");
    if ($memEl.length) $memEl.text("");
    // 请求磁盘大小（字节）
    $.getJSON(`/api/images/info?name=${encodeURIComponent(name)}`)
      .done((info) => {
        // 防止异步结果覆盖其他图片的显示
        if (expectedName !== name) return;
        if ($memEl.length) $memEl.text(formatBytes(info?.bytes));
      })
      .fail(() => {
        if ($memEl.length) $memEl.text("");
      });
    $modalImg.off("load.preview").one("load.preview", function () {
      const w = this.naturalWidth || 0;
      const h = this.naturalHeight || 0;
      if ($sizeEl.length) $sizeEl.text(w && h ? `${w}×${h}` : "");
    });
  };
  const openPreviewByIndex = idx => {
    const list = collectVisibleThumbs();
    if (!list.length) return;
    previewState.list = list;
    previewState.index = Math.max(0, Math.min(idx, list.length - 1));
    updatePreview();
    $modal.addClass("show").attr({ "aria-hidden": "false", "aria-modal": "true" });
  };
  const closePreview = () => {
    if ($modal.length === 0 || $modalImg.length === 0) return;
    $modal.removeClass("show").attr({ "aria-hidden": "true", "aria-modal": "false" });
    $modalImg.attr("src", "");
    previewState = { list: [], index: -1 };
  };
  $("#images").on("click", ".thumb", function () {
    const visible = collectVisibleThumbs();
    const idx = visible.indexOf(this);
    if (idx >= 0) openPreviewByIndex(idx);
  });
  if ($closeBtn.length) $closeBtn.on("click", closePreview);
  if ($modal.length) {
    $modal.on("click", ev => { if (ev.target === $modal.get(0)) closePreview(); });
  }
  if ($prevBtn.length) {
    $prevBtn.on("click", () => {
      const len = previewState.list.length;
      if (!len) return;
      previewState.index = (previewState.index - 1 + len) % len;
      updatePreview();
    });
  }
  if ($nextBtn.length) {
    $nextBtn.on("click", () => {
      const len = previewState.list.length;
      if (!len) return;
      previewState.index = (previewState.index + 1) % len;
      updatePreview();
    });
  }
}