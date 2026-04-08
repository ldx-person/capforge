// CapForge - Domain Classification Module

import * as path from "path";
import * as fs from "fs";
import { listCapabilityFiles, loadCapabilityFile } from "./describe";
import { outputDir as outputDirFromWorkspace } from "./workspace";

interface DomainDef {
  id: string;
  label: string;
  keywords: string[];
}

const DOMAIN_DEFS: DomainDef[] = [
  {
    id: "agent-runtime",
    label: "Agent Runtime（智能体运行时）",
    keywords: ["tool", "extension", "plugin", "context", "session", "provider", "memory", "orchestrat", "bash", "process", "cli"],
  },
  {
    id: "agent-communication",
    label: "Agent Communication（智能体通信）",
    keywords: ["platform", "messaging", "protocol", "acp", "permission", "event", "dispatch"],
  },
  {
    id: "agent-evolution",
    label: "Agent Evolution（智能体进化）",
    keywords: ["train", "reinforcement", "rl", "evaluat", "benchmark", "evolv", "skill", "fine-tun", "score", "checkpoint"],
  },
  {
    id: "agent-infrastructure",
    label: "Agent Infrastructure（智能体基础设施）",
    keywords: ["config", "logging", "database", "cache", "auth"],
  },
];

interface ProjectInfo {
  name: string;
  domains: string[];
  overview: string;
  capabilities: string[];
  techStack: string[];
}

/**
 * Read all capability.md files and generate a domains.md summary
 * using keyword-based automatic domain classification.
 */
export function classifyDomains(outputDir?: string): {
  domainsPath: string;
  projects: string[];
} {
  const projectNames = listCapabilityFiles(outputDir);

  if (projectNames.length === 0) {
    const lines = [
      "# 能力域归类",
      "",
      "尚未生成任何 capability.md 文件。请先运行 `capforge scan <project>` 并让 Claude Code 生成能力描述。",
      "",
    ];
    const domainsPath = saveDomainsManifest(lines.join("\n"), outputDir);
    return { domainsPath, projects: [] };
  }

  // Parse all projects
  const projects: ProjectInfo[] = projectNames.map((name) => {
    const content = loadCapabilityFile(name, outputDir) ?? "";
    const lower = content.toLowerCase();

    const overviewMatch = content.match(/## 概述\s*\n([\s\S]*?)(?=\n## )/);
    const overview = overviewMatch ? overviewMatch[1].trim().split("\n")[0] : "";

    const capMatches = [...content.matchAll(/### (.+)/g)];
    const capabilities = capMatches.map((m) => m[1].trim());

    const techMatch = content.match(/## 技术栈\s*\n([\s\S]*?)(?=\n## |$)/);
    const techStack = techMatch
      ? [...techMatch[1].matchAll(/[-*]\s*(.+)/g)].map((m) => m[1].trim())
      : [];

    // Match domains by keywords
    const domains: string[] = [];
    for (const domainDef of DOMAIN_DEFS) {
      if (domainDef.keywords.some((kw) => lower.includes(kw))) {
        domains.push(domainDef.id);
      }
    }
    // Default to agent-runtime if no domain matched
    if (domains.length === 0) {
      domains.push("agent-runtime");
    }

    return { name, domains, overview, capabilities, techStack };
  });

  // Build domains.md
  const lines: string[] = [
    "# 能力域归类",
    "",
    `共找到 ${projects.length} 个项目，归入 ${DOMAIN_DEFS.length} 个能力域。`,
    "一个项目可属于多个域。",
    "",
    "---",
    "",
  ];

  for (const domainDef of DOMAIN_DEFS) {
    const domainProjects = projects.filter((p) => p.domains.includes(domainDef.id));
    if (domainProjects.length === 0) continue;

    lines.push(`## ${domainDef.label}`, "");
    lines.push(`**域标识:** \`${domainDef.id}\``, "");
    lines.push(`**关键词:** ${domainDef.keywords.join(", ")}`, "");
    lines.push(`**参与项目:** ${domainProjects.length} 个`, "");

    // Public capabilities: intersection of capabilities across projects
    const allCaps = domainProjects.flatMap((p) => p.capabilities);
    const capCounts = new Map<string, number>();
    for (const cap of allCaps) {
      capCounts.set(cap, (capCounts.get(cap) ?? 0) + 1);
    }
    const sharedCaps = [...capCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([cap]) => cap);
    const uniqueCaps = [...capCounts.entries()]
      .filter(([, count]) => count === 1)
      .map(([cap]) => cap);

    if (sharedCaps.length > 0) {
      lines.push("", "### 公共能力", "");
      for (const cap of sharedCaps) {
        lines.push(`- ${cap}`);
      }
    }

    lines.push("", "### 项目贡献", "");
    for (const proj of domainProjects) {
      lines.push(`#### ${proj.name}`, "");
      if (proj.overview) {
        lines.push(`> ${proj.overview}`, "");
      }
      lines.push(`- **贡献能力:** ${proj.capabilities.length > 0 ? proj.capabilities.join("; ") : "（见 capability.md）"}`);
      if (proj.techStack.length > 0) {
        lines.push(`- **技术栈:** ${proj.techStack.join(", ")}`);
      }
      const otherDomains = proj.domains.filter((d) => d !== domainDef.id);
      if (otherDomains.length > 0) {
        lines.push(`- **跨域:** ${otherDomains.join(", ")}`);
      }
      lines.push("");
    }

    if (uniqueCaps.length > 0) {
      lines.push("### 项目差异", "");
      for (const cap of uniqueCaps) {
        const owner = domainProjects.find((p) => p.capabilities.includes(cap));
        if (owner) {
          lines.push(`- **${cap}** — 仅见于 ${owner.name}`);
        }
      }
      lines.push("");
    }

    lines.push("---", "");
  }

  const domainsPath = saveDomainsManifest(lines.join("\n"), outputDir);
  return { domainsPath, projects: projectNames };
}

/**
 * Save domains summary as Markdown.
 */
export function saveDomainsManifest(markdown: string, outputDir?: string): string {
  const dir = outputDir ?? outputDirFromWorkspace();
  fs.mkdirSync(dir, { recursive: true });

  const filePath = path.join(dir, "domains.md");
  fs.writeFileSync(filePath, markdown, "utf-8");

  return filePath;
}
