# EvoSkill 改造计划

## 总体策略
EvoSkill 当前代码结构清晰但模块间存在硬编码耦合（如 claude_code_sdk 直接调用、评估数据集配置写死在代码中、AgentProfile 和评估框架紧耦合）。应将核心能力（评估、进化循环、缓存）抽象为独立可复用的库，同时将 LLM 交互层（技能/提示词提案）与业务逻辑解耦。

## 改造任务

### [high] Task 1: 抽象 LLM 交互接口
- **目标文件:** src/api/claude_code.py
- **动作:** abstract
- **依赖:** 
- **描述:** 当前直接调用 claude_code_sdk，应抽象为 LLMProposer 接口，支持替换为 OpenAI/Anthropic 等任意 LLM 后端。创建 LLMProposer Protocol，包含 propose_skill() 和 propose_prompt() 方法，默认实现用 claude_code_sdk，同时提供通用实现。
- **验收标准:** 1) LLMProposer Protocol 定义清晰 2) claude_code_sdk 只作为默认实现之一 3) 新增 LLM 后端只需实现 Protocol，不修改核心代码 4) 单元测试可用 mock 替换

### [high] Task 2: 解耦评估框架
- **目标文件:** src/evaluation/evaluate.py, src/evaluation/eval_full.py
- **动作:** decouple
- **依赖:** 
- **描述:** 评估框架硬编码了具体数据集（OfficeQA、Dabstep 等），应抽象为 EvalDataset Protocol。每个数据集实现 load_data() 和 score() 方法，通过配置文件注册，支持动态加载新数据集而不修改评估代码。
- **验收标准:** 1) EvalDataset Protocol 定义 2) 每个数据集是独立模块 3) 添加新数据集只需创建新文件并注册 4) 评估代码不直接引用任何具体数据集

### [medium] Task 3: 提取 AgentProfile 为独立包
- **目标文件:** src/agent_profiles/base.py
- **动作:** extract
- **依赖:** 
- **描述:** AgentProfile 是通用的 agent 配置管理，不依赖 EvoSkill 特有逻辑。应提取为独立模块，支持 JSON/YAML 序列化和反序列化，可被其他 agent 框架直接复用。
- **验收标准:** 1) AgentProfile 可独立 import，不依赖其他 EvoSkill 模块 2) 支持 JSON/YAML 导入导出 3) 文档说明独立使用方法

### [medium] Task 4: 缓存层通用化
- **目标文件:** src/cache/run_cache.py
- **动作:** dehardcode
- **依赖:** 
- **描述:** 当前缓存目录硬编码在代码中，应支持通过环境变量或配置指定。同时增加 TTL 过期机制和 LRU 淘汰策略。
- **验收标准:** 1) 缓存目录可通过 CACHE_DIR 环境变量配置 2) 支持 TTL 设置 3) 超限自动淘汰最旧条目 4) 向后兼容现有用法

### [medium] Task 5: 配置外部化
- **目标文件:** src/loop/evolve.py
- **动作:** dehardcode
- **依赖:** 
- **描述:** 进化循环中的参数（并行数、最大迭代次数、温度等）硬编码在代码中。应提取为配置文件（YAML），支持运行时覆盖。
- **验收标准:** 1) 所有可调参数在 config.yaml 中定义 2) 命令行参数可覆盖配置 3) 默认值与当前行为一致 4) 配置文件有注释说明每个参数

### [low] Task 6: 统一评分接口
- **目标文件:** src/evaluation/reward.py
- **动作:** abstract
- **依赖:** 
- **描述:** 评分方法（exact、fuzzy、contains）散落在不同位置，应统一为 Scorer Protocol，支持插件式注册新评分方法。
- **验收标准:** 1) Scorer Protocol 定义 2) 内置 exact/fuzzy/contains 实现 3) 新增评分方法只需实现 Protocol 4) 评分方法可通过配置文件指定
