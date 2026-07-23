import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { getAwsClientConfig } from '@/lib/aws-config';

const DEFAULT_MODEL = 'us.anthropic.claude-sonnet-4-6';

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrock(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient(getAwsClientConfig());
  }
  return bedrockClient;
}

export interface ConverseOptions {
  model?: string;
  systemPrompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

export interface ConverseResult {
  content: string;
  tokensUsed: number;
  model: string;
}

export async function converse(opts: ConverseOptions): Promise<ConverseResult> {
  const model = opts.model || DEFAULT_MODEL;

  const command = new ConverseCommand({
    modelId: model,
    system: [{ text: opts.systemPrompt }],
    messages: opts.messages.map((m) => ({
      role: m.role,
      content: [{ text: m.content }],
    })),
    inferenceConfig: {
      maxTokens: opts.maxTokens || 4096,
      temperature: opts.temperature || 0.7,
    },
  });

  const response = await getBedrock().send(command);
  const outputText = response.output?.message?.content?.[0]?.text || '';
  const inputTokens = response.usage?.inputTokens || 0;
  const outputTokens = response.usage?.outputTokens || 0;

  return {
    content: outputText,
    tokensUsed: inputTokens + outputTokens,
    model,
  };
}

export interface ConverseJsonOptions extends Omit<ConverseOptions, 'messages'> {
  userMessage: string;
}

export async function converseJson<T = unknown>(opts: ConverseJsonOptions): Promise<{ data: T; tokensUsed: number }> {
  const result = await converse({
    ...opts,
    messages: [{ role: 'user', content: opts.userMessage }],
    maxTokens: opts.maxTokens || 8192,
    temperature: 0.3,
  });

  const text = result.content;

  // Try fenced code block first (closed or unclosed)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    const data = JSON.parse(fenceMatch[1].trim()) as T;
    return { data, tokensUsed: result.tokensUsed };
  }

  // If fence is opened but not closed (token limit hit), extract content after the opening fence
  const openFenceMatch = text.match(/```(?:json)?\s*([\s\S]*)/);
  if (openFenceMatch) {
    const inner = openFenceMatch[1].trim();
    const data = extractJson<T>(inner);
    return { data, tokensUsed: result.tokensUsed };
  }

  const data = extractJson<T>(text);
  return { data, tokensUsed: result.tokensUsed };
}

function extractJson<T>(text: string): T {
  const startIdx = text.search(/[\[{]/);
  if (startIdx === -1) throw new Error('No JSON found in response');

  const openChar = text[startIdx];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = startIdx; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === openChar) depth++;
    if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return JSON.parse(text.slice(startIdx, i + 1)) as T;
      }
    }
  }

  return JSON.parse(text) as T;
}
