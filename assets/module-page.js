const fallbackMindMapData = window.fallbackMindMapData || null;

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
                summary: "数据集、综述、基准测试与开源资源。",
                chips: ["Datasets", "Surveys", "Benchmarks"],
                surface: "linear-gradient(135deg, rgba(203, 180, 255, 0.14), rgba(9, 18, 30, 0.16) 68%)"
            }
        };

        const pageRootPath = (document.body.dataset.rootPath || "..").replace(/\/$/, "");
        const pageSectionSlug = document.body.dataset.sectionSlug || "";

        const state = {
            data: null,
            sections: [],
            papers: [],
            featuredPapers: [],
            searchTerm: "",
            searchResults: [],
            activePaperId: null,
            activeSection: null,
            paperById: {},
            observer: null
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

        function buildSectionUrl(sectionSlug, paperId = "") {
            const hash = paperId ? `#${paperId}` : "";
            return `${pageRootPath}/${encodeURIComponent(sectionSlug)}/index.html${hash}`;
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
                    order: index,
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

        function getNodeStats(node) {
            const paperCount = countByType(node, "paper");
            const infoCount = countByType(node, "info");
            const total = paperCount + infoCount;

            return {
                paperCount,
                infoCount,
                total,
                label: paperCount && !infoCount ? "论文" : infoCount && !paperCount ? "资源" : "条目"
            };
        }
        function formatTrail(trail) {
            return trail.join(" / ");
        }

        function renderSidebarStats() {
            const totalPapers = state.papers.length;
            const latestYear = state.papers.length
                ? Math.max(...state.papers.map((paper) => extractYearNumber(paper.year)))
                : "-";
            const stats = [
                { label: "论文数", value: `${totalPapers}` },
                { label: "最新年份", value: latestYear || "-" }
            ];

            document.getElementById("sidebarStats").innerHTML = stats.map((item) => `
                <div class="stat-card rounded-[1.15rem] border border-white/10 bg-white/5 px-3 py-3">
                    <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">${escapeHtml(item.label)}</div>
                    <div class="mt-1.5 text-lg font-semibold text-white">${escapeHtml(item.value)}</div>
                </div>
            `).join("");
        }
        function renderHeroCopy() {
            const activeSection = state.activeSection;
            if (!activeSection) {
                return;
            }

            document.title = `${activeSection.name} - 红外小目标检测论文索引`;

            const eyebrow = document.getElementById("heroEyebrow");
            if (eyebrow) {
                eyebrow.classList.add("hidden");
                eyebrow.innerHTML = "";
            }

            document.getElementById("heroTitle").textContent = activeSection.name;
            document.getElementById("heroDescription").textContent = activeSection.meta.summary;
        }
        function renderHeroStats() {
            const container = document.getElementById("heroStats");
            if (!container) {
                return;
            }

            container.innerHTML = "";
            container.classList.add("hidden");
        }
        function renderOverviewCards() {
            const container = document.getElementById("overviewCards");
            if (!container) {
                return;
            }

            container.innerHTML = state.sections.map((section) => `
                <a
                    href="${buildSectionUrl(section.slug)}"
                    class="section-card relative overflow-hidden rounded-[1.8rem] p-5 text-left"
                    style="background:${escapeHtml(section.meta.surface)}">
                    <div class="text-xs uppercase tracking-[0.18em] text-slate-400">${escapeHtml(section.meta.eyebrow)}</div>
                    <div class="mt-4 flex items-start justify-between gap-4">
                        <div>
                            <div class="text-3xl">${escapeHtml(section.icon || "•")}</div>
                            <h3 class="mt-4 text-2xl font-semibold text-white">${escapeHtml(section.name)}</h3>
                        </div>
                        <div class="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                            ${escapeHtml(section.entryCount)} 条目
                        </div>
                    </div>
                    <p class="mt-4 text-sm leading-7 text-slate-300">${escapeHtml(section.meta.summary)}</p>
                    <div class="mt-5 flex flex-wrap gap-2">
                        ${section.meta.chips.map((chip) => `
                            <span class="tag rounded-full px-3 py-1 text-xs">${escapeHtml(chip)}</span>
                        `).join("")}
                    </div>
                </a>
            `).join("");
        }

        function renderNavList() {
            const container = document.getElementById("sidebarTopicLinks");
            if (!container) {
                return;
            }

            container.innerHTML = state.sections.map((section, index) => `
                <a
                    href="${buildSectionUrl(section.slug)}"
                    data-nav-button="${section.slug}"
                    class="text-slate-400 transition hover:text-cyan-200">
                    ${escapeHtml(section.name)}
                </a>
                ${index < state.sections.length - 1 ? '<span class="text-slate-600">、</span>' : ""}
            `).join("");
        }

        function renderSearchStatus() {
            const container = document.getElementById("searchStatus");
            if (!container) {
                return;
            }

            const sectionName = state.activeSection ? state.activeSection.name : "模块";
            const hasKeyword = Boolean(state.searchTerm);
            const content = hasKeyword
                ? {
                    title: `关键词：${state.searchTerm}`,
                    text: `${state.searchResults.length} 篇相关论文`,
                    hint: "标题 / 年份 / 期刊 / 方向"
                }
                : {
                    title: sectionName,
                    text: "当前模块的论文与资源条目。",
                    hint: "标题 / 年份 / 期刊 / 方向"
                };

            container.innerHTML = `
                <div class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">当前模块</div>
                <h3 class="mt-3 text-2xl font-semibold">${escapeHtml(content.title)}</h3>
                <p class="mt-4 text-sm leading-7 text-slate-300">${escapeHtml(content.text)}</p>
                <div class="mt-5 rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4 text-sm text-slate-400">
                    ${escapeHtml(content.hint)}
                </div>
            `;
        }

        function renderPaperCard(paper) {
            const shortTrail = paper.trail.slice(1);
            const badges = [];
            if (paper.year) {
                badges.push(`<span class="tag rounded-full px-3 py-1 text-xs">${escapeHtml(paper.year)}</span>`);
            }
            if (paper.venue) {
                badges.push(`<span class="tag rounded-full px-3 py-1 text-xs">${escapeHtml(paper.venue)}</span>`);
            }
            return `
                <article
                    id="${escapeHtml(paper.id)}"
                    data-paper-card
                    data-paper-id="${escapeHtml(paper.id)}"
                    class="paper-card rounded-[1.5rem] p-5"
                    tabindex="0"
                    onclick="openPaperModal('${paper.id}')"
                    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPaperModal('${paper.id}');}">
                    <div class="flex items-start justify-between gap-4">
                        <div>
                            <h4 class="text-lg font-semibold leading-7 text-white">${escapeHtml(paper.name)}</h4>
                            <p class="mt-3 text-sm leading-7 text-slate-400">${escapeHtml(shortTrail.join(" / ") || paper.sectionName)}</p>
                        </div>
                        <div class="text-right">
                            ${paper.code ? '<span class="inline-flex items-center gap-1 rounded-full border border-amber-300/20 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-100"><i class="fa-solid fa-code"></i> 代码</span>' : ""}
                        </div>
                    </div>
                    <div class="mt-5 flex flex-wrap gap-2">
                        ${badges.join("")}
                    </div>
                    <div class="mt-5 flex flex-wrap gap-3 text-sm">
                        ${paper.link ? `
                            <span class="inline-flex items-center gap-2 text-cyan-200">
                                <i class="fa-solid fa-arrow-up-right-from-square text-xs"></i>
                                论文链接
                            </span>
                        ` : `
                            <span class="inline-flex items-center gap-2 text-slate-500">
                                <i class="fa-solid fa-link-slash text-xs"></i>
                                未附外链
                            </span>
                        `}
                    </div>
                </article>
            `;
        }

        function renderInfoCard(item) {
            return `
                <div class="soft-panel rounded-[1.4rem] p-5">
                    <div class="text-xs uppercase tracking-[0.16em] text-slate-500">资源</div>
                    <div class="mt-3 text-base font-medium leading-7 text-white">${escapeHtml(item.name)}</div>
                    <div class="mt-3 text-sm leading-7 text-slate-400">${escapeHtml(item.trail.slice(1).join(" / ") || item.sectionName)}</div>
                </div>
            `;
        }

        function renderNodeBlock(node, depth = 0) {
            if (node.type === "paper") {
                return renderPaperCard(node);
            }

            if (node.type === "info") {
                return renderInfoCard(node);
            }

            const directLeaves = (node.children || []).filter((child) => child.type === "paper" || child.type === "info");
            const nestedGroups = (node.children || []).filter((child) => !child.type);
            const stats = getNodeStats(node);
            const countLabel = stats.label === "论文" ? "篇论文" : stats.label === "资源" ? "项资源" : "条目";
            const headingLabel = depth === 0 ? "主题" : "分支";
            const titleClass = depth === 0 ? "text-2xl sm:text-[1.7rem]" : "text-xl";
            const wrapperClass = depth === 0
                ? "soft-panel rounded-[1.7rem] p-5 sm:p-6"
                : "rounded-[1.35rem] border border-white/10 bg-slate-950/30 p-4 sm:p-5";
            const gridClass = directLeaves.length > 1 ? "lg:grid-cols-2" : "";
            const anchorId = depth === 0 ? `id="${escapeHtml(node.id)}"` : "";
            const iconMarkup = node.icon ? `
                <span class="inline-flex h-11 w-11 items-center justify-center rounded-[1rem] border border-white/10 bg-white/5 text-xl">
                    ${escapeHtml(node.icon)}
                </span>
            ` : "";

            return `
                <section ${anchorId} class="${depth > 0 ? "mt-4" : ""}">
                    <div class="${wrapperClass}">
                        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div class="min-w-0">
                                <div class="text-[11px] uppercase tracking-[0.18em] text-slate-500">${escapeHtml(headingLabel)}</div>
                                <div class="mt-3 flex items-start gap-3">
                                    ${iconMarkup}
                                    <div class="min-w-0">
                                        <h3 class="${titleClass} font-semibold leading-tight text-white">${escapeHtml(node.name)}</h3>
                                    </div>
                                </div>
                            </div>
                            <div class="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-300">
                                <span class="h-1.5 w-1.5 rounded-full bg-cyan-300"></span>
                                ${escapeHtml(stats.total)} ${countLabel}
                            </div>
                        </div>

                        ${directLeaves.length ? `
                            <div class="mt-5 grid gap-4 ${gridClass}">
                                ${directLeaves.map((child) => renderNodeBlock(child, depth + 1)).join("")}
                            </div>
                        ` : ""}

                        ${nestedGroups.length ? `
                            <div class="${directLeaves.length ? "mt-5" : "mt-4"} space-y-4">
                                ${nestedGroups.map((child) => renderNodeBlock(child, depth + 1)).join("")}
                            </div>
                        ` : ""}
                    </div>
                </section>
            `;
        }
        function renderSections() {
            const section = state.activeSection;
            if (!section) {
                document.getElementById("sectionsContainer").innerHTML = "";
                return;
            }

            const latestYear = state.papers.length
                ? Math.max(...state.papers.map((paper) => extractYearNumber(paper.year)))
                : "-";

            const themeButtons = section.children.map((child) => {
                const stats = getNodeStats(child);
                return `
                    <button
                        type="button"
                        onclick="scrollToSection('${child.id}')"
                        class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-400/35 hover:text-white">
                        <span class="truncate max-w-[16rem]">${escapeHtml(child.name)}</span>
                        <span class="rounded-full bg-black/20 px-2 py-0.5 text-[10px] text-slate-400">${escapeHtml(stats.total)}</span>
                    </button>
                `;
            }).join("");

            document.getElementById("sectionsContainer").innerHTML = `
                <section id="${escapeHtml(section.id)}" data-section-id="${escapeHtml(section.id)}" class="section-anchor">
                    <div class="flex flex-col gap-3 py-1 xl:flex-row xl:items-center xl:justify-between">
                        <div class="inline-flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                            <span class="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-slate-400">
                                <i class="fa-regular fa-calendar"></i>
                                最新年份 ${escapeHtml(latestYear)}
                            </span>
                        </div>
                        <div class="flex flex-wrap gap-2">
                            ${themeButtons}
                        </div>
                    </div>

                    <div class="mt-4 grid gap-5 ${section.children.length > 1 ? "xl:grid-cols-2" : ""}">
                        ${section.children.map((child) => renderNodeBlock(child, 0)).join("")}
                    </div>
                </section>
            `;
        }
        function renderSearchResultItem(paper) {
            const trail = paper.trail.slice(1).join(" / ") || paper.sectionName;
            return `
                <button type="button" onclick="jumpToPaper('${paper.id}')" class="search-result w-full rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-4 text-left hover:border-cyan-400/35">
                    <div class="flex items-start justify-between gap-3">
                        <div>
                            <div class="font-medium leading-7 text-white">${escapeHtml(paper.name)}</div>
                            <div class="mt-1 text-xs leading-6 text-slate-400">${escapeHtml(trail)}</div>
                        </div>
                        <span class="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-slate-400">${escapeHtml(paper.year || "-")}</span>
                    </div>
                </button>
            `;
        }

        function renderSearchResults() {
            const container = document.getElementById("searchResults");
            const clearButton = document.getElementById("clearSearchButton");
            const hasKeyword = Boolean(state.searchTerm);
            const list = hasKeyword ? state.searchResults : state.featuredPapers;

            clearButton.classList.toggle("hidden", !hasKeyword);

            if (hasKeyword && !list.length) {
                container.innerHTML = `
                    <div class="rounded-[1.5rem] border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm leading-7 text-slate-400">
                        未检索到相关条目。
                    </div>
                `;
                return;
            }

            container.innerHTML = list.map((paper) => renderSearchResultItem(paper)).join("");
        }

        function updateSearchMeta() {
            const meta = document.getElementById("searchMeta");
            if (!state.searchTerm) {
                meta.textContent = "DNANet / TGRS / Multi-Frame / Single-Frame";
                return;
            }
            meta.textContent = `${state.searchResults.length} 篇相关论文`;
        }

        function updatePaperHighlights() {
            const cards = document.querySelectorAll("[data-paper-card]");
            const hasKeyword = Boolean(state.searchTerm);
            const matchIds = new Set(state.searchResults.map((paper) => paper.id));

            cards.forEach((card) => {
                const paperId = card.dataset.paperId;
                card.classList.toggle("is-match", hasKeyword && matchIds.has(paperId));
                card.classList.toggle("is-muted", hasKeyword && !matchIds.has(paperId));
            });
        }

        function handleSearchInput(event) {
            state.searchTerm = normalizeText(event.target.value);
            state.searchResults = state.searchTerm
                ? state.papers.filter((paper) => paper.searchText.includes(state.searchTerm))
                : [];

            renderSearchStatus();
            renderSearchResults();
            updateSearchMeta();
            updatePaperHighlights();
        }

        function clearSearch() {
            const input = document.getElementById("searchInput");
            input.value = "";
            state.searchTerm = "";
            state.searchResults = [];
            renderSearchStatus();
            renderSearchResults();
            updateSearchMeta();
            updatePaperHighlights();
        }

        function scrollToSection(sectionId) {
            const element = document.getElementById(sectionId);
            if (!element) {
                return;
            }
            toggleSidebar(false);
            element.scrollIntoView({ behavior: "smooth", block: "start" });
        }

        function scrollToFirstSection() {
            if (state.activeSection && state.activeSection.children && state.activeSection.children.length) {
                scrollToSection(state.activeSection.children[0].id);
                return;
            }
            if (state.activeSection) {
                scrollToSection(state.activeSection.id);
            }
        }
        function jumpToPaper(paperId, shouldOpenModal = true) {
            const paperElement = document.getElementById(paperId);
            if (!paperElement) {
                return;
            }

            toggleSidebar(false);
            paperElement.scrollIntoView({ behavior: "smooth", block: "center" });
            paperElement.classList.remove("focus-flash");
            void paperElement.offsetWidth;
            paperElement.classList.add("focus-flash");
            if (shouldOpenModal) {
                setTimeout(() => openPaperModal(paperId), 220);
            }
        }

        function jumpToPaperFromHash() {
            const hashId = decodeURIComponent(window.location.hash.replace(/^#/, ""));
            if (!hashId) {
                return;
            }

            setTimeout(() => {
                jumpToPaper(hashId, false);
            }, 220);
        }

        function fillModalMeta(paper) {
            const metaItems = [
                { label: "年份", value: paper.year || "未标注" },
                { label: "期刊 / 会议", value: paper.venue || "未标注" }
            ];

            document.getElementById("modalMeta").innerHTML = metaItems.map((item) => `
                <div class="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
                    <div class="text-xs uppercase tracking-[0.16em] text-slate-500">${escapeHtml(item.label)}</div>
                    <div class="mt-3 text-lg font-medium text-white">${escapeHtml(item.value)}</div>
                </div>
            `).join("");
        }

        function openPaperModal(paperId) {
            const paper = state.paperById[paperId];
            if (!paper) {
                return;
            }

            state.activePaperId = paperId;

            document.getElementById("modalTags").innerHTML = [
                `<span class="tag rounded-full px-3 py-1 text-xs">${escapeHtml(paper.sectionName)}</span>`,
                ...paper.trail.slice(1).map((part) => `<span class="tag rounded-full px-3 py-1 text-xs">${escapeHtml(part)}</span>`)
            ].join("");
            document.getElementById("modalTitle").textContent = paper.name;
            document.getElementById("modalPath").textContent = `研究路径：${formatTrail(paper.trail)}`;
            fillModalMeta(paper);

            const linkState = [];
            if (paper.link) {
                linkState.push("论文链接");
            }
            if (paper.code) {
                linkState.push("代码链接");
            }
            document.getElementById("modalDescription").textContent =
                linkState.length ? `已附${linkState.join("、")}` : "未附链接信息";

            const paperLink = document.getElementById("modalPaperLink");
            if (paper.link) {
                paperLink.href = paper.link;
                paperLink.classList.remove("pointer-events-none", "opacity-40");
            } else {
                paperLink.removeAttribute("href");
                paperLink.classList.add("pointer-events-none", "opacity-40");
            }

            const codeLink = document.getElementById("modalCodeLink");
            if (paper.code) {
                codeLink.href = paper.code;
                codeLink.classList.remove("hidden");
            } else {
                codeLink.removeAttribute("href");
                codeLink.classList.add("hidden");
            }

            const modal = document.getElementById("paperModal");
            modal.classList.remove("hidden");
            modal.classList.add("flex");
        }

        function closePaperModal() {
            const modal = document.getElementById("paperModal");
            modal.classList.add("hidden");
            modal.classList.remove("flex");
        }

        function locateCurrentPaper() {
            if (!state.activePaperId) {
                return;
            }
            closePaperModal();
            jumpToPaper(state.activePaperId, false);
        }

        async function copyCurrentPaper() {
            const paper = state.paperById[state.activePaperId];
            if (!paper) {
                return;
            }

            const text = [
                paper.name,
                paper.year ? `Year: ${paper.year}` : "",
                paper.venue ? `Venue: ${paper.venue}` : "",
                `Path: ${formatTrail(paper.trail)}`,
                paper.link || "",
                paper.code ? `Code: ${paper.code}` : ""
            ].filter(Boolean).join("\n");

            try {
                await navigator.clipboard.writeText(text);
                showToast("已复制条目信息。");
            } catch (error) {
                showToast("复制失败。");
            }
        }

        function exportData() {
            const dataStr = JSON.stringify(state.data || fallbackMindMapData, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "infrared-mindmap-data.json";
            link.click();
            URL.revokeObjectURL(url);
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

        function toggleSidebar(forceOpen) {
            const sidebar = document.getElementById("sidebar");
            const overlay = document.getElementById("sidebarOverlay");
            const shouldOpen = typeof forceOpen === "boolean"
                ? forceOpen
                : sidebar.classList.contains("-translate-x-full");

            if (window.innerWidth >= 1024) {
                overlay.classList.add("hidden");
                document.body.classList.remove("sidebar-open");
                return;
            }

            sidebar.classList.toggle("-translate-x-full", !shouldOpen);
            overlay.classList.toggle("hidden", !shouldOpen);
            document.body.classList.toggle("sidebar-open", shouldOpen);
        }

        function setActiveNav(sectionId) {
            document.querySelectorAll("[data-nav-button]").forEach((button) => {
                const isActive = button.dataset.navButton === sectionId;
                button.classList.toggle("text-white", isActive);
                button.classList.toggle("text-slate-400", !isActive);
            });
        }

        function setupSectionObserver() {
            if (state.activeSection) {
                setActiveNav(state.activeSection.slug);
            }
        }

        async function loadMindMapData() {
            try {
                const response = await fetch(`${pageRootPath}/infrared-mindmap-data.json`, { cache: "no-store" });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return await response.json();
            } catch (error) {
                console.warn("Falling back to embedded data:", error);
                
                return fallbackMindMapData;
            }
        }

        async function initializePage() {
            state.data = await loadMindMapData();
            state.sections = normalizeSections(state.data);
            const requestedSlug = pageSectionSlug || "traditional";
            state.activeSection = state.sections.find((section) => section.slug === requestedSlug) || state.sections[0] || null;
            state.papers = state.activeSection ? buildPaperIndex([state.activeSection]) : [];
            state.featuredPapers = state.papers.slice(0, 8);
            state.paperById = Object.fromEntries(state.papers.map((paper) => [paper.id, paper]));

            renderHeroCopy();
            renderSidebarStats();
            renderHeroStats();
            renderOverviewCards();
            renderNavList();
            renderSearchStatus();
            renderSections();
            renderSearchResults();
            updateSearchMeta();
            updatePaperHighlights();
            setupSectionObserver();
            jumpToPaperFromHash();
        }

        window.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
                closePaperModal();
                toggleSidebar(false);
            }
        });

        window.addEventListener("resize", () => {
            if (window.innerWidth >= 1024) {
                document.getElementById("sidebarOverlay").classList.add("hidden");
                document.body.classList.remove("sidebar-open");
            }
        });

        window.addEventListener("load", initializePage);









