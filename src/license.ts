// ============================================================
// CapForge - License Detection & Policy
// ============================================================

import * as fs from "fs";
import * as path from "path";

export type LicenseSource = "license-file" | "package-json" | "unknown";

export interface LicenseInfo {
  spdxId: string | null;
  /** Human-friendly label (fallback when spdxId is null) */
  label: string;
  source: LicenseSource;
  filePath?: string;
  confidence: "high" | "medium" | "low";
  notes: string[];
}

export interface LicensePolicy {
  /** Whether CapForge should allow generating / executing refactor plans by default */
  allowTransform: boolean;
  /** Short reason for allow/deny */
  reason: string;
  /** User-facing reminders for downstream reuse/compliance */
  reminders: string[];
  /** Risk level used for display */
  risk: "low" | "medium" | "high";
}

const LICENSE_FILENAMES = [
  "LICENSE",
  "LICENSE.txt",
  "LICENSE.md",
  "LICENCE",
  "LICENCE.txt",
  "LICENCE.md",
  "COPYING",
  "COPYING.txt",
  "COPYRIGHT",
  "NOTICE",
];

// A pragmatic SPDX allowlist. We treat copyleft as "restricted" by default because
// it complicates cross-project reuse, which is CapForge's primary goal.
const PERMISSIVE = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Unlicense",
  "CC0-1.0",
]);

const WEAK_COPYLEFT = new Set(["MPL-2.0", "LGPL-2.1", "LGPL-3.0"]);
const STRONG_COPYLEFT = new Set(["GPL-2.0", "GPL-3.0", "AGPL-3.0"]);

/**
 * Detect license info from a repository directory.
 * Best-effort and intentionally conservative: unknown/no-license => restricted.
 */
export function detectLicense(repoDir: string): { info: LicenseInfo; policy: LicensePolicy } {
  const notes: string[] = [];

  // 1) package.json (common for JS projects)
  const pkgPath = path.join(repoDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const lic = pkg.license;
      if (typeof lic === "string" && lic.trim()) {
        const spdx = normalizeSpdx(lic.trim());
        const info: LicenseInfo = {
          spdxId: spdx ?? null,
          label: spdx ?? lic.trim(),
          source: "package-json",
          filePath: pkgPath,
          confidence: spdx ? "high" : "medium",
          notes,
        };
        return { info, policy: policyFromSpdx(info.spdxId, info.label) };
      }
    } catch {
      notes.push("Failed to parse package.json license field.");
    }
  }

  // 2) LICENSE / COPYING files
  for (const filename of LICENSE_FILENAMES) {
    const p = path.join(repoDir, filename);
    if (!fs.existsSync(p)) continue;
    try {
      const content = fs.readFileSync(p, "utf-8");
      const spdx = detectSpdxFromText(content);
      const info: LicenseInfo = {
        spdxId: spdx ?? null,
        label: spdx ?? filename,
        source: "license-file",
        filePath: p,
        confidence: spdx ? "high" : "low",
        notes,
      };
      return { info, policy: policyFromSpdx(info.spdxId, info.label) };
    } catch {
      // ignore unreadable license file
    }
  }

  // 3) Unknown / no license
  const info: LicenseInfo = {
    spdxId: null,
    label: "NOASSERTION",
    source: "unknown",
    confidence: "low",
    notes: [
      ...notes,
      "No LICENSE/COPYING file and no package.json license field detected.",
    ],
  };
  return { info, policy: policyFromSpdx(null, "NOASSERTION") };
}

function normalizeSpdx(raw: string): string | null {
  const upper = raw.trim();
  // Common shortcuts
  if (/^apache\s*2(\.0)?$/i.test(upper)) return "Apache-2.0";
  if (/^mit$/i.test(upper)) return "MIT";
  if (/^bsd\s*3$/i.test(upper)) return "BSD-3-Clause";
  if (/^bsd\s*2$/i.test(upper)) return "BSD-2-Clause";
  if (/^mpl\s*2(\.0)?$/i.test(upper)) return "MPL-2.0";
  if (/^lgpl\s*3(\.0)?$/i.test(upper)) return "LGPL-3.0";
  if (/^lgpl\s*2\.1$/i.test(upper)) return "LGPL-2.1";
  if (/^gpl\s*3(\.0)?$/i.test(upper)) return "GPL-3.0";
  if (/^gpl\s*2(\.0)?$/i.test(upper)) return "GPL-2.0";
  if (/^agpl\s*3(\.0)?$/i.test(upper)) return "AGPL-3.0";
  if (/^isc$/i.test(upper)) return "ISC";
  if (/^unlicense$/i.test(upper)) return "Unlicense";
  if (/^cc0\s*1(\.0)?$/i.test(upper)) return "CC0-1.0";

  // SPDX-ish identifier
  if (/^[A-Za-z0-9.\-+]+$/.test(upper)) return upper;
  return null;
}

function detectSpdxFromText(text: string): string | null {
  const t = text.toLowerCase();
  if (t.includes("apache license") && t.includes("version 2")) return "Apache-2.0";
  if (t.includes("mit license")) return "MIT";
  if (t.includes("bsd 3-clause") || t.includes("redistribution and use in source and binary forms")) {
    // heuristic: could be 2 or 3; we keep generic 3-clause default
    return t.includes("neither the name") ? "BSD-3-Clause" : "BSD-2-Clause";
  }
  if (t.includes("mozilla public license") && t.includes("2.0")) return "MPL-2.0";
  if (t.includes("gnu lesser general public license") && t.includes("version 3")) return "LGPL-3.0";
  if (t.includes("gnu lesser general public license") && t.includes("version 2.1")) return "LGPL-2.1";
  if (t.includes("gnu general public license") && t.includes("version 3")) return "GPL-3.0";
  if (t.includes("gnu general public license") && t.includes("version 2")) return "GPL-2.0";
  if (t.includes("gnu affero general public license") && t.includes("version 3")) return "AGPL-3.0";
  if (t.includes("the unlicense")) return "Unlicense";
  if (t.includes("creative commons") && t.includes("cc0")) return "CC0-1.0";
  return null;
}

function policyFromSpdx(spdxId: string | null, label: string): LicensePolicy {
  const spdx = spdxId ?? null;

  if (!spdx || spdx === "NOASSERTION") {
    return {
      allowTransform: false,
      risk: "high",
      reason: "未检测到明确许可证（默认可能为 All Rights Reserved）",
      reminders: [
        "建议先确认项目 LICENSE（或联系作者）再进行改造/复用。",
        "在引用该项目代码进行开发/分发前，需要做许可证合规审查。",
      ],
    };
  }

  if (PERMISSIVE.has(spdx)) {
    return {
      allowTransform: true,
      risk: "low",
      reason: `许可证为 ${spdx}（宽松许可证）`,
      reminders: [
        "改造后请保留原 LICENSE/NOTICE 与版权声明。",
        "在引用该项目进行开发与分发时，仍需遵循许可证条款（如署名/保留声明）。",
      ],
    };
  }

  if (WEAK_COPYLEFT.has(spdx)) {
    return {
      allowTransform: true,
      risk: "medium",
      reason: `许可证为 ${spdx}（弱 copyleft，复用需注意边界）`,
      reminders: [
        "改造/复用时注意许可证对“修改文件/链接方式/分发形式”的要求。",
        "在引用该项目进行开发与分发前，建议做一次许可证合规审查。",
      ],
    };
  }

  if (STRONG_COPYLEFT.has(spdx)) {
    return {
      allowTransform: false,
      risk: "high",
      reason: `许可证为 ${spdx}（强 copyleft，跨项目复用可能引入传染性要求）`,
      reminders: [
        "默认不建议将该项目能力抽取为可复用组件并跨项目分发。",
        "如确需改造/复用，请确认你的目标项目能接受同等 copyleft 条款，并咨询法务/合规。",
      ],
    };
  }

  // Unknown license: conservative
  return {
    allowTransform: false,
    risk: "high",
    reason: `许可证为 ${label}（未知/非标准许可证，保守处理）`,
    reminders: [
      "默认不执行改造。请先人工确认许可证条款是否允许修改与再分发。",
      "在引用该项目进行开发与分发前，建议做一次许可证合规审查。",
    ],
  };
}

