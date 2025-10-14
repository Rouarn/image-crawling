import { Router } from "express";
import * as path from "node:path";

/**
 * 首页路由模块
 * 负责返回前端入口页面（views/index.html）。
 */
const router = Router();

/**
 * GET /
 * 返回静态页面，供用户配置抓取参数与查看结果。
 */
router.get("/", (req, res) => {
  const filePath = path.join(process.cwd(), "views", "index.html");
  res.sendFile(filePath);
});

export default router;