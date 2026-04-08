# CapForge（铸能）

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
npm install
npm run build
```

## 使用

### CLI 命令

```bash
# 导入单个项目
npx capforge import https://github.com/nousresearch/hermes-agent

# 扫描已导入的项目（文件树、依赖、入口文件、模块结构）
npx capforge scan hermes-agent

# 生成扫描数据 Markdown（交给 Claude Code 生成 capability.md）
npx capforge describe hermes-agent

# 生成改造扫描数据（交给 Claude Code 生成改造计划）
npx capforge transform hermes-agent

# 列出所有 capability.md 文件并生成能力域归类
npx capforge classify-domains

# 验证 capability.md 文件是否包含必要部分
npx capforge validate

# 列出已导入的项目
npx capforge list

# 安装/卸载 CapForge skills
npx capforge install [--force]
npx capforge uninstall
npx capforge status
```

### 短名映射

| 短名 | 项目 | URL |
|------|------|-----|
| agent0 | agent-zero | https://github.com/agent0ai/agent-zero |
| evoskill | EvoSkill | https://github.com/sentient-agi/EvoSkill |
| hermes-agent | hermes-agent | https://github.com/nousresearch/hermes-agent |
| hyperagents | Hyperagents | https://github.com/facebookresearch/Hyperagents |
| metaclaw | MetaClaw | https://github.com/aiming-lab/MetaClaw |
| openclaw-rl | OpenClaw-RL | https://github.com/Gen-Verse/OpenClaw-RL |

## 项目结构

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

## capability.md 格式

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

## 开发

```bash
npm run build
npm install -g .  # 全局安装（可选）
npx tsc --noEmit     # 类型检查
```

## License

MIT

## Claude Code 集成

CapForge 支持 Claude Code skill 注入：

```bash
npx capforge install --force
```

安装后可在 Claude Code 中使用 `/capforge` 和 `/capforge-refactor` 命令。
