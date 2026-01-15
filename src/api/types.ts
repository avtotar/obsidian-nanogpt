export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
  model?: string;
}

export interface NanoGPTImageModel {
  model: string; // The ID used for API calls
  name: string;
  description?: string;
  engine?: string;
}

export interface NanoGPTModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
  context_length?: number;
  max_tokens?: number;
  name?: string;
  description?: string;
  pricing?: {
    prompt?: number;
    completion?: number;
    request?: number;
  };
  kind?: 'chat' | 'image';
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface ChatCompletionChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }>;
}

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  n?: number;
  size?: string;
  quality?: string;
}

export interface ImageGenerationResponse {
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export interface WebSearchRequest {
  query: string;
  num_results?: number;
  provider?: string;
  options?: Record<string, unknown> | string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  summary: string;
  source?: string;
}

export interface WebSearchResponse {
  query: string;
  results: WebSearchResult[];
}

export interface ScrapeUrlsRequest {
  urls: string[];
  stealthMode?: boolean;
}

export interface ScrapeUrlsResult {
  url: string;
  success: boolean;
  title?: string;
  content?: string;
  markdown?: string;
  error?: string;
}

export interface ScrapeUrlsResponse {
  results: ScrapeUrlsResult[];
  summary?: {
    requested: number;
    processed: number;
    successful: number;
    failed: number;
    totalCost?: number;
    stealthModeUsed?: boolean;
  };
}

export interface PluginSettings {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  subscriptionOnly: boolean;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  inlineAutocompleteEnabled: boolean;
  inlineAutocompleteDelayMs: number;
  folderContextEnabled: boolean;
  folderContextMaxFiles: number;
  folderContextMaxChars: number;
  imageSize: string;
  imageQuality: string;
  webSearchNumResults: number;
  webSearchProvider: string;
  webSearchOptions: string;
  includeCitations: boolean;
  chatHistory: { [path: string]: ChatMessage[] };
}

export const DEFAULT_SETTINGS: PluginSettings = {
  apiKey: '',
  baseUrl: 'https://nano-gpt.com/api/v1',
  defaultModel: 'zai-org/glm-4.7',
  subscriptionOnly: true,
  systemPrompt: 'You are a helpful AI assistant.',
  temperature: 0.7,
  maxTokens: 2048,
  inlineAutocompleteEnabled: false,
  inlineAutocompleteDelayMs: 700,
  folderContextEnabled: true,
  folderContextMaxFiles: 5,
  folderContextMaxChars: 8000,
  imageSize: '1024x1024',
  imageQuality: 'standard',
  webSearchNumResults: 5,
  webSearchProvider: '',
  webSearchOptions: '',
  includeCitations: true,
  chatHistory: {},
};
