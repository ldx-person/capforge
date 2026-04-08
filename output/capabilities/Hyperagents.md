# Hyperagents

## 概述
HyperAgents 是 Meta 开发的自引用自改进 Agent 框架，通过递归式的代码编辑与多代进化循环，使 LLM Agent 能够针对任意可计算任务自动优化自身代码。

## 技术栈
Python, Docker, LiteLLM, asyncio, threading, Git

## 核心能力

### Multi-Provider LLM Integration
统一的多 LLM 提供商调用接口，通过 LiteLLM 抽象层支持 OpenAI (GPT-4o/o3/o4/GPT-5)、Anthropic (Claude Sonnet/Haiku) 和 Google Gemini 等模型，内置指数退避重试机制确保 API 调用可靠性。自动处理不同模型的参数差异（如 temperature 和 max_tokens 的不同行为）。

**接口定义:**
```python
@backoff.on_exception(backoff.expo, (requests.exceptions.RequestException, json.JSONDecodeError, KeyError), max_time=600, max_value=60)
def get_response_from_llm(
    msg: str,
    model: str = OPENAI_MODEL,
    temperature: float = 0.0,
    max_tokens: int = MAX_TOKENS,
    msg_history=None,
) -> Tuple[str, list, dict]
```

**输入:** msg (提示文本), model (模型标识符), temperature, max_tokens, msg_history (对话历史)
**输出:** (response_text, new_msg_history, info) 三元组
**依赖:** litellm, backoff, requests, python-dotenv
**关键文件:** agent/llm.py

### Agent System Framework
抽象基类框架，定义了可自改进 Agent 的核心生命周期。通过继承 AgentSystem 并实现 forward() 方法构建自定义 Agent，内置线程安全的日志管理器和持久化聊天历史。MetaAgent 和 TaskAgent 是两个核心实现。

**接口定义:**
```python
class AgentSystem(ABC):
    def __init__(self, model=OPENAI_MODEL, chat_history_file='./outputs/chat_history.md'):
        ...
    @abstractmethod
    def forward(self, *args, **kwargs):
        pass

class MetaAgent(AgentSystem):
    def forward(self, repo_path, eval_path, iterations_left=None): ...

class TaskAgent(AgentSystem):
    def forward(self, inputs) -> tuple: ...
```

**输入:** model (LLM 模型), chat_history_file (历史持久化路径), forward 方法的领域特定参数
**输出:** MetaAgent 生成代码补丁, TaskAgent 返回 (prediction, msg_history)
**依赖:** abc, threading, agent.llm, agent.llm_withtools
**关键文件:** agent/base_agent.py, meta_agent.py, task_agent.py

### Tool-Use Agent Loop
支持工具调用的 Agent 对话循环，动态加载工具并注入格式化的工具描述到系统提示中。支持多轮工具调用、JSON 格式的工具调用解析、上下文溢出重试检测，以及最大工具调用次数限制。

**接口定义:**
```python
def chat_with_agent(
    msg,
    model="claude-4-sonnet-genai",
    msg_history=None,
    logging=print,
    tools_available=[],       # [] = 无工具, 'all' = 全部工具
    multiple_tool_calls=False,
    max_tool_calls=40,
) -> list:  # 返回 msg_history
```

**输入:** msg (用户指令), model, tools_available (工具列表或 'all'), max_tool_calls
**输出:** new_msg_history (完整的消息历史列表)
**依赖:** agent.llm, agent.tools
**关键文件:** agent/llm_withtools.py

### Dynamic Tool Loading System
可扩展的工具动态加载与注册系统，遵循 tool_info() + tool_function() 约定。内置 bash 执行工具和文件编辑工具（支持 view/create/str_replace/insert/undo_edit 操作）。新工具只需实现这两个函数即可自动注册。

**接口定义:**
```python
# 工具加载器
def load_tools(logging=print, names=[]) -> list[dict]:
    # 返回 [{'info': tool_info(), 'function': tool_function, 'name': tool_name}, ...]

# 工具约定（每个工具模块必须实现）
def tool_info() -> dict: ...     # 返回名称、描述、输入 schema
def tool_function(**kwargs): ...  # 执行工具逻辑
```

**输入:** logging (日志函数), names (要加载的工具名列表或 'all')
**输出:** 工具字典列表，包含 info (元数据) 和 function (可调用函数)
**依赖:** importlib, pathlib
**关键文件:** agent/tools/__init__.py, agent/tools/bash.py, agent/tools/edit.py

### Async Bash Execution
异步 Bash 会话管理，提供持久化的 shell 环境用于安全执行命令。支持超时控制（默认 120 秒）、输出缓冲、错误过滤，以及 sentinel 标记的输出边界检测。

**接口定义:**
```python
class BashSession:
    def __init__(self):
        self._timeout = 120.0
        self._sentinel = "<<exit>>"
    async def start(self): ...
    async def run(self, command) -> tuple[str, str]: ...
    def stop(self): ...

def tool_function(command: str) -> str:
    return asyncio.run(tool_function_call(command))
```

**输入:** command (bash 命令字符串)
**输出:** stdout + stderr 合并的结果字符串
**依赖:** asyncio, os
**关键文件:** agent/tools/bash.py

### File Editor Tool
全面的文件系统操作工具，支持查看（带行号）、创建、字符串替换、行插入和撤销编辑五种操作。内置路径验证、内容截断、编辑历史栈，确保操作的安全性和可回溯性。

**接口定义:**
```python
def tool_function(command, path, file_text=None, view_range=None, old_str=None, new_str=None, insert_line=None) -> str:
    # command: "view" | "create" | "str_replace" | "insert" | "undo_edit"

class FileHistory:
    def add(self, path, content): ...
    def undo(self, path) -> str | None: ...
```

**输入:** command (操作类型), path (文件绝对路径), 以及操作相关的 file_text/old_str/new_str/insert_line/view_range
**输出:** 操作结果描述字符串（含行号格式化的文件内容）
**依赖:** pathlib, subprocess
**关键文件:** agent/tools/edit.py

### Docker Container Management
完整的 Docker 容器生命周期管理，包括镜像构建、GPU 支持（自动检测 Docker/Podman 环境）、文件双向拷贝、命令执行与日志记录。支持条件性 GPU 直通和 Genesis 仿真环境初始化验证。

**接口定义:**
```python
def build_container(client, repo_path="./", image_name="app", container_name="app-container", force_rebuild=False, domains=None, verbose=True) -> Container: ...
def copy_to_container(container, source_path: Union[str, Path], dest_path: Union[str, Path], verbose=True) -> None: ...
def copy_from_container(container, source_path: Union[str, Path], dest_path: Union[str, Path], verbose=True) -> None: ...
def cleanup_container(container, verbose=True): ...
def setup_logger(log_file) -> logging.Logger: ...
def safe_log(message: str, level=int, verbose=True): ...
```

**输入:** client (Docker 客户端), repo_path (仓库路径), domains (用于 GPU 检测)
**输出:** Container 对象，文件拷贝结果
**依赖:** docker, tarfile, threading
**关键文件:** utils/docker_utils.py

### Evolutionary Generate Loop
核心进化循环，实现自改进 Agent 的多代迭代流程。包含：meta agent 代码生成、Docker 沙箱内评估、staged evaluation（小样本预筛再全量评估）、多域并行评估、ensemble 评分、多种父代选择策略（score_prop / score_child_prop / best / random / latest），以及可视化分析。

**接口定义:**
```python
def generate_loop(
    domains: list,         # 评估领域列表
    run_id=None,
    max_generation=3,
    eval_samples=-1,
    eval_workers=5,
    parent_selection="score_prop",  # "random"|"latest"|"best"|"score_prop"|"score_child_prop"
    resume_from=None,
    run_baseline=None,     # "no_selfimprove"|"no_archive"|"dgm"|"dgm_custom"|...
    optimize_option="only_agent",  # "both_agent_ensemble"|"only_agent"|"only_ensemble"
    eval_test=False,
    skip_staged_eval=False,
) -> str:  # 返回 output_dir
```

**输入:** domains (评估域), max_generation (最大代数), parent_selection (选择策略)
**输出:** output_dir (输出目录路径)
**依赖:** docker, concurrent.futures, numpy
**关键文件:** generate_loop.py, utils/gl_utils.py

### Domain Evaluation Harness
可扩展的多域评估框架，支持人类偏好任务、BALROG 游戏环境、Genesis 机器人控制、IMO 数学竞赛和 Polyglot 代码生成等多种评估域。通过动态模块加载和统一的 harness/report 接口实现新域的快速接入。

**接口定义:**
```python
def harness(agent_path="./task_agent.py", output_dir="./outputs", run_id=None, domain="search_arena", num_samples=-1, num_workers=5, subset="") -> str: ...
def report(dname, domain, suffix="") -> tuple[dict, str]: ...
```

**输入:** agent_path (Agent 文件路径), domain (评估域标识), num_samples (样本数)
**输出:** output_folder (评估结果目录), report JSON (准确率、精度、召回率等指标)
**依赖:** pandas, importlib, hydra-core (用于 BALROG/Genesis)
**关键文件:** domains/harness.py, domains/report.py, utils/domain_utils.py

## 集成指南
集成 HyperAgents 的推荐方式是继承 AgentSystem 基类并实现 forward() 方法来构建自定义 Agent。使用 get_response_from_llm() 获取统一的 LLM 调用能力，通过 load_tools() 注册自定义工具模块。整个进化流程通过调用 generate_loop() 一键启动，需提前配置好 Docker 环境和 LLM API 密钥（OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY）。新评估域只需在 domains/ 目录下实现对应的 utils 模块（定义 format_input_dict, QUESTION_ID, MODEL 等接口）。

## 改造文件
agent/base_agent.py, agent/llm.py, agent/llm_withtools.py, agent/tools/__init__.py, agent/tools/bash.py, agent/tools/edit.py, meta_agent.py, task_agent.py, generate_loop.py, ensemble.py, select_next_parent.py, domains/harness.py, domains/report.py, utils/common.py, utils/docker_utils.py, utils/gl_utils.py, utils/domain_utils.py, utils/git_utils.py, utils/thread_logger.py
