import Anthropic from '@anthropic-ai/sdk';

// Singleton — never instantiate outside this module
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELS = {
  low:    'claude-haiku-4-5-20251001', // high-volume, simple classification
  medium: 'claude-sonnet-4-6',          // analysis, general reasoning
  high:   'claude-opus-4-8',            // complex multi-step tasks
} as const;

type Tier = keyof typeof MODELS;

// Stable system prompt — cached as a shared prefix on every call (10% of input price on cache hit)
const IMS_SYSTEM =
  'You are an AI assistant embedded in an Inventory Management System (IMS). ' +
  'You help with product categorization, stock analysis, and inventory queries. ' +
  'Be concise. Return valid JSON when the task requires structured output.';

export function isClaudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function claudeQuery(
  messages: Anthropic.MessageParam[],
  tier: Tier = 'medium',
  maxTokens = 512
): Promise<string> {
  const response = await client.messages.create({
    model: MODELS[tier],
    max_tokens: maxTokens,
    system: [{ type: 'text', text: IMS_SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

// Preflight token count — free endpoint, separate from inference rate limits
export async function countPromptTokens(text: string, tier: Tier = 'medium'): Promise<number> {
  const result = await client.messages.countTokens({
    model: MODELS[tier],
    system: IMS_SYSTEM,
    messages: [{ role: 'user', content: text }],
  });
  return result.input_tokens;
}
