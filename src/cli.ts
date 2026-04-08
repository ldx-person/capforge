#!/usr/bin/env node
// ============================================================
// CapForge（铸能）- CLI Entry Point
// ============================================================

import { Command } from "commander";
import {
  cloneRepo,
  listClonedProjects,
  projectAliasFromUrl,
  resolveKnownRepo,
} from "./import";
import { scanProject, scanResultToMarkdown } from "./analyze";
import { describeProject } from "./describe";
import { generateTransformScan } from "./transform";
import { classifyDomains } from "./domain";
import { validate, printValidationReport } from "./validate";
import { installSkills, uninstallSkills, checkInstallStatus, CLAUDE_COMMANDS_DIR, CLAUDE_SKILLS_DIR } from "./install";
import { resolveWorkspaceRoot } from "./workspace";
import { runPipeline } from "./pipeline";

const program = new Command();
const pkg = require("../package.json") as { version?: string };

program
  .name("capforge")
  .description("CapForge（铸能）- 从 GitHub 开源项目中锻造可复用的能力资产")
  .version(pkg.version ?? "0.0.0");

program.option(
  "-w, --workspace <dir>",
  "CapForge 工作空间根目录（默认 ~/.capforge；也可用环境变量 CAPFORGE_WORKSPACE 指定）"
);

function getWorkspaceRoot(): string {
  // Commander: global options are available via program.opts()
  const opts = program.opts<{ workspace?: string }>();
  const root = resolveWorkspaceRoot(opts.workspace);
  // Ensure all modules see the same workspace in this process (optional but convenient)
  process.env.CAPFORGE_WORKSPACE = root;
  return root;
}

// ---- import ----
program
  .command("import <repo>")
  .description("克隆 GitHub 仓库到本地 repos/ 目录")
  .option("--no-shallow", "完整克隆（不使用 --depth 1）")
  .option("--no-update", "如果仓库已存在则不做增量更新（默认会 fetch/pull）")
  .option("--force-update", "强制增量更新（会丢弃本地改动，危险）")
  .action(async (repo: string, opts: { shallow: boolean; update: boolean; forceUpdate?: boolean }) => {
    const workspaceRoot = getWorkspaceRoot();
    const known = resolveKnownRepo(repo);
    const url = known?.url ?? repo;
    try {
      const result = await cloneRepo(url, {
        shallow: opts.shallow,
        baseDir: workspaceRoot,
        update: opts.update,
        forceUpdate: !!opts.forceUpdate,
      });
      if (result.alreadyExists) {
        if (result.updated) {
          console.log(`Updated: ${result.alias} (${result.repoDir})`);
        } else {
          console.log(`Already exists: ${result.alias} (${result.repoDir})`);
        }
        if (result.updateMessage) {
          console.log(`Update: ${result.updateMessage}`);
        } else if (result.updateSkipped) {
          console.log("Update: skipped");
        }
      } else {
        console.log(`Cloned: ${result.alias} -> ${result.repoDir}`);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ---- scan ----
program
  .command("scan <project>")
  .description("扫描已导入项目的代码结构（文件树、依赖、入口文件、模块结构）")
  .action(async (project: string) => {
    const workspaceRoot = getWorkspaceRoot();
    const repoDir = findRepoDir(project, workspaceRoot);
    if (!repoDir) {
      console.error(`Project "${project}" not found in repos/. Run "capforge import" first.`);
      process.exit(1);
    }

    console.log(`Scanning ${project} ...`);

    try {
      const scan = await scanProject(repoDir, project);
      console.log("\n=== Scan Result ===\n");
      console.log(`Project: ${scan.projectName}`);
      console.log(`Entry files: ${scan.entryFiles.join(", ") || "none"}`);
      console.log(`Core modules: ${scan.coreModules.join(", ") || "none"}`);
      console.log(`Tech stack: ${scan.techStack.join(", ") || "unknown"}`);
      console.log(`Dependencies: ${Object.keys(scan.dependencies).length} packages`);
      console.log(`Source files: ${scan.fileTree.length}`);
      console.log(`Files with exports: ${scan.importExports.filesWithExports}`);
      console.log(`Files with imports: ${scan.importExports.filesWithImports}`);
      console.log(
        `License: ${scan.license.spdxId ?? scan.license.label} (source=${scan.license.source}, confidence=${scan.license.confidence})`
      );
      console.log(
        `Transform allowed: ${scan.license.policy.allowTransform ? "yes" : "no"} (reason: ${scan.license.policy.reason})`
      );
      console.log(
        `Export styles: ESM default=${scan.importExports.exportStyle.esmDefaultExportFiles}, ESM named=${scan.importExports.exportStyle.esmNamedExportFiles}, CJS=${scan.importExports.exportStyle.cjsExportFiles}`
      );
      console.log(
        `Top external imports: ${
          scan.importExports.topExternalImportStats
            .slice(0, 10)
            .map((x) => `${x.name}(${x.count})`)
            .join(", ") || "none"
        }`
      );
      console.log(
        `Top internal imports: ${
          scan.importExports.topInternalImportStats
            .slice(0, 10)
            .map((x) => `${x.name}(${x.count})`)
            .join(", ") || "none"
        }`
      );
      console.log(
        `Top exports: ${
          scan.importExports.topExportStats
            .slice(0, 10)
            .map((x) => `${x.name}(${x.count})`)
            .join(", ") || "none"
        }`
      );
      console.log(
        `Top re-export sources: ${
          scan.importExports.topReExportSources
            .slice(0, 10)
            .map((x) => `${x.name}(${x.count})`)
            .join(", ") || "none"
        }`
      );
    } catch (err) {
      console.error(`Scan failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ---- describe ----
program
  .command("describe <project>")
  .description("生成项目扫描数据（Markdown），交给 Claude Code 生成 capability.md")
  .action(async (project: string) => {
    const workspaceRoot = getWorkspaceRoot();
    const repoDir = findRepoDir(project, workspaceRoot);
    if (!repoDir) {
      console.error(`Project "${project}" not found in repos/.`);
      process.exit(1);
    }

    console.log(`Generating scan data for ${project} ...`);

    try {
      const { scan, filePath } = await describeProject(repoDir, project);

      console.log(`\nScan result saved to: ${filePath}`);
      console.log(`  Project: ${scan.projectName}`);
      console.log(`  Entry files: ${scan.entryFiles.join(", ")}`);
      console.log(`  Tech stack: ${scan.techStack.join(", ")}`);
      console.log(`  Dependencies: ${Object.keys(scan.dependencies).length}`);
      console.log();
      console.log("Next step: Pass this scan data to Claude Code to generate a full capability.md.");
      console.log("  The capability.md should contain sections:");
      console.log("  ## 概述, ## 技术栈, ## 核心能力, ## 集成指南, ## 改造文件");
    } catch (err) {
      console.error(`Describe failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ---- transform ----
program
  .command("transform <project>")
  .description("生成改造扫描数据（Markdown），交给 Claude Code 生成改造计划")
  .option("--ignore-license", "忽略许可证限制（不推荐，需自行确保合规）")
  .action(async (project: string, opts: { ignoreLicense?: boolean }) => {
    const workspaceRoot = getWorkspaceRoot();
    const repoDir = findRepoDir(project, workspaceRoot);
    if (!repoDir) {
      console.error(`Project "${project}" not found in repos/.`);
      process.exit(1);
    }

    console.log(`Generating transform scan data for ${project} ...`);

    try {
      // License gate: by default we don't generate transform plans for unknown/strong-copyleft licenses.
      const licenseScan = await scanProject(repoDir, project);
      if (!licenseScan.license.policy.allowTransform && !opts.ignoreLicense) {
        console.error(
          [
            "",
            `⚠️ License gate: ${licenseScan.license.spdxId ?? licenseScan.license.label}`,
            `Reason: ${licenseScan.license.policy.reason}`,
            "Reminders:",
            ...licenseScan.license.policy.reminders.map((r) => `- ${r}`),
            "",
            "Transform scan is blocked by default for this license.",
            "If you have completed license compliance review and still want to proceed, rerun with:",
            `  npx capforge --workspace ${workspaceRoot} transform ${project} --ignore-license`,
            "",
          ].join("\n")
        );
        process.exit(1);
      }

      const { scan, filePath } = await generateTransformScan(repoDir, project);

      console.log(`\nTransform scan saved to: ${filePath}`);
      console.log(`  Project: ${scan.projectName}`);
      console.log(`  Entry files: ${scan.entryFiles.join(", ")}`);
      console.log(`  Tech stack: ${scan.techStack.join(", ")}`);
      console.log();
      console.log("Next step: Pass this scan data to Claude Code to generate a transform plan.");
    } catch (err) {
      console.error(`Transform failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ---- classify-domains ----
program
  .command("classify-domains")
  .description("列出所有已生成的 capability.md 文件，生成能力域归类摘要")
  .action(() => {
    getWorkspaceRoot();
    console.log("Listing capability.md files ...");

    const { domainsPath, projects } = classifyDomains();

    if (projects.length === 0) {
      console.log("No capability.md files found. Run 'capforge scan <project>' and let Claude Code generate capability.md first.");
      process.exit(0);
    }

    console.log(`\nFound ${projects.length} capability.md files.`);
    for (const project of projects) {
      console.log(`  - ${project}`);
    }
    console.log(`\nDomains summary saved to: ${domainsPath}`);
  });

// ---- pipeline ----
program
  .command("pipeline")
  .description("执行确定性流水线（用于 OpenClaw/Claude Code 自动化）：analyze 或 compare")
  .option("--mode <mode>", "analyze|compare", "analyze")
  .option("--repo <repo>", "单个仓库（URL 或已导入项目名）")
  .option("--repos <repos>", "多个仓库（逗号分隔，或重复传参）")
  .option("--topic <topic>", "compare 模式下对比主题/需求摘要")
  .option("--no-transform", "analyze 模式下不生成 transform 扫描（仅 scan/describe/domains/validate）")
  .option("--ignore-license", "忽略许可证门禁（不推荐，需自行确保合规）")
  .option("--no-validate", "跳过 validate（不推荐）")
  .action(async (opts: any) => {
    const workspaceRoot = getWorkspaceRoot();
    const mode = String(opts.mode ?? "analyze") as "analyze" | "compare";
    const repos =
      typeof opts.repos === "string"
        ? opts.repos.split(",").map((s: string) => s.trim()).filter(Boolean)
        : Array.isArray(opts.repos)
          ? opts.repos
          : [];

    try {
      const result = await runPipeline({
        workspaceRoot,
        mode,
        repo: opts.repo,
        repos,
        topic: opts.topic,
        withTransform: opts.transform !== false,
        ignoreLicense: !!opts.ignoreLicense,
        withValidate: opts.validate !== false,
      });

      console.log("\n=== Pipeline Result ===\n");
      console.log(`Mode: ${result.mode}`);
      console.log(`Workspace: ${result.workspaceRoot}`);
      console.log(`Projects: ${result.projects.map((p) => p.name).join(", ")}`);
      if (result.comparisonReportPath) console.log(`Comparison report: ${result.comparisonReportPath}`);
      if (result.domainsPath) console.log(`Domains: ${result.domainsPath}`);
      if (result.validationReportPath) console.log(`Validation report: ${result.validationReportPath}`);
      if (result.notes.length > 0) {
        console.log("\nNotes:");
        for (const n of result.notes) console.log(`- ${n}`);
      }
      console.log();
    } catch (err) {
      console.error(`Pipeline failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ---- validate ----
program
  .command("validate")
  .description("验证 capability.md 文件是否存在并包含必要部分")
  .option("--repos <repos>", "逗号分隔的短名列表", "agent0,evoskill,hermes-agent,hyperagents,metaclaw,openclaw-rl")
  .action(async (opts: { repos: string }) => {
    getWorkspaceRoot();
    const repoNames = opts.repos.split(",").map((s) => s.trim());
    console.log(`Validating against repos: ${repoNames.join(", ")} ...\n`);

    try {
      const report = await validate(repoNames);
      printValidationReport(report);

      const outputPath = require("path").resolve(process.cwd(), "output", "validation-report.md");
      console.log(`Validation report saved to: ${outputPath}`);
    } catch (err) {
      console.error(`Validation failed: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

// ---- list ----
program
  .command("list")
  .description("列出已导入的项目和已生成的能力描述")
  .action(() => {
    const workspaceRoot = getWorkspaceRoot();
    const cloned = listClonedProjects(workspaceRoot);
    const { listCapabilityFiles } = require("./describe");
    const capabilities = listCapabilityFiles();

    console.log("\n=== Imported Projects ===");
    if (cloned.length === 0) {
      console.log("  (none)");
    } else {
      for (const project of cloned) {
        const hasCapability = capabilities.includes(project);
        console.log(`  ${project} ${hasCapability ? "(described)" : "(not described)"}`);
      }
    }

    console.log("\n=== Capability Files ===");
    if (capabilities.length === 0) {
      console.log("  (none)");
    } else {
      for (const name of capabilities) {
        console.log(`  ${name}`);
      }
    }

    console.log();
  });

// ---- install ----
program
  .command("install")
  .description("安装 CapForge skills 到 Claude Code")
  .option("--force", "覆盖已存在的 skill 文件")
  .action(async (opts: { force?: boolean }) => {
    await installSkills(opts);
  });

// ---- uninstall ----
program
  .command("uninstall")
  .description("从 Claude Code 卸载 CapForge skills")
  .action(async () => {
    await uninstallSkills();
  });

// ---- status ----
program
  .command("status")
  .description("查看 CapForge skill 安装状态")
  .action(() => {
    const {
      skillsDir,
      commandsDir,
      installedSkills,
      missingSkills,
      installedCommands,
      missingCommands,
    } = checkInstallStatus();
    console.log("\nCapForge Skills Status:");
    console.log(`  Skills dir (recommended): ${skillsDir ?? CLAUDE_SKILLS_DIR}`);
    if (installedSkills.length > 0) console.log(`    Installed: ${installedSkills.join(", ")}`);
    if (missingSkills.length > 0) console.log(`    Missing: ${missingSkills.join(", ")}`);

    console.log(`  Commands dir (legacy): ${commandsDir ?? CLAUDE_COMMANDS_DIR}`);
    if (installedCommands.length > 0) console.log(`    Installed: ${installedCommands.join(", ")}`);
    if (missingCommands.length > 0) console.log(`    Missing: ${missingCommands.join(", ")}`);
    console.log();
  });

// ---- helpers ----

function findRepoDir(project: string, workspaceRoot: string): string | null {
  const { resolve } = require("path");
  const { existsSync } = require("fs");

  // Try exact name
  const dir = resolve(workspaceRoot, "repos", project);
  if (existsSync(dir)) return dir;

  // Try known repo mapping
  const known = resolveKnownRepo(project);
  if (known) {
    const knownDir = resolve(workspaceRoot, "repos", known.name);
    if (existsSync(knownDir)) return knownDir;

    // Try shortName as directory
    const shortDir = resolve(workspaceRoot, "repos", known.shortName);
    if (existsSync(shortDir)) return shortDir;
  }

  return null;
}

program.parse();
