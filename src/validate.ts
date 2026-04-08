// ============================================================
// CapForge - Validation Module (check capability.md structure)
// ============================================================

import * as path from "path";
import * as fs from "fs";
import { KNOWN_REPOS } from "./import";
import type { KnownRepo } from "./types";
import { listCapabilityFiles, loadCapabilityFile } from "./describe";
import type { CapabilityValidation, ValidationReport } from "./types";
import { REQUIRED_SECTIONS } from "./types";
import { outputDir as outputDirFromWorkspace } from "./workspace";

/**
 * Validate that capability.md files exist and contain expected sections.
 */
export async function validate(
  repoShortNames?: string[],
  outputDir?: string
): Promise<ValidationReport> {
  const repos = repoShortNames
    ? KNOWN_REPOS.filter((r) => repoShortNames.includes(r.shortName))
    : KNOWN_REPOS;

  const results: CapabilityValidation[] = [];
  const capabilityFiles = listCapabilityFiles(outputDir);

  for (const repo of repos) {
    const result = validateSingleProject(repo, capabilityFiles, outputDir);
    results.push(result);
  }

  const validCount = results.filter((r) => r.allSectionsPresent).length;
  const overallScore = repos.length > 0 ? Math.round((validCount / repos.length) * 100) : 0;

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    projects: results,
    overallScore,
    summary: `${validCount}/${repos.length} projects have valid capability.md files. Overall score: ${overallScore}%`,
  };

  // Save report as Markdown
  const dir = outputDir ?? outputDirFromWorkspace();
  fs.mkdirSync(dir, { recursive: true });
  const reportMd = buildValidationReportMarkdown(report);
  fs.writeFileSync(path.join(dir, "validation-report.md"), reportMd, "utf-8");

  return report;
}

function validateSingleProject(
  repo: KnownRepo,
  capabilityFiles: string[],
  outputDir?: string
): CapabilityValidation {
  const issues: string[] = [];
  const requiredSections = REQUIRED_SECTIONS.map((section) => ({
    section,
    present: false,
  }));

  // Check if capability.md exists (try name and shortName variants)
  const candidates = [repo.shortName, repo.name, repo.name.toLowerCase(), repo.shortName.toLowerCase()];
  const matchFile = candidates.find((n) => capabilityFiles.includes(n));
  const exists = !!matchFile;

  if (!exists) {
    issues.push(`No capability.md found for ${repo.name}`);
    return {
      project: repo.name,
      capabilityExists: false,
      requiredSections,
      allSectionsPresent: false,
      issues,
    };
  }

  const content = loadCapabilityFile(matchFile!, outputDir)!;

  if (!content) {
    issues.push(`Could not read capability.md for ${repo.name}`);
    return {
      project: repo.name,
      capabilityExists: false,
      requiredSections,
      allSectionsPresent: false,
      issues,
    };
  }

  // Check required sections
  for (const entry of requiredSections) {
    entry.present = content.includes(entry.section);
    if (!entry.present) {
      issues.push(`Missing section: ${entry.section}`);
    }
  }

  const allSectionsPresent = requiredSections.every((s) => s.present);

  return {
    project: repo.name,
    capabilityExists: true,
    requiredSections,
    allSectionsPresent,
    issues,
  };
}

/**
 * Print a validation report to the console.
 */
export function printValidationReport(report: ValidationReport): void {
  console.log("\n========== Validation Report ==========\n");
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(`Overall Score: ${report.overallScore}%`);
  console.log(`Summary: ${report.summary}\n`);

  for (const result of report.projects) {
    const status = result.capabilityExists
      ? result.allSectionsPresent
        ? "PASS"
        : "PARTIAL"
      : "FAIL";
    console.log(`[${status}] ${result.project}`);

    for (const issue of result.issues) {
      console.log(`  ! ${issue}`);
    }
    console.log();
  }

  console.log("========================================\n");
}

function buildValidationReportMarkdown(report: ValidationReport): string {
  const lines: string[] = [
    "# 验证报告",
    "",
    `**时间:** ${report.timestamp}`,
    `**总分:** ${report.overallScore}%`,
    `**摘要:** ${report.summary}`,
    "",
    "## 项目验证结果",
    "",
  ];

  for (const result of report.projects) {
    const status = result.capabilityExists
      ? result.allSectionsPresent
        ? "PASS"
        : "PARTIAL"
      : "FAIL";
    lines.push(`### [${status}] ${result.project}`, "");

    if (result.issues.length > 0) {
      for (const issue of result.issues) {
        lines.push(`- ${issue}`);
      }
    } else {
      lines.push("所有必要部分均已呈现。");
    }
    lines.push("");
  }

  return lines.join("\n");
}
