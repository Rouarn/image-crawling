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
    /** 渲染骨架屏占位（使用 jQuery） */
    function renderSkeleton(box, count = 8) {
        if (!box) return;
        const $box = $(box);
        $box.empty();
        for (let i = 0; i < count; i++) {
            const $div = $("<div/>").addClass("thumb");
            const $sk = $("<div/>").addClass("skeleton skeleton-thumb");
            const $cap = $("<div/>")
                .addClass("skeleton")
                .css({ height: "12px", borderRadius: "6px", marginTop: "8px" });
            $div.append($sk).append($cap);
            $box.append($div);
        }
    }

    /** 根据输入框内容筛选当前缩略图（使用 jQuery） */
    function applyFilter() {
        const q = (($("#images-filter").val() || "") + "")
            .trim()
            .toLowerCase();
        $("#images .thumb").each(function () {
            const name = String($(this).data("name") || "").toLowerCase();
            $(this).css("display", q ? (name.includes(q) ? "" : "none") : "");
        });
    }

    /**
     * 进度日志工具：统一显示/隐藏/清空与渲染逻辑
     * - show/hide 控制可见性
     * - clear 清空当前内容
     * - append 渲染结构化日志项（含图标与时间戳）
     */
    const progressLog = {
        getBox() {
            return $("#progress");
        },
        show() {
            const $box = this.getBox();
            const $modal = $("#progress-modal");
            if ($box.length === 0 || $modal.length === 0) return;
            $box.removeClass("hidden").css("display", "");
            $modal.addClass("show").attr("aria-hidden", "false");
        },
        hide() {
            const $box = this.getBox();
            const $modal = $("#progress-modal");
            if ($box.length === 0 || $modal.length === 0) return;
            $box.addClass("hidden").css("display", "none");
            $modal.removeClass("show").attr("aria-hidden", "true");
        },
        clear() {
            const $box = this.getBox();
            if ($box.length === 0) return;
            $box.empty();
        },
        nowStr() {
            const d = new Date();
            const hh = String(d.getHours()).padStart(2, "0");
            const mm = String(d.getMinutes()).padStart(2, "0");
            const ss = String(d.getSeconds()).padStart(2, "0");
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
            const $box = this.getBox();
            if ($box.length === 0) return;
            const nearBottom =
                $box.prop("scrollTop") + $box.prop("clientHeight") >= $box.prop("scrollHeight") - 8;
            const $row = $("<div/>").addClass(`log-item log-${type}`);
            const $icon = $("<span/>").addClass("icon").text(this.icons[type] || "ℹ️");
            const $text = $("<span/>").addClass("text").text(String(msg || ""));
            const $time = $("<span/>").addClass("time").text(this.nowStr());
            $row.append($icon, $text, $time);
            $box.append($row);
            const maxItems = 300;
            while ($box.children().length > maxItems) {
                $box.children().first().remove();
            }
            if (nearBottom) {
                $box.prop("scrollTop", $box.prop("scrollHeight"));
            }
        },
    };

    /** 创建并返回一个缩略图元素 */
    function createThumbnailElement(filename, onDelete) {
        const $div = $("<div/>").addClass("thumb").data("name", filename);
        const $img = $("<img/>")
            .attr({
                loading: "lazy",
                src: encodeURI("/storage/" + filename),
                alt: filename,
                title: filename,
            });
        const $cap = $("<div/>").text(filename);
        const $del = $("<button/>")
            .attr({ type: "button", title: "删除" })
            .addClass("delete-btn")
            .text("🗑️");
        $del.on("click", async ev => {
            ev.stopPropagation();
            $del.prop("disabled", true);
            try {
                await onDelete(filename, $div);
            } finally {
                $del.prop("disabled", false);
            }
        });
        $div.append($img, $cap, $del);
        return $div.get(0);
    }


    /**
     * 加载已下载图片并渲染到页面
     * 来源：GET /api/images
     * 渲染策略：
     * - 若返回包含 groups（按顶层子目录分组），则生成“目录标签”控件与对应网格。
     * - 否则兼容旧结构的 files 扁平数组，直接渲染所有缩略图。
     */
    async function loadImages() {
        const $box = $("#images");
        if ($box.length) renderSkeleton($box.get(0), 10);
        try {
            const data = await $.getJSON("/api/images");
            $box.empty();
            const groups = data.groups;
            // 多目录展示方案：使用横向标签（tabs）切换目录，避免页面超高
            if (Array.isArray(groups) && groups.length) {
                $box.removeClass("images");
                const $controls = $("<div/>").addClass("images-controls");
                const byName = new Map(groups.map(g => [g.dir, g.files || []]));
                let active = groups[0].dir;
                const $grid = $("<div/>").addClass("images");
                const renderGrid = name => {
                    $grid.empty();
                    const files = byName.get(name) || [];
                    files.forEach(f => {
                        const thumbEl = createThumbnailElement(f, async (filename, element) => {
                            try {
                                const resp = await $.ajax({
                                    url: "/api/images",
                                    method: "DELETE",
                                    contentType: "application/json",
                                    data: JSON.stringify({ name: filename }),
                                });
                                // jQuery.ajax resolves on HTTP 2xx; remove element
                                $(element).remove();
                                    byName.get(active).splice(byName.get(active).indexOf(filename), 1);
                                
                            } catch (e) {
                                const msg = e?.responseJSON?.error || e?.statusText || (e?.message || e);
                                alert(`删除失败：${msg}`);
                            }
                        });
                        $grid.append(thumbEl);
                    });
                    applyFilter();

                };
                groups.forEach(g => {
                    const $btn = $("<button/>")
                        .attr("type", "button")
                        .addClass("tab" + (g.dir === active ? " active" : ""))
                        .text(g.dir === "root" ? "根目录" : g.dir);
                    $btn.on("click", () => {
                        active = g.dir;
                        $controls.find(".tab").removeClass("active");
                        $btn.addClass("active");
                        renderGrid(active);
                    });
                    $controls.append($btn);
                });
                $box.append($controls).append($grid);
                renderGrid(active);
            } else {
                // 兼容旧结构：扁平 files 列表
                (data.files || []).forEach(f => {
                    const thumbEl = createThumbnailElement(f, async (filename, element) => {
                        try {
                            const resp = await $.ajax({
                                url: "/api/images",
                                method: "DELETE",
                                contentType: "application/json",
                                data: JSON.stringify({ name: filename }),
                            });
                            $(element).remove();
                                data.files.splice(data.files.indexOf(filename), 1);
                        } catch (e) {
                            const msg = e?.responseJSON?.error || e?.statusText || (e?.message || e);
                            alert(`删除失败：${msg}`);
                        }
                    });
                    $box.append(thumbEl);
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
        const $form = $("#crawl-form");
        if ($form.length === 0) return;
        // 根据 URL 自动填充输出目录：取路径最后一段，去掉后缀并规范化
        const $urlInput = $form.find('input[name="url"]');
        const $outDirInput = $form.find('input[name="outDir"]');
        /**
         * 从原始 URL 文本派生稳定的目录名：
         * - 首选使用 URL 的最后路径段；若为空再回退到域名（去除 www.）；
         * - 清理查询/片段，移除文件后缀，归一化为小写短横线形式。
         */
        const deriveOutDir = raw => {
            if (!raw) return "";
            let pathname;
            try {
                pathname = new URL(raw).pathname || "";
            } catch {
                const stripped = String(raw).split("?")[0].split("#")[0];
                const idx = stripped.lastIndexOf("/");
                pathname = idx >= 0 ? stripped.slice(idx) : stripped;
            }
            pathname = pathname.replace(/\/+$/, ""); // 去掉末尾斜杠
            let segment = pathname.split("/").filter(Boolean).pop() || "";
            segment = segment.replace(/\.[^./?#]+$/, ""); // 移除文件后缀
            if (!segment) {
                try {
                    // 退化使用域名（去 www. 前缀）
                    segment = new URL(raw).hostname.replace(/^www\./, "");
                } catch {
                }
            }
            segment = segment
                .trim()
                .replace(/[^\w-]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .toLowerCase();
            return segment || "";
        };
        if ($urlInput.length && $outDirInput.length) {
            $urlInput.on("input", () => {
                const v = String($urlInput.val() || "").trim();
                // 当目标页面 URL 被清空时，同步清空输出目录
                if (!v) {
                    $outDirInput.val("");
                    $outDirInput.data("autofill", "");
                    return;
                }
                const derived = deriveOutDir(v);
                if (!derived) return;
                const prev = String($outDirInput.val() || "").trim();
                // 若为空或之前为自动填充，则更新；避免覆盖用户手动修改
                if (!prev || $outDirInput.data("autofill") === "1") {
                    $outDirInput.val(derived);
                    $outDirInput.data("autofill", "1");
                }
            });
            $urlInput.on("blur", () => {
                const v = String($urlInput.val() || "").trim();
                if (!String($outDirInput.val() || "").trim()) {
                    const derived = deriveOutDir(v);
                    if (derived) {
                        $outDirInput.val(derived);
                        $outDirInput.data("autofill", "1");
                    }
                }
            });
            // 用户手动修改输出目录时，取消自动填充标记
            $outDirInput.on("input", () => {
                $outDirInput.data("autofill", "");
            });
        }
        const $maxPagesInput = $form.find('input[name="maxPages"]');
        const $startPageInput = $form.find('input[name="startPage"]');
        const $endPageInput = $form.find('input[name="endPage"]');
        if ($maxPagesInput.length && $startPageInput.length && $endPageInput.length) {
            const applyFromMaxPages = () => {
                const v = Number($maxPagesInput.val());
                if (!Number.isFinite(v) || v < 1) return;
                $startPageInput.val("1");
                $endPageInput.val(String(v));
            };
            $maxPagesInput.on("input", applyFromMaxPages);
            $maxPagesInput.on("blur", applyFromMaxPages);
        }
        // “插入{page}”按钮：在分页模式输入的当前光标位置插入占位符
        const $insertBtn = $("#insert-page-placeholder");
        const $pagePatternInput = $form.find('input[name="pagePattern"]');
        if ($insertBtn.length && $pagePatternInput.length) {
            $insertBtn.on("click", ev => {
                ev.preventDefault();
                const el = $pagePatternInput.get(0);
                const placeholder = "{page}";
                el.focus();
                const value = el.value || "";
                const start = typeof el.selectionStart === "number" ? el.selectionStart : value.length;
                const end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
                if (!value.includes(placeholder)) {
                    el.value = value.slice(0, start) + placeholder + value.slice(end);
                    const caret = start + placeholder.length;
                    try {
                        el.setSelectionRange(caret, caret);
                    } catch {
                    }
                } else {
                    // 若已存在占位符，则将光标移至首次占位符之后
                    const idx = value.indexOf(placeholder);
                    const caret = idx + placeholder.length;
                    try {
                        el.setSelectionRange(caret, caret);
                    } catch {
                    }
                }
                // 触发 input 事件，保持一致地联动行为
                try {
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                } catch {
                }
                // 若起始/结束页为空，进行合理预填：起始=1，结束=最大页数
                const sp = $form.find('input[name="startPage"]').get(0);
                const ep = $form.find('input[name="endPage"]').get(0);
                const mp = $form.find('input[name="maxPages"]').get(0);
                if (sp && !sp.value) sp.value = "1";
                const mv = mp ? Number(mp.value) : NaN;
                if (ep && !ep.value && Number.isFinite(mv) && mv >= 1) ep.value = String(mv);
            });
        }
        $form.on("submit", async ev => {
            ev.preventDefault();
            const $status = $("#status");
            const $btn = $form.find('button[type="submit"]');
            $btn.prop("disabled", true);
            $status.text("正在抓取...").attr("class", "status");
            progressLog.clear();
            progressLog.show();
            const formData = new FormData($form.get(0));
            const url = formData.get("url");
            // 读取并校验自定义请求头（JSON 可选）
            let headersObj;
            const headersText = ($form.find('textarea[name="headers"]').val() || "").trim();
            if (headersText) {
                try {
                    const parsed = JSON.parse(headersText);
                    if (parsed && typeof parsed === "object") headersObj = parsed;
                } catch (e) {
                    $status.text("错误：请求头 JSON 无效").attr("class", "status error");
                    $btn.prop("disabled", false);
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
                useHeadless:
                    $form.find('input[name="useHeadless"]').get(0)?.checked || undefined,
                headers: headersObj,
            };
            try {
                // 使用 SSE 实时显示进度
                const qs = new URLSearchParams();
                qs.set("url", String(url || ""));
                Object.entries(options).forEach(([k, v]) => {
                    if (v === undefined || v === null || v === "") return;
                    if (k === "headers") {
                        try {
                            qs.set("headers", JSON.stringify(v));
                        } catch {
                        }
                    } else {
                        qs.set(k, String(v));
                    }
                });
                const es = new EventSource(`/api/crawl/stream?${qs.toString()}`);
                es.onmessage = async ev => {
                    try {
                        const payload = JSON.parse(ev.data);
                        if (payload.type === "plan") {
                            progressLog.append("plan", `计划抓取 ${payload.pages} 页`);
                        } else if (payload.type === "page") {
                            progressLog.append(
                                "page",
                                `抓取第 ${payload.index}/${payload.total} 页：${payload.url}`
                            );
                        } else if (payload.type === "fallback") {
                            progressLog.append(
                                "fallback",
                                `抓取失败，使用浏览器渲染尝试提取（原因：${payload.reason}）`
                            );
                        } else if (payload.type === "page_done") {
                            progressLog.append(
                                "page_done",
                                `页面完成，新增图片 ${payload.added} 张`
                            );
                        } else if (payload.type === "discover") {
                            progressLog.append("discover", `共发现图片 ${payload.count} 张`);
                        } else if (payload.type === "complete") {
                            progressLog.append(
                                "complete",
                                `下载完成：保存 ${payload.saved} 张到 ${payload.outDir}`
                            );
                        } else if (payload.type === "result") {
                            const data = payload.result || {};
                            $status.text(`完成：发现 ${data.count || 0} 张，已保存 ${
                                data.saved?.length || 0
                            } 张到 ${data.outDir || ""}`)
                                .attr("class", "status ok");
                            es.close();
                            await loadImages();
                            $btn.prop("disabled", false);
                        } else if (payload.type === "error") {
                            progressLog.append(
                                "error",
                                `错误：${payload.error || "未知错误"}`
                            );
                            $status.text(`错误：${payload.error || "未知错误"}`)
                                .attr("class", "status error");
                            es.close();
                            $btn.prop("disabled", false);
                        }
                    } catch {
                    }
                };
                es.onerror = () => {
                    $status.text("错误：进度连接中断").attr("class", "status error");
                    try {
                        es.close();
                    } catch {
                    }
                    $btn.prop("disabled", false);
                };
            } catch (e) {
                $status.text(`错误：${e.message || e}`).attr("class", "status error");
                $btn.prop("disabled", false);
            }
        });
    }

    $(function () {
        setupForm();
        loadImages().then(() => {
        });
        // 筛选交互
        const $input = $("#images-filter");
        if ($input.length) $input.on("input", applyFilter);
        // 主题初始化与切换
        const $btnTheme = $("#theme-toggle");
        /** 切换主题并持久化到 localStorage */
        const applyTheme = theme => {
            $(document.body).toggleClass("dark", theme === "dark");
            localStorage.setItem("theme", theme);
            if ($btnTheme.length) $btnTheme.text(theme === "dark" ? "☀️" : "🌙");
        };
        const saved = localStorage.getItem("theme") || "light";
        applyTheme(saved);
        if ($btnTheme.length) {
            $btnTheme.on("click", () => {
                const current = $(document.body).hasClass("dark") ? "dark" : "light";
                applyTheme(current === "dark" ? "light" : "dark");
            });
        }

        // 缩略图点击预览
        const $modal = $("#preview-modal");
        const $modalImg = $("#preview-img");
        const $closeBtn = $modal.find(".close");
        // 进度日志模态层
        const $progressModal = $("#progress-modal");
        const $progressCloseBtn = $progressModal.find(".close");
        /** 打开预览模态层并设置图片地址 */
        const openPreview = src => {
            if ($modal.length === 0 || $modalImg.length === 0) return;
            $modalImg.attr("src", src);
            $modal.addClass("show").attr("aria-hidden", "false");
        };
        /** 关闭预览模态层并清理状态 */
        const closePreview = () => {
            if ($modal.length === 0 || $modalImg.length === 0) return;
            $modal.removeClass("show").attr("aria-hidden", "true");
            $modalImg.attr("src", "");
        };
        $("#images").on("click", ".thumb", function (ev) {
            const $img = $(this).find("img");
            const src = $img.attr("src");
            if (src) openPreview(src);
        });
        if ($closeBtn.length) $closeBtn.on("click", closePreview);
        if ($modal.length) {
            $modal.on("click", ev => {
                if (ev.target === $modal.get(0)) closePreview();
            });
        }
        // 进度模态关闭交互：按钮与点击遮罩
        const closeProgress = () => progressLog.hide();
        if ($progressCloseBtn.length) $progressCloseBtn.on("click", closeProgress);
        if ($progressModal.length) {
            $progressModal.on("click", ev => {
                if (ev.target === $progressModal.get(0)) closeProgress();
            });
        }
        // 返回顶部按钮：滚动时显示，点击平滑回顶
        const $backTopBtn = $("#back-to-top");
        if ($backTopBtn.length) {
            const toggleBackTop = () => {
                const show = ($(window).scrollTop() || 0) > 200;
                $backTopBtn.toggleClass("is-visible", show);
            };
            $(window).on("scroll", toggleBackTop);
            $(window).on("resize", toggleBackTop);
            toggleBackTop();
            $backTopBtn.on("click", ev => {
                ev.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
            });
        }
        $(document).on("keydown", ev => {
            if (ev.key === "Escape") {
                closePreview();
                closeProgress();
            }
        });
    });
})();
