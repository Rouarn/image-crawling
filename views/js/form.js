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
      try { segment = new URL(raw).hostname.replace(/^www\./, ""); } catch {}
    }
    segment = segment.trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
    return segment || "";
  };
  if ($urlInput.length && $outDirInput.length) {
    $urlInput.on("input", () => {
      const v = String($urlInput.val() || "").trim();
      if (!v) { $outDirInput.val(""); $outDirInput.data("autofill", ""); return; }
      const derived = deriveOutDir(v);
      if (!derived) return;
      const prev = String($outDirInput.val() || "").trim();
      if (!prev || $outDirInput.data("autofill") === "1") {
        $outDirInput.val(derived);
        $outDirInput.data("autofill", "1");
      }
    });
    $urlInput.on("blur", () => {
      const v = String($urlInput.val() || "").trim();
      if (!String($outDirInput.val() || "").trim()) {
        const derived = deriveOutDir(v);
        if (derived) { $outDirInput.val(derived); $outDirInput.data("autofill", "1"); }
      }
    });
    $outDirInput.on("input", () => { $outDirInput.data("autofill", ""); });
  }

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

  const $insertBtn = $("#insert-page-placeholder");
  const $pagePatternInput = $form.find('input[name="pagePattern"]');
  if ($insertBtn.length && $pagePatternInput.length) {
    $insertBtn.on("click", ev => {
      ev.preventDefault();
      const el = $pagePatternInput.get(0);
      const placeholder = "{page}";
      el.focus();
      const value = el.value || "";
      const start = typeof el.selectionStart === "number" ? el.selectionStart : value.length;
      const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
      if (!value.includes(placeholder)) {
        el.value = value.slice(0, start) + placeholder + value.slice(end);
        const caret = start + placeholder.length;
        try { el.setSelectionRange(caret, caret); } catch {}
      } else {
        const idx = value.indexOf(placeholder);
        const caret = idx + placeholder.length;
        try { el.setSelectionRange(caret, caret); } catch {}
      }
      try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch {}
      const sp = $form.find('input[name="startPage"]').get(0);
      const ep = $form.find('input[name="endPage"]').get(0);
      const mp = $form.find('input[name="maxPages"]').get(0);
      if (sp && !sp.value) sp.value = "1";
      const mv = mp ? Number(mp.value) : NaN;
      if (ep && !ep.value && Number.isFinite(mv) && mv >= 1) ep.value = String(mv);
    });
  }

  $form.on("submit", async ev => {
    ev.preventDefault();
    const $status = $("#status");
    const $btn = $form.find('button[type="submit"]');
    $btn.prop("disabled", true);
    $status.text("正在抓取...").attr("class", "status");
    progressLog.clear();
    progressLog.show();
    const formData = new FormData($form.get(0));
    const url = formData.get("url");
    let headersObj;
    const headersText = ($form.find('textarea[name="headers"]').val() || "").trim();
    if (headersText) {
      try { const parsed = JSON.parse(headersText); if (parsed && typeof parsed === "object") headersObj = parsed; }
      catch (e) {
        $status.text("错误：请求头 JSON 无效").attr("class", "status error");
        $btn.prop("disabled", false); return;
      }
    }
    const options = {
      outDir: formData.get("outDir") || undefined,
      maxPages: Number(formData.get("maxPages")) || undefined,
      concurrency: Number(formData.get("concurrency")) || undefined,
      pageDelayMs: Number(formData.get("pageDelayMs")) || undefined,
      pagePattern: formData.get("pagePattern") || undefined,
      startPage: formData.get("startPage") ? Number(formData.get("startPage")) : undefined,
      endPage: formData.get("endPage") ? Number(formData.get("endPage")) : undefined,
      useHeadless: $form.find('input[name="useHeadless"]').get(0)?.checked || undefined,
      headers: headersObj,
    };
    try {
      const qs = new URLSearchParams();
      qs.set("url", String(url || ""));
      Object.entries(options).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "") return;
        if (k === "headers") { try { qs.set("headers", JSON.stringify(v)); } catch {} }
        else { qs.set(k, String(v)); }
      });
      const es = new EventSource(`/api/crawl/stream?${qs.toString()}`);
      es.onmessage = async ev => {
        try {
          const payload = JSON.parse(ev.data);
          if (payload.type === "plan") {
            progressLog.append("plan", `计划抓取 ${payload.pages} 页`);
          } else if (payload.type === "page") {
            progressLog.append("page", `抓取第 ${payload.index}/${payload.total} 页：${payload.url}`);
          } else if (payload.type === "fallback") {
            progressLog.append("fallback", `抓取失败，使用浏览器渲染尝试提取（原因：${payload.reason}）`);
          } else if (payload.type === "page_done") {
            progressLog.append("page_done", `页面完成，新增图片 ${payload.added} 张`);
          } else if (payload.type === "discover") {
            progressLog.append("discover", `共发现图片 ${payload.count} 张`);
          } else if (payload.type === "complete") {
            progressLog.append("complete", `下载完成：保存 ${payload.saved} 张到 ${payload.outDir}`);
          } else if (payload.type === "result") {
            const data = payload.result || {};
            $status.text(`完成：发现 ${data.count || 0} 张，已保存 ${data.saved?.length || 0} 张到 ${data.outDir || ""}`).attr("class", "status ok");
            es.close();
            await loadImages();
            $btn.prop("disabled", false);
          } else if (payload.type === "error") {
            progressLog.append("error", `错误：${payload.error || "未知错误"}`);
            $status.text(`错误：${payload.error || "未知错误"}`).attr("class", "status error");
            es.close();
            $btn.prop("disabled", false);
          }
        } catch {}
      };
      es.onerror = () => {
        $status.text("错误：进度连接中断").attr("class", "status error");
        try { es.close(); } catch {}
        $btn.prop("disabled", false);
      };
    } catch (e) {
      $status.text(`错误：${e.message || e}`).attr("class", "status error");
      $btn.prop("disabled", false);
    }
  });
}