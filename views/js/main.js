/* 交互脚本：触发抓取与展示下载列表 */
(function () {
  async function loadImages() {
    try {
      const res = await fetch("/api/images");
      const data = await res.json();
      const box = document.getElementById("images");
      box.innerHTML = "";
      (data.files || []).forEach(f => {
        const div = document.createElement("div");
        div.className = "thumb";
        const img = document.createElement("img");
        img.loading = "lazy";
        img.src = "/images/" + encodeURIComponent(f);
        img.alt = f;
        const cap = document.createElement("div");
        cap.textContent = f;
        div.appendChild(img);
        div.appendChild(cap);
        box.appendChild(div);
      });
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
  });
})();