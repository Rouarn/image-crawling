// 根据输入框内容筛选当前缩略图（使用 jQuery）
export function applyFilter() {
  const q = ((($("#images-filter").val() || "") + "").trim().toLowerCase());
  $("#images .thumb").each(function () {
    const name = String($(this).data("name") || "").toLowerCase();
    $(this).css("display", q ? (name.includes(q) ? "" : "none") : "");
  });
}