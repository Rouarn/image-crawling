// ES 模块入口：按职责拆分并统一导入
import { debounce } from "./utils.js";
import { setupForm } from "./form.js";
import { loadImages } from "./thumbnails.js";
import { applyFilter } from "./filter.js";
import { setupProgressModal } from "./progress-log.js";
import { setupPreview } from "./preview.js";
import { setupTheme } from "./theme.js";
import { setupBackToTop } from "./back-to-top.js";

$(function () {
  setupForm();
  loadImages().then(() => {});
  const $input = $("#images-filter");
  if ($input.length) $input.on("input", debounce(applyFilter, 120));
  setupTheme();
  setupPreview();
  setupProgressModal();
  setupBackToTop();
});