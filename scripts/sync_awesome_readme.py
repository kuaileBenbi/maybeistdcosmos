#!/usr/bin/env python3
"""Sync site data from awesome-infrared-small-targets README."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from urllib.request import Request, urlopen

README_URL = "https://raw.githubusercontent.com/Tianfang-Zhang/awesome-infrared-small-targets/main/README.md"
REPO_URL = "https://github.com/Tianfang-Zhang/awesome-infrared-small-targets"
DEFAULT_JSON_PATH = Path("infrared-mindmap-data.json")
DEFAULT_FALLBACK_PATH = Path("assets/fallback-data.js")
PRESERVED_RESOURCE_GROUPS = {"自动追踪 Auto Watch"}

SECTION_LAYOUT = {
    "传统方法": {"icon": "📡"},
    "优化方法": {"icon": "⚙️"},
    "深度学习方法": {"icon": "🧠"},
    "深度展开方法": {"icon": "🔄"},
    "资源 Resources": {"icon": "📚"},
}

HEADING_CONFIG = {
    ("Background Suppression-Based Methods",): {
        "path": ["传统方法", "背景抑制方法"],
        "type": "paper",
        "kind": "generic",
    },
    ("Human Visual System-Based Methods",): {
        "path": ["传统方法", "人类视觉系统方法"],
        "type": "paper",
        "kind": "generic",
    },
    ("Matrix: Single-Subspace",): {
        "path": ["优化方法", "矩阵方法 Matrix", "Single-Subspace"],
        "type": "paper",
        "kind": "generic",
    },
    ("Matrix: Multi-Subspace",): {
        "path": ["优化方法", "矩阵方法 Matrix", "Multi-Subspace"],
        "type": "paper",
        "kind": "generic",
    },
    ("Tensor: Single-Frame",): {
        "path": ["优化方法", "张量方法 Tensor", "Single-Frame"],
        "type": "paper",
        "kind": "generic",
    },
    ("Tensor: Multi-Frame",): {
        "path": ["优化方法", "张量方法 Tensor", "Multi-Frame"],
        "type": "paper",
        "kind": "generic",
    },
    ("Tensor: Deep Unsupervised",): {
        "path": ["优化方法", "张量方法 Tensor", "Deep Unsupervised"],
        "type": "paper",
        "kind": "generic",
    },
    ("Single-Frame",): {
        "path": ["深度学习方法", "单帧 Single-Frame"],
        "type": "paper",
        "kind": "generic",
    },
    ("Multi-Frame",): {
        "path": ["深度学习方法", "多帧 Multi-Frame"],
        "type": "paper",
        "kind": "generic",
    },
    ("Deep Unfolding-Based Methods",): {
        "path": ["深度展开方法", "代表方法"],
        "type": "paper",
        "kind": "generic",
    },
    ("Datasets: Single-Frame",): {
        "path": ["资源 Resources", "数据集 Datasets", "单帧 Datasets: Single-Frame"],
        "type": "info",
        "kind": "dataset",
    },
    ("Datasets: Multi-Frame",): {
        "path": ["资源 Resources", "数据集 Datasets", "多帧 Datasets: Multi-Frame"],
        "type": "info",
        "kind": "dataset",
    },
    ("Recommended Surveys",): {
        "path": ["资源 Resources", "推荐综述 Surveys"],
        "type": "info",
        "kind": "survey",
    },
    ("Recommended Benchmarks",): {
        "path": ["资源 Resources", "基准测试 Benchmarks"],
        "type": "info",
        "kind": "benchmark",
    },
}

VENUE_YEAR_RE = re.compile(r"\*\*([^*\n]*?(?:19|20)\d{2}[^*\n]*)\*\*")
BADGE_LINK_RE = re.compile(r"\[!\[\]\((?P<badge>[^)]+)\)\]\((?P<url>[^)]+)\)")
HEADING_RE = re.compile(r"(###|##)\s+\[(?P<title>[^\]]+)\]\(#table-of-contents\)")
NOISE_BOLDS = {"WITH CODE", "DATASET", "BENCHMARK", "SURVEY"}


def fetch_readme(url: str) -> str:
    req = Request(url, headers={"User-Agent": "infrared-site-sync/1.0"})
    with urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8")


def load_text(readme_path: Optional[Path], url: str) -> str:
    if readme_path:
        return readme_path.read_text(encoding="utf-8")
    return fetch_readme(url)


def normalize_source(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\(\[(https?://[^\]]+)\]\((https?://[^)]+)\)\)", r"(\2)", text)
    text = re.sub(r"(?<!\n)(##\s+\[)", r"\n\1", text)
    text = re.sub(r"(?<!\n)(###\s+\[)", r"\n\1", text)
    return text


def split_sections(text: str) -> Dict[Tuple[str, ...], str]:
    matches = list(HEADING_RE.finditer(text))
    sections: Dict[Tuple[str, ...], str] = {}
    current_h2: Optional[str] = None

    for index, match in enumerate(matches):
        level = match.group(1)
        title = match.group("title").strip()
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[start:end].strip()

        if level == "##":
            current_h2 = title
            sections[(title,)] = body
        else:
            sections[(title,)] = body
            if current_h2:
                sections[(current_h2, title)] = body

    return sections


def split_generic_entries(body: str) -> List[str]:
    lines = body.replace("\r\n", "\n").replace("\r", "\n").splitlines()
    chunks: List[str] = []
    current: List[str] = []

    for raw_line in lines:
        if not raw_line.strip():
            if current:
                chunks.append("\n".join(current).strip())
                current = []
            continue
        if raw_line.startswith("- "):
            if current:
                chunks.append("\n".join(current).strip())
            current = [raw_line.rstrip()]
        elif current:
            current.append(raw_line.rstrip())

    if current:
        chunks.append("\n".join(current).strip())

    return chunks


def parse_badge_links(block: str) -> Tuple[Optional[str], Optional[str]]:
    link: Optional[str] = None
    code: Optional[str] = None
    for match in BADGE_LINK_RE.finditer(block):
        badge = match.group("badge")
        url = match.group("url")
        if "Code-" in badge and not code:
            code = url
        elif "Link-" in badge and not link:
            link = url
    return link, code


def parse_venue_year(block: str) -> Tuple[Optional[str], Optional[str]]:
    matches = list(VENUE_YEAR_RE.finditer(block))
    if not matches:
        return None, None

    raw = matches[-1].group(1).strip().rstrip(".")
    year_match = re.search(r"(19|20)\d{2}", raw)
    year = year_match.group(0) if year_match else None
    venue = raw
    if year:
        venue = raw.replace(year, "").strip(" ,")
    if venue == raw and year and raw == year:
        venue = None
    return venue or None, year


def extract_name_candidate(block: str) -> Optional[str]:
    for candidate in re.findall(r"\*\*([^*\n]+)\*\*", block):
        name = candidate.strip().strip(":,.")
        if not name or name.upper() in NOISE_BOLDS:
            continue
        if re.fullmatch(r"[^*]*(?:19|20)\d{2}[^*]*", name):
            continue
        return name
    return None


def shorten_title(text: str) -> str:
    text = text.strip()
    if not text:
        return text
    for token in [" - ", ". "]:
        if token in text:
            candidate = text.split(token, 1)[0].strip(" ,.-")
            if candidate:
                return candidate
    return text.strip(" ,.-")


def normalize_name(name: str, venue: Optional[str], year: Optional[str], entry_type: str) -> str:
    name = re.sub(r"\s+", " ", name).strip(" .,-")
    if entry_type == "paper" and year and not re.search(r"\b%s\b" % re.escape(year), name):
        suffix = f" ({venue} {year})" if venue else f" ({year})"
        return f"{name}{suffix}"
    return name


def parse_generic_entry(block: str, entry_type: str) -> Optional[Dict[str, str]]:
    link, code = parse_badge_links(block)
    venue, year = parse_venue_year(block)
    lines = [line.strip() for line in block.splitlines() if line.strip()]
    if not lines:
        return None

    first_line = re.sub(r"^[-*]\s*", "", lines[0]).strip()
    name = extract_name_candidate(first_line) or extract_name_candidate(block)

    if not name:
        first_line_plain = first_line.replace("**", "").strip()
        name = shorten_title(first_line_plain)

    if not name:
        return None

    item: Dict[str, str] = {"name": normalize_name(name, venue, year, entry_type), "type": entry_type}
    if year and entry_type == "paper":
        item["year"] = year
    if venue and entry_type == "paper":
        item["venue"] = venue
    if link:
        item["link"] = link
    if code:
        item["code"] = code
    return item


def parse_survey_entries(body: str, entry_type: str) -> List[Dict[str, str]]:
    body = re.split(r"\n#\s+Acknowledgement|\n-----|\nNote:\s*", body, maxsplit=1)[0]
    items: List[Dict[str, str]] = []
    for block in split_generic_entries(body):
        parsed = parse_generic_entry(block, entry_type)
        if parsed:
            items.append(parsed)
    return items


def parse_benchmark_entries(body: str, entry_type: str) -> List[Dict[str, str]]:
    items: List[Dict[str, str]] = []
    for raw_line in body.splitlines():
        line = raw_line.strip()
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip("|").split("|")]
        if len(cells) != 3:
            continue
        name, date, link = cells
        if name.lower() == "title" or name.startswith(":"):
            continue
        if not link.startswith("http"):
            markdown_match = re.search(r"\((https?://[^)]+)\)", link)
            if markdown_match:
                link = markdown_match.group(1)
        item: Dict[str, str] = {"name": name, "type": entry_type, "link": link}
        if date:
            item["date"] = date
        items.append(item)
    return items


def parse_section_entries(body: str, config: Dict[str, object]) -> List[Dict[str, str]]:
    kind = str(config["kind"])
    entry_type = str(config["type"])

    if kind == "benchmark":
        return parse_benchmark_entries(body, entry_type)
    if kind == "survey":
        return parse_survey_entries(body, entry_type)

    items: List[Dict[str, str]] = []
    for block in split_generic_entries(body):
        parsed = parse_generic_entry(block, entry_type)
        if parsed:
            items.append(parsed)
    return items


def find_or_create_child(parent: Dict[str, object], name: str) -> Dict[str, object]:
    children = parent.setdefault("children", [])
    for child in children:
        if child.get("name") == name and "type" not in child:
            return child
    node: Dict[str, object] = {"name": name, "children": []}
    children.append(node)
    return node


def add_items(root: Dict[str, object], path: List[str], items: List[Dict[str, str]]) -> None:
    top_name = path[0]
    top = next((child for child in root["children"] if child["name"] == top_name), None)
    if top is None:
        top = {"name": top_name, "icon": SECTION_LAYOUT.get(top_name, {}).get("icon", "•"), "children": []}
        root["children"].append(top)

    parent = top
    for part in path[1:]:
        parent = find_or_create_child(parent, part)

    existing = {(child.get("name"), child.get("year"), child.get("link")) for child in parent.get("children", []) if isinstance(child, dict)}
    for item in items:
        key = (item.get("name"), item.get("year"), item.get("link"))
        if key not in existing:
            parent.setdefault("children", []).append(item)
            existing.add(key)


def find_named_child(parent: Dict[str, object], name: str) -> Optional[Dict[str, object]]:
    children = parent.get("children", [])
    if not isinstance(children, list):
        return None
    for child in children:
        if isinstance(child, dict) and child.get("name") == name:
            return child
    return None


def load_existing_data(json_path: Path) -> Optional[Dict[str, object]]:
    if not json_path.exists():
        return None
    try:
        return json.loads(json_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def preserve_source_metadata(data: Dict[str, object], existing: Optional[Dict[str, object]]) -> None:
    if not existing:
        return
    existing_source = existing.get("source")
    if not isinstance(existing_source, dict):
        return
    source = data.setdefault("source", {})
    for key in ("arxivWatch",):
        if key in existing_source:
            source[key] = existing_source[key]


def preserve_resource_groups(data: Dict[str, object], existing: Optional[Dict[str, object]]) -> None:
    if not existing:
        return
    existing_resource = find_named_child(existing, "资源 Resources")
    current_resource = find_named_child(data, "资源 Resources")
    if not existing_resource or not current_resource:
        return

    current_children = current_resource.setdefault("children", [])
    current_names = {child.get("name") for child in current_children if isinstance(child, dict)}
    for child in existing_resource.get("children", []):
        if not isinstance(child, dict):
            continue
        name = child.get("name")
        if name in PRESERVED_RESOURCE_GROUPS and name not in current_names:
            current_children.append(child)
            current_names.add(name)


def preserve_existing_nodes(data: Dict[str, object], json_path: Path) -> None:
    existing = load_existing_data(json_path)
    preserve_source_metadata(data, existing)
    preserve_resource_groups(data, existing)


def build_data(readme_text: str) -> Dict[str, object]:
    normalized = normalize_source(readme_text)
    sections = split_sections(normalized)
    missing = [key for key in HEADING_CONFIG if key not in sections]
    if missing:
        joined = ", ".join(" / ".join(key) for key in missing)
        raise RuntimeError(f"Missing expected headings: {joined}")

    data: Dict[str, object] = {
        "name": "Awesome Infrared Small Targets",
        "icon": "📡",
        "source": {"repo": REPO_URL, "readme": README_URL},
        "children": [],
    }

    for top_name, meta in SECTION_LAYOUT.items():
        data["children"].append({"name": top_name, "icon": meta["icon"], "children": []})

    for heading_key, config in HEADING_CONFIG.items():
        items = parse_section_entries(sections[heading_key], config)
        if not items:
            raise RuntimeError(f"No entries parsed for heading {' / '.join(heading_key)}")
        add_items(data, list(config["path"]), items)

    return data


def write_outputs(data: Dict[str, object], json_path: Path, fallback_path: Path) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    json_path.write_text(payload, encoding="utf-8")
    fallback_path.parent.mkdir(parents=True, exist_ok=True)
    fallback_path.write_text(f"window.fallbackMindMapData = {payload};", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync site data from awesome-infrared-small-targets README")
    parser.add_argument("--readme-path", type=Path, help="Use a local README instead of fetching upstream")
    parser.add_argument("--source-url", default=README_URL, help="Raw README URL")
    parser.add_argument("--json-path", type=Path, default=DEFAULT_JSON_PATH, help="Output JSON path")
    parser.add_argument("--fallback-path", type=Path, default=DEFAULT_FALLBACK_PATH, help="Output fallback JS path")
    parser.add_argument("--check", action="store_true", help="Validate parsing without writing files")
    parser.add_argument("--print-headings", action="store_true", help="Print parsed headings and exit")
    parser.add_argument("--print-section", help="Print a normalized section body by heading title and exit")
    args = parser.parse_args()

    try:
        readme_text = load_text(args.readme_path, args.source_url)
        normalized = normalize_source(readme_text)
        if args.print_headings:
            headings = [{"level": match.group(1), "title": match.group("title")} for match in HEADING_RE.finditer(normalized)]
            print(json.dumps(headings, ensure_ascii=False, indent=2))
            return 0
        if args.print_section:
            sections = split_sections(normalized)
            body = sections.get((args.print_section,))
            if body is None:
                print(f"section not found: {args.print_section}", file=sys.stderr)
                return 1
            print(body)
            return 0
        data = build_data(readme_text)
        preserve_existing_nodes(data, args.json_path)
    except Exception as exc:  # noqa: BLE001
        print(f"sync failed: {exc}", file=sys.stderr)
        return 1

    if args.check:
        total = sum(len(node.get("children", [])) for node in data.get("children", []))
        print(json.dumps({
            "sections": len(data.get("children", [])),
            "topLevelGroups": total,
            "source": args.readme_path.as_posix() if args.readme_path else args.source_url,
        }, ensure_ascii=False, indent=2))
        return 0

    write_outputs(data, args.json_path, args.fallback_path)
    print(f"Synced data from {args.readme_path if args.readme_path else args.source_url}")
    print(f"Wrote {args.json_path}")
    print(f"Wrote {args.fallback_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
