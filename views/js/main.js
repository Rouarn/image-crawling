/* 交互脚本：触发抓取与展示下载列表 */
(function () {
  async function loadImages() {
    try {
      const res = await fetch("/api/images");
      const data = await res.json();
      const box = document.getElementById("images");
      box.innerHTML = "";
      const groups = data.groups;
      // 多目录展示方案：使用下拉选择器切换目录，避免纵向堆叠导致页面超高
      if (Array.isArray(groups) && groups.length) {
        box.classList.remove("images");
        const controls = document.createElement("div");
        controls.className = "images-controls";
        const label = document.createElement("label");
        label.textContent = "目录：";
        label.style.marginRight = "6px";
        const select = document.createElement("select");
        select.className = "dir-select";
        const byName = new Map(groups.map(g => [g.dir, g.files || []]));
        let active = groups[0].dir;
        groups.forEach(g => {
          const opt = document.createElement("option");
          opt.value = g.dir;
          opt.textContent = g.dir === "root" ? "根目录" : g.dir;
          select.appendChild(opt);
        });
        select.value = active;
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
        select.addEventListener("change", () => {
          active = select.value;
          renderGrid(active);
        });
        controls.appendChild(label);
        controls.appendChild(select);
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