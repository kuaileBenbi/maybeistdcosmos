const sectionMeta = {
    "传统方法": {
        slug: "traditional",
        title: "传统方法",
        eyebrow: "形态学与局部对比",
        summary: "背景抑制与人类视觉系统方法",
        branchRgb: "92, 227, 194"
    },
    "优化方法": {
        slug: "optimization",
        title: "优化方法",
        eyebrow: "低秩与张量建模",
        summary: "矩阵恢复/张量分解/时空建模",
        branchRgb: "122, 197, 255"
    },
    "深度学习方法": {
        slug: "deep-learning",
        title: "深度学习方法",
        eyebrow: "单帧与时序网络",
        summary: "单帧、多帧与序列建模网络",
        branchRgb: "255, 190, 120"
    },
    "深度展开方法": {
        slug: "unrolling",
        title: "深度展开方法",
        eyebrow: "模型驱动网络",
        summary: "优化迭代与网络结构联合建模",
        branchRgb: "255, 138, 120"
    },
    "资源 Resources": {
        slug: "resources",
        title: "资源",
        eyebrow: "数据集与综述",
        summary: "数据集、综述与基准测试。",
        branchRgb: "129, 174, 255"
    }
};

const friendlyLinks = [
    { name: "GrokCV", href: "https://yimian.grokcv.ai/", note: "南开戴一冕课题组", icon: "fa-solid fa-satellite-dish" },
    { name: "WeiweiDuan", href: "https://mrdec.github.io/", note: "成电纪禄平课题组", icon: "fa-solid fa-wave-square" },
    { name: "北航视觉实验室", href: "https://levir.buaa.edu.cn/", note: "北航史振威课题组", icon: "fa-solid fa-building-columns" },
    { name: "IPIC-Lab", href: "https://github.com/IPIC-Lab", note: "GitHub", icon: "fa-brands fa-github" },
    { name: "zhanglw882", href: "https://github.com/zhanglw882", note: "GitHub", icon: "fa-brands fa-github" }
];
const state = {
    data: null,
    sections: [],
    papers: [],
    featuredPapers: [],
    searchTerm: "",
    searchResults: []
};

let nodeIdSeed = 0;

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

function enrichNode(node, trail, sectionName, sectionSlug, sectionLabel) {
    const enriched = {
        ...node,
        id: `entry-${++nodeIdSeed}`,
        trail: [...trail],
        sectionName,
        sectionSlug,
        sectionLabel
    };

    if (Array.isArray(node.children)) {
        enriched.children = node.children.map((child) =>
            enrichNode(child, [...trail, node.name], sectionName, sectionSlug, sectionLabel)
        );
    }

    if (node.type === "paper" || node.type === "info") {
        enriched.searchText = normalizeText([
            node.name,
            node.year,
            node.venue,
            sectionLabel,
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
            title: section.name,
            eyebrow: "Research Section",
            summary: "Research entries.",
            branchRgb: "144, 195, 255"
        };

        const children = (section.children || []).map((child) =>
            enrichNode(child, [meta.title], section.name, meta.slug, meta.title)
        );
        const paperCount = countByType(section, "paper");
        const infoCount = countByType(section, "info");

        return {
            ...section,
            displayName: meta.title,
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

function cleanNodeLabel(name) {
    return String(name || "").replace(/\s*\(([^)]*)\)\s*$/, "").trim();
}

function getNodeChildren(node) {
    return Array.isArray(node.children) ? node.children : [];
}

function formatLeafMeta(node) {
    if (node.type === "paper") {
        return node.year || "";
    }
    if (node.type === "info") {
        return "";
    }

    const paperCount = countByType(node, "paper");
    const infoCount = countByType(node, "info");
    const entryCount = paperCount || infoCount;

    if (entryCount) {
        return `${entryCount}项`;
    }

    return getNodeChildren(node).length ? `${getNodeChildren(node).length}支` : "";
}

function buildLeafPreview(node, limit) {
    const children = getNodeChildren(node);
    if (!children.length) {
        return [];
    }

    const leaves = children.slice(0, limit).map((child) => ({
        label: cleanNodeLabel(child.name),
        meta: formatLeafMeta(child)
    }));

    if (children.length > limit) {
        leaves.push({
            label: `其余 ${children.length - limit} 项`,
            meta: ""
        });
    }

    return leaves;
}

function buildBranchGroups(section) {
    return section.children.slice(0, 4).map((child) => {
        const nested = getNodeChildren(child).some((grandChild) => getNodeChildren(grandChild).length);
        return {
            title: cleanNodeLabel(child.name),
            leaves: buildLeafPreview(child, nested ? 4 : 3)
        };
    });
}

function getResourceGroupIcon(title) {
    const value = String(title || "");
    if (value.includes("Datasets")) {
        return "fa-solid fa-database";
    }
    if (value.includes("Surveys")) {
        return "fa-solid fa-book-open";
    }
    if (value.includes("Benchmarks")) {
        return "fa-solid fa-chart-line";
    }
    return "fa-solid fa-link";
}

function buildResourceGroups(section) {
    if (!section) {
        return [];
    }

    return section.children.slice(0, 4).map((child) => ({
        title: cleanNodeLabel(child.name),
        count: countByType(child, "paper") || countByType(child, "info") || getNodeChildren(child).length,
        leaves: buildLeafPreview(child, 3)
    }));
}

function renderBranch(section, side) {
    const groups = buildBranchGroups(section);

    return `
        <a
            href="${buildSectionUrl(section.slug)}"
            class="mindmap-branch mindmap-branch--${escapeHtml(side)}"
            style="--branch-rgb:${escapeHtml(section.meta.branchRgb)}">
            <div class="mindmap-branch__head">
                <span class="mindmap-branch__eyebrow">${escapeHtml(section.meta.eyebrow)}</span>
                <span class="mindmap-branch__count">${escapeHtml(section.entryCount)} 项</span>
            </div>
            <div class="mindmap-branch__main">
                <div class="mindmap-branch__icon">${escapeHtml(section.icon || "•")}</div>
                <div>
                    <h3 class="mindmap-branch__title">${escapeHtml(section.displayName)}</h3>
                    <p class="mindmap-branch__summary">${escapeHtml(section.meta.summary)}</p>
                </div>
            </div>
            <div class="mindmap-group-list">
                ${groups.map((group) => `
                    <div class="mindmap-group">
                        <div class="mindmap-group__title">${escapeHtml(group.title)}</div>
                        <div class="mindmap-group__leaves">
                            ${group.leaves.map((leaf) => `
                                <span class="mindmap-leaf">
                                    <span class="mindmap-leaf__label">${escapeHtml(leaf.label)}</span>
                                    ${leaf.meta ? `<em class="mindmap-leaf__meta">${escapeHtml(leaf.meta)}</em>` : ""}
                                </span>
                            `).join("")}
                        </div>
                    </div>
                `).join("")}
            </div>
        </a>
    `;
}

function renderModuleCards() {
    const container = document.getElementById("moduleCards");
    const coreSections = state.sections.filter((section) => section.slug !== "resources");
    const midpoint = Math.ceil(coreSections.length / 2);
    const leftSections = coreSections.slice(0, midpoint);
    const rightSections = coreSections.slice(midpoint);

    container.innerHTML = `
        <div class="mindmap-shell">
            <div class="mindmap-side mindmap-side--left">
                ${leftSections.map((section) => renderBranch(section, "left")).join("")}
            </div>
            <div class="mindmap-center">
                <div class="mindmap-root">
                    <h3 class="mindmap-root__title">红外小目标检测</h3>
                    <p class="mindmap-root__text">研究方向</p>
                </div>
            </div>
            <div class="mindmap-side mindmap-side--right">
                ${rightSections.map((section) => renderBranch(section, "right")).join("")}
            </div>
        </div>
    `;
}

function renderResourcePanel() {
    const container = document.getElementById("resourcePanel");
    if (!container) {
        return;
    }

    const resourceSection = state.sections.find((section) => section.slug === "resources");
    const groups = buildResourceGroups(resourceSection);

    container.innerHTML = `
        <div class="resource-panel__head">
            <div>
                <div class="resource-panel__eyebrow">资源</div>
                <h2 class="resource-panel__title">数据集与链接</h2>
            </div>
            <a href="${buildSectionUrl("resources")}" class="resource-panel__entry-link">资源页</a>
        </div>
        <div class="resource-panel__groups">
            ${groups.map((group) => `
                <a href="${buildSectionUrl("resources")}" class="resource-group">
                    <div class="resource-group__row">
                        <div class="resource-group__title-wrap">
                            <span class="resource-group__icon"><i class="${getResourceGroupIcon(group.title)}"></i></span>
                            <h3 class="resource-group__title">${escapeHtml(group.title)}</h3>
                        </div>
                        <span class="resource-group__count">${escapeHtml(group.count)} 项</span>
                    </div>
                    <div class="resource-group__leaves">
                        ${group.leaves.map((leaf) => `
                            <span class="resource-group__leaf">
                                <span>${escapeHtml(leaf.label)}</span>
                                ${leaf.meta ? `<em>${escapeHtml(leaf.meta)}</em>` : ""}
                            </span>
                        `).join("")}
                    </div>
                </a>
            `).join("")}
        </div>
        <div class="resource-panel__links">
            <div class="resource-panel__eyebrow">友情链接</div>
            <div class="resource-links">
                ${friendlyLinks.map((item) => `
                    <a href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer" class="resource-link-card">
                        <div class="resource-link-card__main">
                            <span class="resource-link-card__icon"><i class="${escapeHtml(item.icon || "fa-solid fa-link")}"></i></span>
                            <div>
                                <span class="resource-link-card__name">${escapeHtml(item.name)}</span>
                                <span class="resource-link-card__note">${escapeHtml(item.note)}</span>
                            </div>
                        </div>
                        <span class="resource-link-card__arrow"><i class="fa-solid fa-arrow-up-right-from-square"></i></span>
                    </a>
                `).join("")}
            </div>
        </div>
    `;
}

function renderSearchResults() {
    const hasKeyword = Boolean(state.searchTerm);
    const list = hasKeyword ? state.searchResults : state.featuredPapers;
    const container = document.getElementById("searchResults");

    if (hasKeyword && !list.length) {
        container.innerHTML = `
            <div class="rounded-[1.5rem] border border-dashed border-white/10 bg-white/5 px-4 py-5 text-sm leading-7 text-slate-400">
                未检索到相关条目。
            </div>
        `;
        return;
    }

    container.innerHTML = list.map((paper) => `
        <a href="${buildSectionUrl(paper.sectionSlug, paper.id)}" class="search-result block rounded-[1.3rem] border border-white/10 bg-white/5 px-4 py-4 text-left hover:border-cyan-400/35">
            <div class="flex items-start justify-between gap-3">
                <div>
                    <div class="font-medium leading-7 text-white">${escapeHtml(paper.name)}</div>
                    <div class="mt-1 text-xs leading-6 text-slate-400">${escapeHtml(paper.sectionLabel)} / ${escapeHtml(paper.trail.slice(1).join(" / "))}</div>
                </div>
                <span class="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-slate-400">${escapeHtml(paper.year || "-")}</span>
            </div>
        </a>
    `).join("");
}

function renderLatestPapers() {
    document.getElementById("latestPapers").innerHTML = state.featuredPapers.map((paper) => `
        <a href="${buildSectionUrl(paper.sectionSlug, paper.id)}" class="paper-card rounded-[1.5rem] p-5">
            <div class="flex items-start justify-between gap-4">
                <div>
                    <h4 class="text-lg font-semibold leading-7 text-white">${escapeHtml(paper.name)}</h4>
                    <p class="mt-3 text-sm leading-7 text-slate-400">${escapeHtml(paper.sectionLabel)}</p>
                </div>
                <span class="tag rounded-full px-3 py-1 text-xs">${escapeHtml(paper.year || "-")}</span>
            </div>
            <div class="mt-4 text-sm leading-7 text-slate-300">${escapeHtml(paper.venue || "未标注")}</div>
        </a>
    `).join("");
}

function updateSearchMeta() {
    const meta = document.getElementById("searchMeta");
    if (!state.searchTerm) {
        meta.textContent = "DNANet / TGRS / 多帧 / 传统方法";
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
    renderResourcePanel();
    renderSearchResults();
    renderLatestPapers();
    updateSearchMeta();

    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", handleSearchInput);
    }
}

window.addEventListener("load", initializePage);
