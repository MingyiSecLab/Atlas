import type { AgentControllerSubagent } from '@mastra/core/agent-controller';
import { docWriterSubagent } from './documentation-writer.js';
import { perfOptimizerSubagent } from './performance-optimizer.js';
import { refactorAssistantSubagent } from './refactor-assistant.js';
import { securityAuditorSubagent } from './security-auditor.js';
import { testGeneratorSubagent } from './test-generator.js';

export {
  docWriterSubagent,
  perfOptimizerSubagent,
  refactorAssistantSubagent,
  securityAuditorSubagent,
  testGeneratorSubagent,
};

/** 默认自定义 subagents 列表。 */
export const customSubagents: AgentControllerSubagent[] = [
  securityAuditorSubagent,
  testGeneratorSubagent,
  perfOptimizerSubagent,
  refactorAssistantSubagent,
  docWriterSubagent,
];
