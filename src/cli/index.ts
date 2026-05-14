#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'opencode');
const OPENCODE_CONFIG = join(CONFIG_DIR, 'opencode.json');
const PLUGIN_CONFIG = join(CONFIG_DIR, 'equity-analyst.jsonc');
const PACKAGE_NAME = 'equity-analyst-opencode';

const args = process.argv.slice(2);
const command = args[0] ?? 'help';

if (command === 'install') {
  install();
} else if (command === 'doctor') {
  doctor();
} else {
  console.log(`Usage:\n  equity-analyst-opencode install\n  equity-analyst-opencode doctor`);
}

function install(): void {
  mkdirSync(CONFIG_DIR, { recursive: true });
  const config = readJson(OPENCODE_CONFIG);
  const plugins = Array.isArray(config.plugin) ? config.plugin : [];
  if (!plugins.includes(PACKAGE_NAME)) plugins.push(PACKAGE_NAME);
  config.plugin = plugins;
  writeFileSync(OPENCODE_CONFIG, `${JSON.stringify(config, null, 2)}\n`);

  if (!existsSync(PLUGIN_CONFIG)) {
    writeFileSync(PLUGIN_CONFIG, starterConfig());
  }

  console.log(`Installed ${PACKAGE_NAME} in ${OPENCODE_CONFIG}`);
  console.log(`Config: ${PLUGIN_CONFIG}`);
}

function doctor(): void {
  console.log(`OpenCode config: ${existsSync(OPENCODE_CONFIG) ? 'found' : 'missing'} ${OPENCODE_CONFIG}`);
  console.log(`Plugin config: ${existsSync(PLUGIN_CONFIG) ? 'found' : 'missing'} ${PLUGIN_CONFIG}`);
}

function readJson(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function starterConfig(): string {
  return `{
  "$schema": "https://unpkg.com/equity-analyst-opencode@latest/equity-analyst.schema.json",
  "preset": "balanced",
  "agents": {
    // Override any skill/agent here, e.g.:
    // "fundamentalAnalyst": { "model": "anthropic/claude-sonnet-4.5", "variant": "high" },
    // "portfolioManager": { "model": "openai/gpt-5.5", "mcps": ["notifications"] }
  },
  "tools": {
    "notifications": { "mcp": "slack", "tool": "slack_post_message" }
  }
}
`;
}
