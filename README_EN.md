# CapForge

**Forge reusable capabilities from GitHub open source projects.**

## Why CapForge?

Open source AI Agent projects are rich with reusable modules — but their capabilities are deeply coupled with the project itself. Extracting and reusing a specific module requires manually reading source code, understanding interfaces, and decoupling dependencies — extremely high cost.

CapForge solves this:

- **Auto-scan** project code structure: file tree, dependencies, module boundaries
- **Works with Claude Code** to generate structured capability descriptions
- **Cross-project capability lookup** — automatically match reusable modules when building new features
- **Transform plans** — auto-generate modularization refactoring proposals
- **Domain classification** — group projects by capability similarity for easy comparison

## Design Philosophy

CapForge **does NOT call any LLM APIs**. Zero cost. Pure code scanning.

| | CapForge | Claude Code |
|---|---|---|
| Code scanning | ✅ Pure analysis, zero API cost | ❌ |
| Capability understanding | ❌ | ✅ Read source + generate capability.md |
| Transform planning | ❌ | ✅ Generate transform-plan.md |
| Domain classification | ✅ Keyword-based auto-grouping | ✅ Supplement with diff analysis |
| Format validation | ✅ validate | ❌ |
| Execute refactoring | ❌ | ✅ Modify code per plan |

All outputs are **Markdown** — agent-readable, human-readable.

## Installation

```bash
git clone https://github.com/ldx-person/capforge.git
cd capforge
npm install && npm run build

# Optional: global install
npm install -g .
```

### Install as Claude Code Skill

CapForge injects into Claude Code via custom slash commands:

```bash
# Install skills (/capforge and /capforge-refactor)
npx capforge install

# Overwrite existing installation
npx capforge install --force

# Check status
npx capforge status

# Uninstall
npx capforge uninstall
```

After installation, restart Claude Code and use:
- `/capforge` — Analyze projects, generate capability descriptions, transform plans, domain classification
- `/capforge-refactor` — Execute code refactoring per transform plan

## Quick Start

```bash
# 1. Import and scan a GitHub project
npx capforge import https://github.com/nousresearch/hermes-agent
npx capforge scan hermes-agent

# 2. In Claude Code, use /capforge to auto-generate:
#    - capability.md (capability descriptions)
#    - transform-plan.md (refactoring plan)
#    - domains.md (domain classification)
#    - validate format

# 3. Confirm to auto-execute refactoring (optional)

# 4. Auto-lookup capabilities when building new features (auto-triggered)
```

## CLI Reference

| Command | Description |
|---------|-------------|
| `capforge import <url>` | Clone GitHub repository |
| `capforge scan <name>` | Scan code structure |
| `capforge describe <name>` | Output scan data |
| `capforge transform <name>` | Output transform scan data |
| `capforge classify-domains` | List capability.md files and classify |
| `capforge validate` | Validate capability.md format |
| `capforge list` | List imported projects |
| `capforge install` | Install skills to Claude Code |
| `capforge uninstall` | Uninstall skills |
| `capforge status` | Check skill installation status |

## Core Flow

```
┌─────────────┐    ┌──────────────┐    ┌──────────────────┐
│  GitHub URL  │───▶│   capforge   │───▶│   Claude Code    │
│             │    │   import +   │    │                  │
│             │    │   scan       │    │  capability.md   │
└─────────────┘    └──────────────┘    │  transform-plan  │
                                       │  domains.md      │
                                       └────────┬─────────┘
                                                │
                    ┌───────────────────────────┘
                    ▼
          ┌──────────────────┐
          │   capforge       │
          │   validate       │
          │   (format check) │
          └──────────────────┘
```

## Output Formats

All outputs are Markdown.

### capability.md — Capability Description

```markdown
# <Project Name>

## Overview
<One-line description>

## Tech Stack
<tech stack>

## Core Capabilities

### <capability-name>
<Description>

**Interface:**
\`\`\`<language>
<Real interface signature>
\`\`\`

**Inputs:** <input description>
**Outputs:** <output description>
**Dependencies:** <dependencies>
**Key Files:** <file paths>

## Integration Guide
<How to integrate into other projects>

## Files to Refactor
<key file list>
```

### transform-plan.md — Refactoring Plan

```markdown
# <Project> Transform Plan

## Strategy
<Overall strategy>

## Tasks

### [high] Task 1: <title>
- **Target File:** <targetFile>
- **Action:** extract|abstract|dehardcode|decouple|adapter
- **Dependencies:** <task ids>
- **Description:** <what to change and why>
- **Acceptance Criteria:** <how to verify>
```

### domains.md — Domain Classification

```markdown
# Domain Classification

## <domain-name>
<domain description>

### Participating Projects
- **<project-name>** — <contributed capabilities>

### Common Capabilities
<shared capabilities>

### Differentiation
- **<project>**: <approach> — <strengths> — best for <scenario>
```

## Project Structure

```
capforge/
├── src/
│   ├── cli.ts          # CLI entry point
│   ├── analyze.ts      # Code scanning
│   ├── describe.ts     # Capability output
│   ├── transform.ts    # Transform scan output
│   ├── domain.ts       # Domain classification
│   ├── validate.ts     # Format validation
│   ├── install.ts      # Claude Code skill installer
│   ├── import.ts       # GitHub cloning
│   └── types.ts        # Type definitions
├── output/
│   ├── capabilities/   # capability.md per project
│   ├── transform-plans/# transform-plan.md per project
│   └── domains.md      # cross-project classification
├── repos/              # cloned repositories
└── package.json
```

## License

MIT © 2026 Autsin Liu
