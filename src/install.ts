// ============================================================
// CapForge - Skill Installation Module
// ============================================================

import * as path from "path";
import * as fs from "fs";

export const CLAUDE_COMMANDS_DIR = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "/root",
  ".claude",
  "commands"
);

function getSkills(): Record<string, string> {
  return {
    "capforge.md": CAPFORGE_SKILL,
    "capforge-refactor.md": CAPFORGE_REFACTOR_SKILL,
  };
}

const SKILL_NAMES = ["capforge.md", "capforge-refactor.md"];

export async function installSkills(options: { force?: boolean }): Promise<void> {
  const skills = getSkills();

  if (!fs.existsSync(CLAUDE_COMMANDS_DIR)) {
    fs.mkdirSync(CLAUDE_COMMANDS_DIR, { recursive: true });
    console.log(`Created: ${CLAUDE_COMMANDS_DIR}`);
  }

  for (const [filename, content] of Object.entries(skills)) {
    const targetPath = path.join(CLAUDE_COMMANDS_DIR, filename);
    const exists = fs.existsSync(targetPath);

    if (exists && !options.force) {
      console.log(`  [SKIP] ${filename} (already exists, use --force to overwrite)`);
      continue;
    }

    fs.writeFileSync(targetPath, content, "utf-8");
    console.log(`  [OK] ${filename} -> ${targetPath}`);
  }

  console.log("\nDone! Restart Claude Code and use /capforge.");
}

export async function uninstallSkills(): Promise<void> {
  for (const filename of SKILL_NAMES) {
    const targetPath = path.join(CLAUDE_COMMANDS_DIR, filename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      console.log(`  [REMOVED] ${filename}`);
    } else {
      console.log(`  [SKIP] ${filename} (not found)`);
    }
  }
  console.log("\nDone.");
}

export function checkInstallStatus(): { installed: string[]; missing: string[] } {
  const installed: string[] = [];
  const missing: string[] = [];
  for (const filename of SKILL_NAMES) {
    if (fs.existsSync(path.join(CLAUDE_COMMANDS_DIR, filename))) {
      installed.push(filename);
    } else {
      missing.push(filename);
    }
  }
  return { installed, missing };
}

// ---- Embedded Skill Content ----

const CAPFORGE_SKILL = `---
description: Analyze GitHub projects, extract capabilities, generate transform plans, and optionally execute refactoring
argument-hint: <github-url-or-command> [--force]
---

Use CapForge to analyze GitHub projects, extract reusable capabilities, generate transform plans, and optionally execute refactoring.

## One-Shot Pipeline

When the user asks to import/analyze a project, execute ALL steps automatically:

\\\`\\\`\\\`bash
# Step 1: Clone + scan
npx capforge import <github-url>
npx capforge scan <project-name>
\\\`\\\`\\\`

Then read the scan output and source code, and generate ALL three artifacts:

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
