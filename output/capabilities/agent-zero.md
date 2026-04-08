# agent-zero

## 概述
Agent Zero 是一个动态、可扩展的多智能体编排框架，支持层级式子代理协作、工具执行、插件扩展和知识管理，以 LLM 为核心驱动自主任务分解与执行。

## 技术栈
Python, LangChain, LiteLLM, FAISS, Flask, Socket.IO, Pydantic, Docker, Playwright, MCP (Model Context Protocol), sentence-transformers

## 核心能力

### 多智能体编排
通过层级式 Agent 体系实现任务分解与协作，每个 Agent 可生成子代理处理子任务，支持 superior/subordinate 通信链和流式响应处理。AgentContext 管理会话状态、任务生命周期和干预机制。

**接口定义:**
```python
class Agent:
    @extension.extensible
    def __init__(self, number: int, config: AgentConfig, context: AgentContext | None = None): ...

    @extension.extensible
    async def monologue(self): ...

    @extension.extensible
    async def call_chat_model(self, messages: list[BaseMessage],
        response_callback: Callable[[str, str], Awaitable[str | None]] | None = None,
        reasoning_callback: Callable[[str, str], Awaitable[None]] | None = None,
        background: bool = False, explicit_caching: bool = True): ...

@dataclass
class AgentConfig:
    mcp_servers: str
    profile: str = ""
    knowledge_subdirs: list[str] = field(default_factory=lambda: ["default", "custom"])
    additional: Dict[str, Any] = field(default_factory=dict)
```

**输入:** AgentConfig, UserMessage, 上下文 ID
**输出:** Agent 响应文本, 推理过程, 工具执行结果
**依赖:** langchain-core, litellm, pydantic
**关键文件:** agent.py, initialize.py, helpers/subagents.py, agents/

### 上下文管理
基于 ContextVar 的多上下文并发管理，支持 USER/TASK/BACKGROUND 三种上下文类型，提供全局上下文注册表、干预机制和日志聚合功能。

**接口定义:**
```python
class AgentContext:
    @extension.extensible
    def __init__(self, config: "AgentConfig", id: str | None = None,
        name: str | None = None, agent0: "Agent|None" = None,
        log: Log.Log | None = None, paused: bool = False,
        type: AgentContextType = AgentContextType.USER, ...): ...

    @staticmethod
    def use(id: str) -> "AgentContext | None": ...

    @extension.extensible
    def communicate(self, msg: "UserMessage", broadcast_level: int = 1): ...

    @extension.extensible
    def reset(self): ...
```

**输入:** context_id, AgentConfig, UserMessage
**输出:** AgentContext 实例, 任务 DeferredTask
**依赖:** threading, pydantic
**关键文件:** agent.py, helpers/context.py, helpers/context_utils.py

### 可插拔工具执行框架
通过继承 Tool 基类定义自定义工具，支持异步执行、进度报告和生命周期钩子。框架自动从文件系统发现并加载工具类，结合 MCP 协议支持远程工具调用。

**接口定义:**
```python
class Tool:
    def __init__(self, agent: Agent, name: str, method: str | None,
        args: dict[str,str], message: str, loop_data: LoopData | None, **kwargs) -> None: ...

    @abstractmethod
    async def execute(self, **kwargs) -> Response: ...

    async def before_execution(self, **kwargs): ...
    async def after_execution(self, response: Response, **kwargs): ...

@dataclass
class Response:
    message: str
    break_loop: bool
    additional: dict[str, Any] | None = None
```

**输入:** tool_name, tool_args (dict), agent 上下文
**输出:** Response (message + break_loop 标志)
**依赖:** abc, helpers/extension.py
**关键文件:** helpers/tool.py, tools/, helpers/extract_tools.py, helpers/mcp_handler.py

### 扩展系统
基于文件系统的轻量级扩展机制，通过 `@extensible` 装饰器为任意函数注入前后扩展点，支持同步/异步扩展，自动发现 extensions 目录下的扩展类。

**接口定义:**
```python
def extensible(func):
    """Make a function emit two implicit extension points around its execution."""

class Extension:
    def __init__(self, agent: "Agent|None", **kwargs): ...
    @abstractmethod
    def execute(self, **kwargs) -> None | Awaitable[None]: ...

async def call_extensions_async(extension_point: str, agent: "Agent|None" = None, **kwargs): ...
def call_extensions_sync(extension_point: str, agent: "Agent|None" = None, **kwargs): ...
```

**输入:** extension_point (路径字符串), agent, kwargs (数据负载)
**输出:** 通过 data dict 修改 result/exception
**依赖:** abc, inspect, os
**关键文件:** helpers/extension.py, extensions/

### 统一 LLM 调用层
封装 LiteLLM 的 Chat 和 Embedding 模型调用，支持流式/非流式、速率限制、重试机制和 reasoning 内容解析。通过 `unified_call` 方法提供统一的回调接口。

**接口定义:**
```python
class LiteLLMChatWrapper(SimpleChatModel):
    async def unified_call(self, system_message="", user_message="",
        messages: List[BaseMessage] | None = None,
        response_callback: Callable[[str, str], Awaitable[str | None]] | None = None,
        reasoning_callback: Callable[[str, str], Awaitable[None]] | None = None,
        tokens_callback: Callable[[str, int], Awaitable[None]] | None = None,
        explicit_caching: bool = False, **kwargs) -> Tuple[str, str]: ...

def get_chat_model(provider: str, name: str, model_config: Optional[ModelConfig] = None, **kwargs) -> LiteLLMChatWrapper: ...
def get_embedding_model(provider: str, name: str, model_config: Optional[ModelConfig] = None, **kwargs) -> LiteLLMEmbeddingWrapper | LocalSentenceTransformerWrapper: ...
```

**输入:** provider, model_name, messages/system_message/user_message
**输出:** (response_text, reasoning_text) 元组
**依赖:** litellm, langchain-core, sentence-transformers
**关键文件:** models.py, helpers/call_llm.py, helpers/providers.py

### 知识与向量存储
基于 FAISS 的向量数据库封装，支持文档相似度搜索、元数据过滤、增量插入和删除，结合 DocumentQueryStore 实现多格式文档加载与分块索引。

**接口定义:**
```python
class VectorDB:
    def __init__(self, agent: Agent, cache: bool = True): ...
    async def search_by_similarity_threshold(self, query: str, limit: int,
        threshold: float, filter: str = ""): ...
    async def search_by_metadata(self, filter: str, limit: int = 0) -> list[Document]: ...
    async def insert_documents(self, docs: list[Document]): ...
    async def delete_documents_by_ids(self, ids: list[str]): ...

class DocumentQueryStore:
    @staticmethod
    def get(agent: Agent): ...
```

**输入:** query 文本, threshold, limit, filter 条件
**输出:** Document 列表 (page_content + metadata)
**依赖:** faiss, langchain-community, simpleeval
**关键文件:** helpers/vector_db.py, helpers/document_query.py

### 插件系统
支持内置和自定义插件的发现、加载、启用/禁用和配置管理。插件通过 plugin.yaml 元数据描述，可按项目/代理粒度配置，支持热重载和 hooks 脚本。

**接口定义:**
```python
class PluginMetadata(BaseModel):
    name: str = ""
    title: str = ""
    description: str = ""
    version: str = ""
    settings_sections: List[str] = Field(default_factory=list)
    per_project_config: bool = False
    per_agent_config: bool = False
    always_enabled: bool = False

def get_enhanced_plugins_list(custom: bool = True, builtin: bool = True,
    plugin_names: list[str] | None = None) -> List[PluginListItem]: ...
def toggle_plugin(plugin_name: str, enabled: bool, project_name: str = "",
    agent_profile: str = "", clear_overrides: bool = False): ...
def get_plugin_config(plugin_name: str, agent: Agent | None = None,
    project_name: str | None = None, agent_profile: str | None = None): ...
```

**输入:** plugin_name, plugin.yaml 配置, toggle 状态
**输出:** PluginListItem, PluginMetadata, 配置 dict
**依赖:** pydantic, flask
**关键文件:** helpers/plugins.py, plugins/

### MCP 协议集成
完整的 Model Context Protocol 客户端实现，支持 StdIO 和 SSE/Streamable HTTP 两种传输方式，管理 MCP 服务器连接、工具发现和远程调用。

**接口定义:**
```python
class MCPServerRemote(BaseModel):
    async def call_tool(self, tool_name: str, input_data: Dict[str, Any]) -> CallToolResult: ...
    async def initialize(self) -> "MCPServerRemote": ...

class MCPServerLocal(BaseModel):
    async def call_tool(self, tool_name: str, input_data: Dict[str, Any]) -> CallToolResult: ...
    async def initialize(self) -> "MCPServerLocal": ...

class MCPConfig(BaseModel):
    @classmethod
    def update(cls, config_str: str) -> Any: ...
    def get_tool(self, agent: Any, tool_name: str) -> MCPTool | None: ...
    def get_tools_prompt(self, server_name: str = "") -> str: ...
```

**输入:** MCP 服务器配置 JSON, tool_name, input_data
**输出:** CallToolResult, 工具列表, 状态信息
**依赖:** mcp, pydantic, httpx, anyio
**关键文件:** helpers/mcp_handler.py, helpers/mcp_server.py

### 技能管理 (Skills)
基于 SKILL.md 标准的技能发现与加载系统，支持 YAML frontmatter 解析、触发器匹配、技能搜索和验证，兼容 Claude Code / Codex 等工具的技能格式。

**接口定义:**
```python
@dataclass(slots=True)
class Skill:
    name: str
    description: str
    path: Path
    skill_md_path: Path
    triggers: List[str] = field(default_factory=list)
    allowed_tools: List[str] = field(default_factory=list)
    content: str = ""

def list_skills(agent: Agent | None = None, include_content: bool = False) -> List[Skill]: ...
def find_skill(skill_name: str, agent: Agent | None = None,
    include_content: bool = False) -> Optional[Skill]: ...
def search_skills(query: str, limit: int = 25, agent: Agent | None = None) -> List[Skill]: ...
def load_skill_for_agent(skill_name: str, agent: Agent | None = None) -> str: ...
```

**输入:** skill_name, agent 作用域, 搜索查询
**输出:** Skill 对象列表, 技能内容字符串
**依赖:** pydantic, yaml, pathlib
**关键文件:** helpers/skills.py, skills/, tools/skills_tool.py

### 异步 Web API 处理器
基于 Flask 的异步 API 处理器抽象，支持 JSON/文件输入、CSRF 保护、认证鉴权和路由自动注册，所有 API 端点通过继承 ApiHandler 类实现。

**接口定义:**
```python
class ApiHandler:
    def __init__(self, app: Flask, thread_lock: ThreadLockType): ...

    @classmethod
    def get_methods(cls) -> list[str]: ...
    @classmethod
    def requires_auth(cls) -> bool: ...

    @abstractmethod
    async def process(self, input: Input, request: Request) -> Output: ...

    async def handle_request(self, request: Request) -> Response: ...
```

**输入:** Flask Request (JSON body / form data / files)
**输出:** JSON dict 或 Flask Response
**依赖:** flask, werkzeug
**关键文件:** helpers/api.py, api/

## 集成指南
集成 Agent Zero 的推荐方式：通过继承 `Tool` 基类实现自定义工具，利用 `@extensible` 装饰器在关键流程注入扩展逻辑。通过 `AgentConfig` 初始化 Agent 实例，使用 `AgentContext.communicate()` 发送消息并获取异步响应。对于 Web 集成，继承 `ApiHandler` 类实现 REST 端点。

## 改造文件
agent.py, models.py, helpers/tool.py, helpers/extension.py, helpers/plugins.py, helpers/mcp_handler.py, helpers/vector_db.py, helpers/skills.py, helpers/api.py, helpers/defer.py
