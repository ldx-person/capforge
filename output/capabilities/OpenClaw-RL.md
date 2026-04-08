# OpenClaw-RL

## 概述
OpenClaw-RL 是一个全异步强化学习框架，通过拦截多轮对话自动收集训练轨迹并持续优化 LLM 策略，支持 Binary RL、OPD 蒸馏和 Combine 三种优化范式，覆盖个人 Agent 优化和终端/GUI/SWE/工具调用等真实世界 Agentic RL 场景。

## 技术栈
Python, TypeScript, PyTorch, FastAPI, SGLang, Megatron-LM, Ray, HuggingFace Transformers, LoRA, Docker, aiohttp, uvicorn

## 核心能力

### Binary RL 训练管线 (GRPO)
基于 Process Reward Model (PRM) 的二元强化学习训练管线。PRM 利用下一状态（用户反馈、环境反馈、工具返回值）作为证据，通过 m-vote 多数投票机制评估每一步的好坏，生成标量奖励信号用于 GRPO advantage 估计和 PPO clipped surrogate loss 优化。整个流程全异步运行，模型在服务请求的同时后台持续训练。

**接口定义:**
```python
class OpenClawAPIServer:
    def __init__(self, args, output_queue: queue.Queue, submission_enabled: threading.Event): ...
    def start(self): ...
    def stop(self): ...
    def pause_submission(self): ...
    def resume_submission(self): ...

def generate_rollout_openclaw(args, rollout_id, data_buffer, evaluation=False) -> RolloutFnTrainOutput: ...

async def reward_func(args, sample_or_samples, **kwargs) -> dict:
    # 返回 {"score": float} 格式的奖励
```

**输入:** 多轮对话消息（通过 OpenAI-compatible API），PRM 评分参数 (prm_m, prm_temperature, prm_max_tokens)
**输出:** RolloutFnTrainOutput (包含带奖励分数的 Sample 列表和训练指标)
**依赖:** FastAPI, uvicorn, httpx, SGLang, slime, torch
**关键文件:** openclaw-rl/openclaw_api_server.py, openclaw-rl/openclaw_rollout.py

### On-Policy Distillation (OPD) 蒸馏训练
OPD 利用下一状态中的 hindsight 信息，让 judge 模型提取文本提示（hint），将 hint 追加到原始 prompt 中构建增强版 teacher，计算 teacher 与 student 在 token 级别的 log-probability 差作为方向性 advantage 信号。支持 Top-K logits 蒸馏（带 tail trick），提供比标量奖励更丰富的 token 级监督信号。

**接口定义:**
```python
class OpenClawOPDAPIServer:
    def __init__(self, args, output_queue: queue.Queue, submission_enabled: threading.Event): ...
    async def _opd_evaluate(self, session_id, turn_num, turn_data, next_state) -> dict: ...
    async def _compute_teacher_log_probs(self, input_ids: list[int], response_len: int) -> list[float]: ...
    async def _compute_teacher_topk_logprobs(self, input_ids, response_len) -> tuple[list[list[float]], list[list[int]]]: ...

def topk_distillation_loss_function(
    args: Namespace, batch: dict, logits: torch.Tensor,
    sum_of_sample_mean: Callable[[torch.Tensor], torch.Tensor],
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]: ...
```

**输入:** 多轮对话消息，PRM/Judge 模型端点，distill_topk 参数
**输出:** 带 teacher_log_probs 和 teacher_topk_log_probs 的 Sample，Top-K KL distillation loss
**依赖:** FastAPI, torch, httpx, SGLang, slime, megatron_core
**关键文件:** openclaw-opd/openclaw_opd_api_server.py, openclaw-opd/openclaw_opd_rollout.py, openclaw-opd/topk_distillation_loss.py

### Combine 混合优化训练
Combine 方法将 Binary RL 和 OPD 蒸馏统一在一个训练流程中。每个 turn 最多产生一个 sample，当 hint-judge 和 eval-judge 同时成功时，sample 同时携带 teacher log-probs 和 RL reward，combined advantage = w_opd * (teacher - old) + w_rl * grpo_advantage，两种信号互补实现更强更鲁棒的优化。

**接口定义:**
```python
class OpenClawCombineAPIServer(OpenClawOPDAPIServer):
    async def _submit_turn_sample(self, turn_data, session_id, opd_result, reward=0.0): ...
    async def _submit_rl_turn_sample(self, turn_data, session_id, eval_score): ...
    def _maybe_submit_ready_samples(self, session_id, force_drop_without_next_state=False): ...

def combine_loss_function(
    args: Namespace, batch: dict, logits: torch.Tensor,
    sum_of_sample_mean: Callable[[torch.Tensor], torch.Tensor],
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]: ...
```

**输入:** 多轮对话消息，OPENCLAW_COMBINE_W_OPD / OPENCLAW_COMBINE_W_RL 权重参数
**输出:** 混合 advantage 的 Sample 列表，含 pg_loss / kl_loss / entropy_loss 的 reported_loss
**依赖:** FastAPI, torch, httpx, SGLang, slime, megatron_core
**关键文件:** openclaw-combine/openclaw_combine_api_server.py, openclaw-combine/openclaw_combine_rollout.py, openclaw-combine/combine_loss.py

### OpenClaw 插件扩展系统 (TypeScript)
TypeScript 实现的 OpenClaw 浏览器插件，拦截所有发往 LLM 的 fetch 请求，自动注入 X-Session-Id 和 X-Turn-Type 请求头，使 OpenClaw 的每次对话都被 RL 服务器正确追踪和分类为 main（可训练）或 side（非训练）turn。

**接口定义:**
```typescript
type RlTrainingConfig = {
  sessionIdHeader: string;
  turnTypeHeader: string;
};

export default function register(api: OpenClawPluginApi): void {
  // 拦截 globalThis.fetch，注入 session 跟踪 header
}
```

**输入:** OpenClawPluginApi 实例，pluginConfig 配置
**输出:** 带有自动 session/turn 类型标注的 HTTP 请求
**依赖:** OpenClaw Plugin SDK, Node.js AsyncLocalStorage
**关键文件:** extensions/rl-training-headers/index.ts

### GUI 桌面环境 Provider 抽象层
为 GUI Agent RL 提供多云/多虚拟化后端的统一抽象接口。支持 Docker、VirtualBox、VMware、AWS、Azure、GCP、Aliyun、Volcengine 等多种基础设施，通过 Provider 和 VMManager 两个抽象基类实现环境创建、快照保存/恢复、生命周期管理等核心功能。

**接口定义:**
```python
class Provider(ABC):
    @abstractmethod
    def start_emulator(self, path_to_vm: str, headless: bool): ...
    @abstractmethod
    def get_ip_address(self, path_to_vm: str) -> str: ...
    @abstractmethod
    def save_state(self, path_to_vm: str, snapshot_name: str): ...
    @abstractmethod
    def revert_to_snapshot(self, path_to_vm: str, snapshot_name: str) -> str: ...
    @abstractmethod
    def stop_emulator(self, path_to_vm: str): ...

class VMManager(ABC):
    @abstractmethod
    def initialize_registry(self, **kwargs): ...
    @abstractmethod
    def get_vm_path(self, **kwargs): ...
    @abstractmethod
    def list_free_vms(self, **kwargs): ...
```

**输入:** VM 配置路径、快照名称、区域信息
**输出:** 虚拟机 IP 地址、快照操作结果、VM 注册表管理
**依赖:** ABC, 云服务商 SDK (boto3, azure, google-cloud 等)
**关键文件:** gui-rl/desktop_env/providers/base.py, gui-rl/desktop_env/providers/docker/provider.py, gui-rl/desktop_env/providers/aws/provider.py, gui-rl/desktop_env/providers/azure/provider.py

### SWE 进程奖励模型 (SweRewardAgent)
面向软件工程 Agent 的步级 PRM 评估系统。针对 SWE-bench 场景，将 issue 描述、Agent 历史步骤和当前命令执行结果构建 prompt，通过 m-vote 多数投票评估每一步的质量（+1/-1），提供步级奖励信号用于 step-wise GRPO 训练。

**接口定义:**
```python
class SweRewardAgent:
    def __init__(self, max_history_steps=8, max_problem_len=8000, max_output_len=4000, skip_submit=True, tokenizer=None): ...
    async def judge_step(self, args, *, problem_statement: str, step_debug: list[dict],
                         policy_response: str, step_index: int) -> Dict[str, Any]: ...
    def submit_step_judge(self, args, *, problem_statement, step_debug, policy_response, step_index) -> asyncio.Task: ...
    async def collect_step_results(self, pending_tasks: list[tuple[int, asyncio.Task]]) -> tuple[list[float], list[dict]]: ...
```

**输入:** Issue 描述，Agent 步骤历史（含命令和执行结果），当前步骤响应
**输出:** 每步的 PRM 评分（+1/-1），投票详情，mean_score
**依赖:** asyncio, SGLang, slime, transformers (tokenizer)
**关键文件:** swe-rl/swe_prm.py, swe-rl/generate_with_swe_remote.py

### Terminal 环境路由服务
为 Terminal Agent RL 提供多 Worker 负载均衡路由。通过 consistent-hash 策略将任务分配到多个环境 Worker，支持 allocate/reset/exec_tool/evaluate/close 等环境操作，内置故障转移和重试机制，实现终端沙箱环境的大规模并行。

**接口定义:**
```python
class Router:
    def __init__(self, worker_urls: list[str], forward_timeout=600.0, forward_retries=1, forward_retry_backoff=0.2): ...
    def select_worker(self, task_key: str) -> tuple[int, str]: ...
    async def forward(self, worker_url, path, payload, timeout=None) -> tuple[dict, int]: ...
    async def forward_by_lease(self, global_lease, path, payload, timeout=None) -> tuple[dict, int]: ...
```

**输入:** task_key（任务标识），Worker URL 列表
**输出:** 环境操作结果（allocate 返回 lease_id，exec_tool 返回执行结果）
**依赖:** FastAPI, aiohttp, uvicorn
**关键文件:** terminal-rl/router_server.py, terminal-rl/env_client.py

### Tool-call 安全沙箱
为 Tool-call Agent RL 提供安全的 Python 代码执行环境和工具注册管理。PythonSandbox 通过危险模式扫描、白名单模块限制、资源限制（内存/超时）确保代码安全执行。ToolRegistry 提供工具注册、查询和并发执行管理。

**接口定义:**
```python
class PythonSandbox:
    def __init__(self, timeout: int = 10, memory_limit: str = "100MB"): ...
    def _check_code_safety(self, code: str) -> tuple[bool, str]: ...
    async def execute_code(self, code: str) -> str: ...

class ToolRegistry:
    def register_tool(self, name: str, tool_spec: dict[str, Any]): ...
    def get_tool_specs(self) -> list[dict[str, Any]]: ...
    async def execute_tool(self, tool_name: str, arguments: dict[str, Any]) -> str: ...
```

**输入:** Python 代码字符串，工具调用名称和参数
**输出:** 代码执行结果文本，工具执行返回值
**依赖:** asyncio, subprocess, psutil
**关键文件:** toolcall-rl/tool_sandbox.py, toolcall-rl/generate_with_retool.py

### Tinker 云端训练部署
基于 Tinker API 的零 GPU 训练部署方案，支持 RL/OPD/Combine 三种方法。通过 TinkerConfig 统一配置模型（LoRA）、教师模型、训练超参、PRM 参数和代理服务器，无需本地 GPU 即可运行 OpenClaw-RL 的全部优化流程。

**接口定义:**
```python
@dataclass
class TinkerConfig:
    method: str = "rl"  # "rl", "opd", or "combine"
    model_name: str = "Qwen/Qwen3-4B-Instruct-2507"
    lora_rank: int = 32
    teacher_model_name: str = ""
    learning_rate: float = 1e-4
    batch_size: int = 4
    max_steps: int = 1000
    w_opd: float = 1.0
    w_rl: float = 1.0
    prm_m: int = 3
    prm_temperature: float = 0.6
    prm_max_tokens: int = 4096
    proxy_host: str = "0.0.0.0"
    proxy_port: int = 30000
```

**输入:** TinkerConfig 配置，TINKER_API_KEY 环境变量
**输出:** 训练后的 LoRA 权重，训练指标（可推送至 wandb）
**依赖:** Tinker API, torch, LoRA, transformers
**关键文件:** openclaw-tinker/run.py, openclaw-tinker/config.py, openclaw-tinker/trainer.py, openclaw-tinker/api_server.py

## 集成指南
OpenClaw-RL 采用模块化设计，每个优化方法（Binary RL / OPD / Combine）作为独立目录提供 API Server 和 Rollout 函数。集成时需：1) 在 slime 框架中通过 `--rollout-function-path` 和 `--custom-loss-function-path` 指定对应模块的入口函数；2) 安装 rl-training-headers 插件到 OpenClaw 使对话请求自动携带 session 跟踪头；3) 将 OpenClaw 的模型 provider 指向 RL proxy 服务器的 `http://<HOST>:30000/v1` 端点。对于通用 Agent RL（终端/GUI/SWE/工具调用），可直接使用各场景的 launch 脚本启动 slime 框架。

## 改造文件
openclaw-rl/openclaw_api_server.py, openclaw-rl/openclaw_rollout.py, openclaw-opd/openclaw_opd_api_server.py, openclaw-opd/openclaw_opd_rollout.py, openclaw-opd/topk_distillation_loss.py, openclaw-combine/openclaw_combine_api_server.py, openclaw-combine/openclaw_combine_rollout.py, openclaw-combine/combine_loss.py, extensions/rl-training-headers/index.ts, gui-rl/desktop_env/providers/base.py, gui-rl/gui_data_source.py, swe-rl/swe_prm.py, terminal-rl/router_server.py, toolcall-rl/tool_sandbox.py, openclaw-tinker/config.py, openclaw-tinker/run.py
