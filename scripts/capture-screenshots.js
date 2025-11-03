import fs from "node:fs";
import path from "node:path";

// ===== 浏览器启动（多通道兼容） =====
async function launchPuppeteer() {
  let puppeteer;
  try {
    const mod = await import("puppeteer");
    puppeteer = mod.default || mod;
  } catch (e) {
    console.error("未安装 puppeteer，无法生成截图：", e.message || e);
    process.exit(1);
  }
  try {
    return await puppeteer.launch({ headless: "new" });
  } catch (e1) {
    try {
      return await puppeteer.launch({ headless: "new", channel: "chrome" });
    } catch (e2) {
      try {
        return await puppeteer.launch({ headless: "new", channel: "msedge" });
      } catch (e3) {
        console.error("无法启动浏览器：", e3.message || e3);
        process.exit(1);
      }
    }
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// 元素截屏（根据元素尺寸动态调整视口并剪裁）
async function screenshotElement(page, selector, filePath, padding = 8) {
  const el = await page.$(selector);
  if (!el) return false;
  const box = await el.boundingBox();
  if (!box) return false;
  const width = Math.max(1366, Math.ceil(box.x + box.width + padding));
  const height = Math.max(900, Math.ceil(box.y + box.height + padding));
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.screenshot({
    path: filePath,
    clip: {
      x: Math.max(0, Math.floor(box.x - padding)),
      y: Math.max(0, Math.floor(box.y - padding)),
      width: Math.ceil(box.width + padding * 2),
      height: Math.ceil(box.height + padding * 2),
    },
  });
  return true;
}

// 注入示例日志并显示进度模态
async function showProgressDemo(page) {
  await page.evaluate(() => {
    const modal = document.getElementById("progress-modal");
    const box = document.getElementById("progress");
    if (!modal || !box) return;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    const mk = (type, msg) => {
      const row = document.createElement("div");
      row.className = `log-item log-${type}`;
      const icon = document.createElement("span");
      icon.className = "icon";
      icon.textContent = "ℹ️";
      const text = document.createElement("span");
      text.className = "text";
      text.textContent = String(msg || "");
      const time = document.createElement("span");
      time.className = "time";
      time.textContent = new Date().toLocaleTimeString();
      row.appendChild(icon);
      row.appendChild(text);
      row.appendChild(time);
      box.appendChild(row);
    };
    box.innerHTML = "";
    mk("plan", "计划抓取 5 页");
    mk("page", "抓取第 1/5 页：https://example.com/page/1");
    mk("page_done", "页面完成，新增图片 12 张");
    mk("discover", "共发现图片 48 张");
    mk("complete", "下载完成：保存 48 张到 storage/images");
  });
}

// 如果没有图片，填充占位缩略图，避免截图为空
async function ensureGridHasItems(page, count = 24) {
  await page.evaluate(c => {
    const box = document.getElementById("images");
    if (!box) return;
    const has = box.querySelectorAll(".thumb").length;
    if (has > 0) return;
    const dataUrl =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' width='240' height='180'><rect width='100%' height='100%' fill='#e3e6ea'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='#667' font-family='sans-serif' font-size='16'>placeholder</text></svg>"
      );
    for (let i = 0; i < c; i++) {
      const div = document.createElement("div");
      div.className = "thumb";
      div.dataset.name = `placeholder-${i + 1}.png`;
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = div.dataset.name;
      img.loading = "lazy";
      const cap = document.createElement("div");
      cap.textContent = div.dataset.name;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "delete-btn";
      del.textContent = "🗑️";
      div.appendChild(img);
      div.appendChild(cap);
      div.appendChild(del);
      box.appendChild(div);
    }
  }, count);
}

async function main() {
  // 允许通过命令行传入端口与输出目录
  const argv = process.argv.slice(2);
  const getArg = key => {
    const idx = argv.findIndex(a => a === key);
    return idx >= 0 && argv[idx + 1] ? argv[idx + 1] : undefined;
  };
  const port = Number(getArg("--port") || process.env.PORT || 3000);
  const baseUrl = `http://localhost:${port}/`;
  const outDir = path.resolve(
    getArg("--outDir") || path.join("views", "image", "screenshots")
  );
  ensureDir(outDir);

  const browser = await launchPuppeteer();
  const page = await browser.newPage();
  // 预置主题为浅色，保证首次载入一致
  await page.evaluateOnNewDocument(() => {
    try {
      localStorage.setItem("theme", "light");
    } catch {}
  });
  await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });

  // 访问首页
  try {
    await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 30000 });
  } catch (e) {
    console.error(
      `无法访问 ${baseUrl}，请先在另一终端运行 pnpm start 或 npm start`
    );
    await browser.close();
    process.exit(1);
  }

  // 保证网格不为空
  await ensureGridHasItems(page);

  // 隐藏所有模态，截取首页（浅色，元素裁剪）
  await page.evaluate(() => {
    const h = id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.remove("show");
      el.setAttribute("aria-hidden", "true");
    };
    h("progress-modal");
    h("preview-modal");
  });
  await screenshotElement(page, "main.layout", path.join(outDir, "home-light.png"), 10);

  // 截取图片网格（浅色）
  await screenshotElement(page, "#images", path.join(outDir, "images-grid.png"), 6);

  // 显示进度模态并截取（保持浅色主题）
  await showProgressDemo(page);
  await screenshotElement(page, "#progress-modal", path.join(outDir, "progress.png"), 10);

  // 打开预览并截取
  // 先确保进度模态隐藏，避免遮挡
  await page.evaluate(() => {
    const modal = document.getElementById("progress-modal");
    const box = document.getElementById("progress");
    if (box) {
      box.classList.add("hidden");
      box.style.display = "none";
    }
    if (modal) {
      modal.classList.remove("show");
      modal.setAttribute("aria-hidden", "true");
    }
  });
  const opened = await page.evaluate(() => {
    const img = document.querySelector("#images .thumb img");
    if (!img) return false;
    const modal = document.getElementById("preview-modal");
    const modalImg = document.getElementById("preview-img");
    if (!modal || !modalImg) return false;
    modalImg.src = img.src;
    modal.classList.add("show");
    modal.setAttribute("aria-hidden", "false");
    return true;
  });
  if (opened) {
    // 等待模态完全可见与图片加载完成
    try {
      await page.waitForFunction(() => {
        const modal = document.getElementById("preview-modal");
        const img = document.getElementById("preview-img");
        return (
          modal && modal.classList.contains("show") && img && img.naturalWidth > 0
        );
      }, { timeout: 3000 });
      await page.waitForTimeout(200);
    } catch {}
    await screenshotElement(page, "#preview-modal", path.join(outDir, "preview.png"), 10);
  }

  // 最后切换深色主题并截取首页（深色）
  try {
    // 直接设置为暗色主题，避免按钮点击不生效
    await page.evaluate(() => {
      document.body.classList.add("dark");
      try { localStorage.setItem("theme", "dark"); } catch {}
      const btn = document.getElementById("theme-toggle");
      if (btn) btn.textContent = "☀️";
      // 清理可能存在的模态层遮挡
      const ids = ["progress-modal", "preview-modal"]; 
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.remove("show");
        el.setAttribute("aria-hidden", "true");
        const box = id === "progress-modal" ? document.getElementById("progress") : null;
        if (box) { box.classList.add("hidden"); box.style.display = "none"; }
      }
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    // 等待样式计算完成
    await page.waitForFunction(() => document.body.classList.contains("dark"), { timeout: 2000 });
    await page.waitForTimeout(200);
    // 重置视口，避免前面元素裁剪调整后的尺寸影响全页截取
    await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
  } catch {}
  await page.screenshot({ path: path.join(outDir, "home-dark.png"), fullPage: true });

  await browser.close();
  console.log("截图已生成：", outDir);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
