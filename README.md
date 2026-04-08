# 红外小目标检测研究追踪

A lightweight static website for tracking infrared small target detection research.

This repository is inspired by [awesome-infrared-small-targets](https://github.com/Tianfang-Zhang/awesome-infrared-small-targets). It reorganizes the upstream `README.md` into a searchable, topic-oriented website that is easier to browse than a long markdown list.

The project originally started as a compact summary for slides, then gradually evolved into a maintainable research-tracking site with automatic upstream synchronization.

## Highlights

- Topic-based navigation across traditional methods, optimization methods, deep learning methods, deep unfolding methods, and resources.
- Search, year-based browsing, paper/resource links, and lightweight static deployment.
- Data-first rendering through `infrared-mindmap-data.json`, with `assets/fallback-data.js` as a built-in fallback.
- Automatic synchronization from the upstream awesome list through GitHub Actions.

## Repository Layout

- `index.html`: homepage entry and overview panels.
- `traditional/`, `optimization/`, `deep-learning/`, `unrolling/`, `resources/`: submodule pages.
- `assets/home-page.js`: homepage data loading and rendering logic.
- `assets/module-page.js`: submodule rendering, search, navigation, and detail behavior.
- `infrared-mindmap-data.json`: primary structured data source used by the site.
- `assets/fallback-data.js`: embedded fallback data used when JSON loading fails.
- `scripts/sync_awesome_readme.py`: parser that converts the upstream README into the local site data format.
- `.github/workflows/sync-awesome-readme.yml`: scheduled and manual sync workflow.

## How This Repository Works

At a high level, the repository acts as a static visualization layer on top of the upstream awesome list:

1. `scripts/sync_awesome_readme.py` fetches the upstream `README.md`.
2. The script parses predefined sections such as methods, datasets, surveys, and benchmarks.
3. Parsed entries are normalized into the local JSON schema used by this site.
4. The outputs are written to `infrared-mindmap-data.json` and `assets/fallback-data.js`.
5. Frontend pages load the JSON first and fall back to embedded data if necessary.
6. GitHub Actions runs the sync job on schedule or on demand, and commits updated data when changes are detected.

In short: upstream README -> local structured data -> static web presentation.

## Auto Sync

- Upstream source: `awesome-infrared-small-targets/README.md`
- Sync entry: `python scripts/sync_awesome_readme.py`
- Workflow: `.github/workflows/sync-awesome-readme.yml`
- Trigger mode: scheduled run plus manual dispatch

This setup is stable for routine upstream updates. If the upstream README changes its section structure significantly, the parser rules may need to be adjusted.

## Local Usage

Sync data from the upstream README:

```bash
python scripts/sync_awesome_readme.py
```

Validate parsing without writing files:

```bash
python scripts/sync_awesome_readme.py --check
```

The site is static, so after data generation it can be previewed or deployed directly as ordinary static files.

## Notes

- This repository is a reorganized presentation layer, not the original source of record for the research list.
- Paper metadata and external links should still be treated as downstream views of the upstream awesome repository and the original paper pages.
- The main goal of this project is to make long-term tracking, browsing, and revisiting the field a bit more efficient.

## Acknowledgement

Thanks to [Tianfang-Zhang/awesome-infrared-small-targets](https://github.com/Tianfang-Zhang/awesome-infrared-small-targets) for the upstream collection and long-term maintenance work behind it.

起初只是想总结一个ppt版本，最后借助ai力量实现了追踪仓库并定时更新网页内容。网页中同时链接了南开、北航、成电等非常优秀的红外小目标检测研究课题组，非常感谢。

2019-2026年，红外小目标从几乎没有公开可用大型数据集到现在已经能拿下CVPR/NIPS等顶刊，从传统手工特征到如今跨模态语义融合，看到那么多一直坚守的前辈或同行，非常钦佩。也很遗憾自己没能有所建树。

希望大家能坚持，坚信有梦想谁都了不起。
