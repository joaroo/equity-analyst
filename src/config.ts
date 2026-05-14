import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const ModelEntrySchema = z.union([
  z.string(),
  z.object({ id: z.string(), variant: z.string().optional() }),
]);

export const AgentConfigSchema = z
  .object({
    model: z.union([z.string(), z.array(ModelEntrySchema).min(1)]).optional(),
    variant: z.string().optional(),
    temperature: z.number().min(0).max(2).optional(),
    mcps: z.array(z.string()).optional(),
    promptAppend: z.string().optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

export const ToolConnectorSchema = z
  .object({
    mcp: z.string(),
    tool: z.string().optional(),
  })
  .strict();

export const PluginConfigSchema = z
  .object({
    $schema: z.string().optional(),
    preset: z.string().optional(),
    presets: z.record(z.record(AgentConfigSchema)).optional(),
    agents: z.record(AgentConfigSchema).optional(),
    tools: z.record(ToolConnectorSchema).optional(),
    mcp: z.record(z.unknown()).optional(),
  })
  .strict();

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;

export const DEFAULT_PRESET = 'balanced';

export const DEFAULT_CONFIG: PluginConfig = {
  preset: DEFAULT_PRESET,
  presets: {
    balanced: {
      orchestrator: { model: 'openai/gpt-5.5', variant: 'high', mcps: [] },
      portfolioExtractor: { model: 'ollama/qwen2.5:7b', variant: 'low', mcps: [] },
      formatter: { model: 'ollama/qwen2.5:7b', variant: 'low', mcps: [] },
      marketSnapshot: { model: 'google/gemini-3-flash-preview', variant: 'low', mcps: [] },
      catalystCalendar: { model: 'google/gemini-3-flash-preview', variant: 'low', mcps: [] },
      fundamentalAnalyst: { model: 'google/gemini-3-pro', variant: 'high', mcps: [] },
      technicalAnalyst: { model: 'google/gemini-3-pro', variant: 'medium', mcps: [] },
      portfolioManager: { model: 'openai/gpt-5.5', variant: 'high', mcps: ['notifications'] },
      valuationAnalyst: { model: 'google/gemini-3-pro', variant: 'high', mcps: [] },
      earningsPreview: { model: 'google/gemini-3-pro', variant: 'medium', mcps: [] },
      earningsReview: { model: 'google/gemini-3-pro', variant: 'medium', mcps: [] },
      indexFundAdvisor: { model: 'google/gemini-3-pro', variant: 'medium', mcps: [] },
    },
    cheap: {
      orchestrator: { model: 'openai/gpt-5.4-mini', variant: 'medium', mcps: [] },
      portfolioExtractor: { model: 'ollama/qwen2.5:7b', variant: 'low', mcps: [] },
      formatter: { model: 'ollama/qwen2.5:7b', variant: 'low', mcps: [] },
      marketSnapshot: { model: 'google/gemini-3-flash-preview', variant: 'low', mcps: [] },
      catalystCalendar: { model: 'google/gemini-3-flash-preview', variant: 'low', mcps: [] },
      fundamentalAnalyst: { model: 'google/gemini-3-flash-preview', variant: 'medium', mcps: [] },
      technicalAnalyst: { model: 'openai/gpt-5.4-mini', variant: 'low', mcps: [] },
      portfolioManager: { model: 'openai/gpt-5.4-mini', variant: 'medium', mcps: ['notifications'] },
      valuationAnalyst: { model: 'google/gemini-3-flash-preview', variant: 'medium', mcps: [] },
      earningsPreview: { model: 'google/gemini-3-flash-preview', variant: 'low', mcps: [] },
      earningsReview: { model: 'google/gemini-3-flash-preview', variant: 'low', mcps: [] },
      indexFundAdvisor: { model: 'google/gemini-3-flash-preview', variant: 'low', mcps: [] },
    },
  },
  tools: {
    notifications: { mcp: 'slack', tool: 'slack_post_message' },
  },
};

export function loadConfig(cwd: string): PluginConfig {
  const globalPath = join(homedir(), '.config', 'opencode', 'equity-analyst.jsonc');
  const projectPath = join(cwd, '.opencode', 'equity-analyst.jsonc');
  const globalConfig = readConfig(globalPath);
  const projectConfig = readConfig(projectPath);
  return PluginConfigSchema.parse(deepMerge(deepMerge(DEFAULT_CONFIG, globalConfig), projectConfig));
}

export function resolveAgents(config: PluginConfig): Record<string, AgentConfig> {
  const presetName = config.preset ?? DEFAULT_PRESET;
  const preset = config.presets?.[presetName] ?? config.presets?.[DEFAULT_PRESET] ?? {};
  return deepMerge(preset, config.agents ?? {}) as Record<string, AgentConfig>;
}

function readConfig(path: string): unknown {
  if (!existsSync(path)) return {};
  return JSON.parse(stripJsonComments(readFileSync(path, 'utf8')));
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (!isObject(base) || !isObject(override)) return (override ?? base) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] = key in out ? deepMerge(out[key], value) : value;
  }
  return out as T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
