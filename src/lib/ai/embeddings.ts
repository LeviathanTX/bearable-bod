import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

const MODEL_ID = 'amazon.titan-embed-text-v2:0';
const DIMENSIONS = 1024;

let bedrockClient: BedrockRuntimeClient | null = null;

function getBedrock(): BedrockRuntimeClient {
  if (!bedrockClient) {
    bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });
  }
  return bedrockClient;
}

export async function embedText(text: string): Promise<number[]> {
  const body = JSON.stringify({
    inputText: text.slice(0, 8192),
    dimensions: DIMENSIONS,
    normalize: true,
  });

  const cmd = new InvokeModelCommand({
    modelId: MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: Buffer.from(body),
  });

  const res = await getBedrock().send(cmd);
  const parsed = JSON.parse(Buffer.from(res.body).toString('utf8'));
  return parsed.embedding as number[];
}

export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}
