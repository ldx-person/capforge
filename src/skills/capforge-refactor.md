Execute a CapForge transform plan on a project's source code (standalone mode).

Use this when the user already has a transform plan and wants to execute refactoring without re-running the full analysis pipeline.

## Workflow

1. Read `output/transform-plans/<project>.md`
2. Sort tasks by priority (high first), respect dependencies
3. For each task:
   - Navigate to `repos/<project>/<targetFile>`
   - Apply the described changes
   - Verify `acceptanceCriteria`
   - Report progress
4. After all tasks complete, re-run full pipeline:
   - `npx capforge scan <project>`
   - Regenerate capability.md, transform-plan.md, domains.md
   - `npx capforge validate` — must pass 100%

Note: For first-time analysis, use `/capforge` instead — it includes refactoring after analysis.
