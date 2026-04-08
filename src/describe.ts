// ============================================================
// CapForge - Describe Module (scan output for Claude Code)
// ============================================================

import * as path from "path";
import * as fs from "fs";
import type { ScanResult } from "./types";
import { scanProject, scanResultToMarkdown } from "./analyze";
import { capabilitiesDir } from "./workspace";

/**
 * Run a scan and output the result as Markdown for Claude Code to use.
 */
export async function describeProject(repoDir: string, projectName: string): Promise<{
  scan: ScanResult;
  markdown: string;
  filePath: string;
}> {
  const scan = await scanProject(repoDir, projectName);
  const markdown = scanResultToMarkdown(scan);

  const filePath = saveScanResult(markdown, projectName);

  return { scan, markdown, filePath };
}

/**
 * Save scan result as Markdown to output directory.
 */
export function saveScanResult(markdown: string, projectName: string, outputDir?: string): string {
  const dir = outputDir ?? capabilitiesDir();
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${projectName}.md`);
  fs.writeFileSync(filePath, markdown, "utf-8");

  return filePath;
}

/**
 * List all saved capability.md files.
 */
export function listCapabilityFiles(outputDir?: string): string[] {
  const dir = outputDir ?? capabilitiesDir();
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

/**
 * Load a capability.md file content.
 */
export function loadCapabilityFile(projectName: string, outputDir?: string): string | null {
  const dir = outputDir ?? capabilitiesDir();
  const filePath = path.join(dir, `${projectName}.md`);

  if (!fs.existsSync(filePath)) return null;

  return fs.readFileSync(filePath, "utf-8");
}
