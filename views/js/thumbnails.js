import { renderSkeleton } from "./utils.js";
import { applyFilter } from "./filter.js";

/** 创建并返回一个缩略图元素 */
export function createThumbnailElement(filename, onDelete) {
  const $div = $("<div/>").addClass("thumb").data("name", filename);

  // 生成缩略图 URL，添加缓存控制
  const thumbnailUrl =
    encodeURI("/storage/" + filename) + "?t=" + new Date().getTime();

  const $img = $("<img/>").attr({
    loading: "lazy",
    src: thumbnailUrl,
    alt: filename,
    title: filename,
    decoding: "async",
    width: 150,
    height: 150,
  });

  // 添加图片加载状态
  $img
    .on("load", function () {
      $div.addClass("loaded");
    })
    .on("error", function () {
      $div.addClass("error");
      $img.attr(
        "src",
        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E❌%3C/text%3E%3C/svg%3E",
      );
    });

  const $cap = $("<div/>").text(filename);
  const $del = $("<button/>")
    .attr({ type: "button", title: "删除", "aria-label": "删除图片" })
    .addClass("delete-btn")
    .text("🗑️");

  // 添加删除按钮的确认提示
  $del.on("click", async ev => {
    ev.stopPropagation();

    if (!confirm(`确定要删除图片 "${filename}" 吗？`)) {
      return;
    }

    $del.prop("disabled", true);
    $del.text("⏳");

    try {
      await onDelete(filename, $div);
      // 添加删除动画
      $div.css({
        transform: "scale(0.8)",
        opacity: 0,
        transition: "all 0.3s ease",
      });

      setTimeout(() => {
        $div.remove();
      }, 300);
    } catch (error) {
      const msg =
        error?.responseJSON?.error ||
        error?.statusText ||
        error?.message ||
        error;
      alert(`删除失败：${msg}`);
    } finally {
      $del.prop("disabled", false);
      $del.text("🗑️");
    }
  });

  $div.append($img, $cap, $del);
  return $div.get(0);
}

/**
 * 加载已下载图片并渲染到页面
 * 来源：GET /api/images
 */
export async function loadImages() {
  const $box = $("#images");
  if ($box.length) renderSkeleton($box.get(0), 10);

  try {
    // 添加缓存控制，确保获取最新数据
    const cacheBuster = new Date().getTime();
    const data = await $.getJSON(`/api/images?_=${cacheBuster}`);
    $box.empty();
    const groups = data.groups;

    if (Array.isArray(groups) && groups.length) {
      $box.removeClass("images");
      const $controls = $("<div/>").addClass("images-controls");
      const byName = new Map(groups.map(g => [g.dir, g.files || []]));
      let active = groups[0].dir;
      const $grid = $("<div/>").addClass("images");

      const renderGrid = name => {
        $grid.empty();
        const files = byName.get(name) || [];

        if (files.length === 0) {
          const $empty = $("<div/>")
            .addClass("empty-state")
            .html("<p>该目录下暂无图片</p>");
          $grid.append($empty);
          return;
        }

        // 批量创建缩略图元素
        const thumbElements = files.map(f => {
          return createThumbnailElement(f, async (filename, element) => {
            try {
              await $.ajax({
                url: "/api/images",
                method: "DELETE",
                contentType: "application/json",
                data: JSON.stringify({ name: filename }),
              });

              // 更新内存中的文件列表
              byName
                .get(active)
                .splice(byName.get(active).indexOf(filename), 1);
              applyFilter();
            } catch (e) {
              throw e;
            }
          });
        });

        // 一次性添加所有缩略图，减少 DOM 操作
        $grid.append(thumbElements);
        applyFilter();
      };

      groups.forEach(g => {
        const $btn = $("<button/>")
          .attr("type", "button")
          .addClass("tab" + (g.dir === active ? " active" : ""))
          .text(g.dir === "root" ? "根目录" : g.dir);

        $btn.on("click", () => {
          active = g.dir;
          $controls.find(".tab").removeClass("active");
          $btn.addClass("active");

          // 添加切换动画
          $grid.css({
            opacity: 0,
            transform: "translateY(10px)",
          });

          setTimeout(() => {
            renderGrid(active);
            $grid.css({
              opacity: 1,
              transform: "translateY(0)",
              transition: "all 0.3s ease",
            });
          }, 150);
        });

        $controls.append($btn);
      });

      $box.append($controls).append($grid);
      renderGrid(active);
    } else {
      const files = data.files || [];

      if (files.length === 0) {
        const $empty = $("<div/>")
          .addClass("empty-state")
          .html("<p>暂无已下载的图片</p>");
        $box.append($empty);
      } else {
        // 批量创建缩略图元素
        const thumbElements = files.map(f => {
          return createThumbnailElement(f, async (filename, element) => {
            try {
              await $.ajax({
                url: "/api/images",
                method: "DELETE",
                contentType: "application/json",
                data: JSON.stringify({ name: filename }),
              });

              // 更新内存中的文件列表
              data.files.splice(data.files.indexOf(filename), 1);
              applyFilter();
            } catch (e) {
              throw e;
            }
          });
        });

        // 一次性添加所有缩略图，减少 DOM 操作
        $box.append(thumbElements);
        applyFilter();
      }
    }
  } catch (e) {
    console.error(e);
    const $error = $("<div/>")
      .addClass("error-state")
      .html("<p>加载图片失败，请刷新页面重试</p>");
    $box.empty().append($error);
  }
}
