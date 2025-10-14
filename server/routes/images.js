import { Router } from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import { STORAGE_ROOT, ensureDir } from "../lib/config.js";

/**
 * 图片列表路由模块
 * 提供 GET /api/images 接口：递归扫描 storage 目录下的图片文件，按顶层子目录分组并排序。
 */
const router = Router();

/**
 * GET /api/images
 * 返回：{ groups: Array<{ dir: string, files: string[] }>, total: number }
 * 细节：
 *  - 支持常见图片扩展名；
 *  - 分组规则：以相对路径的首段作为分组名，根目录为 "root"；
 *  - 分组内文件与分组本身均按字典序排序，root 分组优先。
 */
router.get("/api/images", (req, res) => {
  try {
    const root = STORAGE_ROOT;
    ensureDir(root);

    const exts = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg"]);
    const groups = new Map();

    const pushFile = (relPath, relBase) => {
      const top = relBase ? relBase.split("/")[0] : "root";
      if (!groups.has(top)) groups.set(top, []);
      groups.get(top).push(relPath);
    };

    const walk = (dir, rel = "") => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith(".")) continue; // 跳过隐藏项
        const abs = path.join(dir, ent.name);
        const relPath = rel ? `${rel}/${ent.name}` : ent.name;
        if (ent.isDirectory()) {
          walk(abs, relPath);
        } else {
          const ext = path.extname(ent.name).toLowerCase();
          if (exts.has(ext)) pushFile(relPath, rel);
        }
      }
    };

    walk(root);

    const result = Array.from(groups.entries()).map(([dir, files]) => ({
      dir,
      files: (files || []).sort((a, b) => a.localeCompare(b)),
    }));

    // 目录排序：root 优先，其余字典序
    result.sort((a, b) => (a.dir === "root" ? -1 : b.dir === "root" ? 1 : a.dir.localeCompare(b.dir)));

    const total = result.reduce((acc, g) => acc + g.files.length, 0);
    res.json({ groups: result, total });
  } catch (e) {
    res.status(500).json({ error: e.message || String(e) });
  }
});

export default router;