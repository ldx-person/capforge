# CapForge（铸能）

[English](README_EN.md) | 中文

从 GitHub 开源项目中锻造可复用的能力资产。

## 为什么需要 CapForge？

开源社区有大量优秀的 AI Agent 项目，但它们的能力往往与项目本体深度耦合，难以被其他项目复用。开发者想借鉴某个项目的某个模块时，需要手动读源码、理解接口、剥离依赖——成本极高。

CapForge 解决这个问题：
- **自动扫描** 项目代码结构，提取文件树、依赖关系、模块边界
- **配合 Claude Code** 生成结构化的能力描述（capability.md）
- **跨项目能力检索** — 新项目开发时自动匹配已有能力
- **改造计划** — 自动生成将能力模块化的重构方案
- **能力域归类** — 多个项目按能力相似度自动分组，方便对比选型

## 设计理念

CapForge **不做 LLM 分析**。它的分工是：

| | CapForge | Claude Code |
|---|---|---|
| 代码扫描 | ✅ 纯代码分析，零 API 消耗 | ❌ |
| 能力理解 | ❌ | ✅ 读源码 + 生成 capability.md |
| 改造规划 | ❌ | ✅ 生成 transform-plan.md |
| 域归类 | ✅ 关键词匹配自动分组 | ✅ 补充差异化分析 |
| 格式校验 | ✅ validate | ❌ |
| 执行改造 | ❌ | ✅ 按计划修改代码 |

所有输出都是 **Markdown 格式**，agent 可读、人类可读。

## 安装

```bash
# 克隆项目
git clone https://github.com/ldx-person/capforge.git
cd capforge

# 安装依赖并编译
npm install
npm run build

# 全局安装（可选）
npm install -g .
```

### 安装到 Claude Code

CapForge 通过 skill 方式注入 Claude Code，安装后可在任意项目中使用：

```bash
# 安装 skills（将 /capforge 和 /capforge-refactor 注入 Claude Code）
npx capforge install

# 覆盖已有安装
npx capforge install --force

# 查看安装状态
npx capforge status

# 卸载
npx capforge uninstall
```

> 说明：Claude Code 新版推荐使用 `~/.claude/skills/<name>/SKILL.md`。  
> CapForge 的 `install` 会同时写入：
> - **推荐（新版）**：`~/.claude/skills/capforge/SKILL.md`、`~/.claude/skills/capforge-refactor/SKILL.md`
> - **兼容（旧版）**：`~/.claude/commands/capforge.md`、`~/.claude/commands/capforge-refactor.md`
>
> 安装后需要**完全重启 Claude Code**（退出当前会话/应用，再重新打开）。

安装后，在 Claude Code 中直接使用：
- `/capforge` — 分析项目、生成能力描述、改造计划、域归类
- `/capforge-refactor` — 按改造计划执行代码重构

#### 排错：安装后看不到 /capforge

1. 先确认文件是否写入成功：
   ```bash
   npx capforge status
   ls -la ~/.claude/skills/capforge
   ```
2. 确认你使用的是 **Claude Code CLI**（终端里运行的 `claude`），而不是 Claude 网页/桌面聊天界面：
   ```bash
   claude --version
   ```
3. 完全重启 Claude Code 后再试：在 Claude Code CLI 输入 `/capforge` 并回车。

## 使用

### 快速开始

```bash
# 1. 导入并扫描一个 GitHub 项目
npx capforge import https://github.com/nousresearch/hermes-agent
npx capforge scan hermes-agent

# 2. 在 Claude Code 中使用 /capforge 自动完成：
#    - 生成 capability.md（能力描述）
#    - 生成 transform-plan.md（改造计划）
#    - 更新 domains.md（域归类）
#    - 验证格式

# 3. 确认后自动执行改造（可选）

# 4. 开发新功能时自动检索已有能力库（自动触发）
```

### 工作空间（Workspace）

CapForge 会把**克隆仓库（repos）**和**生成的 Markdown（output）**统一放到同一个工作空间目录下，避免你在不同目录运行命令导致产物分散。

默认工作空间：
- `~/.capforge/`
  - `repos/`：克隆的项目
  - `output/`：capability / transform-plan / domains / validation-report 等

覆盖方式：
- 环境变量：`CAPFORGE_WORKSPACE=/path/to/workspace`
- CLI 参数：`npx capforge --workspace /path/to/workspace <command>`

## 发布到 ClawHub（OpenClaw 技能市场）

ClawHub 支持发布“文本技能包”（一个文件夹，包含 `SKILL.md` 及可选的支持文件）。

本仓库已提供可直接发布的技能目录：

- `clawhub/skills/capforge/`
- `clawhub/skills/capforge-refactor/`

发布方式（示例）：

```bash
# 先安装 clawhub CLI 并登录（一次性）
clawhub login

# 发布 capforge
clawhub skill publish clawhub/skills/capforge \
  --slug capforge \
  --name "CapForge" \
  --version 1.0.0 \
  --tags latest \
  --changelog "Initial release"

# 发布 capforge-refactor
clawhub skill publish clawhub/skills/capforge-refactor \
  --slug capforge-refactor \
  --name "CapForge Refactor" \
  --version 1.0.0 \
  --tags latest \
  --changelog "Initial release"
```

### 命令参考

| 命令 | 说明 |
|------|------|
| `capforge import <url>` | 克隆 GitHub 仓库 |
| `capforge scan <name>` | 扫描代码结构 |
| `capforge describe <name>` | 输出扫描数据 |
| `capforge transform <name>` | 输出改造扫描数据 |
| `capforge classify-domains` | 列出 capability.md 并归类 |
| `capforge validate` | 校验 capability.md 格式 |
| `capforge list` | 列出已导入项目 |
| `capforge install` | 安装 skills 到 Claude Code |
| `capforge uninstall` | 卸载 skills |
| `capforge status` | 查看 skill 安装状态 |

## 核心流程

```
capforge/
├── src/
│   ├── cli.ts          # CLI 入口（commander）
│   ├── types.ts        # 类型定义
│   ├── import.ts       # GitHub 导入
│   ├── analyze.ts      # 代码扫描（文件树、依赖、导入导出分析）
│   ├── transform.ts    # 改造扫描数据输出
│   ├── describe.ts     # 扫描数据输出
│   ├── domain.ts       # 能力域归类（列出 capability.md）
│   ├── validate.ts     # 验证 capability.md 结构
│   ├── install.ts      # Claude Code skill 安装
│   └── skills/         # Skill 文件
├── repos/              # 克隆的项目
├── output/
│   ├── capabilities/   # 每个项目的 capability.md
│   ├── transform-plans/ # 改造计划 .md
│   ├── domains.md      # 域分类摘要
│   └── validation-report.md
├── package.json
├── tsconfig.json
└── README.md
```

## 核心流程

1. **Import** - 克隆 GitHub 仓库到 `repos/` 目录（默认浅克隆）
2. **Scan** - 扫描项目结构：文件树、依赖、入口文件、核心模块、导入/导出分析
3. **Describe** - 输出扫描数据 Markdown，交给 Claude Code 生成 capability.md
4. **Transform** - 输出改造扫描数据，交给 Claude Code 生成改造计划
5. **Classify Domains** - 列出所有 capability.md 文件，生成能力域归类摘要
6. **Validate** - 验证 capability.md 文件包含必要部分（## 概述, ## 核心能力, ## 集成指南, ## 改造文件, ## 技术栈）

## 输出格式

所有输出都是 Markdown 格式，agent 可读、人类可读。

## License 合规提醒（新增）

CapForge 会在扫描时尝试检测目标项目的许可证（优先读取 `package.json` 的 `license` 字段，其次读取 `LICENSE/COPYING` 等文件），并给出**合规提醒**。

- **未检测到明确许可证**：默认认为可能是 *All Rights Reserved*，CapForge 会**默认禁止生成改造扫描/改造计划**，并提示先做合规确认。
- **强 copyleft（GPL/AGPL）**：为避免跨项目复用引入“传染性”要求，CapForge **默认禁止改造**（仍可扫描/生成能力描述）。如你已经完成合规评审，可用 `transform --ignore-license` 强制继续（不推荐）。
- **宽松许可证（MIT/Apache/BSD 等）**：允许改造，但仍会提示保留 LICENSE/NOTICE/版权声明。

当你在新项目中引用该开源项目代码进行开发/分发时，也应在 `capability.md` 的“集成指南”中明确提醒许可证要求。

## Release Notes

见 [CHANGELOG.md](./CHANGELOG.md)。

### capability.md — 能力描述

```markdown
# <Project Name>

## 概述
<one-sentence description>

## 技术栈
<tech stack list>

## 核心能力

### <capability-name>
<description>

**接口定义:**
```<language>
<interface/signature>
```

**输入:** <inputs description>
**输出:** <outputs description>
**依赖:** <dependencies>
**关键文件:** <file paths>

## 集成指南
<how to integrate>

## 改造文件
<list of key files>
```

### transform-plan.md — 改造计划

```markdown
# <Project> 改造计划

## 总体策略
<总体改造建议>

## 改造任务

### [high] Task 1: <title>
- **目标文件:** <targetFile>
- **动作:** extract|abstract|dehardcode|decouple|adapter
- **依赖:** <task ids>
- **描述:** <具体改造描述>
- **验收标准:** <如何验证完成>
```

### domains.md — 能力域归类

```markdown
# 能力域归类

## <domain-name>
<域描述>

### 参与项目
- **<project-name>** — <贡献的能力列表>

### 公共能力
<跨项目公共能力>

### 项目差异
- **<project>**: <方案> — <优势> — 适用于<场景>
```

## License

MIT © 2026 Autsin Liu
