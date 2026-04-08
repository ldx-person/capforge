---
name: capforge-refactor
description: Austin Liu｜按 CapForge 的 transform-plan.md 执行代码改造：提取可复用能力模块、解耦依赖、加适配层，并在改造后重新生成/校验产物
version: 1.0.0
metadata:
  openclaw:
    requires:
      bins:
        - node
        - npx
    install:
      - kind: node
        package: capforge
        bins: [capforge]
    homepage: https://github.com/ldx-person/capforge
    emoji: "🧩"
---

# CapForge Refactor

按 CapForge 的改造计划执行重构（该技能假设你已经有 `transform-plan.md`）。

## 输入

- `~/.capforge/output/transform-plans/<project>.md`（或你的工作空间对应路径）
- 对应源码：`~/.capforge/repos/<project>/...`

## 执行步骤

1. 阅读 `transform-plan.md`，按优先级（high → medium → low）排序，并遵循依赖关系。
2. 对每个任务按“验收标准”完成改造：
   - `extract`：提取能力模块到独立目录/包
   - `abstract`：抽象接口，隔离具体实现
   - `dehardcode`：把硬编码迁移到配置/参数
   - `decouple`：移除不必要的跨模块依赖
   - `adapter`：为外部依赖/不稳定 API 增加适配层
3. 每完成一组任务，重新跑扫描与产物更新：
   ```bash
   npx capforge scan <project>
   npx capforge describe <project>
   npx capforge transform <project>
   npx capforge classify-domains
   npx capforge validate
   ```
4. 如果 `validate` 不通过，修复 `capability.md` 必需章节缺失或结构错误，直到通过。

## 注意事项

- 改造应以“可复用”为目标：对外暴露稳定 API（接口/函数签名/配置项），避免把项目内部细节泄露为公共依赖。
- 改造范围较大时，建议按任务拆分小 PR/小提交，方便回滚与 review。
