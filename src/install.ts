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

const SKILL_DIR = path.join(__dirname, "skills");
const SKILL_FILES = ["capforge.md", "capforge-refactor.md"];

/**
 * Install CapForge skills into Claude Code's commands directory.
 */
export async function installSkills(options: { force?: boolean }): Promise<void> {
  if (!fs.existsSync(CLAUDE_COMMANDS_DIR)) {
    fs.mkdirSync(CLAUDE_COMMANDS_DIR, { recursive: true });
    console.log(`Created: ${CLAUDE_COMMANDS_DIR}`);
  }

  for (const filename of SKILL_FILES) {
    const src = path.join(SKILL_DIR, filename);
    const targetPath = path.join(CLAUDE_COMMANDS_DIR, filename);

    if (!fs.existsSync(src)) {
      console.log(`  [MISSING] ${filename} (source not found at ${src})`);
      continue;
    }

    const exists = fs.existsSync(targetPath);
    if (exists && !options.force) {
      console.log(`  [SKIP] ${filename} (already exists, use --force to overwrite)`);
      continue;
    }

    fs.copyFileSync(src, targetPath);
    console.log(`  [OK] ${filename} -> ${targetPath}`);
  }

  console.log("\nDone! Use /capforge and /capforge-refactor in Claude Code.");
}

/**
 * Uninstall CapForge skills from Claude Code.
 */
export async function uninstallSkills(): Promise<void> {
  for (const filename of SKILL_FILES) {
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

/**
 * Check installation status.
 */
export function checkInstallStatus(): { installed: string[]; missing: string[] } {
  const installed: string[] = [];
  const missing: string[] = [];

  for (const filename of SKILL_FILES) {
    const targetPath = path.join(CLAUDE_COMMANDS_DIR, filename);
    if (fs.existsSync(targetPath)) {
      installed.push(filename);
    } else {
      missing.push(filename);
    }
  }

  return { installed, missing };
}
