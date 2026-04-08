// ============================================================
// CapForge - GitHub Import Module
// ============================================================

import * as path from "path";
import * as fs from "fs";
import * as util from "util";
import { exec } from "child_process";

const execAsync = util.promisify(exec);

import type { KnownRepo } from "./types";
import { reposDir as reposDirFromWorkspace } from "./workspace";

/** Well-known validation repos */
export const KNOWN_REPOS: KnownRepo[] = [
  { name: "agent-zero", url: "https://github.com/agent0ai/agent-zero", shortName: "agent0" },
  { name: "EvoSkill", url: "https://github.com/sentient-agi/EvoSkill", shortName: "evoskill" },
  { name: "hermes-agent", url: "https://github.com/nousresearch/hermes-agent", shortName: "hermes-agent" },
  { name: "Hyperagents", url: "https://github.com/facebookresearch/Hyperagents", shortName: "hyperagents" },
  { name: "MetaClaw", url: "https://github.com/aiming-lab/MetaClaw", shortName: "metaclaw" },
  { name: "OpenClaw-RL", url: "https://github.com/Gen-Verse/OpenClaw-RL", shortName: "openclaw-rl" },
];

/**
 * Resolve a short name, full name, or URL to a KnownRepo.
 */
export function resolveKnownRepo(input: string): KnownRepo | undefined {
  const lower = input.toLowerCase().trim();
  return KNOWN_REPOS.find(
    (r) =>
      r.shortName.toLowerCase() === lower ||
      r.name.toLowerCase() === lower ||
      r.url.toLowerCase() === lower
  );
}

/**
 * Extract a human-friendly project name from a GitHub URL.
 */
export function projectAliasFromUrl(url: string): string {
  const match = url.match(/github\.com\/[^/]+\/([^/]+)/);
  if (match) return match[1].replace(/\.git$/, "");
  return url.split("/").pop()?.replace(/\.git$/, "") ?? "unknown-project";
}

/**
 * Return the absolute path to the repos directory.
 */
export function reposDir(baseDir?: string): string {
  return reposDirFromWorkspace(baseDir);
}

/**
 * Clone a GitHub repository into the local repos/ directory.
 * If the directory already exists, can optionally do an incremental update (git fetch/pull).
 */
export async function cloneRepo(
  repoUrl: string,
  options?: { baseDir?: string; shallow?: boolean; update?: boolean; forceUpdate?: boolean }
): Promise<{
  repoDir: string;
  alias: string;
  alreadyExists: boolean;
  updated: boolean;
  updateSkipped: boolean;
  updateMessage?: string;
}> {
  const alias = projectAliasFromUrl(repoUrl);
  const dir = path.join(reposDir(options?.baseDir), alias);

  if (fs.existsSync(dir)) {
    // If not a git repo, treat as error (avoid pulling into random folders)
    if (!fs.existsSync(path.join(dir, ".git"))) {
      throw new Error(`Target exists but is not a git repo: ${dir}`);
    }

    // Default: do incremental update unless explicitly disabled
    const doUpdate = options?.update !== false;
    if (!doUpdate) {
      return { repoDir: dir, alias, alreadyExists: true, updated: false, updateSkipped: true };
    }

    const updateResult = await updateRepo(dir, { force: !!options?.forceUpdate });
    return {
      repoDir: dir,
      alias,
      alreadyExists: true,
      updated: updateResult.updated,
      updateSkipped: updateResult.skipped,
      updateMessage: updateResult.message,
    };
  }

  fs.mkdirSync(path.dirname(dir), { recursive: true });

  const shallowFlag = options?.shallow !== false ? "--depth 1" : "";
  const cmd = `git clone ${shallowFlag} ${repoUrl} ${dir}`.trim();

  console.log(`Cloning ${repoUrl} ...`);
  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 300_000 });
    if (stderr && !stderr.includes("Cloning into")) {
      console.warn(`git stderr: ${stderr}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to clone ${repoUrl}: ${message}`);
  }

  console.log(`Cloned to ${dir}`);
  return { repoDir: dir, alias, alreadyExists: false, updated: false, updateSkipped: false };
}

/**
 * List all projects currently cloned under repos/.
 */
export function listClonedProjects(baseDir?: string): string[] {
  const dir = reposDir(baseDir);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => {
    const p = path.join(dir, name);
    return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, ".git"));
  });
}

async function updateRepo(
  repoDir: string,
  opts: { force: boolean }
): Promise<{ updated: boolean; skipped: boolean; message: string }> {
  // Check dirty state
  try {
    const { stdout } = await execAsync(`git -C ${quote(repoDir)} status --porcelain`, { timeout: 60_000 });
    const dirty = stdout.trim().length > 0;
    if (dirty && !opts.force) {
      return {
        updated: false,
        skipped: true,
        message: "Local changes detected (dirty working tree). Skipping update. Use --force-update to discard changes.",
      };
    }

    if (dirty && opts.force) {
      // Danger: discard local changes; explicit opt-in only
      await execAsync(`git -C ${quote(repoDir)} reset --hard`, { timeout: 120_000 });
      await execAsync(`git -C ${quote(repoDir)} clean -fd`, { timeout: 120_000 });
    }

    // Fetch updates
    await execAsync(`git -C ${quote(repoDir)} fetch --all --prune`, { timeout: 300_000 });

    // Pull fast-forward only (safe default)
    const pullCmd = `git -C ${quote(repoDir)} pull --ff-only`;
    try {
      const { stdout: pullOut, stderr: pullErr } = await execAsync(pullCmd, { timeout: 300_000 });
      const msg = (pullOut || pullErr || "").trim() || "Updated.";
      return { updated: true, skipped: false, message: msg };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        updated: false,
        skipped: true,
        message: `Update skipped (non-fast-forward or other issue). ${message}`,
      };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { updated: false, skipped: true, message: `Update failed: ${message}` };
  }
}

function quote(p: string): string {
  // simple shell quoting for paths
  return `'${p.replace(/'/g, "'\\''")}'`;
}
