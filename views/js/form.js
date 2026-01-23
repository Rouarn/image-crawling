import { progressLog } from "./progress-log.js";
import { loadImages } from "./thumbnails.js";

/**
 * 初始化抓取表单交互：
 * - 根据 URL 自动派生输出目录（outDir），避免用户重复输入；
 * - 监听提交并组装 options，发送到 /api/crawl；
 * - 展示状态文本与错误信息，并在成功后刷新图片列表。
 */
export function setupForm() {
  const $form = $("#crawl-form");
  if ($form.length === 0) return;

  const $urlInput = $form.find('input[name="url"]');
  const $outDirInput = $form.find('input[name="outDir"]');
  const $status = $("#status");
  const $btn = $form.find('button[type="submit"]');

  // 自动生成输出目录
  const deriveOutDir = raw => {
    if (!raw) return "";
    let pathname;
    try {
      pathname = new URL(raw).pathname || "";
    } catch {
      const stripped = String(raw).split("?")[0].split("#")[0];
      const idx = stripped.lastIndexOf("/");
      pathname = idx >= 0 ? stripped.slice(idx) : stripped;
    }
    pathname = pathname.replace(/\/+$/, "");
    let segment = pathname.split("/").filter(Boolean).pop() || "";
    segment = segment.replace(/\.[^./?#]+$/, "");
    if (!segment) {
      try {
        segment = new URL(raw).hostname.replace(/^www\./, "");
      } catch {}
    }
    segment = segment
      .trim()
      .replace(/[^\w-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase();
    return segment || "";
  };

  // URL 输入时自动填充输出目录
  if ($urlInput.length && $outDirInput.length) {
    $urlInput.on("input", () => {
      const v = String($urlInput.val() || "").trim();
      if (!v) {
        $outDirInput.val("");
        $outDirInput.data("autofill", "");
        return;
      }

      const derived = deriveOutDir(v);
      if (!derived) return;

      const prev = String($outDirInput.val() || "").trim();
      if (!prev || $outDirInput.data("autofill") === "1") {
        $outDirInput.val(derived);
        $outDirInput.data("autofill", "1");
        // 添加填充动画
        $outDirInput.css({
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          transition: "background-color 0.3s ease",
        });

        setTimeout(() => {
          $outDirInput.css("backgroundColor", "");
        }, 1000);
      }
    });

    $urlInput.on("blur", () => {
      const v = String($urlInput.val() || "").trim();
      if (!String($outDirInput.val() || "").trim()) {
        const derived = deriveOutDir(v);
        if (derived) {
          $outDirInput.val(derived);
          $outDirInput.data("autofill", "1");
        }
      }
    });

    $outDirInput.on("input", () => {
      $outDirInput.data("autofill", "");
    });
  }

  // 页码联动
  const $maxPagesInput = $form.find('input[name="maxPages"]');
  const $startPageInput = $form.find('input[name="startPage"]');
  const $endPageInput = $form.find('input[name="endPage"]');

  if ($maxPagesInput.length && $startPageInput.length && $endPageInput.length) {
    const applyFromMaxPages = () => {
      const v = Number($maxPagesInput.val());
      if (!Number.isFinite(v) || v < 1) return;

      $startPageInput.val("1");
      $endPageInput.val(String(v));
    };

    $maxPagesInput.on("input", applyFromMaxPages);
    $maxPagesInput.on("blur", applyFromMaxPages);
  }

  // 插入页码占位符
  const $insertBtn = $("#insert-page-placeholder");
  const $pagePatternInput = $form.find('input[name="pagePattern"]');

  if ($insertBtn.length && $pagePatternInput.length) {
    $insertBtn.on("click", ev => {
      ev.preventDefault();

      const el = $pagePatternInput.get(0);
      const placeholder = "{page}";

      el.focus();

      const value = el.value || "";
      const start =
        typeof el.selectionStart === "number"
          ? el.selectionStart
          : value.length;
      const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;

      if (!value.includes(placeholder)) {
        el.value = value.slice(0, start) + placeholder + value.slice(end);
        const caret = start + placeholder.length;
        try {
          el.setSelectionRange(caret, caret);
        } catch {}
      } else {
        const idx = value.indexOf(placeholder);
        const caret = idx + placeholder.length;
        try {
          el.setSelectionRange(caret, caret);
        } catch {}
      }

      try {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } catch {}

      const sp = $form.find('input[name="startPage"]').get(0);
      const ep = $form.find('input[name="endPage"]').get(0);
      const mp = $form.find('input[name="maxPages"]').get(0);

      if (sp && !sp.value) sp.value = "1";

      const mv = mp ? Number(mp.value) : NaN;
      if (ep && !ep.value && Number.isFinite(mv) && mv >= 1)
        ep.value = String(mv);

      // 添加按钮点击反馈
      $insertBtn.css({
        transform: "scale(0.95)",
        transition: "transform 0.1s ease",
      });

      setTimeout(() => {
        $insertBtn.css("transform", "");
      }, 100);
    });
  }

  // 表单验证
  const validateForm = () => {
    let isValid = true;
    const $url = $form.find('input[name="url"]');
    const urlValue = $url.val().trim();

    // 重置所有错误状态
    $form.find("input, textarea").removeClass("error");
    $form.find(".error-message").remove();

    // 验证 URL
    if (!urlValue) {
      showError($url, "请输入目标页面 URL");
      isValid = false;
    } else if (!isValidUrl(urlValue)) {
      showError($url, "请输入有效的 URL 地址");
      isValid = false;
    }

    // 验证数字输入
    const numberFields = [
      { name: "maxPages", min: 1 },
      { name: "concurrency", min: 1 },
      { name: "pageDelayMs", min: 0 },
      { name: "startPage", min: 1 },
      { name: "endPage", min: 1 },
    ];

    numberFields.forEach(field => {
      const $input = $form.find(`input[name="${field.name}"]`);
      if ($input.length) {
        const value = $input.val().trim();
        if (value) {
          const numValue = Number(value);
          if (isNaN(numValue) || numValue < field.min) {
            showError($input, `请输入大于或等于 ${field.min} 的数字`);
            isValid = false;
          }
        }
      }
    });

    // 验证 JSON 格式的请求头
    const $headers = $form.find('textarea[name="headers"]');
    const headersValue = $headers.val().trim();

    if (headersValue) {
      try {
        JSON.parse(headersValue);
      } catch {
        showError($headers, "请输入有效的 JSON 格式");
        isValid = false;
      }
    }

    return isValid;
  };

  // 显示错误信息
  const showError = ($input, message) => {
    $input.addClass("error");

    // 检查是否已有错误信息
    if (!$input.next(".error-message").length) {
      const $error = $("<div/>").addClass("error-message").text(message);
      $input.after($error);
    }
  };

  // 验证 URL 格式
  const isValidUrl = url => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // 表单提交
  $form.on("submit", async ev => {
    ev.preventDefault();

    // 验证表单
    if (!validateForm()) {
      $status.text("请检查表单中的错误").attr("class", "status error");
      return;
    }

    // 禁用按钮并显示加载状态
    $btn.prop("disabled", true);
    $btn.html('<span class="loading">⏳</span> 正在抓取...');
    $status.text("正在准备抓取...").attr("class", "status");

    // 清空并显示进度日志
    progressLog.clear();
    progressLog.show();

    // 收集表单数据
    const formData = new FormData($form.get(0));
    const url = formData.get("url");
    let headersObj;

    const headersText = (
      $form.find('textarea[name="headers"]').val() || ""
    ).trim();
    if (headersText) {
      try {
        const parsed = JSON.parse(headersText);
        if (parsed && typeof parsed === "object") {
          headersObj = parsed;
        }
      } catch (e) {
        showError(
          $form.find('textarea[name="headers"]'),
          "请输入有效的 JSON 格式",
        );
        $status.text("错误：请求头 JSON 无效").attr("class", "status error");
        $btn.prop("disabled", false);
        $btn.text("开始抓取");
        return;
      }
    }

    // 构建选项
    const options = {
      outDir: formData.get("outDir") || undefined,
      maxPages: Number(formData.get("maxPages")) || undefined,
      concurrency: Number(formData.get("concurrency")) || undefined,
      pageDelayMs: Number(formData.get("pageDelayMs")) || undefined,
      pagePattern: formData.get("pagePattern") || undefined,
      startPage: formData.get("startPage")
        ? Number(formData.get("startPage"))
        : undefined,
      endPage: formData.get("endPage")
        ? Number(formData.get("endPage"))
        : undefined,
      useHeadless:
        $form.find('input[name="useHeadless"]').get(0)?.checked || undefined,
      headers: headersObj,
    };

    try {
      const qs = new URLSearchParams();
      qs.set("url", String(url || ""));

      Object.entries(options).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        if (k === "headers") {
          try {
            qs.set("headers", JSON.stringify(v));
          } catch {}
        } else {
          qs.set(k, String(v));
        }
      });

      // 建立 SSE 连接
      const es = new EventSource(`/api/crawl/stream?${qs.toString()}`);

      es.onmessage = async ev => {
        try {
          const payload = JSON.parse(ev.data);

          if (payload.type === "plan") {
            progressLog.append("plan", `计划抓取 ${payload.pages} 页`);
            $status
              .text(`计划抓取 ${payload.pages} 页`)
              .attr("class", "status");
          } else if (payload.type === "page") {
            progressLog.append(
              "page",
              `抓取第 ${payload.index}/${payload.total} 页：${payload.url}`,
            );
            $status
              .text(`抓取第 ${payload.index}/${payload.total} 页`)
              .attr("class", "status");
          } else if (payload.type === "fallback") {
            progressLog.append(
              "fallback",
              `抓取失败，使用浏览器渲染尝试提取（原因：${payload.reason}）`,
            );
            $status.text("使用浏览器渲染尝试提取").attr("class", "status");
          } else if (payload.type === "page_done") {
            progressLog.append(
              "page_done",
              `页面完成，新增图片 ${payload.added} 张`,
            );
            $status
              .text(`页面完成，新增图片 ${payload.added} 张`)
              .attr("class", "status");
          } else if (payload.type === "discover") {
            progressLog.append("discover", `共发现图片 ${payload.count} 张`);
            $status
              .text(`共发现图片 ${payload.count} 张`)
              .attr("class", "status");
          } else if (payload.type === "complete") {
            progressLog.append(
              "complete",
              `下载完成：保存 ${payload.saved} 张到 ${payload.outDir}`,
            );
            $status
              .text(
                `完成：发现 ${payload.saved} 张，已保存到 ${payload.outDir}`,
              )
              .attr("class", "status ok");

            es.close();
            await loadImages();

            // 恢复按钮状态
            $btn.prop("disabled", false);
            $btn.text("开始抓取");

            // 显示成功动画
            $status.css({
              animation: "fadeIn 0.5s ease",
            });

            setTimeout(() => {
              $status.css("animation", "");
            }, 500);
          } else if (payload.type === "error") {
            progressLog.append("error", `错误：${payload.error || "未知错误"}`);
            $status
              .text(`错误：${payload.error || "未知错误"}`)
              .attr("class", "status error");

            es.close();
            $btn.prop("disabled", false);
            $btn.text("开始抓取");
          }
        } catch (error) {
          console.error("处理 SSE 消息时出错:", error);
        }
      };

      es.onerror = () => {
        $status.text("错误：进度连接中断").attr("class", "status error");
        try {
          es.close();
        } catch {}
        $btn.prop("disabled", false);
        $btn.text("开始抓取");
      };
    } catch (e) {
      console.error("提交表单时出错:", e);
      $status.text(`错误：${e.message || e}`).attr("class", "status error");
      $btn.prop("disabled", false);
      $btn.text("开始抓取");
    }
  });

  // 输入时清除错误状态
  $form.on("input", "input, textarea", function () {
    $(this).removeClass("error");
    $(this).next(".error-message").remove();
  });
}
