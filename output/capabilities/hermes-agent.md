# hermes-agent

## 概述
跨平台 AI 智能体网关与工具执行框架,支持 WhatsApp/Telegram/Discord 等 15+ 消息平台,通过 ACP 协议实现编辑器集成,并提供可扩展的 LLM Provider 抽象与工具注册系统。

## 技术栈
Python, LLM Integration (OpenAI/Anthropic/OpenRouter), ACP Protocol, SQLite, Docker, Node.js, asyncio

## 核心能力

### platform_adapter
多平台消息网关适配器,基于抽象基类 BasePlatformAdapter 实现统一的收发消息接口。支持 15+ 平台(Telegram, Discord, WhatsApp, Slack, Signal, Matrix, Feishu, WeCom 等),通过标准化 MessageEvent 和 SendResult 数据结构屏蔽平台差异,支持图片/音频/文档缓存与重试机制。

**接口定义:**
```python
class BasePlatformAdapter(ABC):
    def __init__(self, config: PlatformConfig, platform: Platform):
        ...
    @abstractmethod
    async def send_message(self, recipient: str, text: str, **kwargs) -> SendResult: ...
    @abstractmethod
    async def start(self, message_handler: MessageHandler) -> None: ...
    @abstractmethod
    async def stop(self) -> None: ...

@dataclass
class SendResult:
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    retryable: bool = False

@dataclass
class MessageEvent:
    text: str
    message_type: MessageType = MessageType.TEXT
    source: SessionSource = None
    media_urls: List[str] = field(default_factory=list)
```

**输入:** PlatformConfig 配置对象, MessageEvent 标准化消息
**输出:** SendResult 发送结果, MessageHandler 消息处理回调
**依赖:** aiohttp, httpx, python-telegram-bot, discord.py
**关键文件:** gateway/platforms/base.py, gateway/platforms/whatsapp.py, gateway/platforms/telegram.py, gateway/config.py, gateway/session.py

### acp_server
Agent Communication Protocol (ACP) 服务器实现,将 Hermes 智能体暴露为标准 ACP Agent,支持编辑器(如 VS Code Copilot)通过 JSON-RPC 协议进行会话管理、工具调用审批、MCP Server 注册等操作,实现 IDE 原生集成。

**接口定义:**
```python
class HermesACPAgent(acp.Agent):
    _SLASH_COMMANDS = {
        "help": "Show available commands",
        "model": "Show or change current model",
        "tools": "List available tools",
        "context": "Show conversation context info",
        "reset": "Clear conversation history",
        "compact": "Compress conversation context",
        "version": "Show Hermes version",
    }

    def __init__(self, session_manager: SessionManager | None = None):
        super().__init__()
        self.session_manager = session_manager or SessionManager()
        self._conn: Optional[acp.Client] = None

    def on_connect(self, conn: acp.Client) -> None: ...
```

**输入:** ACP JSON-RPC 请求(session 生命周期, prompt, 权限请求)
**输出:** ACP 会话更新(tool call 进度, 消息, 思考过程)
**依赖:** acp SDK, httpx, tenacity
**关键文件:** acp_adapter/server.py, acp_adapter/entry.py, acp_adapter/events.py, acp_adapter/permissions.py, acp_adapter/session.py

### tool_executor
可扩展的工具执行框架,支持 40+ 内置工具(终端执行、文件操作、Web 搜索、浏览器自动化、代码执行、任务委派等),通过 toolsets 系统按场景分组,工具自注册到 registry 中,支持异步桥接和并行执行。

**接口定义:**
```python
def get_tool_definitions(
    enabled_toolsets: Optional[List[str]] = None,
    disabled_toolsets: Optional[List[str]] = None,
    quiet_mode: bool = False,
) -> list

def handle_function_call(
    function_name: str,
    function_args: Dict[str, Any],
    task_id: str,
    user_task: str = "",
) -> str
```

**输入:** function_name 工具标识符, function_args 工具参数字典, task_id 任务隔离标识
**输出:** JSON 格式的工具执行结果字符串
**依赖:** tools/ 目录下各工具模块, toolsets 分组系统
**关键文件:** model_tools.py, toolsets.py, toolset_distributions.py, tools/registry.py

### llm_provider
多 LLM Provider 运行时解析系统,支持 109+ 提供商(OpenAI, Anthropic, OpenRouter, Copilot 等),通过 CredentialPool 实现多凭证轮询与自动故障转移,支持三种 API 模式(chat_completions, codex_responses, anthropic_messages)自动切换,以及本地模型自动检测。

**接口定义:**
```python
def resolve_runtime_provider(requested: Optional[str] = None) -> Dict[str, Any]:
    """Resolve the full runtime provider config (base_url, api_key, api_mode, provider)."""
    ...

# Returns:
# {
#     "provider": str,
#     "api_mode": str,           # "chat_completions" | "codex_responses" | "anthropic_messages"
#     "base_url": str,
#     "api_key": str,
#     "source": str,             # "pool" | "env" | "config"
#     "credential_pool": CredentialPool | None,
#     "requested_provider": str,
# }

@dataclass(frozen=True)
class HermesOverlay:
    transport: str = "openai_chat"     # openai_chat | anthropic_messages | codex_responses
    is_aggregator: bool = False
    auth_type: str = "api_key"         # api_key | oauth_device_code | oauth_external | external_process
    extra_env_vars: Tuple[str, ...] = ()
    base_url_override: str = ""
    base_url_env_var: str = ""
```

**输入:** provider 名称(可选, 从 config/env 自动解析)
**输出:** 包含 provider, api_mode, base_url, api_key 的运行时配置字典
**依赖:** openai, anthropic SDK, CredentialPool, models.dev 目录
**关键文件:** hermes_cli/runtime_provider.py, hermes_cli/providers.py, agent/credential_pool.py, hermes_cli/auth.py

### session_store
基于 SQLite 的会话持久化存储,支持 WAL 模式并发读写、FTS5 全文搜索、会话分叉与恢复,以及消息级别的 token 统计和计费追踪。通过应用层随机抖动重试解决多进程写锁竞争问题。

**接口定义:**
```python
class SessionDB:
    def __init__(self, db_path: Path = None): ...

    def _execute_write(self, fn: Callable[[sqlite3.Connection], T]) -> T:
        """Execute a write transaction with BEGIN IMMEDIATE and jitter retry."""
        ...

class SessionManager:
    def __init__(self, agent_factory=None, db=None): ...

    def create_session(self, cwd: str = ".") -> SessionState: ...
    def get_session(self, session_id: str) -> Optional[SessionState]: ...
    def remove_session(self, session_id: str) -> bool: ...
    def fork_session(self, session_id: str, cwd: str = ".") -> Optional[SessionState]: ...
    def list_sessions(self) -> List[Dict[str, Any]]: ...

@dataclass
class SessionState:
    session_id: str
    agent: Any             # AIAgent instance
    cwd: str = "."
    model: str = ""
    history: List[Dict[str, Any]] = field(default_factory=list)
    cancel_event: Any = None
```

**输入:** SessionState 会话状态对象, Message 消息对象, session_id 标识符
**输出:** Session 会话对象, 消息历史列表, FTS5 搜索结果
**依赖:** sqlite3 (WAL mode), threading, pydantic
**关键文件:** hermes_state.py, acp_adapter/session.py, gateway/session.py

### event_hook_system
轻量级事件驱动钩子系统,在网关生命周期关键点(gateway:startup, session:start/end, agent:start/step/end, command:*)触发用户自定义处理器。钩子通过 ~/.hermes/hooks/ 目录发现,每个钩子包含 HOOK.yaml 元数据和 handler.py 处理函数。

**接口定义:**
```python
class HookRegistry:
    def __init__(self): ...

    def discover_and_load(self) -> None:
        """Scan the hooks directory for hook directories and load their handlers."""
        ...

    async def emit(self, event_type: str, context: Dict[str, Any]) -> None:
        """Fire all registered handlers for the given event type."""
        ...

    @property
    def loaded_hooks(self) -> List[dict]:
        """Return metadata about all loaded hooks."""
        ...

# Events:
#   gateway:startup, session:start, session:end, session:reset,
#   agent:start, agent:step, agent:end, command:*
```

**输入:** event_type 事件类型字符串, context 事件上下文字典
**输出:** 异步分发到已注册的处理器(无返回值)
**依赖:** yaml, asyncio, importlib
**关键文件:** gateway/hooks.py, gateway/builtin_hooks/

### permission_handler
ACP 权限审批桥接系统,将 ACP 客户端的权限请求映射为 Hermes 内部的审批回调。支持 once/always/deny 三种决策模式,内置超时自动拒绝机制,确保工具调用在用户授权后才执行。

**接口定义:**
```python
def make_approval_callback(
    request_permission_fn: Callable,
    loop: asyncio.AbstractEventLoop,
    session_id: str,
    timeout: float = 60.0,
) -> Callable[[str, str], str]:
    """Return a hermes-compatible approval_callback(command, description) -> str.

    Returns one of: "once", "always", "deny"
    """

# Maps ACP PermissionOptionKind -> hermes approval result strings:
_KIND_TO_HERMES = {
    "allow_once": "once",
    "allow_always": "always",
    "reject_once": "deny",
    "reject_always": "deny",
}
```

**输入:** request_permission_fn ACP 权限请求函数, session_id 会话 ID, timeout 超时秒数
**输出:** Callable[[str, str], str] 审批回调函数, 返回 "once"/"always"/"deny"
**依赖:** acp SDK, asyncio
**关键文件:** acp_adapter/permissions.py

### agent_loop
多轮智能体循环引擎,基于 OpenAI 规范的 tool calling 实现自动工具调用循环。支持任意返回 ChatCompletion 对象的服务器(VLLM, SGLang, OpenRouter, OpenAI API),包含推理内容提取、工具错误追踪、最大轮次限制等特性。

**接口定义:**
```python
@dataclass
class AgentResult:
    messages: List[Dict[str, Any]]         # Full conversation history in OpenAI message format
    managed_state: Optional[Dict[str, Any]] = None
    turns_used: int = 0
    finished_naturally: bool = False
    reasoning_per_turn: List[Optional[str]] = field(default_factory=list)
    tool_errors: List[ToolError] = field(default_factory=list)

@dataclass
class ToolError:
    turn: int
    tool_name: str
    arguments: str
    error: str
    tool_result: str

def resize_tool_pool(max_workers: int):
    """Replace the global tool executor with a new one of the given size."""
    ...
```

**输入:** messages 对话历史, tools 工具定义列表, max_turns 最大轮次
**输出:** AgentResult 包含完整对话历史、使用轮次、工具错误记录
**依赖:** openai SDK, model_tools, concurrent.futures
**关键文件:** environments/agent_loop.py

### tool_context
为 RL 训练 reward 函数提供的无限制工具访问上下文,绑定到特定 rollout 的 task_id,使验证函数可以直接使用所有 hermes-agent 工具(终端、文件读写、Web 搜索等),所有操作共享同一沙箱环境。

**接口定义:**
```python
class ToolContext:
    def __init__(self, task_id: str): ...

    def terminal(self, command: str, timeout: int = 180) -> Dict[str, Any]:
        """Run a command in the rollout's terminal session."""
        ...

    def read_file(self, path: str) -> Dict[str, Any]:
        """Read a file from the rollout's filesystem."""
        ...

    def write_file(self, path: str, content: str) -> Dict[str, Any]:
        """Write a TEXT file in the rollout's filesystem."""
        ...

    def upload_file(self, local_path: str, remote_path: str) -> Dict[str, Any]:
        """Upload a local file to the rollout's sandbox (binary-safe)."""
        ...
```

**输入:** task_id 任务隔离标识符, 各工具的参数(command/path/content)
**输出:** Dict[str, Any] 各工具的执行结果(exit_code, output, content 等)
**依赖:** model_tools, tools.terminal_tool, tools.browser_tool
**关键文件:** environments/tool_context.py

### memory_provider
可插拔的记忆持久化 Provider 抽象基类,支持内置记忆(MEMORY.md/USER.md)和外部 Provider(Honcho, Hindsight, Mem0 等)。通过生命周期方法(initialize, prefetch, sync_turn)管理会话记忆,支持 per-profile 隔离和子代理上下文过滤。

**接口定义:**
```python
class MemoryProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    def initialize(self, session_id: str, **kwargs) -> None: ...

    @abstractmethod
    def system_prompt_block(self) -> str: ...

    @abstractmethod
    def prefetch(self, query: str) -> None: ...

    @abstractmethod
    def sync_turn(self, user_message: str, assistant_message: str) -> None: ...

    @abstractmethod
    def get_tool_schemas(self) -> List[Dict]: ...

    @abstractmethod
    def handle_tool_call(self, tool_name: str, arguments: Dict) -> str: ...
```

**输入:** session_id 会话标识, query 查询文本, user/assistant 消息对
**输出:** system prompt 块, 工具 schema 列表, 工具调用结果, 记忆召回内容
**依赖:** abc, 各外部 Provider SDK
**关键文件:** agent/memory_provider.py, agent/builtin_memory_provider.py, agent/memory_manager.py

## 集成指南
通过实现项目提供的抽象接口并使用依赖注入进行松耦合集成:实现 BasePlatformAdapter 以接入新的消息平台;实现 MemoryProvider 以接入自定义记忆后端;通过 resolve_runtime_provider() 配置 LLM Provider;调用 register_tool() 注册自定义工具到工具注册表;通过 HookRegistry.emit() 订阅生命周期事件;使用 ToolContext 为 RL 训练环境提供工具访问能力。

## 改造文件
gateway/platforms/base.py, gateway/platforms/whatsapp.py, gateway/config.py, gateway/hooks.py, gateway/session.py, acp_adapter/server.py, acp_adapter/permissions.py, acp_adapter/session.py, acp_adapter/events.py, acp_adapter/entry.py, environments/agent_loop.py, environments/tool_context.py, environments/hermes_base_env.py, hermes_cli/runtime_provider.py, hermes_cli/providers.py, hermes_cli/main.py, agent/credential_pool.py, agent/memory_provider.py, hermes_state.py, model_tools.py, toolsets.py
