# MetaClaw

## 概述
模块化的 LLM 代理基础设施框架，提供自演进的长期记忆管理、技能注入与自动演化、RL 训练数据收集与代理服务，以及 OpenClaw 插件扩展系统。

## 技术栈
TypeScript, Python, FastAPI, SQLite + FTS5, PyTorch, SentenceTransformers, OpenAI API, uvicorn

## 核心能力

### LLM 长期记忆管理
基于 SQLite + FTS5 的持久化分层记忆系统，支持 6 种记忆类型（episodic、semantic、preference、project_state、working_summary、procedural_observation），提供 keyword/hybrid/embedding 三种检索模式，以及自动合并、去重、过期归档和自适应策略优化。

**接口定义:**
```python
@dataclass
class MemoryUnit:
    memory_id: str
    scope_id: str
    memory_type: MemoryType
    content: str
    summary: str = ""
    entities: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    importance: float = 0.5
    confidence: float = 0.7
    access_count: int = 0
    reinforcement_score: float = 0.0
    status: MemoryStatus = MemoryStatus.ACTIVE
    embedding: list[float] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
```

**输入:** MemoryUnit 数据对象、MemoryQuery 查询参数（scope_id, query_text, top_k, max_tokens）
**输出:** 匹配的 MemorySearchHit 列表，包含评分和匹配词项
**依赖:** sqlite3, hashlib, numpy
**关键文件:** metaclaw/memory/models.py, metaclaw/memory/store.py, metaclaw/memory/manager.py, metaclaw/memory/retriever.py, metaclaw/memory/policy.py

### 技能管理与自动演化
从 Markdown 技能文件中加载、检索和动态演化技能，支持 template（关键词匹配）和 embedding（向量相似度）两种检索模式，能在会话过程中自动分析模式并生成新技能。

**接口定义:**
```python
class SkillManager:
    def __init__(
        self,
        skills_dir: str,
        retrieval_mode: str = "template",
        embedding_model_path: Optional[str] = None,
        task_specific_top_k: Optional[int] = None,
    ): ...
    def retrieve(self, task_description: str, top_k: int = 6) -> list[dict]: ...
    def retrieve_relevant(self, task_description: str, top_k: int = 6, min_relevance: float = 0.07) -> list[dict]: ...
    def add_skills(self, new_skills: list[dict], category: str = "general") -> int: ...
    def format_for_conversation(self, skills: list[dict]) -> str: ...
```

**输入:** 任务描述文本、技能目录路径
**输出:** 排序后的技能列表（name, description, category, content）
**依赖:** sentence-transformers（可选，embedding 模式需要）
**关键文件:** metaclaw/skill_manager.py, metaclaw/skill_evolver.py

### LLM 代理 API 服务
FastAPI 代理服务器，在 OpenClaw 和后端 LLM 之间转发请求，负责会话跟踪、技能注入、记忆检索与注入、上下文截断、PRM 评分和多提供商 CLI 转发（Claude Code、OpenAI Codex、Gemini CLI）。

**接口定义:**
```python
class MetaClawAPIServer:
    def __init__(
        self,
        config: MetaClawConfig,
        output_queue: queue.Queue,
        submission_enabled: threading.Event,
        sampling_client=None,
        skill_manager: Optional[SkillManager] = None,
        prm_scorer: Optional[PRMScorer] = None,
        skill_evolver=None,
        last_request_tracker=None,
        memory_manager=None,
    ): ...
```

**输入:** OpenAI 格式的聊天请求（含 X-Session-Id, X-Turn-Type, X-Memory-Scope 头部）
**输出:** OpenAI 兼容的聊天完成响应（支持流式和非流式）
**依赖:** fastapi, uvicorn, httpx, openai
**关键文件:** metaclaw/api_server.py, metaclaw/config.py

### OpenClaw 插件扩展系统
TypeScript 插件，实现 OpenClaw Plugin SDK 的 `register(api)` 接口，提供会话/轮次头部注入、自动 venv 创建与 pip 安装、一键启动 MetaClaw、以及记忆 sidecar 服务管理。

**接口定义:**
```typescript
export default function register(api: OpenClawPluginApi): void
// 内存插件（独立）:
export default {
  id: "metaclaw-memory",
  name: "MetaClaw Memory",
  register(api: any): {
    api.registerService({ id, start, stop })
    registerAutoRecall(api, getClient, cfg)
    registerAutoCapture(api, getClient, cfg)
    registerMemorySearchTool(api, getClient, cfg)
    registerMemoryStoreTool(api, getClient, cfg)
  }
}
```

**输入:** OpenClaw PluginApi 实例、插件配置对象
**输出:** 注册的钩子、工具、斜杠命令和服务
**依赖:** openclaw/plugin-sdk, node:child_process, node:fs
**关键文件:** extensions/metaclaw-openclaw/index.ts, openclaw-metaclaw-memory/src/index.ts

### 记忆检索引擎
多模式检索引擎，支持 keyword（IDF 加权关键词搜索 + FTS5 加速）、hybrid（关键词 + embedding 融合评分）和 embedding（纯向量相似度）三种模式，具备查询扩展同义词表和标签增强功能。

**接口定义:**
```python
class MemoryRetriever:
    def __init__(
        self,
        store: MemoryStore,
        policy: MemoryPolicy | None = None,
        retrieval_mode: str = "keyword",
        embedder=None,
    ): ...
    def retrieve(self, query: MemoryQuery) -> list[MemorySearchHit]: ...
```

**输入:** MemoryQuery（scope_id, query_text, top_k, max_tokens, include_types, context_tags）
**输出:** MemorySearchHit 列表（unit, score, matched_terms, reason）
**依赖:** MemoryStore, MemoryPolicy, BaseEmbedder（可选）
**关键文件:** metaclaw/memory/retriever.py, metaclaw/memory/embeddings.py

### LLM Prompt 日志记录
OpenClaw 插件，捕获 llm_input、llm_output、agent_end 三个生命周期事件，将完整的 prompt/completion 对和会话摘要按 session 分目录持久化为 JSON 文件。

**接口定义:**
```typescript
type PendingInput = {
  timestamp: string; runId: string; sessionId: string;
  provider: string; model: string; prompt: string;
  historyMessages: unknown[];
}
export default function register(api: OpenClawPluginApi): void
// 事件: api.on("llm_input", ...), api.on("llm_output", ...), api.on("agent_end", ...)
```

**输入:** LLM 输入/输出事件（含 provider, model, prompt, assistantTexts, usage）
**输出:** 按会话 ID 分目录的 JSON 日志文件（input.json, round.json, agent-end.json）
**依赖:** openclaw/plugin-sdk, node:fs, node:path
**关键文件:** benchmark/openclaw_customize/llm-prompt-logger/index.ts

### 自适应记忆策略
基于遥测数据自动调整检索参数的策略系统，支持 named profiles（balanced, recall, precision, recent），包含类型权重、新近度加权和重要性权重等可调参数。

**接口定义:**
```python
@dataclass
class MemoryPolicy:
    max_injected_units: int = 6
    max_injected_tokens: int = 800
    recent_bonus_hours: int = 72
    keyword_weight: float = 1.0
    metadata_weight: float = 0.45
    importance_weight: float = 0.5
    recency_weight: float = 0.3
    type_boosts: dict[str, float] = field(default_factory=lambda: {
        "working_summary": 1.2, "project_state": 1.1,
        "preference": 1.0, "semantic": 1.0,
        "episodic": 0.8, "procedural_observation": 0.9,
    })
    @classmethod
    def from_profile(cls, profile: str) -> "MemoryPolicy": ...
```

**输入:** 遥测数据、策略状态（MemoryPolicyState）
**输出:** 调优后的 MemoryPolicy 实例
**依赖:** 无外部依赖
**关键文件:** metaclaw/memory/policy.py, metaclaw/memory/policy_optimizer.py, metaclaw/memory/policy_store.py

### 嵌入向量引擎
可插拔的文本嵌入抽象层，支持 HashingEmbedder（确定性哈希，零依赖）和 SentenceTransformerEmbedder（语义嵌入，依赖 sentence-transformers），提供统一的 encode/encode_batch 接口。

**接口定义:**
```python
class BaseEmbedder(ABC):
    @abstractmethod
    def encode(self, text: str) -> list[float]: ...
    def encode_batch(self, texts: list[str]) -> list[list[float]]: ...
    @property
    @abstractmethod
    def dimensions(self) -> int: ...

class HashingEmbedder(BaseEmbedder):
    def __init__(self, dimensions: int = 64): ...

class SentenceTransformerEmbedder(BaseEmbedder):
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"): ...
```

**输入:** 文本字符串或文本列表
**输出:** 浮点向量（维度取决于实现：hashing=64, semantic=384）
**依赖:** hashlib（hashing）, sentence-transformers（semantic）
**关键文件:** metaclaw/memory/embeddings.py

### 统一配置管理
基于 dataclass 的统一配置系统，涵盖模型、训练、奖励/PRM、技能、记忆等所有子系统的参数，支持命令行覆盖和 YAML 持久化存储。

**接口定义:**
```python
@dataclass
class MetaClawConfig:
    model_name: str = "Qwen/Qwen3-4B"
    mode: str = "skills_only"  # "skills_only" | "rl" | "auto"
    proxy_host: str = "127.0.0.1"
    proxy_port: int = 8090
    llm_provider: str = "custom"
    llm_api_base: str = ""
    llm_model_id: str = ""
    memory_enabled: bool = False
    memory_retrieval_mode: str = "keyword"
    use_skills: bool = False
    skills_dir: str = "memory_data/skills"
    synergy_enabled: bool = False
```

**输入:** YAML 配置文件、环境变量、命令行参数
**输出:** MetaClawConfig dataclass 实例
**依赖:** dataclasses, pyyaml
**关键文件:** metaclaw/config.py, metaclaw/config_store.py, metaclaw/launcher.py

## 集成指南
集成 MetaClaw 需要实现 `OpenClawPluginApi` 接口注册插件，或直接导入 Python 模块使用 `MemoryManager.from_config(cfg)` 构建记忆服务。通过 `MetaClawConfig` dataclass 统一配置模型、记忆、技能等参数，用 `MetaClawLauncher` 一键启动代理服务。配置环境变量 `MEMORY_DB_PATH`、`LOG_DIR`、`PLUGIN_CONFIG` 来解耦文件系统依赖。

## 改造文件
metaclaw/memory/store.py, metaclaw/memory/manager.py, metaclaw/memory/retriever.py, metaclaw/memory/models.py, metaclaw/memory/policy.py, metaclaw/memory/embeddings.py, metaclaw/skill_manager.py, metaclaw/api_server.py, metaclaw/config.py, metaclaw/launcher.py, extensions/metaclaw-openclaw/index.ts, openclaw-metaclaw-memory/src/index.ts, benchmark/openclaw_customize/llm-prompt-logger/index.ts
