// ============================================================
// CapForge - Workspace Path Resolution
// ============================================================

import * as path from "path";

const HOME_DIR = process.env.HOME ?? process.env.USERPROFILE ?? "/root";

function expandHome(p: string): string {
  if (p === "~") return HOME_DIR;
  if (p.startsWith("~/")) return path.join(HOME_DIR, p.slice(2));
  return p;
}

/**
 * Resolve CapForge workspace root.
 *
 * Priority:
 * 1) explicit argument
 * 2) env CAPFORGE_WORKSPACE
 * 3) default: ~/.capforge
 *
 * Workspace layout:
 *   <workspaceRoot>/
 *     repos/
 *     output/
 */
export function resolveWorkspaceRoot(workspace?: string): string {
  const fromArg = workspace?.trim();
  const fromEnv = process.env.CAPFORGE_WORKSPACE?.trim();
  const root = fromArg || fromEnv || path.join(HOME_DIR, ".capforge");
  return path.resolve(expandHome(root));
}

export function reposDir(workspace?: string): string {
  return path.join(resolveWorkspaceRoot(workspace), "repos");
}

export function outputDir(workspace?: string): string {
  return path.join(resolveWorkspaceRoot(workspace), "output");
}

export function capabilitiesDir(workspace?: string): string {
  return path.join(outputDir(workspace), "capabilities");
}

export function transformPlansDir(workspace?: string): string {
  return path.join(outputDir(workspace), "transform-plans");
}

export function comparisonsDir(workspace?: string): string {
  return path.join(outputDir(workspace), "comparisons");
}

export function pipelineDir(workspace?: string): string {
  return path.join(outputDir(workspace), "pipeline");
}
