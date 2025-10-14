/* 交互脚本：触发抓取与展示下载列表 */
(function () {
  async function loadImages() {
    try {
      const res = await fetch("/api/images");
      const data = await res.json();
      const box = document.getElementById("images");
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
            const img = document.createElement("img");
            img.loading = "lazy";
            img.src = encodeURI("/storage/" + f);
            img.alt = f;
            const cap = document.createElement("div");
            cap.textContent = f;
            div.appendChild(img);
            div.appendChild(cap);
            grid.appendChild(div);
          });
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
          const img = document.createElement("img");
          img.loading = "lazy";
          img.src = encodeURI("/storage/" + f);
          img.alt = f;
          const cap = document.createElement("div");
          cap.textContent = f;
          div.appendChild(img);
          div.appendChild(cap);
          box.appendChild(div);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  function setupForm() {
    const form = document.getElementById("crawl-form");
    if (!form) return;
    // 根据 URL 自动填充输出目录：取路径最后一段，去掉后缀并规范化
    const urlInput = form.querySelector('input[name="url"]');
    const outDirInput = form.querySelector('input[name="outDir"]');
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
      const formData = new FormData(form);
      const url = formData.get("url");
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
      };
      try {
        const res = await fetch("/api/crawl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, options }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "请求失败");
        status.textContent = `完成：发现 ${data.count} 张，已保存 ${
          data.saved?.length || 0
        } 张到 ${data.outDir}`;
        status.className = "status ok";
        await loadImages();
      } catch (e) {
        status.textContent = `错误：${e.message || e}`;
        status.className = "status error";
      } finally {
        btn.disabled = false;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupForm();
    loadImages();
    // 主题初始化与切换
    const btn = document.getElementById("theme-toggle");
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
    const openPreview = src => {
      if (!modal || !modalImg) return;
      modalImg.src = src;
      modal.classList.add("show");
      modal.setAttribute("aria-hidden", "false");
    };
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
    document.addEventListener("keydown", ev => {
      if (ev.key === "Escape") closePreview();
    });
  });
})();