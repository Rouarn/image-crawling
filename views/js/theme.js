import { $body } from "./utils.js";

/** 初始化主题切换与持久化 */
export function setupTheme() {
  const $btnTheme = $("#theme-toggle");
  const applyTheme = theme => {
    $body.toggleClass("dark", theme === "dark");
    localStorage.setItem("theme", theme);
    if ($btnTheme.length) $btnTheme.text(theme === "dark" ? "☀️" : "🌙");
  };
  const saved = localStorage.getItem("theme") || "light";
  applyTheme(saved);
  if ($btnTheme.length) {
    $btnTheme.on("click", () => {
      const current = $body.hasClass("dark") ? "dark" : "light";
      applyTheme(current === "dark" ? "light" : "dark");
    });
  }
}