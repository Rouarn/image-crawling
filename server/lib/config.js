import * as path from "node:path";
import * as fs from "node:fs";

/**
 * 配置模块
 * 提供公共存储根目录与确保目录存在的工具函数。
 */
export const STORAGE_ROOT = path.resolve("storage");

/**
 * 确保目录存在（若不存在则递归创建）。
 * @param {string} dir 目录绝对或相对路径
 */
export function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}