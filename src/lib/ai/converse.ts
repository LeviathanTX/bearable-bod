import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const DEFAULT_MODEL = 'us.anthropic.claude-sonnet-4-6-v1:0';

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrock(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });
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
    temperature: 0.3,
  });

  const jsonMatch = result.content.match(/```json\s*([\s\S]*?)```/) ||
    result.content.match(/\[[\s\S]*\]/) ||
    result.content.match(/\{[\s\S]*\}/);

  const raw = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : result.content;
  const data = JSON.parse(raw) as T;
  return { data, tokensUsed: result.tokensUsed };
}
