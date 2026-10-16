import type { AgentControllerSubagent } from '@mastra/core/agent-controller';
import { MC_TOOLS } from '@mastra/code-sdk/tool-names';

/**
 * 性能优化专家
 * 识别性能瓶颈并提出优化建议
 */
export const perfOptimizerSubagent: AgentControllerSubagent = {
  id: 'perf-optimizer',
  name: 'Performance Optimizer',
  description: '性能优化专家，识别瓶颈并提出优化方案',
  instructions: `你是一个性能优化专家。关注：

**性能分析**：
- 识别 CPU 密集操作
- 识别 I/O 瓶颈
- 识别内存泄漏
- 识别不必要的重复计算

**优化策略**：
- 算法优化（时间复杂度）
- 缓存策略
- 异步处理
- 批量操作
- 索引优化

**测量**：
- 使用 Benchmark 验证优化效果
- 提供优化前后对比数据`,

  allowedWorkspaceTools: [
    MC_TOOLS.VIEW,
    MC_TOOLS.SEARCH_CONTENT,
    MC_TOOLS.FIND_FILES,
    MC_TOOLS.FILE_STAT,
    MC_TOOLS.WRITE_FILE,
    MC_TOOLS.STRING_REPLACE_LSP,
    MC_TOOLS.EXECUTE_COMMAND,
  ],

  defaultModelId: 'anthropic/claude-sonnet-4',

  maxSteps: 20,
};
