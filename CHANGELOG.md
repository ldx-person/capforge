# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2026-04-09

### Added
- Claude Code 安装兼容升级：`capforge install` 同时写入 `~/.claude/skills/<name>/SKILL.md`（推荐）与 `~/.claude/commands/*.md`（兼容旧版），`status` 输出分别展示两处状态。
- 工作空间统一：repos 与输出 Markdown（output）统一落在同一 workspace（默认 `~/.capforge`），支持 `--workspace` / `CAPFORGE_WORKSPACE` 覆盖。
- 导入/导出“详细分析”：按文件提取 imports/exports/re-exports，统计外部/内部导入次数、导出符号次数、导出形态（ESM default/named/CJS），并在 scan/describe/transform 输出中展示“名称+次数”。
- License 检测与合规提醒：扫描时检测项目许可证并给出提醒；对“无许可证/强 copyleft/未知许可证”默认阻止生成改造扫描，提供 `transform --ignore-license` 覆盖。
- ClawHub 发布物：新增 `clawhub/skills/capforge` 与 `clawhub/skills/capforge-refactor` 技能包（用于发布到 ClawHub 技能市场）。

### Fixed
- 修复 build 脚本中拷贝不存在的 `src/skills` 导致构建失败的问题。

## [1.1.0] - 2026-04-08

### Changed
- 版本升级与若干 CLI/文档改进。

