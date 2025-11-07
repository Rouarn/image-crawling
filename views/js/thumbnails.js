import { renderSkeleton } from "./utils.js";
import { applyFilter } from "./filter.js";

/** 创建并返回一个缩略图元素 */
export function createThumbnailElement(filename, onDelete) {
  const $div = $("<div/>").addClass("thumb").data("name", filename);
  const $img = $("<img/>").attr({
    loading: "lazy",
    src: encodeURI("/storage/" + filename),
    alt: filename,
    title: filename,
  });
  const $cap = $("<div/>").text(filename);
  const $del = $("<button/>")
    .attr({ type: "button", title: "删除" })
    .addClass("delete-btn")
    .text("🗑️");
  $del.on("click", async ev => {
    ev.stopPropagation();
    $del.prop("disabled", true);
    try {
      await onDelete(filename, $div);
    } finally {
      $del.prop("disabled", false);
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
    const data = await $.getJSON("/api/images");
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
        files.forEach(f => {
          const thumbEl = createThumbnailElement(
            f,
            async (filename, element) => {
              try {
                await $.ajax({
                  url: "/api/images",
                  method: "DELETE",
                  contentType: "application/json",
                  data: JSON.stringify({ name: filename }),
                });
                $(element).remove();
                byName.get(active).splice(byName.get(active).indexOf(filename), 1);
                applyFilter();
              } catch (e) {
                const msg = e?.responseJSON?.error || e?.statusText || e?.message || e;
                alert(`删除失败：${msg}`);
              }
            }
          );
          $grid.append(thumbEl);
        });
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
          renderGrid(active);
        });
        $controls.append($btn);
      });
      $box.append($controls).append($grid);
      renderGrid(active);
    } else {
      (data.files || []).forEach(f => {
        const thumbEl = createThumbnailElement(
          f,
          async (filename, element) => {
            try {
              await $.ajax({
                url: "/api/images",
                method: "DELETE",
                contentType: "application/json",
                data: JSON.stringify({ name: filename }),
              });
              $(element).remove();
              data.files.splice(data.files.indexOf(filename), 1);
              applyFilter();
            } catch (e) {
              const msg = e?.responseJSON?.error || e?.statusText || e?.message || e;
              alert(`删除失败：${msg}`);
            }
          }
        );
        $box.append(thumbEl);
      });
      applyFilter();
    }
  } catch (e) {
    console.error(e);
  }
}