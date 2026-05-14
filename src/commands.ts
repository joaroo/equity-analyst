import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const COMMANDS = [
  ['analyze', 'Run the full weekly stock analysis pipeline end-to-end.', 'equity-orchestrator'],
  ['snapshot', 'Return a compact market regime snapshot.', 'equity-market-snapshot'],
  ['index-funds', 'Analyze index fund allocation and rebalancing.', 'equity-index-fund-advisor'],
  ['earnings-preview', 'Run pre-earnings scenario analysis for a ticker.', 'equity-earnings-preview'],
  ['earnings-review', 'Review reported earnings and thesis impact for a ticker.', 'equity-earnings-review'],
  ['catalyst-calendar', 'Scan portfolio holdings/watchlist for upcoming binary events.', 'equity-catalyst-calendar'],
  ['valuation', 'Run peer comps and DCF valuation for a ticker.', 'equity-valuation-analyst'],
] as const;

export function buildCommands(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, fallbackDescription, agent] of COMMANDS) {
    const source = readCommand(name);
    const { description, body } = parseCommand(source, fallbackDescription);
    out[name] = {
      description,
      agent,
      template: rewriteForOpenCode(name, body),
    };
  }
  return out;
}

function readCommand(name: string): string {
  const path = join(ROOT, 'commands', `${name}.md`);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function parseCommand(source: string, fallbackDescription: string): { description: string; body: string } {
  if (!source.startsWith('---')) return { description: fallbackDescription, body: source };
  const end = source.indexOf('\n---', 3);
  if (end === -1) return { description: fallbackDescription, body: source };
  const frontmatter = source.slice(3, end);
  const description = frontmatter.match(/^description:\s*(.*)$/m)?.[1]?.trim() ?? fallbackDescription;
  return { description, body: source.slice(end + 4).trim() };
}

function rewriteForOpenCode(name: string, body: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/mcp__ollama__ollama_list_models/g, 'the configured portfolioExtractor/formatter agent model'],
    [/mcp__ollama__ollama_generate/g, 'the configured portfolioExtractor/formatter agent model'],
    [/mcp__gemini__gemini_generate/g, 'the configured specialist agent model/provider'],
    [/\$\{NOTIFICATION_MCP_TOOL\}/g, "the configured notifications connector"],
    [/equity-analyst:market-snapshot/g, 'equity-market-snapshot'],
    [/equity-analyst:catalyst-calendar/g, 'equity-catalyst-calendar'],
    [/equity-analyst:systematic-fundamental-analyst/g, 'equity-fundamental-analyst'],
    [/equity-analyst:independent-technical-analyst/g, 'equity-technical-analyst'],
    [/equity-analyst:portfolio-manager/g, 'equity-portfolio-manager'],
  ];
  const rewritten = replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), body);
  if (name === 'analyze') {
    return `Use the configured OpenCode equity agents. Delegate specialist work with the Task tool using exact subagent_type values. OpenCode provider routing replaces legacy Gemini/Ollama MCP inference; do not call model-provider MCP connectors. Do not call notification tools from the orchestrator; if notification delivery is requested, delegate final delivery to equity-portfolio-manager or equity-formatter as appropriate.

Command: /analyze

## Corrected OpenCode pipeline

1. If portfolio JSON is not already present, run these in parallel:
   - equity-portfolio-extractor: extract holdings/watchlist/index_funds/cash JSON
   - equity-market-snapshot: produce market context JSON

2. If portfolio JSON is already present, run these in parallel:
   - equity-portfolio-extractor: validate/normalize portfolio JSON
   - equity-market-snapshot: produce market context JSON
   - equity-catalyst-calendar: scan holdings/watchlist for 4-week events

3. If catalyst calendar could not run in step 1 because portfolio JSON was missing, run equity-catalyst-calendar after extraction completes.

4. Run equity-fundamental-analyst with portfolio JSON and market context labeled exactly as ## MARKET CONTEXT (PRE-FETCHED):.

5. Run equity-technical-analyst with the full fundamental report, portfolio JSON, and market context.

6. Run equity-portfolio-manager with the full fundamental report, full technical report, catalyst calendar JSON, and portfolio JSON. Only this agent may use notifications.

7. If a notification-friendly rewrite is needed, run equity-formatter on the portfolio-manager output, then pass it back to equity-portfolio-manager for delivery if configured.

${rewritten}`;
  }
  return `Use the configured OpenCode equity agents. OpenCode provider routing replaces legacy Gemini/Ollama MCP inference; use the command's configured agent model/provider. Delegate specialist work with the Task tool using the exact subagent_type when useful.\n\nCommand: /${name}\n\n${rewritten}`;
}
