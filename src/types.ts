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
}

/** Summary of imports/exports found in source files */
export interface ImportExportSummary {
  totalFiles: number;
  filesWithExports: number;
  filesWithImports: number;
  topImports: string[];       // most-imported packages
  topExports: string[];       // most-exported symbols
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
