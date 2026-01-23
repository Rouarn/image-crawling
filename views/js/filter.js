// 根据输入框内容筛选当前缩略图（使用 jQuery）
export function applyFilter() {
  const q = ((($("#images-filter").val() || "") + "").trim().toLowerCase());
  const $thumbs = $("#images .thumb");
  
  // 使用更高效的批量操作
  if (!q) {
    // 显示所有缩略图
    $thumbs.css("display", "");
  } else {
    // 筛选并显示匹配的缩略图
    $thumbs.each(function () {
      const $thumb = $(this);
      const name = String($thumb.data("name") || "").toLowerCase();
      
      if (name.includes(q)) {
        $thumb.css("display", "");
        // 添加匹配动画
        $thumb.css({
          animation: "fadeIn 0.3s ease"
        });
        
        setTimeout(() => {
          $thumb.css("animation", "");
        }, 300);
      } else {
        $thumb.css("display", "none");
      }
    });
  }
}