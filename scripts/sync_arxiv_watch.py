#!/usr/bin/env python3
"""Fetch and classify recent arXiv cs.CV papers for infrared small-target tracking."""

from __future__ import annotations

import argparse
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from time import sleep
from typing import Dict, Iterable, List, Optional, Sequence, Set, Tuple
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ARXIV_API_URL = "https://export.arxiv.org/api/query"
DEFAULT_JSON_PATH = Path("infrared-mindmap-data.json")
DEFAULT_FALLBACK_PATH = Path("assets/fallback-data.js")
RESOURCE_SECTION_NAME = "资源 Resources"
AUTO_WATCH_NODE_NAME = "自动追踪 Auto Watch"
PRIORITY_BUCKET_NAME = "顶会/顶刊优先"
REGULAR_BUCKET_NAME = "常规候选"
DEFAULT_CATEGORY = "cs.CV"
DEFAULT_MAX_RESULTS = 100
DEFAULT_LOOKBACK_DAYS = 120
DEFAULT_MAX_ITEMS = 40
DEFAULT_MAX_PER_GROUP = 8
ARXIV_REQUEST_DELAY_SECONDS = 3
# Keep the live arXiv prefetch query narrower than the classifier rules.
# This reduces API load while the downstream classifier still enforces the
# broader keyword boundary used by the project.
ARXIV_QUERY_TERMS = [
    "infrared small target detection",
    "infrared dim target detection",
    "infrared small object detection",
    "infrared small target tracking",
    "infrared target tracking",
    "thermal small target detection",
    "IRSTD",
    "SIRST",
    "infrared point target",
    "infrared tiny object detection",
    "thermal infrared detection small",
]

NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}

GROUP_ORDER = [
    "单帧深度学习候选",
    "多帧与跟踪候选",
    "优化建模/深度展开候选",
    "传统先验候选",
    "数据集/综述/基准候选",
]

GROUP_LABELS = {
    "single_frame": "单帧深度学习候选",
    "multi_frame": "多帧与跟踪候选",
    "optimization": "优化建模/深度展开候选",
    "traditional": "传统先验候选",
    "resource": "数据集/综述/基准候选",
}

GROUP_TO_SECTION = {
    "single_frame": "深度学习方法",
    "multi_frame": "深度学习方法",
    "optimization": "优化方法",
    "traditional": "传统方法",
    "resource": RESOURCE_SECTION_NAME,
}

VENUE_RULES = [
    {
        "venue": "CVPR",
        "tier": "top-conference",
        "patterns": [r"\bcvpr\b", r"computer vision and pattern recognition"],
    },
    {
        "venue": "ICCV",
        "tier": "top-conference",
        "patterns": [r"\biccv\b", r"international conference on computer vision"],
    },
    {
        "venue": "ECCV",
        "tier": "top-conference",
        "patterns": [r"\beccv\b", r"european conference on computer vision"],
    },
    {
        "venue": "NeurIPS",
        "tier": "top-conference",
        "patterns": [r"\bneurips\b", r"\bnips\b", r"neural information processing systems"],
    },
    {
        "venue": "AAAI",
        "tier": "top-conference",
        "patterns": [r"\baaai\b", r"association for the advancement of artificial intelligence"],
    },
    {
        "venue": "WACV",
        "tier": "top-conference",
        "patterns": [r"\bwacv\b", r"winter conference on applications of computer vision"],
    },
    {
        "venue": "ICRA",
        "tier": "top-conference",
        "patterns": [r"\bicra\b", r"international conference on robotics and automation"],
    },
    {
        "venue": "TPAMI",
        "tier": "top-journal",
        "patterns": [r"\btpami\b", r"\bpami\b", r"pattern analysis and machine intelligence"],
    },
    {
        "venue": "TIP",
        "tier": "top-journal",
        "patterns": [r"\btip\b", r"transactions on image processing"],
    },
    {
        "venue": "TGRS",
        "tier": "top-journal",
        "patterns": [r"\btgrs\b", r"transactions on geoscience and remote sensing"],
    },
    {
        "venue": "GRSL",
        "tier": "top-journal",
        "patterns": [r"\bgrsl\b", r"geoscience and remote sensing letters"],
    },
    {
        "venue": "TAES",
        "tier": "relevant-journal",
        "patterns": [r"\btaes\b", r"aerospace and electronic systems"],
    },
    {
        "venue": "TNNLS",
        "tier": "relevant-journal",
        "patterns": [r"\btnnls\b", r"transactions on neural networks and learning systems"],
    },
    {
        "venue": "JSTARS",
        "tier": "relevant-journal",
        "patterns": [r"\bjstars\b", r"journal of selected topics in applied earth observations"],
    },
    {
        "venue": "PR",
        "tier": "relevant-journal",
        "patterns": [r"\bpattern recognition\b"],
    },
    {
        "venue": "IJCAI",
        "tier": "relevant-conference",
        "patterns": [r"\bijcai\b", r"international joint conference on artificial intelligence"],
    },
    {
        "venue": "IROS",
        "tier": "relevant-conference",
        "patterns": [r"\biros\b", r"international conference on intelligent robots and systems"],
    },
    {
        "venue": "ICASSP",
        "tier": "relevant-conference",
        "patterns": [r"\bicassp\b", r"international conference on acoustics, speech, and signal processing"],
    },
]

STRONG_PHRASES = [
    (r"\binfrared small target detection\b", 5, "infrared small target detection"),
    (r"\binfrared dim target detection\b", 5, "infrared dim target detection"),
    (r"\binfrared small object detection\b", 4, "infrared small object detection"),
    (r"\binfrared small target tracking\b", 4, "infrared small target tracking"),
    (r"\binfrared target tracking\b", 4, "infrared target tracking"),
    (r"\bthermal small target detection\b", 4, "thermal small target detection"),
    (r"\binfrared point target\b", 4, "infrared point target"),
    (r"\binfrared tiny (target|object)\b", 4, "infrared tiny target/object"),
    (r"\bdim[-\s]?small target\b", 3, "dim-small target"),
    (r"\birstd\b", 4, "IRSTD"),
    (r"\bsirst\b", 4, "SIRST"),
    (r"\bmirst\b", 4, "MIRST"),
    (r"\binfrared target detection\b", 3, "infrared target detection"),
]

DOMAIN_PATTERNS = [
    (r"\binfrared\b", "infrared"),
    (r"\bthermal infrared\b", "thermal infrared"),
    (r"\bthermal\b", "thermal"),
    (r"\birstd\b", "IRSTD"),
    (r"\bsirst\b", "SIRST"),
    (r"\bmirst\b", "MIRST"),
    (r"\birst\b", "IRST"),
    (r"\binfra-red\b", "infra-red"),
]

TARGET_PATTERNS = [
    (r"\bsmall target\b", "small target"),
    (r"\bdim target\b", "dim target"),
    (r"\bdim[-\s]?small target\b", "dim-small target"),
    (r"\bpoint target\b", "point target"),
    (r"\bweak target\b", "weak target"),
    (r"\btiny target\b", "tiny target"),
    (r"\bsmall object\b", "small object"),
    (r"\btiny object\b", "tiny object"),
    (r"\bspot target\b", "spot target"),
    (r"\bsub[-\s]?pixel target\b", "sub-pixel target"),
]

TASK_PATTERNS = [
    (r"\bdetection\b", "detection"),
    (r"\bsegmentation\b", "segmentation"),
    (r"\btracking\b", "tracking"),
    (r"\btracker\b", "tracker"),
    (r"\blocalization\b", "localization"),
]

RESOURCE_PATTERNS = [
    (r"\bdataset\b", "dataset"),
    (r"\bbenchmark\b", "benchmark"),
    (r"\bsurvey\b", "survey"),
    (r"\b(review article|literature review)\b", "review"),
    (r"\bchallenge\b", "challenge"),
]

MULTI_FRAME_PATTERNS = [
    (r"\bmulti[-\s]?frame\b", "multi-frame"),
    (r"\bvideo\b", "video"),
    (r"\bsequence\b", "sequence"),
    (r"\btemporal\b", "temporal"),
    (r"\bspatio[-\s]?temporal\b", "spatio-temporal"),
    (r"\btracking\b", "tracking"),
    (r"\btrajectory\b", "trajectory"),
]

OPTIMIZATION_PATTERNS = [
    (r"\blow[-\s]?rank\b", "low-rank"),
    (r"\bsparse\b", "sparse"),
    (r"\btensor\b", "tensor"),
    (r"\bmatrix\b", "matrix"),
    (r"\bsubspace\b", "subspace"),
    (r"\bdecomposition\b", "decomposition"),
    (r"\brpca\b", "RPCA"),
    (r"\bnuclear norm\b", "nuclear norm"),
    (r"\bmodel[-\s]?driven\b", "model-driven"),
]

UNROLLING_PATTERNS = [
    (r"\bunfold(?:ing)?\b", "unfolding"),
    (r"\bunroll(?:ed|ing)?\b", "unrolling"),
    (r"\bista\b", "ISTA"),
    (r"\badmm\b", "ADMM"),
    (r"\bproximal\b", "proximal"),
]

TRADITIONAL_PATTERNS = [
    (r"\bmorpholog(?:y|ical)\b", "morphology"),
    (r"\blocal contrast\b", "local contrast"),
    (r"\bcenter[-\s]?surround\b", "center-surround"),
    (r"\bhuman visual\b", "human visual"),
    (r"\bsaliency\b", "saliency"),
    (r"\bbackground suppression\b", "background suppression"),
    (r"\btop[-\s]?hat\b", "top-hat"),
]

DEEP_PATTERNS = [
    (r"\btransformer\b", "transformer"),
    (r"\bcnn\b", "CNN"),
    (r"\bnetwork\b", "network"),
    (r"\bdiffusion\b", "diffusion"),
    (r"\bsegmentation model\b", "segmentation model"),
    (r"\bdeep learning\b", "deep learning"),
    (r"\bneural\b", "neural"),
    (r"\bfoundation model\b", "foundation model"),
    (r"\bsam\b", "SAM"),
]

NEGATIVE_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"pedestrian",
        r"face recognition",
        r"person re-identification",
        r"breast cancer",
        r"infrared spectroscopy",
        r"satellite image caption",
        r"remote sensing scene classification",
        r"infrared face",
        r"infrared pedestrian",
        r"traffic sign",
    )
]

ACCEPTANCE_HINTS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\baccepted\b",
        r"\bto appear\b",
        r"\bappears in\b",
        r"\bpublished in\b",
        r"\bproceedings\b",
        r"\boral\b",
        r"\bspotlight\b",
    )
]


def compile_keyword_rules(raw_rules: Sequence[Tuple[str, str]]) -> List[Tuple[re.Pattern[str], str]]:
    return [(re.compile(pattern, re.IGNORECASE), label) for pattern, label in raw_rules]


COMPILED_DOMAIN_PATTERNS = compile_keyword_rules(DOMAIN_PATTERNS)
COMPILED_TARGET_PATTERNS = compile_keyword_rules(TARGET_PATTERNS)
COMPILED_TASK_PATTERNS = compile_keyword_rules(TASK_PATTERNS)
COMPILED_RESOURCE_PATTERNS = compile_keyword_rules(RESOURCE_PATTERNS)
COMPILED_MULTI_FRAME_PATTERNS = compile_keyword_rules(MULTI_FRAME_PATTERNS)
COMPILED_OPTIMIZATION_PATTERNS = compile_keyword_rules(OPTIMIZATION_PATTERNS)
COMPILED_UNROLLING_PATTERNS = compile_keyword_rules(UNROLLING_PATTERNS)
COMPILED_TRADITIONAL_PATTERNS = compile_keyword_rules(TRADITIONAL_PATTERNS)
COMPILED_DEEP_PATTERNS = compile_keyword_rules(DEEP_PATTERNS)
COMPILED_STRONG_PHRASES = [
    (re.compile(pattern, re.IGNORECASE), weight, label)
    for pattern, weight, label in STRONG_PHRASES
]

for rule in VENUE_RULES:
    rule["compiled_patterns"] = [re.compile(pattern, re.IGNORECASE) for pattern in rule["patterns"]]


def text_of(element: ET.Element, path: str) -> str:
    child = element.find(path, NS)
    if child is None or child.text is None:
        return ""
    return re.sub(r"\s+", " ", child.text).strip()


def parse_iso_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def build_submitted_date_range(lookback_days: int) -> str:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=lookback_days)
    return f"[{cutoff.strftime('%Y%m%d%H%M')} TO {now.strftime('%Y%m%d%H%M')}]"


def build_search_query(category: str, lookback_days: int, term: Optional[str] = None) -> str:
    date_query = f"submittedDate:{build_submitted_date_range(lookback_days)}"
    if term:
        return f'cat:{category} AND {date_query} AND all:"{term}"'
    phrase_query = " OR ".join(f'all:"{query_term}"' for query_term in ARXIV_QUERY_TERMS)
    return f"cat:{category} AND {date_query} AND ({phrase_query})"


def build_query_url(category: str, max_results: int, lookback_days: int, term: Optional[str] = None) -> str:
    query = urlencode(
        {
            "search_query": build_search_query(category, lookback_days, term),
            "start": 0,
            "max_results": max_results,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }
    )
    return f"{ARXIV_API_URL}?{query}"


def fetch_feed(feed_url: str) -> str:
    request = Request(
        feed_url,
        headers={
            "User-Agent": "infrared-site-arxiv-watch/1.0 (research metadata sync)",
        },
    )
    delay_seconds = 5
    last_error: Optional[Exception] = None
    for _ in range(2):
        try:
            with urlopen(request, timeout=15) as response:
                return response.read().decode("utf-8")
        except HTTPError as exc:
            last_error = exc
            if exc.code not in {429, 500, 502, 503, 504}:
                raise
            sleep(delay_seconds)
            delay_seconds *= 2
    if last_error:
        raise last_error
    raise RuntimeError("unreachable arXiv fetch state")


def load_entries(feed_path: Optional[Path], category: str, max_results: int, lookback_days: int) -> Tuple[List[Dict[str, object]], str, List[str]]:
    if feed_path:
        return parse_feed_entries(feed_path.read_text(encoding="utf-8")), feed_path.as_posix(), []

    merged_entries: Dict[str, Dict[str, object]] = {}
    per_term_limit = max(15, min(max_results, 25))
    failed_terms: List[str] = []
    for index, term in enumerate(ARXIV_QUERY_TERMS):
        url = build_query_url(category, per_term_limit, lookback_days, term)
        try:
            feed_text = fetch_feed(url)
        except Exception as exc:  # noqa: BLE001
            failed_terms.append(term)
            print(f"warning: failed to fetch term '{term}': {exc}", file=sys.stderr)
        else:
            for entry in parse_feed_entries(feed_text):
                arxiv_id = str(entry.get("arxiv_id", ""))
                if arxiv_id and arxiv_id not in merged_entries:
                    merged_entries[arxiv_id] = entry
        if index < len(ARXIV_QUERY_TERMS) - 1:
            sleep(ARXIV_REQUEST_DELAY_SECONDS)

    entries = list(merged_entries.values())
    if not entries and failed_terms:
        raise RuntimeError(f"all arXiv keyword requests failed: {', '.join(failed_terms)}")
    entries.sort(
        key=lambda entry: (
            -((entry.get("updated") or entry.get("published")).timestamp())
            if isinstance(entry.get("updated") or entry.get("published"), datetime)
            else 0.0
        )
    )
    return entries, f"{ARXIV_API_URL} (keyword-batched)", failed_terms


def parse_feed_entries(feed_text: str) -> List[Dict[str, object]]:
    root = ET.fromstring(feed_text)
    entries: List[Dict[str, object]] = []

    for entry in root.findall("atom:entry", NS):
        entry_id = text_of(entry, "atom:id")
        arxiv_id = entry_id.rstrip("/").split("/")[-1]
        summary = text_of(entry, "atom:summary")
        title = text_of(entry, "atom:title")
        authors = [text_of(author, "atom:name") for author in entry.findall("atom:author", NS)]
        primary_category = ""
        primary_node = entry.find("arxiv:primary_category", NS)
        if primary_node is not None:
            primary_category = primary_node.attrib.get("term", "")
        categories = [
            category.attrib.get("term", "")
            for category in entry.findall("atom:category", NS)
            if category.attrib.get("term")
        ]
        pdf_url = ""
        for link in entry.findall("atom:link", NS):
            href = link.attrib.get("href", "")
            title_attr = link.attrib.get("title", "")
            if title_attr == "pdf":
                pdf_url = href
                break

        entries.append(
            {
                "arxiv_id": arxiv_id,
                "title": title,
                "summary": summary,
                "authors": authors,
                "link": entry_id.replace("http://", "https://"),
                "pdf_url": pdf_url.replace("http://", "https://"),
                "comment": text_of(entry, "arxiv:comment"),
                "journal_ref": text_of(entry, "arxiv:journal_ref"),
                "doi": text_of(entry, "arxiv:doi"),
                "published": parse_iso_datetime(text_of(entry, "atom:published")),
                "updated": parse_iso_datetime(text_of(entry, "atom:updated")),
                "primary_category": primary_category,
                "categories": categories,
            }
        )

    return entries


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def normalize_title_key(title: str) -> str:
    value = re.sub(r"\s*\((?:arxiv|cvpr|iccv|eccv|neurips|nips|aaai|wacv|icra|tip|tgrs|grsl|tpami|pami)[^)]*\)\s*$", "", title, flags=re.IGNORECASE)
    return normalize_text(value)


def arxiv_id_from_link(link: str) -> Optional[str]:
    match = re.search(r"arxiv\.org/(?:abs|pdf)/([^/?#]+)", link or "", re.IGNORECASE)
    if not match:
        return None
    return match.group(1).replace(".pdf", "")


def match_labels(text: str, compiled_rules: Sequence[Tuple[re.Pattern[str], str]]) -> List[str]:
    labels: List[str] = []
    for pattern, label in compiled_rules:
        if pattern.search(text):
            labels.append(label)
    return labels


def classify_relevance(entry: Dict[str, object]) -> Optional[Dict[str, object]]:
    text = normalize_text(
        " ".join(
            [
                str(entry.get("title", "")),
                str(entry.get("summary", "")),
                str(entry.get("comment", "")),
                str(entry.get("journal_ref", "")),
            ]
        )
    )

    strong_tags: List[str] = []
    score = 0
    for pattern, weight, label in COMPILED_STRONG_PHRASES:
        if pattern.search(text):
            strong_tags.append(label)
            score += weight

    domain_tags = match_labels(text, COMPILED_DOMAIN_PATTERNS)
    target_tags = match_labels(text, COMPILED_TARGET_PATTERNS)
    task_tags = match_labels(text, COMPILED_TASK_PATTERNS)

    if not domain_tags:
        return None
    if not target_tags and not strong_tags:
        return None
    if not task_tags and not any(tag in {"tracking", "infrared target tracking"} for tag in strong_tags):
        return None

    score += len(domain_tags) + len(target_tags) + len(task_tags)

    negative_hits = [pattern.pattern for pattern in NEGATIVE_PATTERNS if pattern.search(text)]
    if negative_hits and score < 8:
        return None
    if score < 3:
        return None

    return {
        "score": score,
        "tags": dedupe(strong_tags + domain_tags + target_tags + task_tags),
    }


def detect_venue(entry: Dict[str, object], fallback_year: str) -> Dict[str, str]:
    journal_ref = str(entry.get("journal_ref", ""))
    comment = str(entry.get("comment", ""))

    for source_name, source_text in (("journal_ref", journal_ref), ("comment", comment)):
        normalized = normalize_text(source_text)
        if not normalized:
            continue
        for rule in VENUE_RULES:
            patterns = rule.get("compiled_patterns", [])
            if any(pattern.search(normalized) for pattern in patterns):
                status = "published" if source_name == "journal_ref" else "mentioned"
                if source_name == "comment" and any(pattern.search(comment) for pattern in ACCEPTANCE_HINTS):
                    status = "accepted"
                year_match = re.search(r"(19|20)\d{2}", source_text)
                return {
                    "venue": str(rule["venue"]),
                    "tier": str(rule["tier"]),
                    "status": status,
                    "source": source_name,
                    "year": year_match.group(0) if year_match else fallback_year,
                }

    return {
        "venue": "arXiv",
        "tier": "preprint",
        "status": "preprint",
        "source": "arxiv",
        "year": fallback_year,
    }


def classify_group(entry: Dict[str, object]) -> Tuple[str, List[str]]:
    text = normalize_text(
        " ".join(
            [
                str(entry.get("title", "")),
                str(entry.get("summary", "")),
                str(entry.get("comment", "")),
                str(entry.get("journal_ref", "")),
            ]
        )
    )
    reasons: List[str] = []
    resource_hits = match_labels(text, COMPILED_RESOURCE_PATTERNS)
    multi_frame_hits = match_labels(text, COMPILED_MULTI_FRAME_PATTERNS)
    optimization_hits = match_labels(text, COMPILED_OPTIMIZATION_PATTERNS)
    unrolling_hits = match_labels(text, COMPILED_UNROLLING_PATTERNS)
    traditional_hits = match_labels(text, COMPILED_TRADITIONAL_PATTERNS)
    deep_hits = match_labels(text, COMPILED_DEEP_PATTERNS)

    if resource_hits:
        reasons.extend(resource_hits)
        return "resource", dedupe(reasons)
    if multi_frame_hits:
        reasons.extend(multi_frame_hits)
        return "multi_frame", dedupe(reasons)
    if optimization_hits or unrolling_hits:
        reasons.extend(optimization_hits)
        reasons.extend(unrolling_hits)
        return "optimization", dedupe(reasons)
    if traditional_hits and not deep_hits:
        reasons.extend(traditional_hits)
        return "traditional", dedupe(reasons)

    reasons.extend(deep_hits or ["generic neural detector"])
    return "single_frame", dedupe(reasons)


def dedupe(values: Iterable[str]) -> List[str]:
    seen: Set[str] = set()
    result: List[str] = []
    for value in values:
        stripped = value.strip()
        if not stripped or stripped in seen:
            continue
        seen.add(stripped)
        result.append(stripped)
    return result


def isoformat(value: Optional[datetime]) -> str:
    if value is None:
        return ""
    return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def collect_existing_papers(root: Dict[str, object], skip_auto_watch: bool = True) -> Tuple[Set[str], Set[str]]:
    title_keys: Set[str] = set()
    arxiv_ids: Set[str] = set()

    def walk(node: Dict[str, object], inside_auto_watch: bool = False) -> None:
        nonlocal title_keys, arxiv_ids
        name = str(node.get("name", ""))
        current_inside_auto_watch = inside_auto_watch or name == AUTO_WATCH_NODE_NAME
        if node.get("type") == "paper":
            if skip_auto_watch and current_inside_auto_watch:
                return
            title_keys.add(normalize_title_key(name))
            link = str(node.get("link", ""))
            arxiv_id = arxiv_id_from_link(link)
            if arxiv_id:
                arxiv_ids.add(arxiv_id)
            return
        children = node.get("children", [])
        if not isinstance(children, list):
            return
        for child in children:
            if isinstance(child, dict):
                walk(child, current_inside_auto_watch)

    walk(root)
    return title_keys, arxiv_ids


def find_or_create_child(parent: Dict[str, object], name: str) -> Dict[str, object]:
    children = parent.setdefault("children", [])
    for child in children:
        if isinstance(child, dict) and child.get("name") == name:
            return child
    node = {"name": name, "children": []}
    children.append(node)
    return node


def extract_auto_watch_arxiv_ids(root: Dict[str, object]) -> Set[str]:
    ids: Set[str] = set()

    def walk(node: Dict[str, object], inside_auto_watch: bool = False) -> None:
        name = str(node.get("name", ""))
        current = inside_auto_watch or name == AUTO_WATCH_NODE_NAME
        if node.get("type") == "paper" and current:
            link = str(node.get("link", ""))
            arxiv_id = arxiv_id_from_link(link)
            if arxiv_id:
                ids.add(arxiv_id)
            return
        children = node.get("children", [])
        if not isinstance(children, list):
            return
        for child in children:
            if isinstance(child, dict):
                walk(child, current)

    walk(root)
    return ids


NOTIFIED_IDS_PATH = Path("notified-arxiv-ids.json")
NEW_PAPERS_SUMMARY_PATH = Path("new-papers-summary.md")


def load_notified_ids() -> Set[str]:
    try:
        data = json.loads(NOTIFIED_IDS_PATH.read_text(encoding="utf-8"))
        return set(data.get("ids", []))
    except (FileNotFoundError, json.JSONDecodeError):
        return set()


def save_notified_ids(ids: Set[str]) -> None:
    NOTIFIED_IDS_PATH.write_text(
        json.dumps({"ids": sorted(ids)}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def write_notification_summary(new_papers: Sequence[Dict[str, object]], notified_ids: Set[str]) -> None:
    if not new_papers:
        for p in (NEW_PAPERS_SUMMARY_PATH, Path("new-papers-summary.html")):
            if p.exists():
                p.unlink()
        return

    lines = [f"# 红外小目标检测 - 新论文通知 ({datetime.now(timezone.utc).strftime('%Y-%m-%d')})\n"]
    lines.append(f"本次新追踪到 **{len(new_papers)}** 篇论文。\n")

    for i, paper in enumerate(new_papers, 1):
        title = str(paper.get("name", "无标题"))
        link = str(paper.get("link", ""))
        authors = str(paper.get("authors", ""))
        venue = str(paper.get("venue", "arXiv"))
        year = str(paper.get("year", ""))
        group = str(paper.get("classification_group", ""))
        pdf = str(paper.get("pdf", ""))
        abstract = str(paper.get("abstract", ""))

        lines.append(f"## {i}. {title}\n")
        if link:
            lines.append(f"- **链接**: [{link}]({link})")
        if pdf:
            lines.append(f"- **PDF**: [{pdf}]({pdf})")
        lines.append(f"- **作者**: {authors}")
        lines.append(f"- **发表**: {venue} {year}")
        lines.append(f"- **分类**: {group}")
        if abstract:
            short = abstract[:300] + ("..." if len(abstract) > 300 else "")
            lines.append(f"- **摘要**: {short}")
        lines.append("")

    NEW_PAPERS_SUMMARY_PATH.write_text("\n".join(lines), encoding="utf-8")

    new_ids = {str(p.get("arxiv_id", "")) for p in new_papers if p.get("arxiv_id")}
    save_notified_ids(notified_ids | new_ids)

    html_path = Path("new-papers-summary.html")
    html_parts = [
        '<html><head><meta charset="utf-8">',
        '<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px}'
        '.paper{border-left:3px solid #4a90d9;padding:8px 12px;margin:12px 0;background:#f8f9fa}'
        'h1{color:#2c3e50}h2{font-size:16px;margin:4px 0}a{color:#4a90d9}'
        '.meta{color:#666;font-size:13px}.abstract{color:#444;font-size:13px;margin-top:4px}</style>',
        '</head><body>',
        f'<h1>红外小目标检测 - 新论文通知 ({datetime.now(timezone.utc).strftime("%Y-%m-%d")})</h1>',
        f'<p>本次新追踪到 <strong>{len(new_papers)}</strong> 篇论文。</p>',
    ]
    for i, paper in enumerate(new_papers, 1):
        title = str(paper.get("name", "无标题"))
        link = str(paper.get("link", ""))
        authors = str(paper.get("authors", ""))
        venue = str(paper.get("venue", "arXiv"))
        year = str(paper.get("year", ""))
        group = str(paper.get("classification_group", ""))
        pdf = str(paper.get("pdf", ""))
        abstract = str(paper.get("abstract", ""))
        link_html = f'<a href="{link}">{title}</a>' if link else title
        pdf_html = f' | <a href="{pdf}">PDF</a>' if pdf else ""
        short = abstract[:300] + ("..." if len(abstract) > 300 else "")
        html_parts.append(
            f'<div class="paper"><h2>{i}. {link_html}{pdf_html}</h2>'
            f'<div class="meta">{authors} · {venue} {year} · {group}</div>'
            f'<div class="abstract">{short}</div></div>'
        )
    html_parts.append("</body></html>")
    html_path.write_text("\n".join(html_parts), encoding="utf-8")

    print(f"Notification summary: {len(new_papers)} new papers")
    print(f"Wrote {NEW_PAPERS_SUMMARY_PATH}")
    print(f"Wrote {html_path}")


def remove_auto_watch_node(root: Dict[str, object]) -> None:
    children = root.get("children", [])
    if not isinstance(children, list):
        return
    for section_node in children:
        if not isinstance(section_node, dict):
            continue
        section_children = section_node.get("children")
        if not isinstance(section_children, list):
            continue
        section_node["children"] = [
            child for child in section_children
            if not isinstance(child, dict) or child.get("name") != AUTO_WATCH_NODE_NAME
        ]


def sort_key(entry: Dict[str, object]) -> Tuple[int, float, float]:
    bucket_rank = 0 if entry.get("bucket") == PRIORITY_BUCKET_NAME else 1
    score = float(entry.get("score", 0))
    timestamp = float(entry.get("sort_timestamp", 0.0))
    return (bucket_rank, -score, -timestamp)


def select_candidates(
    raw_entries: Sequence[Dict[str, object]],
    existing_title_keys: Set[str],
    existing_arxiv_ids: Set[str],
    lookback_days: int,
    max_items: int,
    max_per_group: int,
) -> List[Dict[str, object]]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=lookback_days)
    selected: List[Dict[str, object]] = []
    per_group_counts: Dict[Tuple[str, str], int] = defaultdict(int)

    prepared: List[Dict[str, object]] = []
    seen_new_ids: Set[str] = set()
    for entry in raw_entries:
        published = entry.get("published")
        if isinstance(published, datetime) and published < cutoff:
            continue

        relevance = classify_relevance(entry)
        if not relevance:
            continue

        title_key = normalize_title_key(str(entry.get("title", "")))
        arxiv_id = str(entry.get("arxiv_id", ""))
        if title_key in existing_title_keys or arxiv_id in existing_arxiv_ids or arxiv_id in seen_new_ids:
            continue

        year = ""
        if isinstance(published, datetime):
            year = str(published.year)
        venue_meta = detect_venue(entry, year)
        group_key, group_reasons = classify_group(entry)
        bucket = (
            PRIORITY_BUCKET_NAME
            if venue_meta["tier"] in {"top-conference", "top-journal"}
            else REGULAR_BUCKET_NAME
        )

        item = {
            "name": str(entry.get("title", "")).strip(),
            "type": "paper",
            "year": venue_meta["year"] or year,
            "venue": venue_meta["venue"] or "arXiv",
            "link": str(entry.get("link", "")),
            "pdf": str(entry.get("pdf_url", "")),
            "authors": ", ".join(str(author) for author in entry.get("authors", []) if author),
            "abstract": str(entry.get("summary", "")),
            "comment": str(entry.get("comment", "")),
            "journal_ref": str(entry.get("journal_ref", "")),
            "doi": str(entry.get("doi", "")),
            "arxiv_id": arxiv_id,
            "primary_category": str(entry.get("primary_category", "")),
            "categories": entry.get("categories", []),
            "published": isoformat(published if isinstance(published, datetime) else None),
            "updated": isoformat(entry.get("updated") if isinstance(entry.get("updated"), datetime) else None),
            "source_kind": "arxiv-watch",
            "source_label": "arXiv Auto Watch",
            "classification_group": GROUP_LABELS[group_key],
            "classification_group_key": group_key,
            "classification_tags": dedupe(list(relevance["tags"]) + group_reasons),
            "classification_score": relevance["score"],
            "venue_tier": venue_meta["tier"],
            "venue_status": venue_meta["status"],
            "venue_signal": venue_meta["source"],
            "bucket": bucket,
            "_bucket": bucket,
            "score": relevance["score"],
            "sort_timestamp": (
                (entry.get("updated") or entry.get("published")).timestamp()
                if isinstance(entry.get("updated") or entry.get("published"), datetime)
                else 0.0
            ),
        }
        prepared.append(item)
        seen_new_ids.add(arxiv_id)

    prepared.sort(key=sort_key)
    for item in prepared:
        group_count_key = (str(item["bucket"]), str(item["classification_group"]))
        if per_group_counts[group_count_key] >= max_per_group:
            continue
        if len(selected) >= max_items:
            break
        selected.append(item)
        per_group_counts[group_count_key] += 1

    return selected


def build_section_watch_nodes(items: Sequence[Dict[str, object]]) -> Dict[str, Dict[str, object]]:
    section_papers: Dict[str, List[Dict[str, object]]] = defaultdict(list)
    for item in items:
        group_key = str(item.get("classification_group_key", ""))
        section_name = GROUP_TO_SECTION.get(group_key, RESOURCE_SECTION_NAME)
        payload = dict(item)
        payload.pop("bucket", None)
        payload.pop("score", None)
        payload.pop("sort_timestamp", None)
        payload.pop("classification_group_key", None)
        section_papers[section_name].append(payload)

    result: Dict[str, Dict[str, object]] = {}
    for section_name, papers in section_papers.items():
        grouped: Dict[str, Dict[str, List[Dict[str, object]]]] = {
            PRIORITY_BUCKET_NAME: defaultdict(list),
            REGULAR_BUCKET_NAME: defaultdict(list),
        }
        for paper in papers:
            bucket = str(paper.get("_bucket", REGULAR_BUCKET_NAME))
            group_label = str(paper.get("classification_group", ""))
            grouped[bucket][group_label].append(paper)

        watch_node: Dict[str, object] = {
            "name": AUTO_WATCH_NODE_NAME,
            "children": [],
        }
        for bucket_name in (PRIORITY_BUCKET_NAME, REGULAR_BUCKET_NAME):
            bucket_groups = grouped[bucket_name]
            children = []
            for group_name in GROUP_ORDER:
                group_papers = bucket_groups.get(group_name, [])
                if group_papers:
                    children.append({"name": group_name, "children": group_papers})
            if children:
                watch_node["children"].append({"name": bucket_name, "children": children})

        result[section_name] = watch_node
    return result


def update_data_tree(data: Dict[str, object], section_nodes: Dict[str, Dict[str, object]], source_meta: Dict[str, object]) -> None:
    remove_auto_watch_node(data)
    children = data.get("children", [])
    if not isinstance(children, list):
        return
    for section_node in children:
        if not isinstance(section_node, dict):
            continue
        section_name = str(section_node.get("name", ""))
        if section_name in section_nodes:
            section_node.setdefault("children", []).append(section_nodes[section_name])
    for section_name, node in section_nodes.items():
        if not any(
            isinstance(c, dict) and c.get("name") == section_name
            for c in children
        ):
            section_obj = {"name": section_name, "children": [node]}
            children.append(section_obj)
    source = data.setdefault("source", {})
    source["arxivWatch"] = source_meta


def write_outputs(data: Dict[str, object], json_path: Path, fallback_path: Path) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    json_path.write_text(payload, encoding="utf-8")
    fallback_path.parent.mkdir(parents=True, exist_ok=True)
    fallback_path.write_text(f"window.fallbackMindMapData = {payload};", encoding="utf-8")


def build_summary(items: Sequence[Dict[str, object]], source: str, category: str, lookback_days: int) -> Dict[str, object]:
    groups: Dict[str, int] = defaultdict(int)
    buckets: Dict[str, int] = defaultdict(int)
    for item in items:
        groups[str(item["classification_group"])] += 1
        buckets[str(item["bucket"])] += 1
    return {
        "source": source,
        "category": category,
        "lookbackDays": lookback_days,
        "totalMatches": len(items),
        "buckets": dict(sorted(buckets.items())),
        "groups": dict(sorted(groups.items())),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync recent arXiv cs.CV infrared small-target candidates into the site data.")
    parser.add_argument("--feed-path", type=Path, help="Use a local Atom feed instead of fetching arXiv")
    parser.add_argument("--json-path", type=Path, default=DEFAULT_JSON_PATH, help="Existing site JSON path")
    parser.add_argument("--fallback-path", type=Path, default=DEFAULT_FALLBACK_PATH, help="Fallback JS path")
    parser.add_argument("--category", default=DEFAULT_CATEGORY, help="arXiv primary category to query")
    parser.add_argument("--max-results", type=int, default=DEFAULT_MAX_RESULTS, help="Maximum arXiv API results to request")
    parser.add_argument("--lookback-days", type=int, default=DEFAULT_LOOKBACK_DAYS, help="How many recent days to keep")
    parser.add_argument("--max-items", type=int, default=DEFAULT_MAX_ITEMS, help="Maximum number of matched items to keep")
    parser.add_argument("--max-per-group", type=int, default=DEFAULT_MAX_PER_GROUP, help="Maximum papers per classification group")
    parser.add_argument("--check", action="store_true", help="Validate and print a summary without writing files")
    args = parser.parse_args()

    try:
        data = json.loads(args.json_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        print(f"input json not found: {args.json_path}", file=sys.stderr)
        return 1
    except json.JSONDecodeError as exc:
        print(f"invalid json in {args.json_path}: {exc}", file=sys.stderr)
        return 1

    try:
        raw_entries, source_ref, failed_terms = load_entries(args.feed_path, args.category, args.max_results, args.lookback_days)
        existing_title_keys, existing_arxiv_ids = collect_existing_papers(data, skip_auto_watch=True)
        old_auto_watch_ids = extract_auto_watch_arxiv_ids(data)
        matches = select_candidates(
            raw_entries,
            existing_title_keys,
            existing_arxiv_ids,
            args.lookback_days,
            args.max_items,
            args.max_per_group,
        )
    except Exception as exc:  # noqa: BLE001
        print(f"arxiv sync failed: {exc}", file=sys.stderr)
        return 1

    notified_ids = load_notified_ids()
    new_papers = [
        p for p in matches
        if str(p.get("arxiv_id", "")) not in old_auto_watch_ids
        and str(p.get("arxiv_id", "")) not in notified_ids
    ]

    source_meta: Dict[str, object] = {
        "category": args.category,
        "feed": source_ref,
        "fetchedAt": isoformat(datetime.now(timezone.utc)),
        "lookbackDays": args.lookback_days,
        "maxResults": args.max_results,
        "matchedPapers": len(matches),
        "failedTerms": failed_terms,
    }
    section_nodes = build_section_watch_nodes(matches)
    update_data_tree(data, section_nodes, source_meta)

    if args.check:
        print(json.dumps(build_summary(matches, source_ref, args.category, args.lookback_days), ensure_ascii=False, indent=2))
        return 0

    write_outputs(data, args.json_path, args.fallback_path)
    write_notification_summary(new_papers, notified_ids)
    print(f"Synced arXiv watch from {source_ref}")
    print(f"Matched {len(matches)} papers")
    print(f"Wrote {args.json_path}")
    print(f"Wrote {args.fallback_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
