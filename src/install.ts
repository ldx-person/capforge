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
