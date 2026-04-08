// ============================================================
// CapForge - Code Scanning Module (no LLM)
// ============================================================

import * as path from "path";
import * as fs from "fs";
import { glob } from "glob";
import type { ScanResult, ImportExportSummary, ImportExportFileDetail } from "./types";
import { detectLicense } from "./license";

/**
 * Perform pure structural analysis of a cloned project.
 * No LLM needed — all code scanning.
 */
export async function scanProject(repoDir: string, projectName: string): Promise<ScanResult> {
  const fileTree = await listSourceFiles(repoDir);
  const entryFiles = findEntryFiles(fileTree);
  const coreModules = findCoreModules(repoDir, fileTree);
  const dependencyMap = parseDependencies(repoDir);
  const techStack = inferTechStack(repoDir, dependencyMap, fileTree);
  const importExports = scanImportExports(repoDir, fileTree);
  const { info, policy } = detectLicense(repoDir);

  return {
    projectName,
    entryFiles,
    coreModules,
    dependencies: dependencyMap,
    techStack,
    fileTree,
    importExports,
    license: {
      spdxId: info.spdxId,
      label: info.label,
      source: info.source,
      filePath: info.filePath,
      confidence: info.confidence,
      notes: info.notes,
      policy: {
        allowTransform: policy.allowTransform,
        risk: policy.risk,
        reason: policy.reason,
        reminders: policy.reminders,
      },
    },
  };
}

/**
 * Output a scan result as Markdown (for Claude Code to consume).
 */
export function scanResultToMarkdown(result: ScanResult): string {
  const lines: string[] = [
    `# ${result.projectName} — 代码扫描结果`,
    "",
    `## 项目结构`,
    "",
    `- **入口文件:** ${result.entryFiles.join(", ") || "未检测到"}`,
    `- **核心模块:** ${result.coreModules.join(", ") || "未检测到"}`,
    `- **技术栈:** ${result.techStack.join(", ") || "未知"}`,
    `- **依赖包数量:** ${Object.keys(result.dependencies).length}`,
    "",
    `## 依赖列表`,
    "",
  ];

  const deps = Object.entries(result.dependencies);
  if (deps.length === 0) {
    lines.push("(无依赖)");
  } else {
    for (const [name, version] of deps) {
      lines.push(`- \`${name}\`: ${version}`);
    }
  }

  lines.push("", "## 文件树", "");
  for (const file of result.fileTree) {
    lines.push(`- ${file}`);
  }

  lines.push("", "## 导入/导出分析", "");
  lines.push(`- **总文件数:** ${result.importExports.totalFiles}`);
  lines.push(`- **含导出的文件:** ${result.importExports.filesWithExports}`);
  lines.push(`- **含导入的文件:** ${result.importExports.filesWithImports}`);
  lines.push(
    `- **导出形态:** ESM default=${result.importExports.exportStyle.esmDefaultExportFiles}, ESM named=${result.importExports.exportStyle.esmNamedExportFiles}, CJS=${result.importExports.exportStyle.cjsExportFiles}`
  );
  lines.push(
    `- **高频外部导入(含次数):** ${
      result.importExports.topExternalImportStats
        .slice(0, 10)
        .map((x) => `${x.name}(${x.count})`)
        .join(", ") || "无"
    }`
  );
  lines.push(
    `- **高频内部导入(含次数):** ${
      result.importExports.topInternalImportStats
        .slice(0, 10)
        .map((x) => `${x.name}(${x.count})`)
        .join(", ") || "无"
    }`
  );
  lines.push(
    `- **高频导出(含次数):** ${
      result.importExports.topExportStats
        .slice(0, 10)
        .map((x) => `${x.name}(${x.count})`)
        .join(", ") || "无"
    }`
  );
  lines.push(
    `- **高频 re-export 来源(含次数):** ${
      result.importExports.topReExportSources
        .slice(0, 10)
        .map((x) => `${x.name}(${x.count})`)
        .join(", ") || "无"
    }`
  );

  lines.push("", "## License / 合规提醒", "");
  lines.push(
    `- **检测到的许可证:** ${result.license.spdxId ?? result.license.label}（来源: ${result.license.source}, 置信度: ${result.license.confidence}）`
  );
  if (result.license.filePath) {
    lines.push(`- **许可证文件:** ${result.license.filePath}`);
  }
  lines.push(`- **改造支持:** ${result.license.policy.allowTransform ? "允许（默认）" : "默认禁止"}`);
  lines.push(`- **原因:** ${result.license.policy.reason}`);
  if (result.license.policy.reminders.length > 0) {
    lines.push(`- **提醒:**`);
    for (const r of result.license.policy.reminders) lines.push(`  - ${r}`);
  }
  lines.push(
    "",
    "> 注意：CapForge 只做结构扫描与提示，不提供法律意见。最终是否改造/分发请以许可证文本与合规审查为准。",
    ""
  );

  lines.push("", "---", "");
  lines.push("将以上扫描结果交给 Claude Code，让它根据结构分析生成 `capability.md`。");

  return lines.join("\n");
}

// ---- helpers ----

async function listSourceFiles(repoDir: string): Promise<string[]> {
  const patterns = [
    "**/*.ts",
    "**/*.tsx",
    "**/*.js",
    "**/*.jsx",
    "**/*.py",
    "**/__init__.py",
    "**/*.go",
    "**/*.rs",
    "**/package.json",
    "**/requirements.txt",
    "**/go.mod",
    "**/Cargo.toml",
    "**/*.toml",
  ];

  const files = await glob(patterns, {
    cwd: repoDir,
    ignore: ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/__pycache__/**"],
    nodir: true,
  });

  return files.sort();
}

function findEntryFiles(files: string[]): string[] {
  const entryNames = [
    "index.ts",
    "index.js",
    "main.ts",
    "main.js",
    "app.ts",
    "app.js",
    "cli.ts",
    "cli.js",
    "main.py",
    "app.py",
    "cli.py",
    "__main__.py",
    "main.go",
    "main.rs",
    "lib.rs",
  ];
  return files.filter((f) => entryNames.some((name) => f.endsWith(name)));
}

function findCoreModules(repoDir: string, files: string[]): string[] {
  const modules: string[] = [];

  // TypeScript/JavaScript src/ directory
  const srcDir = path.join(repoDir, "src");
  if (fs.existsSync(srcDir)) {
    try {
      const entries = fs.readdirSync(srcDir, { withFileTypes: true });
      for (const d of entries) {
        if (d.isDirectory()) {
          modules.push(`src/${d.name}`);
        }
      }
    } catch {
      // ignore
    }
  }

  // Python packages (directories with __init__.py, up to 2 levels deep)
  const maxDepth = 2;
  const candidates = files.filter((f) => f.endsWith("__init__.py"));
  for (const initFile of candidates) {
    const parts = initFile.split("/");
    // __init__.py at depth N means the parent directory at depth N-1 is a package
    const pkgParts = parts.slice(0, -1); // drop __init__.py
    if (pkgParts.length > 0 && pkgParts.length <= maxDepth) {
      const pkg = pkgParts.join("/");
      if (!modules.includes(pkg)) {
        modules.push(pkg);
      }
    }
  }

  if (modules.length > 0) return modules.slice(0, 15);

  // Fallback: use top-level directories from file tree
  return files
    .filter((f) => f.includes("/"))
    .map((f) => f.split("/")[0])
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 10);
}

function parseDependencies(repoDir: string): Record<string, string> {
  const deps: Record<string, string> = {};

  const pkgPath = path.join(repoDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      Object.assign(deps, pkg.dependencies ?? {}, pkg.devDependencies ?? {});
    } catch {
      // ignore
    }
  }

  const reqPath = path.join(repoDir, "requirements.txt");
  if (fs.existsSync(reqPath)) {
    try {
      const lines = fs.readFileSync(reqPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [name, version] = trimmed.split(/==|>=|<=|>|</);
          deps[name.trim()] = version?.trim() ?? "*";
        }
      }
    } catch {
      // ignore
    }
  }

  return deps;
}

function inferTechStack(
  repoDir: string,
  deps: Record<string, string>,
  files: string[]
): string[] {
  const stack: Set<string> = new Set();

  if (files.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"))) stack.add("TypeScript");
  if (files.some((f) => f.endsWith(".py"))) stack.add("Python");
  if (files.some((f) => f.endsWith(".go"))) stack.add("Go");
  if (files.some((f) => f.endsWith(".rs"))) stack.add("Rust");

  if (deps["react"]) stack.add("React");
  if (deps["next"]) stack.add("Next.js");
  if (deps["express"]) stack.add("Express");
  if (deps["fastapi"] || deps["flask"]) stack.add("Web Framework");
  if (deps["langchain"] || deps["openai"]) stack.add("LLM Integration");
  if (deps["anthropic"] || Object.keys(deps).some((k) => k.startsWith("@anthropic-ai"))) stack.add("Anthropic SDK");
  if (deps["pytorch"] || deps["torch"]) stack.add("PyTorch");
  if (Object.keys(deps).some((k) => k.includes("docker"))) stack.add("Docker");
  if (deps["asyncio"]) stack.add("Async Python");
  if (deps["pytest"]) stack.add("Testing");
  if (deps["mocha"] || deps["jest"]) stack.add("Testing");

  if (fs.existsSync(path.join(repoDir, "Dockerfile"))) stack.add("Docker");

  return Array.from(stack);
}

function scanImportExports(repoDir: string, files: string[]): ImportExportSummary {
  const codeFiles = files.filter(
    (f) =>
      (f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".py") || f.endsWith(".go")) &&
      !f.includes("node_modules")
  );

  const MAX_SCAN_FILES = Number.parseInt(process.env.CAPFORGE_IMPORT_EXPORT_MAX_FILES ?? "2000", 10);
  const MAX_DETAILS_FILES = Number.parseInt(process.env.CAPFORGE_IMPORT_EXPORT_MAX_DETAILS ?? "300", 10);

  let filesWithExports = 0;
  let filesWithImports = 0;
  let esmDefaultExportFiles = 0;
  let esmNamedExportFiles = 0;
  let cjsExportFiles = 0;

  const externalImportCounts = new Map<string, number>();
  const internalImportCounts = new Map<string, number>();
  const allImportCounts = new Map<string, number>();
  const exportCounts = new Map<string, number>();
  const reExportCounts = new Map<string, number>();

  const fileDetails: ImportExportFileDetail[] = [];

  const scanned = codeFiles.slice(0, Math.max(1, MAX_SCAN_FILES));
  for (const file of scanned) {
    const fullPath = path.join(repoDir, file);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");

      const detail = analyzeOneFile(file, content);

      if (detail.imports.length > 0) filesWithImports++;
      if (detail.exports.length > 0 || detail.reExports.length > 0 || detail.exportStyle.cjs || detail.exportStyle.esmDefault || detail.exportStyle.esmNamed) {
        filesWithExports++;
      }

      if (detail.exportStyle.esmDefault) esmDefaultExportFiles++;
      if (detail.exportStyle.esmNamed) esmNamedExportFiles++;
      if (detail.exportStyle.cjs) cjsExportFiles++;

      for (const imp of detail.imports) {
        allImportCounts.set(imp, (allImportCounts.get(imp) ?? 0) + 1);
        if (isInternalImport(imp, detail.language)) {
          internalImportCounts.set(imp, (internalImportCounts.get(imp) ?? 0) + 1);
        } else {
          externalImportCounts.set(imp, (externalImportCounts.get(imp) ?? 0) + 1);
        }
      }

      for (const exp of detail.exports) {
        exportCounts.set(exp, (exportCounts.get(exp) ?? 0) + 1);
      }
      for (const src of detail.reExports) {
        reExportCounts.set(src, (reExportCounts.get(src) ?? 0) + 1);
      }

      if (fileDetails.length < MAX_DETAILS_FILES) {
        fileDetails.push(detail);
      }
    } catch {
      // skip unreadable files
    }
  }

  const topImportStats = toTopStats(allImportCounts, 50);
  const topExternalImportStats = toTopStats(externalImportCounts, 50);
  const topInternalImportStats = toTopStats(internalImportCounts, 50);
  const topExportStats = toTopStats(exportCounts, 50);
  const topReExportSources = toTopStats(reExportCounts, 50);

  return {
    totalFiles: codeFiles.length,
    filesWithExports,
    filesWithImports,
    topImports: topImportStats.slice(0, 20).map((x) => x.name),
    topExports: topExportStats.slice(0, 20).map((x) => x.name),
    topImportStats,
    topExternalImportStats,
    topInternalImportStats,
    topExportStats,
    topReExportSources,
    exportStyle: {
      esmDefaultExportFiles,
      esmNamedExportFiles,
      cjsExportFiles,
    },
    fileDetails,
  };
}

function toTopStats(map: Map<string, number>, limit: number): Array<{ name: string; count: number }> {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function detectLanguage(file: string): ImportExportFileDetail["language"] {
  if (file.endsWith(".ts") || file.endsWith(".tsx")) return "ts";
  if (file.endsWith(".js") || file.endsWith(".jsx")) return "js";
  if (file.endsWith(".py")) return "py";
  if (file.endsWith(".go")) return "go";
  if (file.endsWith(".rs")) return "rs";
  return "other";
}

function isInternalImport(source: string, lang: ImportExportFileDetail["language"]): boolean {
  // JS/TS relative + alias-like paths
  if (source.startsWith(".") || source.startsWith("/") || source.startsWith("~")) return true;
  // Python relative
  if (lang === "py" && source.startsWith(".")) return true;
  // Go: internal imports often contain the module path; best-effort treat "github.com/..." as external
  if (lang === "go") {
    return !(source.startsWith("github.com/") || source.includes("."));
  }
  // treat scoped/node packages as external by default
  return false;
}

function analyzeOneFile(file: string, content: string): ImportExportFileDetail {
  const language = detectLanguage(file);
  const imports: string[] = [];
  const exports: string[] = [];
  const reExports: string[] = [];
  const style = { esmDefault: false, esmNamed: false, cjs: false };

  if (language === "ts" || language === "js") {
    // ----- imports -----
    for (const m of content.matchAll(/import\s+(?:type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]/g)) {
      imports.push(m[1]);
    }
    for (const m of content.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      imports.push(m[1]);
    }
    for (const m of content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      imports.push(m[1]);
    }

    // ----- exports -----
    if (/export\s+default\s+/m.test(content)) style.esmDefault = true;
    if (/export\s+(?:\{|\*)/m.test(content) || /export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+\w+/m.test(content)) {
      style.esmNamed = true;
    }
    if (/module\.exports\s*=|exports\.\w+\s*=|Object\.defineProperty\(exports,/m.test(content)) style.cjs = true;

    // named exports (best-effort)
    for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+(\w+)/g)) exports.push(m[1]);
    for (const m of content.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g)) exports.push(m[1]);
    for (const m of content.matchAll(/export\s+(?:interface|type|enum)\s+(\w+)/g)) exports.push(m[1]);
    // export { a, b as c }
    for (const m of content.matchAll(/export\s*\{\s*([^}]+)\s*\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) {
      const raw = m[1];
      const from = m[2];
      if (from) reExports.push(from);
      for (const part of raw.split(",")) {
        const name = part.trim().split(/\s+as\s+/)[0]?.trim();
        if (name) exports.push(name);
      }
    }
    // export * from 'x'
    for (const m of content.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
      reExports.push(m[1]);
    }
    // CommonJS exports.foo =
    for (const m of content.matchAll(/exports\.(\w+)\s*=/g)) exports.push(m[1]);
  } else if (language === "py") {
    // imports
    for (const m of content.matchAll(/(?:^|\n)\s*import\s+([^\n#]+)/g)) {
      const raw = m[1].trim();
      for (const part of raw.split(",")) {
        const name = part.trim().replace(/\s+as\s+\w+$/, "");
        if (name) imports.push(name);
      }
    }
    for (const m of content.matchAll(/(?:^|\n)\s*from\s+([^\s]+)\s+import\s+([^\n#]+)/g)) {
      const mod = m[1].trim();
      imports.push(mod);
      // exported names not inferred here; but capture __all__ or defs/classes
    }
    // exports (best-effort: top-level def/class + __all__)
    for (const m of content.matchAll(/(?:^|\n)(?:async\s+def|def|class)\s+(\w+)\s*[\(:]/g)) {
      exports.push(m[1]);
    }
    const allMatch = content.match(/__all__\s*=\s*\[([^\]]*)\]/m);
    if (allMatch) {
      for (const s of allMatch[1].split(",")) {
        const name = s.trim().replace(/^['"]|['"]$/g, "");
        if (name) exports.push(name);
      }
    }
  } else if (language === "go") {
    // imports
    for (const m of content.matchAll(/(?:^|\n)\s*import\s+\(\s*([\s\S]*?)\s*\)/g)) {
      const block = m[1];
      for (const line of block.split("\n")) {
        const mm = line.match(/"([^"]+)"/);
        if (mm) imports.push(mm[1]);
      }
    }
    for (const m of content.matchAll(/(?:^|\n)\s*import\s+"([^"]+)"/g)) {
      imports.push(m[1]);
    }
    // exports: exported identifiers in Go start with uppercase (best-effort)
    for (const m of content.matchAll(/(?:^|\n)\s*func\s+([A-Z]\w*)\s*\(/g)) exports.push(m[1]);
    for (const m of content.matchAll(/(?:^|\n)\s*type\s+([A-Z]\w*)\s+/g)) exports.push(m[1]);
    for (const m of content.matchAll(/(?:^|\n)\s*var\s+([A-Z]\w*)\s+/g)) exports.push(m[1]);
    for (const m of content.matchAll(/(?:^|\n)\s*const\s+([A-Z]\w*)\s+/g)) exports.push(m[1]);
  }

  const uniq = <T,>(arr: T[]) => Array.from(new Set(arr));
  const normalized = (s: string) => s.trim();

  return {
    file,
    language,
    imports: uniq(imports.map(normalized)).filter(Boolean),
    exports: uniq(exports.map(normalized)).filter(Boolean),
    reExports: uniq(reExports.map(normalized)).filter(Boolean),
    exportStyle: style,
  };
}
