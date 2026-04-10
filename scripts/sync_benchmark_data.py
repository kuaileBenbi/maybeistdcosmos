#!/usr/bin/env python3
"""Sync benchmark data from BasicIRSTD into the static site."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from urllib.request import Request, urlopen

BENCHMARK_URL = "https://raw.githubusercontent.com/kuaileBenbi/BasicIRSTD/main/benchmark-data.json"
REPO_URL = "https://github.com/kuaileBenbi/BasicIRSTD"
DEFAULT_BENCHMARK_PATH = Path("benchmark-data.json")
DEFAULT_FALLBACK_PATH = Path("assets/fallback-benchmark-data.js")


def fetch_json(url: str) -> Dict[str, Any]:
    request = Request(url, headers={"User-Agent": "infrared-site-benchmark-sync/1.0"})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def load_json(source_path: Optional[Path], source_url: str) -> Dict[str, Any]:
    if source_path:
        return json.loads(source_path.read_text(encoding="utf-8"))
    return fetch_json(source_url)


def ensure_object(value: Any, label: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise RuntimeError(f"{label} must be an object")
    return value


def ensure_list(value: Any, label: str) -> List[Any]:
    if not isinstance(value, list):
        raise RuntimeError(f"{label} must be a list")
    return value


def normalize_metric_keys(metrics: Dict[str, Any], metric_keys: Set[str]) -> None:
    for key, value in metrics.items():
        if value in (None, ""):
            continue
        if isinstance(value, (int, float)):
            metric_keys.add(key)
            continue
        if isinstance(value, str):
            text = value.strip().replace(",", "").replace("%", "")
            if not text:
                continue
            try:
                float(text)
            except ValueError as exc:
                raise RuntimeError(f"metric {key!r} has a non-numeric value: {value!r}") from exc
            metric_keys.add(key)
            continue
        raise RuntimeError(f"metric {key!r} must be numeric, string, or null")


def validate_pd_fa_curve(points: Any, result_label: str) -> None:
    if not isinstance(points, list):
        raise RuntimeError(f"{result_label} curves.pd_fa must be a list")

    for index, point in enumerate(points, start=1):
        if isinstance(point, list):
            if len(point) < 2:
                raise RuntimeError(f"{result_label} curves.pd_fa[{index}] must have at least two values")
            continue

        if isinstance(point, dict):
            if not any(key in point for key in ("fa", "false_alarm", "x")):
                raise RuntimeError(f"{result_label} curves.pd_fa[{index}] is missing an FA field")
            if not any(key in point for key in ("pd", "probability_detection", "y")):
                raise RuntimeError(f"{result_label} curves.pd_fa[{index}] is missing a Pd field")
            continue

        raise RuntimeError(f"{result_label} curves.pd_fa[{index}] must be a list or object")


def validate_payload(data: Dict[str, Any]) -> Dict[str, Any]:
    payload = ensure_object(data, "benchmark payload")
    meta = ensure_object(payload.get("meta"), "meta")
    datasets = ensure_list(payload.get("datasets"), "datasets")
    methods = ensure_list(payload.get("methods"), "methods")
    results = ensure_list(payload.get("results"), "results")

    dataset_ids: Set[str] = set()
    method_ids: Set[str] = set()
    metric_keys: Set[str] = set()
    curve_keys: Set[str] = set()

    for index, dataset in enumerate(datasets, start=1):
        item = ensure_object(dataset, f"datasets[{index}]")
        dataset_id = str(item.get("id", "")).strip()
        dataset_name = str(item.get("name", "")).strip()
        if not dataset_id or not dataset_name:
            raise RuntimeError(f"datasets[{index}] must include non-empty id and name")
        dataset_ids.add(dataset_id)

    for index, method in enumerate(methods, start=1):
        item = ensure_object(method, f"methods[{index}]")
        method_id = str(item.get("id", "")).strip()
        method_name = str(item.get("name", "")).strip()
        if not method_id or not method_name:
            raise RuntimeError(f"methods[{index}] must include non-empty id and name")
        method_ids.add(method_id)

    for index, result in enumerate(results, start=1):
        item = ensure_object(result, f"results[{index}]")
        dataset_id = str(item.get("dataset_id", "")).strip()
        method_id = str(item.get("method_id", "")).strip()
        if not dataset_id or not method_id:
            raise RuntimeError(f"results[{index}] must include non-empty dataset_id and method_id")
        if dataset_id not in dataset_ids:
            raise RuntimeError(f"results[{index}] references unknown dataset_id: {dataset_id}")
        if method_id not in method_ids:
            raise RuntimeError(f"results[{index}] references unknown method_id: {method_id}")

        metrics = ensure_object(item.get("metrics", {}), f"results[{index}].metrics")
        normalize_metric_keys(metrics, metric_keys)

        curves = ensure_object(item.get("curves", {}), f"results[{index}].curves")
        for curve_key, points in curves.items():
            curve_keys.add(curve_key)
            if curve_key == "pd_fa":
                validate_pd_fa_curve(points, f"results[{index}]")

    meta.setdefault("source_repo", REPO_URL)

    return {
        "datasets": len(datasets),
        "methods": len(methods),
        "results": len(results),
        "metrics": sorted(metric_keys),
        "curves": sorted(curve_keys),
        "source_repo": meta.get("source_repo", REPO_URL),
        "generated_at": meta.get("generated_at", ""),
        "source_commit": meta.get("source_commit", ""),
    }


def write_outputs(data: Dict[str, Any], benchmark_path: Path, fallback_path: Path) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    benchmark_path.write_text(payload, encoding="utf-8")
    fallback_path.parent.mkdir(parents=True, exist_ok=True)
    fallback_path.write_text(f"window.fallbackBenchmarkData = {payload};", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync benchmark-data.json from BasicIRSTD")
    parser.add_argument("--source-path", type=Path, help="Use a local benchmark-data.json instead of fetching the remote file")
    parser.add_argument("--source-url", default=BENCHMARK_URL, help="Raw benchmark-data.json URL")
    parser.add_argument("--benchmark-path", type=Path, default=DEFAULT_BENCHMARK_PATH, help="Output benchmark JSON path")
    parser.add_argument("--fallback-path", type=Path, default=DEFAULT_FALLBACK_PATH, help="Output embedded fallback JS path")
    parser.add_argument("--check", action="store_true", help="Validate the source payload without writing files")
    args = parser.parse_args()

    try:
        data = load_json(args.source_path, args.source_url)
        summary = validate_payload(data)
    except Exception as exc:  # noqa: BLE001
        print(f"sync failed: {exc}", file=sys.stderr)
        return 1

    if args.check:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    write_outputs(data, args.benchmark_path, args.fallback_path)
    source_ref = args.source_path.as_posix() if args.source_path else args.source_url
    print(f"Synced benchmark data from {source_ref}")
    print(f"Wrote {args.benchmark_path}")
    print(f"Wrote {args.fallback_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
