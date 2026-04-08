// ============================================================
// CapForge - Transform Module (scan output for Claude Code)
// ============================================================

import * as path from "path";
import * as fs from "fs";
import type { ScanResult } from "./types";
import { scanProject } from "./analyze";
import { transformPlansDir } from "./workspace";

/**
 * Run a scan and output a transform-ready Markdown for Claude Code to use.
 */
export async function generateTransformScan(repoDir: string, projectName: string): Promise<{
  scan: ScanResult;
  markdown: string;
  filePath: string;
}> {
  const scan = await scanProject(repoDir, projectName);
  const markdown = buildTransformMarkdown(scan);

  const filePath = saveTransformPlan(markdown, projectName);

  return { scan, markdown, filePath };
}

/**
 * Build a Markdown document with scan data + instructions for Claude Code
 * to generate a transform plan.
 */
function buildTransformMarkdown(scan: ScanResult): string {
  const lines: string[] = [
    `# ${scan.projectName} — 改造扫描数据`,
    "",
    `## 项目概要`,
    "",
    `- **入口文件:** ${scan.entryFiles.join(", ") || "未检测到"}`,
    `- **核心模块:** ${scan.coreModules.join(", ") || "未检测到"}`,
    `- **技术栈:** ${scan.techStack.join(", ") || "未知"}`,
    `- **依赖包:** ${Object.keys(scan.dependencies).length} 个`,
    `- **许可证:** ${scan.license.spdxId ?? scan.license.label}（${scan.license.policy.allowTransform ? "默认允许改造" : "默认禁止改造"}；原因：${scan.license.policy.reason}）`,
    `- **导出形态:** ESM default=${scan.importExports.exportStyle.esmDefaultExportFiles}, ESM named=${scan.importExports.exportStyle.esmNamedExportFiles}, CJS=${scan.importExports.exportStyle.cjsExportFiles}`,
    `- **高频外部导入(含次数):** ${
      scan.importExports.topExternalImportStats
        .slice(0, 10)
        .map((x) => `${x.name}(${x.count})`)
        .join(", ") || "无"
    }`,
    `- **高频内部导入(含次数):** ${
      scan.importExports.topInternalImportStats
        .slice(0, 10)
        .map((x) => `${x.name}(${x.count})`)
        .join(", ") || "无"
    }`,
    `- **高频导出(含次数):** ${
      scan.importExports.topExportStats
        .slice(0, 10)
        .map((x) => `${x.name}(${x.count})`)
        .join(", ") || "无"
    }`,
    `- **高频 re-export 来源(含次数):** ${
      scan.importExports.topReExportSources
        .slice(0, 10)
        .map((x) => `${x.name}(${x.count})`)
        .join(", ") || "无"
    }`,
    "",
    `## 文件树`,
    "",
  ];

  for (const file of scan.fileTree) {
    lines.push(`- ${file}`);
  }

  lines.push("", "## 依赖列表", "");
  const deps = Object.entries(scan.dependencies);
  if (deps.length === 0) {
    lines.push("(无依赖)");
  } else {
    for (const [name, version] of deps) {
      lines.push(`- \`${name}\`: ${version}`);
    }
  }

  lines.push(
    "",
    "---",
    "",
    "将以上扫描数据交给 Claude Code，让它生成改造计划。",
    "",
    "## License / 合规提醒（必须处理）",
    ...scan.license.policy.reminders.map((r) => `- ${r}`),
    "",
    "改造计划应包含以下结构：",
    "",
    "```markdown",
    `# ${scan.projectName} 改造计划`,
    "",
    "## 总体策略",
    "<general advice>",
    "",
    "## 改造任务",
    "",
    "### [high] Task 1: <title>",
    "- **目标文件:** <targetFile>",
    "- **动作:** extract|abstract|dehardcode|decouple|adapter",
    "- **依赖:** <task ids>",
    "- **描述:** <description>",
    "- **验收标准:** <acceptanceCriteria>",
    "```",
  );

  return lines.join("\n");
}

/**
 * Save transform plan as Markdown.
 */
export function saveTransformPlan(markdown: string, projectName: string, outputDir?: string): string {
  const dir = outputDir ?? transformPlansDir();
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, `${projectName}.md`);
  fs.writeFileSync(filePath, markdown, "utf-8");

  return filePath;
}

/**
 * Load a previously saved transform plan.
 */
export function loadTransformPlan(projectName: string, outputDir?: string): string | null {
  const dir = outputDir ?? path.resolve(process.cwd(), "output", "transform-plans");
  const filePath = path.join(dir, `${projectName}.md`);

  if (!fs.existsSync(filePath)) return null;

  return fs.readFileSync(filePath, "utf-8");
}
