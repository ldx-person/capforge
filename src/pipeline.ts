// ============================================================
// CapForge - Deterministic Pipeline Executor
// ============================================================

import * as fs from "fs";
import * as path from "path";

import { cloneRepo, listClonedProjects, projectAliasFromUrl, resolveKnownRepo } from "./import";
import { scanProject } from "./analyze";
import { describeProject, loadCapabilityFile } from "./describe";
import { generateTransformScan } from "./transform";
import { classifyDomains } from "./domain";
import { validate } from "./validate";
import { comparisonsDir, pipelineDir, resolveWorkspaceRoot } from "./workspace";

export type PipelineMode = "analyze" | "compare";

export interface PipelineOptions {
  workspaceRoot?: string;
  mode: PipelineMode;

  /** single project (url or name) */
  repo?: string;
  /** multiple projects (url or name) */
  repos?: string[];

  /** compare topic (optional) */
  topic?: string;

  /** generate transform scan (analyze mode) */
  withTransform?: boolean;
  /** ignore license gate for transform */
  ignoreLicense?: boolean;

  /** validate after run */
  withValidate?: boolean;
}

export interface PipelineResult {
  mode: PipelineMode;
  workspaceRoot: string;
  timestamp: string;
  projects: Array<{
    input: string;
    name: string;
    repoDir: string;
    scanned: boolean;
    described: boolean;
    transform: "skipped" | "generated" | "blocked";
    license: {
      spdxId: string | null;
      label: string;
      allowTransform: boolean;
      reason: string;
      risk: string;
    };
  }>;
  domainsPath?: string;
  validationReportPath?: string;
  comparisonReportPath?: string;
  notes: string[];
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const workspaceRoot = resolveWorkspaceRoot(opts.workspaceRoot);
  process.env.CAPFORGE_WORKSPACE = workspaceRoot;

  const timestamp = new Date().toISOString();
  const notes: string[] = [];

  const projectInputs = resolveProjectInputs(opts);
  if (projectInputs.length === 0) {
    throw new Error("No repos provided. Use --repo (analyze) or --repos (compare).");
  }

  const results: PipelineResult["projects"] = [];

  for (const input of projectInputs) {
    const ensured = await ensureProject(input, workspaceRoot);

    const scan = await scanProject(ensured.repoDir, ensured.name);
    const transformAllowed = scan.license.policy.allowTransform;

    // describe output (scan markdown)
    await describeProject(ensured.repoDir, ensured.name);

    let transform: "skipped" | "generated" | "blocked" = "skipped";
    if (opts.mode === "analyze" && (opts.withTransform ?? true)) {
      if (transformAllowed || opts.ignoreLicense) {
        await generateTransformScan(ensured.repoDir, ensured.name);
        transform = "generated";
      } else {
        // Deterministic behavior: create a stub transform-plan to make the pipeline "complete",
        // but mark it blocked by license policy.
        transform = "blocked";
        notes.push(`Transform blocked for ${ensured.name} due to license policy.`);
      }
    }

    results.push({
      input,
      name: ensured.name,
      repoDir: ensured.repoDir,
      scanned: true,
      described: true,
      transform,
      license: {
        spdxId: scan.license.spdxId,
        label: scan.license.label,
        allowTransform: transformAllowed,
        reason: scan.license.policy.reason,
        risk: scan.license.policy.risk,
      },
    });
  }

  // domains summary always updated for compare and analyze (useful for later lookup)
  const domains = classifyDomains();

  // validate (optional; default true)
  let validationReportPath: string | undefined;
  if (opts.withValidate ?? true) {
    const report = await validate(undefined);
    // validate() writes output/validation-report.md into workspace output dir
    validationReportPath = path.join(workspaceRoot, "output", "validation-report.md");
    if (report.overallScore < 100) {
      notes.push(`Validation score is ${report.overallScore}%. Some capability.md may be incomplete.`);
    }
  }

  let comparisonReportPath: string | undefined;
  if (opts.mode === "compare") {
    comparisonReportPath = writeComparisonReport({
      workspaceRoot,
      topic: opts.topic,
      projects: results.map((p) => p.name),
    });
  }

  const pipelineReportDir = pipelineDir(workspaceRoot);
  fs.mkdirSync(pipelineReportDir, { recursive: true });
  const reportPath = path.join(pipelineReportDir, `pipeline-${safeStamp(timestamp)}-${opts.mode}.json`);
  const final: PipelineResult = {
    mode: opts.mode,
    workspaceRoot,
    timestamp,
    projects: results,
    domainsPath: domains.domainsPath,
    validationReportPath,
    comparisonReportPath,
    notes,
  };
  fs.writeFileSync(reportPath, JSON.stringify(final, null, 2), "utf-8");

  return final;
}

function resolveProjectInputs(opts: PipelineOptions): string[] {
  if (opts.mode === "analyze") {
    if (!opts.repo) return [];
    return [opts.repo];
  }
  // compare
  const repos = opts.repos ?? [];
  // allow comma-separated passed as a single element (common in CLIs)
  if (repos.length === 1 && repos[0].includes(",")) {
    return repos[0].split(",").map((s) => s.trim()).filter(Boolean);
  }
  return repos;
}

async function ensureProject(input: string, workspaceRoot: string): Promise<{ name: string; repoDir: string }> {
  const trimmed = input.trim();
  const known = resolveKnownRepo(trimmed);
  const resolvedUrl = known?.url ?? trimmed;

  const isUrl = /^https?:\/\//.test(resolvedUrl) || resolvedUrl.includes("github.com/");
  if (isUrl) {
    // Pipeline default: keep repos fresh via incremental update.
    const result = await cloneRepo(resolvedUrl, { baseDir: workspaceRoot, shallow: true, update: true });
    return { name: result.alias, repoDir: result.repoDir };
  }

  // treat as existing project folder name (or known short name)
  const candidates = listClonedProjects(workspaceRoot);
  if (candidates.includes(trimmed)) {
    return { name: trimmed, repoDir: path.join(workspaceRoot, "repos", trimmed) };
  }
  if (known?.name && candidates.includes(known.name)) {
    return { name: known.name, repoDir: path.join(workspaceRoot, "repos", known.name) };
  }
  if (known?.shortName && candidates.includes(known.shortName)) {
    return { name: known.shortName, repoDir: path.join(workspaceRoot, "repos", known.shortName) };
  }

  // fallback: treat as URL-ish
  if (trimmed.includes("/")) {
    const url = trimmed.startsWith("http") ? trimmed : `https://github.com/${trimmed}`;
    const result = await cloneRepo(url, { baseDir: workspaceRoot, shallow: true, update: true });
    return { name: result.alias, repoDir: result.repoDir };
  }

  throw new Error(`Project not found in workspace repos/: ${input}`);
}

function writeComparisonReport(args: { workspaceRoot: string; topic?: string; projects: string[] }): string {
  const dir = comparisonsDir(args.workspaceRoot);
  fs.mkdirSync(dir, { recursive: true });

  const topic = (args.topic ?? "").trim();
  const baseName = topic ? toKebab(topic).slice(0, 64) : `comparison-${safeStamp(new Date().toISOString()).slice(0, 13)}`;
  const filePath = path.join(dir, `${baseName}.md`);

  const lines: string[] = [
    `# 横向对比报告：${topic || baseName}`,
    "",
    "## 需求摘要",
    "",
    topic ? topic : "（未提供明确需求，建议补充：目标场景、必须能力、约束条件）",
    "",
    "## 候选项目清单",
    "",
    ...args.projects.map((p) => `- ${p}`),
    "",
    "## License 风险与改造可行性",
    "",
  ];

  for (const p of args.projects) {
    const cap = loadCapabilityFile(p) ?? "";
    // Very light parsing: look for "## License" section if present
    const licenseLine = cap.match(/\*\*检测到的许可证:\*\*\s*(.+)/)?.[1] ?? "（请查看 scan 输出中的 License/合规提醒）";
    lines.push(`### ${p}`, `- ${licenseLine}`, "");
  }

  lines.push(
    "## 能力矩阵（占位）",
    "",
    "> 如果你希望矩阵自动填充，请确保各项目 capability.md 的“## 核心能力”下有 `### <能力名>` 标题。随后可在此报告中按标题聚合生成矩阵。",
    "",
    "## 集成成本评估（占位）",
    "",
    "- 依赖复杂度、扩展点、侵入性、配置成本等",
    "",
    "## 结论与推荐（占位）",
    "",
    "- Top 1-3 推荐与理由",
    "",
    "---",
    "",
    "免责声明：本报告不构成法律意见；许可证合规需人工审查。",
    ""
  );

  fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  return filePath;
}

function toKebab(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function safeStamp(iso: string): string {
  return iso.replace(/[:.]/g, "").replace("T", "-").replace("Z", "");
}
