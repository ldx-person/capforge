// ============================================================
// CapForge - Code Scanning Module (no LLM)
// ============================================================

import * as path from "path";
import * as fs from "fs";
import { glob } from "glob";
import type { ScanResult, ImportExportSummary } from "./types";

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

  return {
    projectName,
    entryFiles,
    coreModules,
    dependencies: dependencyMap,
    techStack,
    fileTree,
    importExports,
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
  lines.push(`- **高频导入:** ${result.importExports.topImports.join(", ") || "无"}`);
  lines.push(`- **高频导出:** ${result.importExports.topExports.join(", ") || "无"}`);

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

  let filesWithExports = 0;
  let filesWithImports = 0;
  const importCounts = new Map<string, number>();
  const exportSymbols: string[] = [];

  for (const file of codeFiles.slice(0, 200)) {
    const fullPath = path.join(repoDir, file);
    try {
      const content = fs.readFileSync(fullPath, "utf-8");

      const hasExport =
        content.includes("export ") ||
        content.includes("module.exports") ||
        (file.endsWith(".py") && /^(def|class|async def) \w+/m.test(content));
      const hasImport =
        content.includes("import ") ||
        content.includes("require(") ||
        (file.endsWith(".py") && content.includes("import "));

      if (hasExport) filesWithExports++;
      if (hasImport) filesWithImports++;

      // Extract import sources (TS/JS)
      const importMatches = content.matchAll(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
      for (const m of importMatches) {
        const src = m[1];
        // Only count package imports (not relative)
        if (!src.startsWith(".")) {
          importCounts.set(src, (importCounts.get(src) ?? 0) + 1);
        }
      }

      // Python imports — strip trailing commas/parens/as
      if (file.endsWith(".py")) {
        const pyImports = content.matchAll(/(?:^|\n)\s*import\s+([^\n]+)/g);
        for (const m of pyImports) {
          const raw = m[1].replace(/\s*as\s+\w+/, "").replace(/[(),]/g, "");
          for (const part of raw.split(/\s+/)) {
            const src = part.trim();
            if (src && !src.startsWith(".")) {
              importCounts.set(src, (importCounts.get(src) ?? 0) + 1);
            }
          }
        }
        const pyFromImports = content.matchAll(/(?:^|\n)\s*from\s+(\S+)\s+import/g);
        for (const m of pyFromImports) {
          const src = m[1];
          if (!src.startsWith(".")) {
            importCounts.set(src, (importCounts.get(src) ?? 0) + 1);
          }
        }
      }

      // Extract export names (TS)
      const exportMatches = content.matchAll(/export\s+(?:function|class|const|interface|type)\s+(\w+)/g);
      for (const m of exportMatches) {
        exportSymbols.push(m[1]);
      }
    } catch {
      // skip
    }
  }

  const topImports = Array.from(importCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name]) => name);

  const topExports = exportSymbols.slice(0, 20);

  return {
    totalFiles: codeFiles.length,
    filesWithExports,
    filesWithImports,
    topImports,
    topExports,
  };
}
