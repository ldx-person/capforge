// ============================================================
// CapForge - Skill Installation Module
// ============================================================

import * as path from "path";
import * as fs from "fs";

const HOME_DIR = process.env.HOME ?? process.env.USERPROFILE ?? "/root";
export const CLAUDE_DIR = path.join(HOME_DIR, ".claude");
/**
 * Legacy custom command location (still supported by Claude Code, but newer versions
 * recommend installing skills under ~/.claude/skills/<name>/SKILL.md).
 */
export const CLAUDE_COMMANDS_DIR = path.join(CLAUDE_DIR, "commands");
/** Recommended skill location for Claude Code */
export const CLAUDE_SKILLS_DIR = path.join(CLAUDE_DIR, "skills");

type SkillSpec = { name: string; content: string };

function getSkills(): SkillSpec[] {
  return [
    { name: "capforge", content: CAPFORGE_SKILL },
    { name: "capforge-refactor", content: CAPFORGE_REFACTOR_SKILL },
  ];
}

const SKILL_NAMES = ["capforge", "capforge-refactor"] as const;

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created: ${dir}`);
  }
}

function installToSkillsDir(skills: SkillSpec[], options: { force?: boolean }): void {
  ensureDir(CLAUDE_SKILLS_DIR);

  for (const skill of skills) {
    const dir = path.join(CLAUDE_SKILLS_DIR, skill.name);
    ensureDir(dir);
    const targetPath = path.join(dir, "SKILL.md");
    const exists = fs.existsSync(targetPath);

    if (exists && !options.force) {
      console.log(`  [SKIP] skills/${skill.name}/SKILL.md (already exists, use --force to overwrite)`);
      continue;
    }

    fs.writeFileSync(targetPath, skill.content, "utf-8");
    console.log(`  [OK] skills/${skill.name}/SKILL.md -> ${targetPath}`);
  }
}

function installToCommandsDir(skills: SkillSpec[], options: { force?: boolean }): void {
  ensureDir(CLAUDE_COMMANDS_DIR);

  for (const skill of skills) {
    const filename = `${skill.name}.md`;
    const targetPath = path.join(CLAUDE_COMMANDS_DIR, filename);
    const exists = fs.existsSync(targetPath);

    if (exists && !options.force) {
      console.log(`  [SKIP] commands/${filename} (already exists, use --force to overwrite)`);
      continue;
    }

    fs.writeFileSync(targetPath, skill.content, "utf-8");
    console.log(`  [OK] commands/${filename} -> ${targetPath}`);
  }
}

export async function installSkills(options: { force?: boolean }): Promise<void> {
  const skills = getSkills();

  // Install to recommended path first (Claude Code v2+ primarily treats custom commands as skills)
  installToSkillsDir(skills, options);

  // Also install legacy command files for backward compatibility with older setups
  installToCommandsDir(skills, options);

  console.log(
    "\nDone! Please fully restart Claude Code (exit the session/app, then reopen) and use /capforge."
  );
}

export async function uninstallSkills(): Promise<void> {
  // Remove skills
  for (const name of SKILL_NAMES) {
    const skillDir = path.join(CLAUDE_SKILLS_DIR, name);
    const skillFile = path.join(skillDir, "SKILL.md");
    if (fs.existsSync(skillFile)) {
      fs.unlinkSync(skillFile);
      console.log(`  [REMOVED] skills/${name}/SKILL.md`);
    }
    // best-effort cleanup
    try {
      if (fs.existsSync(skillDir) && fs.readdirSync(skillDir).length === 0) {
        fs.rmdirSync(skillDir);
      }
    } catch {
      // ignore
    }
  }

  // Remove legacy command files
  for (const name of SKILL_NAMES) {
    const filename = `${name}.md`;
    const targetPath = path.join(CLAUDE_COMMANDS_DIR, filename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      console.log(`  [REMOVED] commands/${filename}`);
    }
  }

  console.log("\nDone.");
}

export function checkInstallStatus(): {
  skillsDir: string;
  commandsDir: string;
  installedSkills: string[];
  missingSkills: string[];
  installedCommands: string[];
  missingCommands: string[];
} {
  const installedSkills: string[] = [];
  const missingSkills: string[] = [];
  const installedCommands: string[] = [];
  const missingCommands: string[] = [];

  for (const name of SKILL_NAMES) {
    const skillFile = path.join(CLAUDE_SKILLS_DIR, name, "SKILL.md");
    if (fs.existsSync(skillFile)) installedSkills.push(name);
    else missingSkills.push(name);

    const cmdFile = path.join(CLAUDE_COMMANDS_DIR, `${name}.md`);
    if (fs.existsSync(cmdFile)) installedCommands.push(name);
    else missingCommands.push(name);
  }

  return {
    skillsDir: CLAUDE_SKILLS_DIR,
    commandsDir: CLAUDE_COMMANDS_DIR,
    installedSkills,
    missingSkills,
    installedCommands,
    missingCommands,
  };
}

// ---- Embedded Skill Content ----

const CAPFORGE_SKILL = `---
name: capforge
description: Analyze GitHub projects, extract capabilities, generate transform plans, and support cross-project comparison/selection
argument-hint: <github-url-or-command> [--force]
---

使用 CapForge 来分析 GitHub 项目、提取可复用能力、生成改造计划，并支持“多项目横向对比/选型”（自然语言意图路由）。

> 重要：CapForge 默认工作空间为 ~/.capforge（或环境变量 CAPFORGE_WORKSPACE / CLI 参数 --workspace 指定）。

## 意图路由（自然语言）

你必须先根据用户的自然语言输入判断意图，并用一句话告知用户你将执行的模式：

### A) 横向对比/选型（Compare 模式）

满足任一条件视为 Compare：
- 用户明确要求：对比/比较/横向/选型/推荐/哪个好/差异/评估/竞品
- 用户给出 ≥2 个候选项目（多个 URL/多个 repo 名）
- 用户只描述需求（“我想做 X，帮我选合适的项目/方案”）

### B) 单项目分析/产物生成（Analyze 模式）

满足以下条件通常为 Analyze：
- 输入只涉及 1 个项目（一个 URL 或一个短名）
- 用户要：scan/describe/transform/validate/生成能力描述/生成改造计划

如果 Compare/Analyze 都可能成立（高歧义），再追问一句确认；否则直接执行。

### C) 全量更新（Update 模式）

满足任一条件视为 Update：
- 用户明确要求：更新项目/同步最新/pull 最新/检查更新/全量更新
- 用户说“把所有已导入项目都更新一下”

Update 模式必须优先执行：

~~~bash
npx capforge update --all
~~~

并把输出摘要（更新了哪些、跳过了哪些及原因）反馈给用户。若用户只想更新某一个项目，则执行：

~~~bash
npx capforge update <project>
~~~

## One-Shot Pipeline

当判定为 **Analyze 模式** 时，执行以下一键流水线（尽量自动完成全部步骤）：

# （为避免不同宿主对 Markdown 转义的差异，这里使用 ~~~ 代码块）
~~~bash
# 推荐：使用确定性流水线（强约束，适合 OpenClaw 自动化）
npx capforge pipeline --mode analyze --repo <github-url>
~~~

然后读取扫描输出与源码，生成/完善产物：

**Step 2: Generate capability.md** → \\\`output/capabilities/<project>.md\\\`

Format: # <Name> / ## 概述 / ## 技术栈 / ## 核心能力 (5-10 caps with real interfaces) / ## 集成指南 / ## 改造文件

**Step 3: Generate transform-plan.md** → \\\`output/transform-plans/<project>.md\\\`

Format: # <Project> 改造计划 / ## 总体策略 / ## 改造任务 (priority, targetFile, action, description, acceptanceCriteria)

Actions: extract|abstract|dehardcode|decouple|adapter

**Step 4: Update domains.md** → \\\`output/domains.md\\\`

Read ALL capability.md, classify into multi-domains. Each domain: 参与项目, 公共能力, 项目差异.

**Step 5: Validate** — \\\`npx capforge validate\\\` must pass 100%.

**Step 6: Ask user** — 全部执行 / 只执行高优先级 / 不执行？

**Step 7: Execute if confirmed** — modify repos/<project>/, then re-run Steps 2-5.

> License 门禁：如果目标项目许可证为“未知/无许可证/强 copyleft（GPL/AGPL）”，CapForge 默认会阻止生成改造扫描/计划。除非用户明确确认已完成合规评审，否则不要指导用户使用 --ignore-license。

## 横向对比/选型（Compare 模式）

当判定为 Compare 模式时，目标是输出一份“可决策”的对比报告，并尽量减少用户交互。

优先使用确定性流水线来保证“步骤不遗漏、产物一定落盘”：

~~~bash
npx capforge pipeline --mode compare --repos <repo1,repo2,...> --topic "<需求摘要>"
~~~

### 输入形态
- 用户给出候选列表（URL/短名）：直接使用
- 用户只给需求描述：从现有能力库（output/domains.md + output/capabilities/*.md）召回候选；候选不足时，再请用户补充 3-8 个项目 URL/名称

### 执行步骤（尽量自动）
1. 对每个候选项目执行（或确保已存在）：
   - npx capforge import <url>
   - npx capforge scan <name>
   - npx capforge describe <name>（必要时你需要将该 md 改写为“真正 capability.md”，保证章节齐全）
2. 生成/更新 npx capforge classify-domains，确保 output/domains.md 最新
3. 输出对比报告到：
   - output/comparisons/<topic>.md

### 输出文件命名规则（你来定，需稳定）
- 如果用户明确给了主题（例如“选型 agent runtime”）：将主题转成 kebab-case 作为 <topic>
- 否则使用：comparison-YYYYMMDD-HHMM

### 对比报告必须包含的章节（硬性要求）
1. **需求摘要**（用户要解决什么）
2. **候选项目清单**（版本/技术栈/入口/核心模块）
3. **License 风险与改造可行性**（逐项目列出：SPDX、是否允许改造、原因、提醒）
4. **能力矩阵**（能力簇 × 项目，至少以 capability.md 的“核心能力”作为维度；标题不一致时允许你合并同义项并标注依据）
5. **集成成本评估**（依赖、侵入性、扩展点、配置复杂度）
6. **结论与推荐**（Top 1-3 + 适用场景 + 不适用场景 + 风险）

### 强制提醒（必须写入结论）
- CapForge 不提供法律意见；license 合规需人工审查
- 对“默认禁止改造”的候选：推荐时必须降权并明确标注“仅可参考，不建议抽取复用/分发”

## Capability Lookup (Auto-Trigger)

When user builds new project or adds feature, scan output/domains.md and output/capabilities/*.md for reusable capabilities first.

## Rules

1. Complete Steps 1-6 always
2. Real interfaces from source code
3. Real file paths
4. Multi-domain support
5. Chinese descriptions, English code
6. 5-10 capabilities, REUSABLE focus
`;

const CAPFORGE_REFACTOR_SKILL = `---
name: capforge-refactor
description: Execute a CapForge transform plan to refactor a project
argument-hint: <project-name>
---

Execute a CapForge transform plan (standalone mode).

1. Read \\\`output/transform-plans/<project>.md\\\`
2. Sort by priority (high first), respect dependencies
3. Modify \\\`repos/<project>/<targetFile>\\\`, verify acceptanceCriteria
4. Re-run pipeline: scan → capability.md → transform-plan.md → domains.md → validate

For first-time analysis, use /capforge instead.
`;
