/*
  前端交互主脚本
  职责总览：
  - 加载已下载图片列表：GET /api/images，按目录分组渲染缩略图网格。
  - 表单提交抓取任务：POST /api/crawl，展示进度状态与结果统计，并刷新列表。
  - 主题切换与持久化：light/dark 两种主题，存储于 localStorage。
  - 图片预览模态层：缩略图点击弹出大图，支持遮罩点击与 ESC 关闭。
  事件流简介：
  - DOMContentLoaded → setupForm() → 注册输入联动/提交事件；
  - DOMContentLoaded → loadImages() → 初次拉取并渲染图片；
  - 用户提交表单 → POST /api/crawl → 成功后再次 loadImages()；
  - 用户点击缩略图 → 打开预览 → 点击遮罩/关闭或按 ESC → 关闭预览。
*/
(function () {
  /** 渲染骨架屏占位 */
  function renderSkeleton(box, count = 8) {
    if (!box) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < count; i++) {
      const div = document.createElement("div");
      div.className = "thumb";
      const sk = document.createElement("div");
      sk.className = "skeleton skeleton-thumb";
      div.appendChild(sk);
      const cap = document.createElement("div");
      cap.className = "skeleton";
      cap.style.height = "12px";
      cap.style.borderRadius = "6px";
      cap.style.marginTop = "8px";
      div.appendChild(cap);
      frag.appendChild(div);
    }
    box.innerHTML = "";
    box.appendChild(frag);
  }

  /** 根据输入框内容筛选当前缩略图 */
  function applyFilter() {
    const input = document.getElementById("images-filter");
    const q = (input && input.value ? input.value : "").trim().toLowerCase();
    const thumbs = document.querySelectorAll("#images .thumb");
    thumbs.forEach(t => {
      const name = (t.dataset.name || "").toLowerCase();
      t.style.display = q ? (name.includes(q) ? "" : "none") : "";
    });
  }

  /**
   * 进度日志工具：统一显示/隐藏/清空与渲染逻辑
   * - show/hide 控制可见性
   * - clear 清空当前内容
   * - append 渲染结构化日志项（含图标与时间戳）
   */
  const progressLog = {
    getBox() { return document.getElementById("progress"); },
    show() {
      const box = this.getBox();
      const modal = document.getElementById("progress-modal");
      if (!box || !modal) return;
      box.classList.remove("hidden");
      box.style.display = "";
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
    },
    hide() {
      const box = this.getBox();
      const modal = document.getElementById("progress-modal");
      if (!box || !modal) return;
      box.classList.add("hidden");
      box.style.display = "none";
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    },
    clear() {
      const box = this.getBox();
      if (!box) return;
      box.textContent = "";
    },
    nowStr() {
      const d = new Date();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
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
      const box = this.getBox();
      if (!box) return;
      const nearBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 8;
      const row = document.createElement("div");
      row.className = `log-item log-${type}`;
      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = this.icons[type] || "ℹ️";
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = String(msg || "");
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = this.nowStr();
      row.appendChild(icon);
      row.appendChild(text);
      row.appendChild(time);
      box.appendChild(row);
      const maxItems = 300;
      while (box.children.length > maxItems) {
        box.removeChild(box.firstChild);
      }
      if (nearBottom) {
        box.scrollTop = box.scrollHeight;
      }
    }
  };

  /**
   * 加载已下载图片并渲染到页面
   * 来源：GET /api/images
   * 渲染策略：
   * - 若返回包含 groups（按顶层子目录分组），则生成“目录标签”控件与对应网格。
   * - 否则兼容旧结构的 files 扁平数组，直接渲染所有缩略图。
   */
  async function loadImages() {
    const box = document.getElementById("images");
    if (box) renderSkeleton(box, 10);
    try {
      const res = await fetch("/api/images");
      const data = await res.json();
      box.innerHTML = "";
      const groups = data.groups;
      // 多目录展示方案：使用横向标签（tabs）切换目录，避免页面超高
      if (Array.isArray(groups) && groups.length) {
        box.classList.remove("images");
        const controls = document.createElement("div");
        controls.className = "images-controls";
        const byName = new Map(groups.map(g => [g.dir, g.files || []]));
        let active = groups[0].dir;
        const grid = document.createElement("div");
        grid.className = "images";
        const renderGrid = name => {
          grid.innerHTML = "";
          const files = byName.get(name) || [];
          files.forEach(f => {
            const div = document.createElement("div");
            div.className = "thumb";
            div.dataset.name = f;
            const img = document.createElement("img");
            img.loading = "lazy";
            img.src = encodeURI("/storage/" + f);
            img.alt = f;
            img.title = f;
            const cap = document.createElement("div");
            cap.textContent = f;
            div.appendChild(img);
            div.appendChild(cap);
            grid.appendChild(div);
          });
          applyFilter();
        };
        groups.forEach(g => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "tab" + (g.dir === active ? " active" : "");
          btn.textContent = g.dir === "root" ? "根目录" : g.dir;
          btn.addEventListener("click", () => {
            active = g.dir;
            Array.from(controls.querySelectorAll(".tab")).forEach(el => el.classList.remove("active"));
            btn.classList.add("active");
            renderGrid(active);
          });
          controls.appendChild(btn);
        });
        box.appendChild(controls);
        box.appendChild(grid);
        renderGrid(active);
      } else {
        // 兼容旧结构：扁平 files 列表
        (data.files || []).forEach(f => {
          const div = document.createElement("div");
          div.className = "thumb";
          div.dataset.name = f;
          const img = document.createElement("img");
          img.loading = "lazy";
          img.src = encodeURI("/storage/" + f);
          img.alt = f;
          img.title = f;
          const cap = document.createElement("div");
          cap.textContent = f;
          div.appendChild(img);
          div.appendChild(cap);
          box.appendChild(div);
        });
        applyFilter();
      }
    } catch (e) {
      console.error(e);
    }
  }

  /**
   * 初始化抓取表单交互：
   * - 根据 URL 自动派生输出目录（outDir），避免用户重复输入；
   * - 监听提交并组装 options，发送到 /api/crawl；
   * - 展示状态文本与错误信息，并在成功后刷新图片列表。
   */
  function setupForm() {
    const form = document.getElementById("crawl-form");
    if (!form) return;
    // 根据 URL 自动填充输出目录：取路径最后一段，去掉后缀并规范化
    const urlInput = form.querySelector('input[name="url"]');
    const outDirInput = form.querySelector('input[name="outDir"]');
    /**
     * 从原始 URL 文本派生稳定的目录名：
     * - 首选使用 URL 的最后路径段；若为空再回退到域名（去除 www.）；
     * - 清理查询/片段，移除文件后缀，归一化为小写短横线形式。
     */
    const deriveOutDir = raw => {
      if (!raw) return "";
      let pathname = "";
      try {
        pathname = new URL(raw).pathname || "";
      } catch {
        const stripped = String(raw).split("?")[0].split("#")[0];
        const idx = stripped.lastIndexOf("/");
        pathname = idx >= 0 ? stripped.slice(idx) : stripped;
      }
      pathname = pathname.replace(/\/+$/, ""); // 去掉末尾斜杠
      let segment = (pathname.split("/").filter(Boolean).pop() || "");
      segment = segment.replace(/\.[^./?#]+$/, ""); // 移除文件后缀
      if (!segment) {
        try {
          // 退化使用域名（去 www. 前缀）
          segment = new URL(raw).hostname.replace(/^www\./, "");
        } catch {}
      }
      segment = segment.trim().replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
      return segment || "";
    };
    if (urlInput && outDirInput) {
      urlInput.addEventListener("input", () => {
        const v = urlInput.value.trim();
        const derived = deriveOutDir(v);
        if (!derived) return;
        const prev = outDirInput.value.trim();
        // 若为空或之前为自动填充，则更新；避免覆盖用户手动修改
        if (!prev || outDirInput.dataset.autofill === "1") {
          outDirInput.value = derived;
          outDirInput.dataset.autofill = "1";
        }
      });
      urlInput.addEventListener("blur", () => {
        const v = urlInput.value.trim();
        if (!outDirInput.value.trim()) {
          const derived = deriveOutDir(v);
          if (derived) {
            outDirInput.value = derived;
            outDirInput.dataset.autofill = "1";
          }
        }
      });
      // 用户手动修改输出目录时，取消自动填充标记
      outDirInput.addEventListener("input", () => {
        outDirInput.dataset.autofill = "";
      });
    }
    form.addEventListener("submit", async ev => {
      ev.preventDefault();
      const status = document.getElementById("status");
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      status.textContent = "正在抓取...";
      status.className = "status";
      progressLog.clear();
      progressLog.show();
      const formData = new FormData(form);
      const url = formData.get("url");
      // 读取并校验自定义请求头（JSON 可选）
      let headersObj;
      const headersText = form.querySelector('textarea[name="headers"]')?.value?.trim();
      if (headersText) {
        try {
          const parsed = JSON.parse(headersText);
          if (parsed && typeof parsed === "object") headersObj = parsed;
        } catch (e) {
          status.textContent = "错误：请求头 JSON 无效";
          status.className = "status error";
          btn.disabled = false;
          return;
        }
      }
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
        useHeadless: form.querySelector('input[name="useHeadless"]')?.checked || undefined,
        headers: headersObj,
      };
      try {
        // 使用 SSE 实时显示进度
        const qs = new URLSearchParams();
        qs.set("url", String(url || ""));
        Object.entries(options).forEach(([k,v]) => {
          if (v === undefined || v === null || v === "") return;
          if (k === "headers") {
            try { qs.set("headers", JSON.stringify(v)); } catch {}
          } else {
            qs.set(k, String(v));
          }
        });
        const es = new EventSource(`/api/crawl/stream?${qs.toString()}`);
        es.onmessage = async (ev) => {
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
              status.textContent = `完成：发现 ${data.count || 0} 张，已保存 ${data.saved?.length || 0} 张到 ${data.outDir || ''}`;
              status.className = "status ok";
              es.close();
              await loadImages();
              btn.disabled = false;
            } else if (payload.type === "error") {
              progressLog.append("error", `错误：${payload.error || '未知错误'}`);
              status.textContent = `错误：${payload.error || '未知错误'}`;
              status.className = "status error";
              es.close();
              btn.disabled = false;
            }
          } catch {}
        };
        es.onerror = () => {
          status.textContent = "错误：进度连接中断";
          status.className = "status error";
          try { es.close(); } catch {}
          btn.disabled = false;
        };
      } catch (e) {
        status.textContent = `错误：${e.message || e}`;
        status.className = "status error";
        btn.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupForm();
    loadImages();
    // 筛选交互
    const input = document.getElementById("images-filter");
    if (input) input.addEventListener("input", applyFilter);
    // 主题初始化与切换
    const btn = document.getElementById("theme-toggle");
    /** 切换主题并持久化到 localStorage */
    const applyTheme = theme => {
      document.body.classList.toggle("dark", theme === "dark");
      localStorage.setItem("theme", theme);
      if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
    };
    const saved = localStorage.getItem("theme") || "light";
    applyTheme(saved);
    if (btn) {
      btn.addEventListener("click", () => {
        const current = document.body.classList.contains("dark") ? "dark" : "light";
        applyTheme(current === "dark" ? "light" : "dark");
      });
    }

    // 缩略图点击预览
    const modal = document.getElementById("preview-modal");
    const modalImg = document.getElementById("preview-img");
    const closeBtn = modal ? modal.querySelector(".close") : null;
    // 进度日志模态层
    const progressModal = document.getElementById("progress-modal");
    const progressCloseBtn = progressModal ? progressModal.querySelector(".close") : null;
    /** 打开预览模态层并设置图片地址 */
    const openPreview = src => {
      if (!modal || !modalImg) return;
      modalImg.src = src;
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
    };
    /** 关闭预览模态层并清理状态 */
    const closePreview = () => {
      if (!modal || !modalImg) return;
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
      modalImg.src = "";
    };
    const imagesBox = document.getElementById("images");
    if (imagesBox) {
      imagesBox.addEventListener("click", ev => {
        const thumb = ev.target.closest(".thumb");
        if (!thumb) return;
        const img = thumb.querySelector("img");
        if (img && img.src) openPreview(img.src);
      });
    }
    if (closeBtn) closeBtn.addEventListener("click", closePreview);
    if (modal) {
      modal.addEventListener("click", ev => {
        if (ev.target === modal) closePreview();
      });
    }
    // 进度模态关闭交互：按钮与点击遮罩
    const closeProgress = () => progressLog.hide();
    if (progressCloseBtn) progressCloseBtn.addEventListener("click", closeProgress);
    if (progressModal) {
      progressModal.addEventListener("click", ev => {
        if (ev.target === progressModal) closeProgress();
      });
    }
    document.addEventListener("keydown", ev => {
      if (ev.key === "Escape") {
        closePreview();
        closeProgress();
      }
    });
  });
})();