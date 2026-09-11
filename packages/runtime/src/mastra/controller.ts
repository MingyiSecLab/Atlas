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
import { allModes } from './modes.js';
import { applyOmConfigToInitialState } from './observational-memory.js';
import type { RuntimeObservationalMemoryConfig } from './observational-memory.js';

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
  /** Observational Memory 配置；省略时沿用 SDK 默认行为 */
  observationalMemory?: RuntimeObservationalMemoryConfig;
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

  // 工作区专家文件（<configDir>/agents/*.md）扫描为专家 modes；坏文件跳过并告警
  const expertScan = scanExpertModes({
    workspacePath: options.workspacePath,
    configDirName: options.configDir,
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

  // 额外工具
  if (options.extraTools) {
    config.extraTools = options.extraTools;
  }

  // 禁用工具
  if (options.disabledTools && options.disabledTools.length > 0) {
    config.disabledTools = options.disabledTools;
  }

  // Observational Memory 旋钮写入 initialState（显式配置优先于 settings 播种）
  const initialState = applyOmConfigToInitialState(config.initialState, options.observationalMemory);
  if (initialState) {
    config.initialState = initialState;
  }

  return config;
}
