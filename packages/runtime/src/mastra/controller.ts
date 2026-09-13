import type { MastraCodeConfig } from '@mastra/code-sdk';
import type {
  AgentControllerMode,
  AgentControllerSubagent,
} from '@mastra/core/agent-controller';
import {
  applyModelConfigToModes,
  applyModelConfigToSubagents,
} from '../models/config.js';
import type { RuntimeModelConfig } from '../models/types.js';
import { scanExpertModes } from '../experts/scanner.js';
import { createSecurityMastraTools } from '../tools/security-tools/index.js';
import { allModes } from './modes.js';
import { applyOmConfigToInitialState } from './observational-memory.js';
import type { RuntimeObservationalMemoryConfig } from './observational-memory.js';
import type { RuntimePentestService } from '../pentest/types.js';
import type { RuntimeSandboxAdapter } from '../sandbox/types.js';

export interface ControllerConfigOptions {
  workspacePath: string;
  homeDir?: string;
  configDir?: string;
  settingsPath?: string;
  modes?: AgentControllerMode[];
  subagents?: AgentControllerSubagent[];
  models?: RuntimeModelConfig;
  extraTools?: MastraCodeConfig['extraTools'];
  disabledTools?: string[];
  /** 自定义向量库实例（注入后 code-sdk 跳过默认 mastra-vectors.db 的创建） */
  vector?: MastraCodeConfig['vector'];
  /** 用户级专家目录（~/.atlas/agents）；与工作区 <configDir>/agents/ 合并，工作区同名优先 */
  userAgentsDir?: string;
  /** Observational Memory 配置；省略时沿用 SDK 默认行为 */
  observationalMemory?: RuntimeObservationalMemoryConfig;
  /** 渗透测试服务实例（供安全工具适配层自动关联任务黑板） */
  pentestService?: RuntimePentestService;
  /** Kali 沙箱执行器；提供后注册 kali_* 工具（kali_exec / kali_session_* / kali_file_*） */
  sandbox?: RuntimeSandboxAdapter;
}

/**
 * 创建 MastraCodeConfig 配置
 *
 * 支持：
 * - 自定义 modes（默认挂载全量 modes：build/plan/fast + customModes）
 * - 自定义 subagents（覆盖或扩展 explore/plan/execute）
 * - extraTools 额外工具
 * - disabledTools 禁用工具
 */
export function createControllerConfig(
  options: ControllerConfigOptions
): MastraCodeConfig {
  const config: MastraCodeConfig = {
    cwd: options.workspacePath,
  };

  if (options.homeDir) config.homeDir = options.homeDir;
  if (options.configDir) config.configDir = options.configDir;
  if (options.settingsPath) config.settingsPath = options.settingsPath;

  // 自定义 modes（未显式传入时默认使用全量 modes）
  const modes = applyModelConfigToModes(options.modes ?? allModes, options.models);

  // 工作区专家文件（<configDir>/agents/*.md）扫描为专家 modes；坏文件跳过并告警。
  // userAgentsDir 提供时同时扫描用户级目录（工作区同名优先）。
  const expertScan = scanExpertModes({
    workspacePath: options.workspacePath,
    configDirName: options.configDir,
    ...(options.userAgentsDir ? { userDirectory: options.userAgentsDir } : {}),
  });
  for (const warning of expertScan.warnings) {
    process.stderr.write(
      `${JSON.stringify({ level: 'warn', module: 'experts', message: warning })}\n`,
    );
  }
  const mergedModes = [...(modes ?? []), ...expertScan.modes];
  if (mergedModes.length > 0) {
    config.modes = mergedModes;
  }

  // 自定义 subagents
  const subagents = applyModelConfigToSubagents(
    options.subagents,
    options.models,
  );
  if (subagents && subagents.length > 0) {
    config.subagents = subagents;
  }

  // 额外工具（挂载原生安全工具适配层，并合并外部额外工具）
  const securityTools = createSecurityMastraTools({
    workspacePath: options.workspacePath,
    pentestService: options.pentestService,
    ...(options.sandbox ? { sandbox: options.sandbox } : {})
  });
  if (typeof options.extraTools === 'function') {
    const customFn = options.extraTools;
    config.extraTools = async (ctx) => {
      const res = await customFn(ctx);
      return { ...securityTools, ...res };
    };
  } else {
    config.extraTools = {
      ...securityTools,
      ...(options.extraTools ?? {}),
    };
  }

  // 禁用工具
  if (options.disabledTools && options.disabledTools.length > 0) {
    config.disabledTools = options.disabledTools;
  }

  // 自定义向量库（注入后跳过 SDK 默认 mastra-vectors.db）
  if (options.vector) {
    config.vector = options.vector;
  }

  // Observational Memory 旋钮写入 initialState（显式配置优先于 settings 播种）
  const initialState = applyOmConfigToInitialState(config.initialState, options.observationalMemory);
  if (initialState) {
    config.initialState = initialState;
  }

  return config;
}
