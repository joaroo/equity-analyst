import type { Plugin } from '@opencode-ai/plugin';
import { buildOpenCodeAgents } from './agents';
import { buildCommands } from './commands';
import { loadConfig, resolveAgents } from './config';

const EquityAnalystPlugin: Plugin = async (ctx) => {
  const pluginConfig = loadConfig(ctx.directory);
  const agentConfigs = resolveAgents(pluginConfig);

  return {
    config: async (opencodeConfig: Record<string, unknown>) => {
      opencodeConfig.agent = {
        ...((opencodeConfig.agent as Record<string, unknown> | undefined) ?? {}),
        ...buildOpenCodeAgents(agentConfigs, pluginConfig),
      };

      opencodeConfig.command = {
        ...((opencodeConfig.command as Record<string, unknown> | undefined) ?? {}),
        ...buildCommands(),
      };

      if (pluginConfig.mcp) {
        opencodeConfig.mcp = {
          ...((opencodeConfig.mcp as Record<string, unknown> | undefined) ?? {}),
          ...pluginConfig.mcp,
        };
      }
    },
  };
};

export default EquityAnalystPlugin;
