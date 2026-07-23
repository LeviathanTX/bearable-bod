export interface ModelOption {
  id: string;
  label: string;
  provider: string;
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: 'us.anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic' },
  { id: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5', provider: 'Anthropic' },
  { id: 'us.anthropic.claude-opus-4-6-v1', label: 'Claude Opus 4.6', provider: 'Anthropic' },
  { id: 'us.amazon.nova-pro-v1:0', label: 'Amazon Nova Pro', provider: 'Amazon' },
  { id: 'us.meta.llama3-3-70b-instruct-v1:0', label: 'Llama 3.3 70B', provider: 'Meta' },
  { id: 'us.mistral.mistral-large-2411-v1:0', label: 'Mistral Large', provider: 'Mistral' },
];

export function isValidModel(modelId: string): boolean {
  return AVAILABLE_MODELS.some((m) => m.id === modelId);
}
