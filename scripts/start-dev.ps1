# 配置环境变量
$BackendPort = 5678
$FrontendApiTarget = "http://localhost:$BackendPort"

Write-Host "=========================================="
Write-Host "Backend Port: $BackendPort"
Write-Host "API Target  : $FrontendApiTarget"
Write-Host "=========================================="

# 定义命令 (使用 cmd 语法，因为 concurrently 默认在 Windows 上使用 cmd)
# 1. 后端: 设置端口并启动
$BackendCmd = "cd backend && set PORT=$BackendPort && pnpm start:dev"

# 2. 前端: 等待后端端口就绪，设置 API 目标并启动
# 注意: 需要先安装 wait-on: pnpm add -D -w wait-on
$FrontendCmd = "wait-on tcp:$BackendPort && cd frontend && set VITE_API_TARGET=$FrontendApiTarget && pnpm dev"

# 使用 concurrently 并行运行 (在当前终端显示输出)
# 需要先安装 concurrently: pnpm add -D -w concurrently
Write-Host "Starting services in parallel..."

& pnpm exec concurrently -k -n "BACKEND,FRONTEND" -c "blue,magenta" $BackendCmd $FrontendCmd
