// ============================================================
// CapForge - GitHub Import Module
// ============================================================

import * as path from "path";
import * as fs from "fs";
import * as util from "util";
import { exec } from "child_process";

const execAsync = util.promisify(exec);

import type { KnownRepo } from "./types";

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
  return path.resolve(baseDir ?? process.cwd(), "repos");
}

/**
 * Clone a GitHub repository into the local repos/ directory.
 * Skips if the directory already exists.
 */
export async function cloneRepo(
  repoUrl: string,
  options?: { baseDir?: string; shallow?: boolean }
): Promise<{ repoDir: string; alias: string; alreadyExists: boolean }> {
  const alias = projectAliasFromUrl(repoUrl);
  const dir = path.join(reposDir(options?.baseDir), alias);

  if (fs.existsSync(dir)) {
    return { repoDir: dir, alias, alreadyExists: true };
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
  return { repoDir: dir, alias, alreadyExists: false };
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
