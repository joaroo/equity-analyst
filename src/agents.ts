import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig, PluginConfig } from './config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export type EquityAgentName =
  | 'orchestrator'
  | 'portfolioExtractor'
  | 'formatter'
  | 'marketSnapshot'
  | 'catalystCalendar'
  | 'fundamentalAnalyst'
  | 'technicalAnalyst'
  | 'portfolioManager'
  | 'valuationAnalyst'
  | 'earningsPreview'
  | 'earningsReview'
  | 'indexFundAdvisor';

type AgentDefinition = {
  key: EquityAgentName;
  id: string;
  description: string;
  mode: 'primary' | 'subagent';
  skill?: string;
  prompt: string;
  defaultMcps: string[];
};

export const AGENTS: AgentDefinition[] = [
  {
    key: 'orchestrator',
    id: 'equity-orchestrator',
    mode: 'primary',
    description: 'Coordinates the equity analysis workflow and delegates to configured analyst agents.',
    defaultMcps: [],
    prompt: `You are the equity-analyst OpenCode orchestrator.

Coordinate work; do not invent analysis. Delegate to specialist agents by stable OpenCode agent id:
- equity-portfolio-extractor: extract holdings/watchlist/cash JSON
- equity-market-snapshot: market regime JSON
- equity-catalyst-calendar: upcoming portfolio events
- equity-fundamental-analyst: fundamental report
- equity-technical-analyst: technical report
- equity-portfolio-manager: final portfolio decisions and optional notification delivery
- equity-valuation-analyst: standalone valuation
- equity-earnings-preview: standalone pre-earnings analysis
- equity-earnings-review: standalone post-earnings analysis
- equity-index-fund-advisor: standalone index fund advisory

Parallelism rule: launch independent subagent tasks in the same turn when inputs are available. If portfolio data is already present, market snapshot, portfolio extraction validation, and catalyst calendar can run together. If portfolio data must be extracted first, run portfolio extraction and market snapshot in parallel, then run catalyst calendar.

All analyst agents are read-only. Only equity-portfolio-manager may use notifications. Preserve the disclaimer: this is research, not financial advice.`,
  },
  {
    key: 'portfolioExtractor',
    id: 'equity-portfolio-extractor',
    mode: 'subagent',
    description: 'Extracts holdings, watchlist, index funds, and cash into strict JSON.',
    defaultMcps: [],
    prompt: `Extract portfolio data from user text or referenced notes. Return strict JSON only with keys: holdings, watchlist, index_funds, cash_available, cash_currency. Do not analyze securities.`,
  },
  {
    key: 'formatter',
    id: 'equity-formatter',
    mode: 'subagent',
    description: 'Formats portfolio reports for notification delivery.',
    defaultMcps: [],
    prompt: `Format equity-analyst reports for notification channels. Preserve facts, verdicts, scores, and warnings. Convert markdown tables to readable bullets when needed.`,
  },
  skillAgent('marketSnapshot', 'equity-market-snapshot', 'Market regime snapshot analyst.', 'market-snapshot', []),
  skillAgent('catalystCalendar', 'equity-catalyst-calendar', 'Four-week catalyst and binary-event scanner.', 'catalyst-calendar', []),
  skillAgent('fundamentalAnalyst', 'equity-fundamental-analyst', 'Systematic fundamental analyst.', 'fundamental-analysis', []),
  skillAgent('technicalAnalyst', 'equity-technical-analyst', 'Independent technical analyst.', 'technical-analysis', []),
  skillAgent('portfolioManager', 'equity-portfolio-manager', 'Portfolio manager combining analyst reports into decisions.', 'portfolio-management', ['notifications']),
  skillAgent('valuationAnalyst', 'equity-valuation-analyst', 'Peer comps and DCF valuation analyst.', 'valuation', []),
  skillAgent('earningsPreview', 'equity-earnings-preview', 'Pre-earnings scenario analyst.', 'earnings-preview', []),
  skillAgent('earningsReview', 'equity-earnings-review', 'Post-earnings thesis-impact analyst.', 'earnings-review', []),
  skillAgent('indexFundAdvisor', 'equity-index-fund-advisor', 'Index fund allocation and rebalancing advisor.', 'index-fund-advisory', []),
];

export function buildOpenCodeAgents(agentConfigs: Record<string, AgentConfig>, pluginConfig: PluginConfig): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const agent of AGENTS) {
    const config = agentConfigs[agent.key] ?? {};
    if (config.disabled) continue;
    const modelConfig = normalizeModel(config.model);
    out[agent.id] = {
      name: agent.id,
      description: agent.description,
      mode: agent.mode,
      model: modelConfig.model,
      ...(modelConfig.variant || config.variant ? { variant: modelConfig.variant ?? config.variant } : {}),
      ...(typeof config.temperature === 'number' ? { temperature: config.temperature } : {}),
      prompt: withToolContext(agent.prompt, config.promptAppend, pluginConfig),
      tools: agent.key === 'portfolioManager' ? { write: false, edit: false, bash: false } : { write: false, edit: false, bash: false },
      permission: buildPermissions(agent, config.mcps ?? agent.defaultMcps, pluginConfig),
    };
  }
  return out;
}

function skillAgent(key: EquityAgentName, id: string, description: string, skill: string, defaultMcps: string[]): AgentDefinition {
  return {
    key,
    id,
    description,
    mode: 'subagent',
    skill,
    defaultMcps,
    prompt: `You are ${description}\n\nFollow this skill file exactly, with one OpenCode migration override: legacy references to market-data, local-inference, Gemini MCP, or Ollama MCP mean your configured OpenCode model/provider. Do not require those MCP connectors. For current market facts, use the provider's available current-data/grounding capabilities if present; if a fact cannot be verified, state that clearly instead of fabricating. Do not issue financial advice. Return the requested schema/verdict categories only.\n\n${readSkill(skill)}`,
  };
}

function readSkill(skill: string): string {
  const path = join(ROOT, 'skills', skill, 'SKILL.md');
  if (!existsSync(path)) return `Skill file missing: skills/${skill}/SKILL.md`;
  return readFileSync(path, 'utf8');
}

function withToolContext(prompt: string, append: string | undefined, config: PluginConfig): string {
  const tools = Object.entries(config.tools ?? {})
    .map(([alias, connector]) => {
      const toolId = connector.tool ? `${connector.mcp}_${connector.tool}` : `${connector.mcp}_*`;
      return `- ${alias}: MCP server '${connector.mcp}', OpenCode tool '${toolId}'`;
    })
    .join('\n');
  return `${prompt}\n\n## OpenCode provider-native mode\nModel/provider selection is handled by this agent's OpenCode config. Do not call Gemini/Ollama MCP tools for model inference. Optional MCP tools are only for side effects or external services.\n\n## Optional MCP tools\n${tools || 'No optional MCP tools configured.'}\n\nOnly call MCP tools explicitly permitted for this agent.${append ? `\n\n## User prompt append\n${append}` : ''}`;
}

function normalizeModel(model: AgentConfig['model']): { model?: string; variant?: string } {
  if (!model) return {};
  const first = Array.isArray(model) ? model[0] : model;
  return typeof first === 'string' ? { model: first } : { model: first.id, variant: first.variant };
}

function buildPermissions(agent: AgentDefinition, allowedAliases: string[], config: PluginConfig): Record<string, string> {
  const permissions: Record<string, string> = {};
  const connectors = config.tools ?? {};
  for (const [alias, connector] of Object.entries(connectors)) {
    const action = allowedAliases.includes(alias) ? 'allow' : 'deny';
    if (connector.tool) permissions[`${sanitize(connector.mcp)}_${sanitize(connector.tool)}`] = action;
  }
  permissions.task = agent.key === 'orchestrator' ? 'allow' : 'deny';
  return permissions;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}
