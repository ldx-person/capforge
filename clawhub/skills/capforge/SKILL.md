---
name: capforge
description: Austin Liu | Extract reusable capability assets from GitHub open-source projects: scan code structure, generate capability.md / transform-plan.md, classify domains, validate format. No LLM analysis required.
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - git
        - node
        - npx
    install:
      # 使用 npx 运行会自动拉取 npm 包;这里声明为 node 依赖,便于运行环境预装/审计
      - kind: node
        package: capforge
        bins: [capforge]
    homepage: https://github.com/ldx-person/capforge
    # 额外品牌信息(非强制字段,作为前端展示/检索信息)
    emoji: "⚒️"
---

# CapForge(铸能)

**Austin Liu**:从 GitHub 开源项目中锻造可复用的能力资产。

## 你会得到什么

CapForge 的职责是**纯代码结构扫描**(不调用 LLM)并产出可被 Agent / 人类阅读的 Markdown;你(或 OpenClaw/Clawdbot)再基于扫描结果把能力"资产化":

- `capability.md`:可复用能力的结构化说明(接口、输入输出、关键文件等)
- `transform-plan.md`:把能力"模块化/可复用"的改造任务清单
- `domains.md`:跨项目能力域归类摘要
- `validation-report.md`:capability.md 结构校验报告

## 适用场景(核心卖点)

- 你想快速"看懂一个开源项目能复用什么",并沉淀为可检索的能力资产(`capability.md`)。
- 你想把多个开源 Agent 项目做横向对比,快速选型/组合能力(配合 `domains.md`)。

## 工作空间约定(重要)

CapForge 默认将所有克隆仓库与输出统一放在同一个工作空间:

- 默认:`~/.capforge/`
  - `repos/`:克隆的项目
  - `output/`:扫描/能力/计划等产物

你可以通过任意一种方式覆盖:

- `CAPFORGE_WORKSPACE=/path/to/ws`
- `npx capforge --workspace /path/to/ws <command>`

## 一键分析流水线(推荐)

当用户给你一个 GitHub 项目链接时,按顺序执行:

### Step 1) Clone + Scan

```bash
npx capforge import <github-url>
npx capforge scan <project-name>
```

> `<project-name>` 一般是仓库名(URL 最后一段)。

### Step 2) 生成 capability.md(你来写,CapForge 不写)

先让 CapForge 生成扫描数据(Markdown):

```bash
npx capforge describe <project-name>
```

它会写入(默认工作空间):

- `~/.capforge/output/capabilities/<project-name>.md`

然后你需要基于:
1) 扫描数据
2) 仓库源码(`~/.capforge/repos/<project-name>/...`)
生成一个"真正的能力描述"并覆盖写回 `output/capabilities/<project-name>.md`(或另存为 `capability.md` 再统一收集)。

**capability.md 必须包含这些章节:**

- `## 概述`
- `## 技术栈`
- `## 核心能力`(建议 5-10 个能力点,包含真实接口/函数签名与关键文件路径)
- `## 集成指南`
- `## 改造文件`

### Step 3) 生成 transform-plan.md(你来写,CapForge 只给扫描数据)

```bash
npx capforge transform <project-name>
```

它会写入:

- `~/.capforge/output/transform-plans/<project-name>.md`

然后你需要把该文件改写为"真正的改造计划",建议结构:

```markdown
# <Project> 改造计划

## 总体策略

## 改造任务

### [high] Task 1: <title>
- **目标文件:** <targetFile>
- **动作:** extract|abstract|dehardcode|decouple|adapter
- **依赖:** <task ids>
- **描述:** <description>
- **验收标准:** <acceptanceCriteria>
```

### Step 4) 归类 domains.md

```bash
npx capforge classify-domains
```

输出:

- `~/.capforge/output/domains.md`

### Step 5) 校验格式

```bash
npx capforge validate
```

输出:

- `~/.capforge/output/validation-report.md`

## 交互决策点(在执行改造前一定要问)

在你准备根据 transform-plan.md 修改代码前,请明确询问用户:

1) **全部执行 / 只执行高优先级 / 不执行改造**?
2) 是否允许对仓库进行大规模重构(例如 API 抽象、适配层、新增模块边界)?
