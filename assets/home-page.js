const sectionMeta = {
            "传统方法": {
                slug: "traditional",
                eyebrow: "Classical Baselines",
                summary: "形态学、局部对比和人类视觉系统相关方法。",
                chips: ["Morphology", "Local Contrast", "HVS"],
                surface: "linear-gradient(135deg, rgba(92, 227, 194, 0.18), rgba(9, 18, 30, 0.16) 68%)"
            },
            "优化方法": {
                slug: "optimization",
                eyebrow: "Low-Rank / Tensor",
                summary: "低秩表示、矩阵恢复与张量建模方法。",
                chips: ["Matrix", "Tensor", "Multi-Frame"],
                surface: "linear-gradient(135deg, rgba(122, 197, 255, 0.16), rgba(9, 18, 30, 0.16) 68%)"
            },
            "深度学习方法": {
                slug: "deep-learning",
                eyebrow: "Deep Models",
                summary: "单帧与多帧深度神经网络方法。",
                chips: ["CNN", "Transformer", "Sequence"],
                surface: "linear-gradient(135deg, rgba(255, 190, 120, 0.16), rgba(9, 18, 30, 0.16) 68%)"
            },
            "深度展开方法": {
                slug: "unrolling",
                eyebrow: "Unrolled Networks",
                summary: "优化展开与模型驱动网络方法。",
                chips: ["RPCA", "Unrolling", "Hybrid"],
                surface: "linear-gradient(135deg, rgba(255, 138, 120, 0.16), rgba(9, 18, 30, 0.16) 68%)"
            },
            "资源 Resources": {
                slug: "resources",
                eyebrow: "Datasets & Surveys",
                summary: "数据集、综述与基准测试。",
                chips: ["Datasets", "Surveys", "Benchmarks"],
                surface: "linear-gradient(135deg, rgba(203, 180, 255, 0.14), rgba(9, 18, 30, 0.16) 68%)"
            }
        };

        const state = {
            data: null,
            sections: [],
            papers: [],
            featuredPapers: [],
            searchTerm: "",
            searchResults: []
        };

        let nodeIdSeed = 0;
        let toastTimer = null;

        function escapeHtml(value) {
            return String(value || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        }

        function normalizeText(value) {
            return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
        }

        function extractYearNumber(value) {
            const matches = String(value || "").match(/\d{4}/g);
            if (!matches) {
                return 0;
            }
            return Math.max(...matches.map(Number));
        }

        function countByType(node, targetType) {
            if (!node) {
                return 0;
            }
            if (node.type === targetType) {
                return 1;
            }
            if (!Array.isArray(node.children)) {
                return 0;
            }
            return node.children.reduce((sum, child) => sum + countByType(child, targetType), 0);
        }

        function enrichNode(node, trail, sectionName, sectionSlug) {
            const enriched = {
                ...node,
                id: `entry-${++nodeIdSeed}`,
                trail: [...trail],
                sectionName,
                sectionSlug
            };

            if (Array.isArray(node.children)) {
                enriched.children = node.children.map((child) => enrichNode(child, [...trail, node.name], sectionName, sectionSlug));
            }

            if (node.type === "paper" || node.type === "info") {
                enriched.searchText = normalizeText([
                    node.name,
                    node.year,
                    node.venue,
                    ...trail
                ].filter(Boolean).join(" "));
            }

            return enriched;
        }

        function collectPapers(node, bucket) {
            if (node.type === "paper") {
                bucket.push(node);
            }
            if (Array.isArray(node.children)) {
                node.children.forEach((child) => collectPapers(child, bucket));
            }
        }

        function collectInfos(node, bucket) {
            if (node.type === "info") {
                bucket.push(node);
            }
            if (Array.isArray(node.children)) {
                node.children.forEach((child) => collectInfos(child, bucket));
            }
        }

        function normalizeSections(data) {
            nodeIdSeed = 0;
            return (data.children || []).map((section, index) => {
                const meta = sectionMeta[section.name] || {
                    slug: `section-${index + 1}`,
                    eyebrow: "Research Section",
                    summary: "研究条目",
                    chips: [],
                    surface: "linear-gradient(135deg, rgba(144, 195, 255, 0.16), rgba(9, 18, 30, 0.16) 68%)"
                };
                const children = (section.children || []).map((child) => enrichNode(child, [section.name], section.name, meta.slug));
                const paperCount = countByType(section, "paper");
                const infoCount = countByType(section, "info");

                return {
                    ...section,
                    id: `section-${index + 1}`,
                    slug: meta.slug,
                    children,
                    paperCount,
                    infoCount,
                    entryCount: paperCount || infoCount,
                    meta
                };
            });
        }

        function buildPaperIndex(sections) {
            const papers = [];
            sections.forEach((section) => section.children.forEach((child) => collectPapers(child, papers)));
            papers.sort((a, b) => extractYearNumber(b.year) - extractYearNumber(a.year));
            return papers;
        }

        function buildSectionUrl(sectionSlug, paperId = "") {
            const hash = paperId ? `#${paperId}` : "";
            return `./${encodeURIComponent(sectionSlug)}/index.html${hash}`;
        }

        function scrollToSection(sectionId) {
            if (sectionId === "top") {
                window.scrollTo({ top: 0, behavior: "smooth" });
                return;
            }

            const element = document.getElementById(sectionId);
            if (element) {
                element.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }

        function renderHeroStats() {
            const latestYear = state.papers.length
                ? Math.max(...state.papers.map((paper) => extractYearNumber(paper.year)))
                : "-";
            const stats = [
                { title: "条目总数", value: state.papers.length, text: "已收录论文" },
                { title: "模块数量", value: state.sections.length, text: "研究方向" },
                { title: "最新年份", value: latestYear, text: "最新收录年份" }
            ];

            document.getElementById("heroStats").innerHTML = stats.map((item) => `
                <div class="glass-panel rounded-[1.6rem] p-5">
                    <div class="text-xs uppercase tracking-[0.16em] text-slate-500">${escapeHtml(item.title)}</div>
                    <div class="mt-3 text-4xl font-semibold text-white">${escapeHtml(item.value)}</div>
                    <p class="mt-4 text-sm leading-7 text-slate-400">${escapeHtml(item.text)}</p>
                </div>
            `).join("");
        }

        function renderTopicLinks() {
            document.getElementById("topicLinks").innerHTML = state.sections.map((section) => `
                <a href="${buildSectionUrl(section.slug)}" class="tag inline-flex items-center rounded-full px-3 py-2 text-xs transition hover:border-cyan-300/30 hover:text-white">
                    ${escapeHtml(section.name)}
                </a>
            `).join("");
        }

        function renderModuleCards() {
            document.getElementById("moduleCards").innerHTML = state.sections.map((section, index) => `
                <a
                    href="${buildSectionUrl(section.slug)}"
                    class="section-card home-nav-card rounded-[1.8rem] p-5 text-left"
                    style="background:${escapeHtml(section.meta.surface)}">
                    <div class="home-nav-card__top">
                        <span class="home-nav-card__index">${String(index + 1).padStart(2, "0")}</span>
                        <span class="home-nav-card__count">${escapeHtml(section.entryCount)} 条目</span>
                    </div>
                    <div class="home-nav-card__icon">${escapeHtml(section.icon || "•")}</div>
                    <h3 class="home-nav-card__title">${escapeHtml(section.name)}</h3>
                    <p class="home-nav-card__summary">${escapeHtml(section.meta.summary)}</p>
                    <div class="home-nav-card__footer">
                        <div class="home-nav-card__chips">
                            ${section.meta.chips.slice(0, 2).map((chip) => `
                                <span class="tag rounded-full px-3 py-1 text-xs">${escapeHtml(chip)}</span>
                            `).join("")}
                        </div>
                        <span class="home-nav-card__action">
                            进入子页
                            <i class="fa-solid fa-arrow-right text-[0.72rem]"></i>
                        </span>
                    </div>
                </a>
            `).join("");
        }

        function renderSearchResults() {
            const hasKeyword = Boolean(state.searchTerm);
            const container = document.getElementById("searchResults");

            if (!hasKeyword) {
                container.innerHTML = `
                    <div class="home-search-empty rounded-[1.5rem] border border-dashed border-white/10 bg-white/5 px-5 py-6">
                        <div class="text-sm font-medium text-white">输入关键词开始检索</div>
                        <p class="mt-3 text-sm leading-7 text-slate-400">可输入标题、年份、期刊或研究方向关键词。</p>
                    </div>
                `;
                return;
            }

            const list = state.searchResults;

            if (!list.length) {
                container.innerHTML = `
                    <div class="home-search-empty rounded-[1.5rem] border border-dashed border-white/10 bg-white/5 px-5 py-6">
                        <div class="text-sm font-medium text-white">未检索到相关条目</div>
                        <p class="mt-3 text-sm leading-7 text-slate-400">可尝试年份、期刊简称或研究方向关键词。</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = list.map((paper) => `
                <a href="${buildSectionUrl(paper.sectionSlug, paper.id)}" class="search-result home-search-card block rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-4 text-left hover:border-cyan-400/35">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <div class="font-medium leading-7 text-white">${escapeHtml(paper.name)}</div>
                            <div class="mt-1 text-xs leading-6 text-slate-400">${escapeHtml(paper.venue || "未标注")}</div>
                        </div>
                        <span class="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-slate-400">${escapeHtml(paper.year || "-")}</span>
                    </div>
                    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span class="tag rounded-full px-2.5 py-1">${escapeHtml(paper.sectionName)}</span>
                        <span>${escapeHtml(paper.trail.slice(1).join(" / "))}</span>
                    </div>
                </a>
            `).join("");
        }

        function renderLatestPapers() {
            document.getElementById("latestPapers").innerHTML = state.featuredPapers.map((paper) => `
                <a href="${buildSectionUrl(paper.sectionSlug, paper.id)}" class="paper-card home-latest-card rounded-[1.5rem] p-5">
                    <div class="home-latest-card__row">
                        <div class="home-latest-card__year">${escapeHtml(paper.year || "-")}</div>
                        <div class="home-latest-card__body">
                            <div class="text-xs uppercase tracking-[0.16em] text-slate-500">${escapeHtml(paper.sectionName)}</div>
                            <h3 class="mt-2 text-lg font-semibold leading-7 text-white">${escapeHtml(paper.name)}</h3>
                            <div class="mt-3 text-sm leading-7 text-slate-300">${escapeHtml(paper.venue || "未标注")}</div>
                        </div>
                    </div>
                </a>
            `).join("");
        }

        function renderResourceHighlights() {
            const resourceSection = state.sections.find((section) => section.slug === "resources");
            if (!resourceSection) {
                document.getElementById("resourceHighlights").innerHTML = "";
                return;
            }

            const infos = [];
            resourceSection.children.forEach((child) => collectInfos(child, infos));
            document.getElementById("resourceHighlights").innerHTML = infos.slice(0, 6).map((item) => `
                <a href="${buildSectionUrl(resourceSection.slug)}" class="soft-panel block rounded-[1.4rem] p-4 transition hover:border-cyan-300/20">
                    <div class="text-xs uppercase tracking-[0.16em] text-slate-500">${escapeHtml(resourceSection.name)}</div>
                    <div class="mt-3 text-base font-medium leading-7 text-white">${escapeHtml(item.name)}</div>
                    <div class="mt-2 text-sm leading-7 text-slate-400">${escapeHtml(item.trail.slice(1).join(" / "))}</div>
                </a>
            `).join("");
        }

        function updateSearchMeta() {
            const meta = document.getElementById("searchMeta");
            if (!state.searchTerm) {
                meta.textContent = "输入标题、年份、期刊或方向关键词";
                return;
            }
            meta.textContent = `${state.searchResults.length} 篇相关论文`;
        }

        function handleSearchInput(event) {
            state.searchTerm = normalizeText(event.target.value);
            state.searchResults = state.searchTerm
                ? state.papers.filter((paper) => paper.searchText.includes(state.searchTerm))
                : [];

            updateSearchMeta();
            renderSearchResults();
        }

        function showToast(message) {
            const toast = document.getElementById("toast");
            toast.textContent = message;
            toast.classList.remove("hidden");

            if (toastTimer) {
                clearTimeout(toastTimer);
            }

            toastTimer = setTimeout(() => {
                toast.classList.add("hidden");
            }, 2400);
        }

        async function loadMindMapData() {
            try {
                const response = await fetch("./infrared-mindmap-data.json", { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                console.warn("Falling back to embedded data:", error);
                
                return window.fallbackMindMapData || null;
            }
        }

        async function initializePage() {
            state.data = await loadMindMapData();
            state.sections = normalizeSections(state.data);
            state.papers = buildPaperIndex(state.sections);
            state.featuredPapers = state.papers.slice(0, 8);
            renderModuleCards();
            renderSearchResults();
            renderLatestPapers();
            updateSearchMeta();
        }

        window.addEventListener("load", initializePage);







