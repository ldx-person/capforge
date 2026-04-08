Use CapForge to analyze GitHub projects, extract reusable capabilities, generate transform plans, and optionally execute refactoring.

## One-Shot Pipeline

When the user asks to import/analyze a project, execute ALL steps automatically:

```bash
# Step 1: Clone + scan
npx capforge import <github-url>
npx capforge scan <project-name>
```

Then read the scan output and source code, and generate ALL three artifacts:

**Step 2: Generate capability.md** → `output/capabilities/<project>.md`

```markdown
# <Project Name>

## 概述
<一句话描述>

## 技术栈
<tech stack>

## 核心能力

### <capability-name>
<2-3句描述>

**接口定义:**
```<language>
<真实接口签名>
```

**输入:** <输入描述>
**输出:** <输出描述>
**依赖:** <依赖>
**关键文件:** <文件路径>

## 集成指南
<如何集成到其他项目>

## 改造文件
<关键文件列表>
```

**Step 3: Generate transform-plan.md** → `output/transform-plans/<project>.md`

```markdown
# <Project> 改造计划

## 总体策略
<总体改造建议>

## 改造任务

### [high] Task 1: <title>
- **目标文件:** <targetFile>
- **动作:** extract|abstract|dehardcode|decouple|adapter
- **依赖:** <task ids>
- **描述:** <具体改造描述>
- **验收标准:** <如何验证完成>
```

**Step 4: Update domains.md** → `output/domains.md`

Read ALL existing `output/capabilities/*.md`, re-classify all projects into domains (multi-domain):

```markdown
# 能力域归类

## <domain-name>
<域描述>

### 参与项目
- **<project-name>** — <贡献的能力列表>

### 公共能力
<跨项目公共能力>

### 项目差异
- **<project>**: <方案> — <优势> — 适用于<场景>
```

**Step 5: Validate**

```bash
npx capforge validate
```

Must pass 100%.

**Step 6: Ask the user**

After validation passes, present the transform plan summary to the user and ask:

> 分析完成。改造计划包含 X 个任务（高优先级 Y 个）。是否开始执行改造？
> 
> - 全部执行
> - 只执行高优先级
> - 不执行，仅保留计划

**Step 7: Execute refactoring (if user confirms)**

If the user confirms, execute tasks in order:
1. Sort by priority (high first), respect dependencies
2. For each task:
   - Navigate to `repos/<project>/<targetFile>`
   - Apply the described changes
   - Verify `acceptanceCriteria`
   - Report progress after each task
3. After ALL tasks complete, re-run Steps 2-5 to regenerate all artifacts
4. Final `capforge validate` — must pass 100%

## Other Commands

```bash
npx capforge list                    # 列出已导入项目
npx capforge scan <name>             # 单独扫描
npx capforge install [--force]       # 安装 skill
npx capforge uninstall               # 卸载 skill
npx capforge status                  # 查看安装状态
```

## Capability Lookup (Auto-Trigger)

When the user asks Claude Code to **build a new project, add a feature, or implement a module**, ALWAYS scan existing capabilities first before writing code:

1. Read `output/domains.md` to understand available domains
2. Read relevant `output/capabilities/*.md` files that match the user's need
3. If matching capabilities found, present to the user:

   > 发现已有能力可以复用：
   > - **hermes-agent** 的 platform_adapter — 多平台消息适配器
   > - **Hyperagents** 的 tool_executor — 工具执行框架
   > 
   > 是否参考这些实现？

4. If user confirms, read the capability's interface definition and key files
5. Use as reference when implementing the new feature
6. After implementation, regenerate domains.md if the new project should be added

Example triggers:
- "帮我写一个消息通知模块" → search: platform_adapter, event_dispatcher
- "加个 LLM 调用层" → search: llm_provider, runtime_provider_resolver
- "实现权限控制" → search: permission_handler, approval_callback
- "新建一个 agent 框架" → search: all agent-runtime domain projects

## Rules

1. ALWAYS complete Steps 1-6 in full pipeline — never stop after scan
2. Interface definitions must be REAL — read the actual source code
3. File paths must be REAL — verify they exist in the repo
4. A project CAN appear in multiple domains
5. Write descriptions in Chinese, keep code/technical terms in English
6. Each project should have 5-10 core capabilities, focus on REUSABLE ones
7. During refactoring, modify actual code in `repos/<project>/`, verify each task's acceptance criteria before marking done
