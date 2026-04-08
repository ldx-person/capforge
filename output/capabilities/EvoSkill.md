# EvoSkill

## 概述
自主进化 Agent 框架，通过迭代式的技能/提示词进化循环，让 Agent 在多基准测试上持续自我改进。

## 技术栈
Python, Anthropic API, Docker, Async

## 核心能力

### evolve_loop
自进化核心循环，管理技能和提示词的迭代进化流程。每个进化步骤生成新的 skill/prompt，在多个数据集上评估，保留最优版本。

**接口定义:**
```python
async def evolve(
    agent_profile: AgentProfile,
    config: EvolveConfig,
) -> EvolveResult:
    """Run one evolution step: propose → evaluate → select best"""
```

**输入:** AgentProfile（当前 agent 配置）, EvolveConfig（进化参数）
**输出:** EvolveResult（进化结果，包含新旧版本对比）
**依赖:** claude_code_sdk, src/evaluation
**关键文件:** src/loop/evolve.py, src/agent_profiles/base.py

### multi_benchmark_evaluation
多数据集并行评估框架，支持 OfficeQA、Dabstep、LiveCodeBench、SEAL-QA 等基准测试。

**接口定义:**
```python
async def evaluate_agent_parallel(
    agent_fn: Callable,
    dataset: str,
    num_workers: int = 4,
) -> list[EvalResult]:
    """Evaluate agent on a dataset with parallel workers"""
```

**输入:** agent_fn（待测 agent 函数）, dataset（数据集名称）, num_workers（并行数）
**输出:** list[EvalResult]（评估结果列表）
**依赖:** datasets, asyncio
**关键文件:** src/evaluation/evaluate.py, src/evaluation/eval_full.py

### answer_scoring
答案提取与评分系统，从 Agent 的对话轨迹中提取最终答案并计算准确率。

**接口定义:**
```python
def score_answer(
    predicted: str,
    ground_truth: str,
    scoring_method: str = "exact",
) -> float:
    """Score predicted answer against ground truth"""
```

**输入:** predicted（预测答案）, ground_truth（正确答案）, scoring_method（评分方法）
**输出:** float（得分 0-1）
**依赖:** 无外部依赖
**关键文件:** src/evaluation/reward.py

### skill_proposal
技能提案生成，基于当前 agent 表现分析瓶颈，生成新的技能（tool）定义。

**接口定义:**
```python
@dataclass
class SkillProposerResponse:
    skill_name: str
    skill_description: str
    skill_parameters: list[dict]
    rationale: str

async def propose_skill(
    agent_profile: AgentProfile,
    eval_results: list[EvalResult],
) -> SkillProposerResponse:
    """Analyze eval results and propose a new skill"""
```

**输入:** AgentProfile, eval_results
**输出:** SkillProposerResponse（技能提案）
**依赖:** claude_code_sdk
**关键文件:** src/schemas/skill_proposer.py, src/api/claude_code.py

### prompt_proposal
提示词进化提案，生成改进版的 system prompt 以提升 agent 表现。

**接口定义:**
```python
@dataclass
class PromptProposerResponse:
    prompt_name: str
    prompt_content: str
    rationale: str

async def propose_prompt(
    agent_profile: AgentProfile,
    eval_results: list[EvalResult],
) -> PromptProposerResponse:
    """Analyze eval results and propose improved prompt"""
```

**输入:** AgentProfile, eval_results
**输出:** PromptProposerResponse（提示词提案）
**依赖:** claude_code_sdk
**关键文件:** src/schemas/prompt_proposer.py

### agent_profile_management
Agent 配置管理，支持基于任务类型的配置文件和运行时参数覆盖。

**接口定义:**
```python
@dataclass
class AgentProfile:
    name: str
    model: str
    system_prompt: str
    tools: list[dict]
    skill_names: list[str]
    config: dict[str, Any]

def load_profile(path: str) -> AgentProfile: ...
def save_profile(profile: AgentProfile, path: str) -> None: ...
```

**输入:** path（配置文件路径）
**输出:** AgentProfile
**依赖:** pydantic, yaml
**关键文件:** src/agent_profiles/base.py, src/agent_profiles/

### run_cache
评估结果缓存，支持断点续跑，避免重复评估。

**接口定义:**
```python
class RunCache:
    def __init__(self, cache_dir: str): ...
    def get(self, key: str) -> Optional[dict]: ...
    def set(self, key: str, value: dict) -> None: ...
    def has(self, key: str) -> bool: ...
```

**输入:** key（缓存键）, value（缓存值）
**输出:** Optional[dict]
**依赖:** 无外部依赖
**关键文件:** src/cache/run_cache.py

### program_registry
进化产物注册表，跟踪所有已进化出的技能和提示词版本。

**接口定义:**
```python
class ProgramManager:
    def register(self, name: str, version: int, content: str, metadata: dict): ...
    def get_latest(self, name: str) -> Optional[dict]: ...
    def list_all(self) -> list[dict]: ...
    def get_history(self, name: str) -> list[dict]: ...
```

**输入:** name（程序名）, version（版本）, content（内容）
**输出:** Optional[dict]
**依赖:** 无外部依赖
**关键文件:** src/registry/

## 集成指南
导入 EvoSkill 的评估框架和进化循环，配置 AgentProfile 指向你的 agent，调用 evolve() 开始自进化。评估框架可独立使用，只需实现 agent_fn 回调函数即可在任何基准上测试你的 agent。

## 改造文件
src/loop/evolve.py, src/evaluation/evaluate.py, src/evaluation/reward.py, src/schemas/skill_proposer.py, src/schemas/prompt_proposer.py, src/agent_profiles/base.py, src/cache/run_cache.py, src/registry/
