// ============================================================
// CapForge - Type Definitions
// ============================================================

/** Result of scanning a project's source code (pure code analysis, no LLM) */
export interface ScanResult {
  projectName: string;
  entryFiles: string[];
  coreModules: string[];
  dependencies: Record<string, string>;
  techStack: string[];
  fileTree: string[];
  importExports: ImportExportSummary;
  license: LicenseScanResult;
}

export interface LicenseScanResult {
  /** SPDX ID if detected; otherwise null */
  spdxId: string | null;
  /** Display label (fallback if SPDX can't be detected) */
  label: string;
  source: "license-file" | "package-json" | "unknown";
  filePath?: string;
  confidence: "high" | "medium" | "low";
  policy: {
    allowTransform: boolean;
    risk: "low" | "medium" | "high";
    reason: string;
    reminders: string[];
  };
  notes: string[];
}

/** Summary of imports/exports found in source files */
export interface ImportExportSummary {
  totalFiles: number;
  filesWithExports: number;
  filesWithImports: number;

  /**
   * Legacy fields (kept for backward compatibility).
   * Prefer `topImportStats` / `topExportStats`.
   */
  topImports: string[]; // most-imported modules (names only)
  topExports: string[]; // most-exported symbols (names only)

  /** Detailed import statistics (module -> count) */
  topImportStats: Array<{ name: string; count: number }>;
  /** External-only imports (npm/pip packages etc, best-effort) */
  topExternalImportStats: Array<{ name: string; count: number }>;
  /** Internal/relative imports (e.g. ./x, ../y, local packages), best-effort */
  topInternalImportStats: Array<{ name: string; count: number }>;
  /** Detailed export statistics (symbol -> count) */
  topExportStats: Array<{ name: string; count: number }>;

  /** Re-export sources (e.g. `export * from "x"`) */
  topReExportSources: Array<{ name: string; count: number }>;

  /** High-level breakdown for export styles */
  exportStyle: {
    esmDefaultExportFiles: number;
    esmNamedExportFiles: number;
    cjsExportFiles: number;
  };

  /**
   * File-level details (can be large; capped by scanner).
   * - `imports`: import sources (external + internal)
   * - `exports`: exported symbol names (best-effort)
   * - `reExports`: re-export sources (best-effort)
   */
  fileDetails: ImportExportFileDetail[];
}

export interface ImportExportFileDetail {
  file: string;
  language: "ts" | "js" | "py" | "go" | "rs" | "other";
  imports: string[];
  exports: string[];
  reExports: string[];
  exportStyle: {
    esmDefault: boolean;
    esmNamed: boolean;
    cjs: boolean;
  };
}

/** Validation result for a single project's capability.md */
export interface CapabilityValidation {
  project: string;
  capabilityExists: boolean;
  requiredSections: { section: string; present: boolean }[];
  allSectionsPresent: boolean;
  issues: string[];
}

/** Aggregate validation report */
export interface ValidationReport {
  timestamp: string;
  projects: CapabilityValidation[];
  overallScore: number;
  summary: string;
}

/** Known validation repo metadata */
export interface KnownRepo {
  name: string;
  url: string;
  shortName: string;
}

/** Required sections in a capability.md file */
export const REQUIRED_SECTIONS = [
  "## 概述",
  "## 核心能力",
  "## 集成指南",
  "## 改造文件",
  "## 技术栈",
] as const;
