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

const BENCHMARK_SOURCES = [
    "./benchmark-data.json",
    "https://raw.githubusercontent.com/kuaileBenbi/BasicIRSTD/main/benchmark-data.json"
];

const BENCHMARK_REPO_URL = "https://github.com/kuaileBenbi/BasicIRSTD";

const BENCHMARK_METRIC_META = {
    pd_fa: { label: "PD-FA Curve" },
    miou: { label: "mIoU" },
    niou: { label: "nIoU" },
    f1: { label: "F1" },
    precision: { label: "Precision" },
    recall: { label: "Recall" },
    pd: { label: "Pd" },
    fa: { label: "Fa" },
    fps: { label: "FPS" },
    latency_ms: { label: "Latency (ms)" },
    params_m: { label: "Params (M)" },
    flops_g: { label: "FLOPs (G)" }
};

const BENCHMARK_METRIC_PRIORITY = [
    "pd_fa",
    "miou",
    "niou",
    "f1",
    "pd",
    "fa",
    "fps",
    "latency_ms",
    "params_m",
    "flops_g",
    "precision",
    "recall"
];

const PERCENT_LIKE_METRICS = new Set(["miou", "niou", "f1", "precision", "recall", "pd"]);
const LOWER_BETTER_METRICS = new Set(["fa", "latency_ms", "params_m", "flops_g"]);
const BENCHMARK_COLOR_PALETTE = ["#5ce3c2", "#7ac5ff", "#ffbe78", "#ff8a78", "#b2a6ff", "#f7d56a", "#66d1ff", "#ff9dc8"];

const state = {
    data: null,
    sections: [],
    papers: [],
    featuredPapers: [],
    searchTerm: "",
    searchResults: [],
    benchmark: null,
    benchmarkSelection: {
        datasetId: "",
        metric: ""
    },
    benchmarkChart: null,
    benchmarkSource: "",
    benchmarkError: ""
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

function flattenSearchValues(values) {
    return values.reduce((items, value) => {
        if (Array.isArray(value)) {
            value.filter(Boolean).forEach((entry) => items.push(String(entry)));
            return items;
        }
        if (value) {
            items.push(String(value));
        }
        return items;
    }, []);
}

function slugify(value) {
    const normalized = normalizeText(value)
        .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return normalized || "item";
}

function extractYearNumber(value) {
    const matches = String(value || "").match(/\d{4}/g);
    if (!matches) {
        return 0;
    }
    return Math.max(...matches.map(Number));
}

function extractSortNumber(node) {
    const preciseDate = node && (node.updated || node.published);
    const timestamp = Date.parse(String(preciseDate || ""));
    if (!Number.isNaN(timestamp)) {
        return timestamp;
    }
    return extractYearNumber(node && node.year) * 1000;
}

function parseNumericValue(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value !== "string") {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    const isPercent = trimmed.endsWith("%");
    const numeric = Number(trimmed.replace(/,/g, "").replace(/%/g, ""));
    if (!Number.isFinite(numeric)) {
        return null;
    }
    return isPercent ? numeric / 100 : numeric;
}

function normalizeMetricValue(metric, value) {
    if (!Number.isFinite(value)) {
        return null;
    }
    if (PERCENT_LIKE_METRICS.has(metric) && value > 1.5) {
        return value / 100;
    }
    return value;
}

function normalizeCurvePoints(points) {
    if (!Array.isArray(points)) {
        return [];
    }

    return points
        .map((point) => {
            if (Array.isArray(point) && point.length >= 2) {
                return {
                    fa: parseNumericValue(point[0]),
                    pd: normalizeMetricValue("pd", parseNumericValue(point[1]))
                };
            }

            if (point && typeof point === "object") {
                return {
                    fa: parseNumericValue(point.fa ?? point.false_alarm ?? point.x),
                    pd: normalizeMetricValue("pd", parseNumericValue(point.pd ?? point.probability_detection ?? point.y))
                };
            }

            return null;
        })
        .filter((point) => point && Number.isFinite(point.fa) && point.fa > 0 && Number.isFinite(point.pd))
        .sort((left, right) => left.fa - right.fa);
}

function formatDateLabel(value) {
    if (!value) {
        return "未标注";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }
    return date.toISOString().slice(0, 10);
}

function formatBenchmarkMetricLabel(metric) {
    return BENCHMARK_METRIC_META[metric]?.label || String(metric || "").replace(/_/g, " ").toUpperCase();
}

function formatBenchmarkMetricValue(metric, value) {
    if (!Number.isFinite(value)) {
        return "N/A";
    }
    if (PERCENT_LIKE_METRICS.has(metric)) {
        const scaled = value <= 1.5 ? value * 100 : value;
        return `${scaled.toFixed(2)}%`;
    }
    if (metric === "fa") {
        const absolute = Math.abs(value);
        if (absolute >= 1e4 || (absolute > 0 && absolute < 1e-2)) {
            return value.toExponential(2);
        }
        if (absolute >= 100) {
            return value.toFixed(1);
        }
        return value.toFixed(3);
    }
    if (metric === "fps") {
        return value.toFixed(1);
    }
    if (metric === "latency_ms") {
        return `${value.toFixed(1)} ms`;
    }
    if (metric === "params_m" || metric === "flops_g") {
        return value.toFixed(2);
    }
    return value.toFixed(4);
}

function formatBenchmarkAxisValue(metric, value) {
    if (!Number.isFinite(value)) {
        return "-";
    }
    if (PERCENT_LIKE_METRICS.has(metric)) {
        return `${value.toFixed(1)}%`;
    }
    if (metric === "fa") {
        const absolute = Math.abs(value);
        if (absolute >= 1e4 || (absolute > 0 && absolute < 1e-2)) {
            return value.toExponential(1);
        }
        if (absolute >= 100) {
            return value.toFixed(0);
        }
        return value.toFixed(2);
    }
    if (metric === "fps") {
        return value.toFixed(1);
    }
    if (metric === "latency_ms") {
        return `${value.toFixed(1)} ms`;
    }
    return value.toFixed(2);
}

function formatBenchmarkChartValue(metric, value) {
    if (!Number.isFinite(value)) {
        return null;
    }
    if (PERCENT_LIKE_METRICS.has(metric)) {
        return (value <= 1.5 ? value : value / 100) * 100;
    }
    return value;
}

function isLowerBetterMetric(metric) {
    return LOWER_BETTER_METRICS.has(metric);
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
        enriched.searchText = normalizeText(flattenSearchValues([
            node.name,
            node.year,
            node.venue,
            node.authors,
            node.abstract,
            node.comment,
            node.journal_ref,
            node.source_label,
            node.classification_group,
            node.classification_tags,
            sectionLabel,
            ...trail
        ]).join(" "));
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
    papers.sort((a, b) => extractSortNumber(b) - extractSortNumber(a));
    return papers;
}

function buildSectionUrl(sectionSlug, paperId = "") {
    const hash = paperId ? `#${paperId}` : "";
    return `./${encodeURIComponent(sectionSlug)}/index.html${hash}`;
}

function cleanNodeLabel(name) {
    return String(name || "").replace(/\s*\(([^)]*)\)\s*$/, "").trim();
}

function canonicalizeLookupKey(value) {
    return cleanNodeLabel(value)
        .toLowerCase()
        .replace(/&/g, "and")
        .replace(/[\s\-_/:[\]{}().,]+/g, "")
        .replace(/[^a-z0-9\u4e00-\u9fa5]/g, "")
        .trim();
}

function addLookupCandidate(lookup, candidate, paper) {
    [normalizeText(candidate), canonicalizeLookupKey(candidate)].forEach((key) => {
        if (key && !lookup.has(key)) {
            lookup.set(key, paper);
        }
    });
}

function buildPaperLookup(papers) {
    const lookup = new Map();

    papers.forEach((paper) => {
        [paper.name, cleanNodeLabel(paper.name)].forEach((candidate) => addLookupCandidate(lookup, candidate, paper));
    });

    return lookup;
}

function findMatchingPaper(lookup, candidates) {
    for (const candidate of candidates) {
        const normalized = normalizeText(candidate);
        if (normalized && lookup.has(normalized)) {
            return lookup.get(normalized);
        }

        const canonical = canonicalizeLookupKey(candidate);
        if (canonical && lookup.has(canonical)) {
            return lookup.get(canonical);
        }
    }
    return null;
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

function upsertDataset(datasetMap, id, partial = {}) {
    const key = slugify(id || partial.name || `dataset-${datasetMap.size + 1}`);
    const existing = datasetMap.get(key) || {
        id: key,
        name: partial.name || id || key,
        task: partial.task || "",
        defaultMetrics: [],
        curveMetrics: [],
        description: partial.description || "",
        paperLink: partial.paperLink || ""
    };

    existing.name = partial.name || existing.name;
    existing.task = partial.task || existing.task;
    existing.description = partial.description || existing.description;
    existing.paperLink = partial.paperLink || existing.paperLink;
    if (Array.isArray(partial.defaultMetrics) && partial.defaultMetrics.length) {
        existing.defaultMetrics = partial.defaultMetrics;
    }
    if (Array.isArray(partial.curveMetrics) && partial.curveMetrics.length) {
        existing.curveMetrics = partial.curveMetrics;
    }

    datasetMap.set(key, existing);
    return existing;
}

function upsertMethod(methodMap, id, partial = {}) {
    const key = slugify(id || partial.name || `method-${methodMap.size + 1}`);
    const existing = methodMap.get(key) || {
        id: key,
        name: partial.name || id || key,
        family: partial.family || "",
        paperName: partial.paperName || partial.name || id || key,
        paperLink: partial.paperLink || "",
        codeLink: partial.codeLink || "",
        venue: partial.venue || "",
        year: partial.year || "",
        tags: Array.isArray(partial.tags) ? partial.tags : []
    };

    existing.name = partial.name || existing.name;
    existing.family = partial.family || existing.family;
    existing.paperName = partial.paperName || existing.paperName;
    existing.paperLink = partial.paperLink || existing.paperLink;
    existing.codeLink = partial.codeLink || existing.codeLink;
    existing.venue = partial.venue || existing.venue;
    existing.year = partial.year || existing.year;
    if (Array.isArray(partial.tags) && partial.tags.length) {
        existing.tags = partial.tags;
    }

    methodMap.set(key, existing);
    return existing;
}

function getAvailableBenchmarkMetrics(results) {
    const metricSet = new Set();

    results.forEach((result) => {
        Object.keys(result.metrics || {}).forEach((metric) => {
            if (Number.isFinite(result.metrics[metric])) {
                metricSet.add(metric);
            }
        });
        if (Array.isArray(result.curves?.pd_fa) && result.curves.pd_fa.length) {
            metricSet.add("pd_fa");
        }
    });

    const ordered = BENCHMARK_METRIC_PRIORITY.filter((metric) => metricSet.has(metric));
    Array.from(metricSet).sort().forEach((metric) => {
        if (!ordered.includes(metric)) {
            ordered.push(metric);
        }
    });
    return ordered;
}

function pickDefaultBenchmarkMetric(dataset) {
    if (!dataset) {
        return "";
    }
    if (dataset.availableMetrics.includes("pd_fa")) {
        return "pd_fa";
    }
    return dataset.defaultMetrics.find((metric) => dataset.availableMetrics.includes(metric))
        || dataset.availableMetrics[0]
        || "";
}

function getBenchmarkMetricValue(result, metric) {
    if (metric === "pd_fa") {
        if (Number.isFinite(result.metrics.pd)) {
            return result.metrics.pd;
        }
        const curve = result.curves?.pd_fa || [];
        return curve.length ? curve[curve.length - 1].pd : null;
    }
    return result.metrics?.[metric] ?? null;
}

function normalizeBenchmarkData(raw, paperLookup) {
    if (!raw || !Array.isArray(raw.results)) {
        return null;
    }

    const datasetMap = new Map();
    const methodMap = new Map();
    const datasetsRaw = Array.isArray(raw.datasets) ? raw.datasets : [];
    const methodsRaw = Array.isArray(raw.methods) ? raw.methods : [];

    datasetsRaw.forEach((dataset, index) => {
        upsertDataset(datasetMap, dataset.id || dataset.dataset_id || dataset.name || `dataset-${index + 1}`, {
            name: dataset.name || dataset.id || `Dataset ${index + 1}`,
            task: dataset.task || dataset.type || "",
            description: dataset.description || "",
            paperLink: dataset.paper_link || dataset.paperLink || "",
            defaultMetrics: dataset.default_metrics || dataset.defaultMetrics || [],
            curveMetrics: dataset.curve_metrics || dataset.curveMetrics || []
        });
    });

    methodsRaw.forEach((method, index) => {
        upsertMethod(methodMap, method.id || method.method_id || method.name || `method-${index + 1}`, {
            name: method.name || method.id || `Method ${index + 1}`,
            family: method.family || "",
            paperName: method.paper_name || method.paperName || method.name || "",
            paperLink: method.paper_link || method.paperLink || "",
            codeLink: method.code_link || method.codeLink || "",
            venue: method.venue || "",
            year: method.year || "",
            tags: method.tags || []
        });
    });

    const normalizedResults = raw.results.map((result, index) => {
        const datasetKey = slugify(
            result.dataset_id
            || result.datasetId
            || result.dataset_name
            || result.datasetName
            || result.dataset
            || `dataset-${index + 1}`
        );
        const methodKey = slugify(
            result.method_id
            || result.methodId
            || result.method_name
            || result.methodName
            || result.method
            || `method-${index + 1}`
        );

        const dataset = upsertDataset(datasetMap, datasetKey, {
            name: result.dataset_name || result.datasetName || result.dataset || datasetKey,
            task: result.task || "",
            description: result.dataset_description || result.datasetDescription || "",
            paperLink: result.dataset_paper_link || result.datasetPaperLink || ""
        });

        const method = upsertMethod(methodMap, methodKey, {
            name: result.method_name || result.methodName || result.method || methodKey,
            family: result.family || "",
            paperName: result.paper_name || result.paperName || result.method_name || result.methodName || result.method || "",
            paperLink: result.paper_link || result.paperLink || "",
            codeLink: result.code_link || result.codeLink || "",
            venue: result.venue || "",
            year: result.year || "",
            tags: result.tags || []
        });

        const rawMetrics = result.metrics && typeof result.metrics === "object" ? result.metrics : {};
        const metrics = {};

        Object.entries(rawMetrics).forEach(([metric, rawValue]) => {
            const numeric = parseNumericValue(rawValue);
            if (numeric !== null) {
                metrics[metric] = normalizeMetricValue(metric, numeric);
            }
        });

        BENCHMARK_METRIC_PRIORITY.filter((metric) => metric !== "pd_fa").forEach((metric) => {
            if (!Number.isFinite(metrics[metric])) {
                const numeric = parseNumericValue(result[metric]);
                if (numeric !== null) {
                    metrics[metric] = normalizeMetricValue(metric, numeric);
                }
            }
        });

        const curves = {};
        const rawCurves = result.curves && typeof result.curves === "object" ? result.curves : {};
        const pdFaPoints = normalizeCurvePoints(rawCurves.pd_fa || rawCurves.pdFa || result.pd_fa || result.pdFa);
        if (pdFaPoints.length) {
            curves.pd_fa = pdFaPoints;
        }

        const matchingPaper = findMatchingPaper(paperLookup, [
            method.paperName,
            method.name,
            method.id,
            result.paper_name,
            result.paperName,
            result.name,
            result.method_id,
            result.methodId
        ]);

        return {
            id: `${dataset.id}-${method.id}-${index + 1}`,
            datasetId: dataset.id,
            datasetName: dataset.name,
            methodId: method.id,
            methodName: method.name,
            paperName: method.paperName || method.name,
            paperLink: method.paperLink,
            codeLink: method.codeLink,
            venue: method.venue,
            year: method.year,
            tags: method.tags,
            split: result.split || "",
            setting: result.setting || "",
            metrics,
            curves,
            linkedPaperUrl: matchingPaper ? buildSectionUrl(matchingPaper.sectionSlug, matchingPaper.id) : "",
            linkedPaperName: matchingPaper ? matchingPaper.name : ""
        };
    });

    if (!normalizedResults.length) {
        return null;
    }

    const datasets = Array.from(datasetMap.values())
        .map((dataset) => {
            const results = normalizedResults.filter((result) => result.datasetId === dataset.id);
            if (!results.length) {
                return null;
            }
            const availableMetrics = getAvailableBenchmarkMetrics(results);
            return {
                ...dataset,
                results,
                availableMetrics,
                defaultMetric: pickDefaultBenchmarkMetric({
                    availableMetrics,
                    defaultMetrics: dataset.defaultMetrics || []
                }),
                methodCount: new Set(results.map((result) => result.methodId)).size
            };
        })
        .filter(Boolean);

    if (!datasets.length) {
        return null;
    }

    return {
        meta: raw.meta || {},
        datasets,
        methodsCount: new Set(normalizedResults.map((result) => result.methodId)).size,
        resultCount: normalizedResults.length
    };
}

function getSelectedBenchmarkDataset() {
    if (!state.benchmark) {
        return null;
    }
    return state.benchmark.datasets.find((dataset) => dataset.id === state.benchmarkSelection.datasetId) || state.benchmark.datasets[0] || null;
}

function ensureBenchmarkSelection() {
    if (!state.benchmark || !state.benchmark.datasets.length) {
        state.benchmarkSelection.datasetId = "";
        state.benchmarkSelection.metric = "";
        return;
    }

    const dataset = getSelectedBenchmarkDataset() || state.benchmark.datasets[0];
    state.benchmarkSelection.datasetId = dataset.id;

    if (!dataset.availableMetrics.includes(state.benchmarkSelection.metric)) {
        state.benchmarkSelection.metric = dataset.defaultMetric || dataset.availableMetrics[0] || "";
    }
}

function buildBenchmarkSummaryChips() {
    const container = document.getElementById("benchmarkSummaryChips");
    if (!container) {
        return;
    }

    if (!state.benchmark) {
        container.innerHTML = `
            <span class="benchmark-chip"><strong>Benchmark</strong> 等待数据接入</span>
        `;
        return;
    }

    const generatedAt = state.benchmark.meta.generated_at || state.benchmark.meta.generatedAt || "";
    const chips = [
        { label: "Datasets", value: state.benchmark.datasets.length },
        { label: "Methods", value: state.benchmark.methodsCount },
        { label: "Results", value: state.benchmark.resultCount }
    ];

    if (generatedAt) {
        chips.push({ label: "Updated", value: formatDateLabel(generatedAt) });
    }

    container.innerHTML = chips.map((chip) => `
        <span class="benchmark-chip">
            <strong>${escapeHtml(chip.label)}</strong>
            <span>${escapeHtml(chip.value)}</span>
        </span>
    `).join("");
}

function renderBenchmarkControls() {
    const container = document.getElementById("benchmarkControls");
    if (!container) {
        return;
    }

    if (!state.benchmark) {
        container.innerHTML = "";
        return;
    }

    const dataset = getSelectedBenchmarkDataset();
    if (!dataset) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = `
        <div class="benchmark-control">
            <label for="benchmarkDatasetSelect">Dataset</label>
            <select id="benchmarkDatasetSelect" class="benchmark-select" onchange="handleBenchmarkDatasetChange(event)">
                ${state.benchmark.datasets.map((item) => `
                    <option value="${escapeHtml(item.id)}" ${item.id === dataset.id ? "selected" : ""}>${escapeHtml(item.name)}</option>
                `).join("")}
            </select>
        </div>
        <div class="benchmark-control">
            <label for="benchmarkMetricSelect">Metric</label>
            <select id="benchmarkMetricSelect" class="benchmark-select" onchange="handleBenchmarkMetricChange(event)">
                ${dataset.availableMetrics.map((metric) => `
                    <option value="${escapeHtml(metric)}" ${metric === state.benchmarkSelection.metric ? "selected" : ""}>${escapeHtml(formatBenchmarkMetricLabel(metric))}</option>
                `).join("")}
            </select>
        </div>
    `;
}

function renderBenchmarkEmptyState(message) {
    const stateNode = document.getElementById("benchmarkChartState");
    const chartNode = document.getElementById("benchmarkChart");
    if (!stateNode || !chartNode) {
        return;
    }

    stateNode.classList.remove("hidden");
    stateNode.textContent = message;
    chartNode.style.display = "none";

    if (state.benchmarkChart) {
        state.benchmarkChart.dispose();
        state.benchmarkChart = null;
    }
}

function clearBenchmarkEmptyState() {
    const stateNode = document.getElementById("benchmarkChartState");
    const chartNode = document.getElementById("benchmarkChart");
    if (!stateNode || !chartNode) {
        return;
    }

    stateNode.classList.add("hidden");
    stateNode.textContent = "";
    chartNode.style.display = "block";
}

function getTopBenchmarkResults(dataset, metric, limit) {
    const ranked = dataset.results
        .map((result) => ({
            ...result,
            sortValue: getBenchmarkMetricValue(result, metric)
        }))
        .filter((result) => Number.isFinite(result.sortValue))
        .sort((left, right) => {
            if (isLowerBetterMetric(metric)) {
                return left.sortValue - right.sortValue;
            }
            return right.sortValue - left.sortValue;
        });

    return ranked.slice(0, limit);
}

function getBenchmarkResultLink(result) {
    if (result.linkedPaperUrl) {
        return { href: result.linkedPaperUrl, external: false };
    }
    if (result.paperLink) {
        return { href: result.paperLink, external: true };
    }
    return null;
}

function renderBenchmarkLeaderboard() {
    const container = document.getElementById("benchmarkLeaderboard");
    if (!container) {
        return;
    }

    if (!state.benchmark) {
        container.innerHTML = `
            <div class="benchmark-empty">等待 benchmark 数据接入后显示方法榜单。</div>
        `;
        return;
    }

    const dataset = getSelectedBenchmarkDataset();
    if (!dataset) {
        container.innerHTML = "";
        return;
    }

    const metric = state.benchmarkSelection.metric;
    const results = getTopBenchmarkResults(dataset, metric, metric === "pd_fa" ? 6 : 8);
    if (!results.length) {
        container.innerHTML = `
            <div class="benchmark-empty">当前数据集没有可用于 ${formatBenchmarkMetricLabel(metric)} 的数值。</div>
        `;
        return;
    }

    container.innerHTML = results.map((result, index) => {
        const link = getBenchmarkResultLink(result);
        const isLink = Boolean(link);
        const wrapperTag = isLink ? "a" : "div";
        const hrefAttr = isLink ? `href="${escapeHtml(link.href)}"` : "";
        const targetAttr = isLink && link.external ? ` target="_blank" rel="noreferrer"` : "";
        const modifierClass = isLink ? "" : " benchmark-rank-card--static";
        return `
            <${wrapperTag} ${hrefAttr}${targetAttr} class="benchmark-rank-card${modifierClass}">
                <div class="benchmark-rank-card__row">
                    <div class="flex items-start gap-3 min-w-0">
                        <span class="benchmark-rank-card__index">${index + 1}</span>
                        <div class="min-w-0">
                            <div class="benchmark-rank-card__title">${escapeHtml(result.methodName)}</div>
                            <div class="benchmark-rank-card__meta">${escapeHtml(result.paperName || result.linkedPaperName || result.datasetName)}</div>
                        </div>
                    </div>
                    <div class="benchmark-rank-card__value">${escapeHtml(formatBenchmarkMetricValue(metric, result.sortValue))}</div>
                </div>
            </${wrapperTag}>
        `;
    }).join("");
}

function buildBenchmarkBarOption(dataset, metric) {
    const ranked = getTopBenchmarkResults(dataset, metric, 8);
    const labels = ranked.map((result) => result.methodName).reverse();
    const values = ranked.map((result) => formatBenchmarkChartValue(metric, result.sortValue)).reverse();
    const unitLabel = PERCENT_LIKE_METRICS.has(metric) ? " (%)" : "";

    return {
        backgroundColor: "transparent",
        animationDuration: 500,
        grid: { top: 18, left: 18, right: 18, bottom: 18, containLabel: true },
        tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            backgroundColor: "rgba(8, 15, 26, 0.96)",
            borderColor: "rgba(92, 227, 194, 0.22)",
            textStyle: { color: "#e8f1ff" },
            formatter(params) {
                const item = params[0];
                const result = ranked[ranked.length - 1 - item.dataIndex];
                return [
                    `<strong>${escapeHtml(result.methodName)}</strong>`,
                    `${escapeHtml(formatBenchmarkMetricLabel(metric))}: ${escapeHtml(formatBenchmarkMetricValue(metric, result.sortValue))}`,
                    result.paperName ? `${escapeHtml(result.paperName)}` : ""
                ].filter(Boolean).join("<br>");
            }
        },
        xAxis: {
            type: "value",
            name: `${formatBenchmarkMetricLabel(metric)}${unitLabel}`,
            nameTextStyle: { color: "#91a6c9", padding: [0, 0, 0, 4] },
            axisLabel: {
                color: "#91a6c9",
                formatter(value) {
                    return formatBenchmarkAxisValue(metric, value);
                }
            },
            splitLine: { lineStyle: { color: "rgba(144, 195, 255, 0.08)" } }
        },
        yAxis: {
            type: "category",
            data: labels,
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: { color: "#dbe9ff" }
        },
        series: [
            {
                type: "bar",
                data: values,
                barMaxWidth: 18,
                itemStyle: {
                    borderRadius: [0, 999, 999, 0],
                    color(params) {
                        return BENCHMARK_COLOR_PALETTE[(ranked.length - 1 - params.dataIndex) % BENCHMARK_COLOR_PALETTE.length];
                    }
                }
            }
        ]
    };
}

function buildBenchmarkCurveOption(dataset) {
    const ranked = getTopBenchmarkResults(dataset, "pd_fa", 6)
        .filter((result) => Array.isArray(result.curves?.pd_fa) && result.curves.pd_fa.length);

    return {
        backgroundColor: "transparent",
        color: BENCHMARK_COLOR_PALETTE,
        animationDuration: 500,
        grid: { top: 44, left: 18, right: 18, bottom: 18, containLabel: true },
        legend: { top: 0, textStyle: { color: "#dbe9ff" } },
        tooltip: {
            trigger: "item",
            backgroundColor: "rgba(8, 15, 26, 0.96)",
            borderColor: "rgba(92, 227, 194, 0.22)",
            textStyle: { color: "#e8f1ff" },
            formatter(params) {
                const data = params.data || [];
                return [
                    `<strong>${escapeHtml(params.seriesName)}</strong>`,
                    `FA: ${escapeHtml(formatBenchmarkMetricValue("fa", data[0]))}`,
                    `Pd: ${escapeHtml(formatBenchmarkMetricValue("pd", data[1] / 100))}`
                ].join("<br>");
            }
        },
        xAxis: {
            type: "log",
            name: "FA",
            min: "dataMin",
            max: "dataMax",
            axisLabel: {
                color: "#91a6c9",
                formatter(value) {
                    return formatBenchmarkAxisValue("fa", value);
                }
            },
            splitLine: { lineStyle: { color: "rgba(144, 195, 255, 0.08)" } }
        },
        yAxis: {
            type: "value",
            name: "Pd (%)",
            min: 0,
            max: 100,
            axisLabel: {
                color: "#91a6c9",
                formatter(value) {
                    return `${value.toFixed(0)}%`;
                }
            },
            splitLine: { lineStyle: { color: "rgba(144, 195, 255, 0.08)" } }
        },
        series: ranked.map((result) => ({
            name: result.methodName,
            type: "line",
            smooth: true,
            symbol: "circle",
            symbolSize: 7,
            lineStyle: { width: 2.5 },
            emphasis: { focus: "series" },
            data: result.curves.pd_fa.map((point) => [point.fa, formatBenchmarkChartValue("pd", point.pd)])
        }))
    };
}

function renderBenchmarkChart() {
    if (!state.benchmark) {
        renderBenchmarkEmptyState("当前没有可展示的 benchmark 数据。");
        return;
    }

    if (!window.echarts) {
        renderBenchmarkEmptyState("图表库未成功加载，无法渲染 benchmark 图。");
        return;
    }

    const dataset = getSelectedBenchmarkDataset();
    const metric = state.benchmarkSelection.metric;
    if (!dataset || !metric) {
        renderBenchmarkEmptyState("当前 benchmark 数据不完整。");
        return;
    }

    const hasData = metric === "pd_fa"
        ? dataset.results.some((result) => Array.isArray(result.curves?.pd_fa) && result.curves.pd_fa.length)
        : dataset.results.some((result) => Number.isFinite(getBenchmarkMetricValue(result, metric)));

    if (!hasData) {
        renderBenchmarkEmptyState(`数据集 ${dataset.name} 目前没有可用于 ${formatBenchmarkMetricLabel(metric)} 的可视化数据。`);
        return;
    }

    const chartNode = document.getElementById("benchmarkChart");
    if (!chartNode) {
        return;
    }

    clearBenchmarkEmptyState();
    if (!state.benchmarkChart) {
        state.benchmarkChart = window.echarts.init(chartNode);
    }

    const option = metric === "pd_fa"
        ? buildBenchmarkCurveOption(dataset)
        : buildBenchmarkBarOption(dataset, metric);

    state.benchmarkChart.setOption(option, true);
    state.benchmarkChart.resize();
}

function renderBenchmarkSection() {
    const sourceLink = document.getElementById("benchmarkSourceLink");
    if (sourceLink) {
        sourceLink.href = state.benchmark?.meta.source_repo || state.benchmark?.meta.sourceRepo || BENCHMARK_REPO_URL;
    }

    buildBenchmarkSummaryChips();
    renderBenchmarkControls();
    renderBenchmarkLeaderboard();

    if (!state.benchmark && state.benchmarkError) {
        renderBenchmarkEmptyState(`未成功加载 benchmark 数据。已尝试本地与 BasicIRSTD 远端文件。${state.benchmarkError}`);
        return;
    }

    renderBenchmarkChart();
}

function handleBenchmarkDatasetChange(event) {
    state.benchmarkSelection.datasetId = event.target.value;
    state.benchmarkSelection.metric = "";
    ensureBenchmarkSelection();
    renderBenchmarkSection();
}

function handleBenchmarkMetricChange(event) {
    state.benchmarkSelection.metric = event.target.value;
    ensureBenchmarkSelection();
    renderBenchmarkSection();
}

async function fetchJsonFromSource(source) {
    const response = await fetch(source, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
}

async function loadMindMapData() {
    try {
        return await fetchJsonFromSource("./infrared-mindmap-data.json");
    } catch (error) {
        console.warn("Falling back to embedded data:", error);
        return window.fallbackMindMapData || null;
    }
}

async function loadBenchmarkData() {
    const errors = [];

    for (const source of BENCHMARK_SOURCES) {
        try {
            const data = await fetchJsonFromSource(source);
            return { data, source, error: "" };
        } catch (error) {
            errors.push(`${source}: ${error.message}`);
        }
    }

    if (window.fallbackBenchmarkData) {
        return {
            data: window.fallbackBenchmarkData,
            source: "embedded fallback",
            error: errors.join(" | ")
        };
    }

    return {
        data: null,
        source: "",
        error: errors.join(" | ")
    };
}

async function initializePage() {
    const [mindMapData, benchmarkPayload] = await Promise.all([
        loadMindMapData(),
        loadBenchmarkData()
    ]);

    state.data = mindMapData;
    state.sections = normalizeSections(state.data);
    state.papers = buildPaperIndex(state.sections);
    state.featuredPapers = state.papers.slice(0, 8);

    const paperLookup = buildPaperLookup(state.papers);
    state.benchmarkSource = benchmarkPayload.source;
    state.benchmarkError = benchmarkPayload.error;
    state.benchmark = normalizeBenchmarkData(benchmarkPayload.data, paperLookup);
    ensureBenchmarkSelection();

    renderModuleCards();
    renderResourcePanel();
    renderSearchResults();
    renderLatestPapers();
    renderBenchmarkSection();
    updateSearchMeta();

    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("input", handleSearchInput);
    }
}

window.handleBenchmarkDatasetChange = handleBenchmarkDatasetChange;
window.handleBenchmarkMetricChange = handleBenchmarkMetricChange;
window.scrollToSection = scrollToSection;

window.addEventListener("resize", () => {
    if (state.benchmarkChart) {
        state.benchmarkChart.resize();
    }
});

window.addEventListener("load", initializePage);
