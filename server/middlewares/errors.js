/**
 * 404 未找到中间件
 * 放在所有路由之后，用于匹配未处理的请求并返回统一错误。
 */
export function notFound(req, res) {
  res.status(404).json({ error: "未找到" });
}

/**
 * 全局错误处理中间件
 * 捕获路由与中间件中的异常，记录日志并返回统一错误结构。
 */
export function errorHandler(err, req, res, next) {
  console.error(err);
  res.status(500).json({ error: err?.message || "服务器内部错误" });
}