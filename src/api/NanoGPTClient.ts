import {
  ChatMessage,
  ChatCompletionRequest,
  ChatCompletionChunk,
  ImageGenerationRequest,
  ImageGenerationResponse,
  WebSearchRequest,
  WebSearchResponse,
  ScrapeUrlsRequest,
  ScrapeUrlsResponse,
  NanoGPTModel,
  NanoGPTImageModel,
} from './types';

export class NanoGPTClient {
  private apiKey: string;
  private baseUrl: string;
  private modelCache: Map<string, { models: NanoGPTModel[]; timestamp: number }> = new Map();
  private imageModelCache: { models: NanoGPTImageModel[]; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor(apiKey: string, baseUrl: string = 'https://nano-gpt.com/api/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.apiKey) {
      throw new Error('API key is required');
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`NanoGPT API error: ${response.status} - ${error}`);
    }

    return response;
  }

  async streamChatCompletion(
    messages: ChatMessage[],
    model: string,
    onChunk: (chunk: string) => void,
    temperature: number = 0.7,
    maxTokens: number = 2048
  ): Promise<void> {
    const request: ChatCompletionRequest = {
      model,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
    };

    const response = await this.fetchWithAuth(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      body: JSON.stringify(request),
    });

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine === '' || trimmedLine === 'data: [DONE]') continue;
          if (!trimmedLine.startsWith('data: ')) continue;

          try {
            const jsonStr = trimmedLine.slice(6);
            const chunk: ChatCompletionChunk = JSON.parse(jsonStr);
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch (e) {
            console.error('Error parsing SSE chunk:', e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    const body = {
      prompt: request.prompt,
      model: request.model || 'flux-pro',
      n: request.n || 1,
      size: request.size || '1024x1024',
      quality: request.quality || 'standard',
    };

    const response = await this.fetchWithAuth(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return await response.json();
  }

  async webSearch(request: WebSearchRequest): Promise<WebSearchResponse> {
    let parsedOptions: Record<string, unknown> | undefined;

    if (typeof request.options === 'string' && request.options.trim().length > 0) {
      try {
        parsedOptions = JSON.parse(request.options);
      } catch (error) {
        console.warn('Invalid web search options JSON, ignoring.', error);
      }
    } else if (request.options && typeof request.options === 'object') {
      parsedOptions = request.options as Record<string, unknown>;
    }

    const body = {
      query: request.query,
      num_results: request.num_results,
      provider: request.provider || undefined,
      options: parsedOptions,
    };

    // Correct endpoint based on documentation: https://nano-gpt.com/api/web
    const endpoint = this.baseUrl.replace('/v1', '/web');

    const response = await this.fetchWithAuth(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return await response.json();
  }

  async listImageModels(): Promise<NanoGPTImageModel[]> {
    if (this.imageModelCache && Date.now() - this.imageModelCache.timestamp < this.CACHE_DURATION) {
      return this.imageModelCache.models;
    }

    try {
      // Use the specific endpoint for image models
      // Based on curl output: {"models":{"image":{"model-id": {...}}}}
      const response = await this.fetchWithAuth('https://nano-gpt.com/api/models/image');
      const data = await response.json();

      const models: NanoGPTImageModel[] = [];
      const imageModels = data.models?.image || data.models || data.data || [];

      if (Array.isArray(imageModels)) {
        imageModels.forEach((modelData: any) => {
          const modelId = modelData.model || modelData.id || modelData.name;
          if (!modelId) return;
          models.push({
            model: modelId,
            name: modelData.name || modelId,
            description: modelData.description,
            engine: modelData.engine,
          });
        });
      } else if (imageModels && typeof imageModels === 'object') {
        for (const [key, value] of Object.entries(imageModels)) {
          const modelData = value as any;
          models.push({
            model: modelData.model || modelData.id || key,
            name: modelData.name || key,
            description: modelData.description,
            engine: modelData.engine,
          });
        }
      }

      this.imageModelCache = {
        models,
        timestamp: Date.now(),
      };

      return models;
    } catch (e) {
      console.error('Failed to fetch image models', e);
      // Fallback to basic models if API fails
      return [
        { model: 'flux-pro', name: 'Flux Pro' },
        { model: 'dall-e-3', name: 'DALL-E 3' },
        { model: 'stable-diffusion-xl', name: 'Stable Diffusion XL' },
      ];
    }
  }

  async scrapeUrls(request: ScrapeUrlsRequest): Promise<ScrapeUrlsResponse> {
    const response = await this.fetchWithAuth('https://nano-gpt.com/api/scrape-urls', {
      method: 'POST',
      body: JSON.stringify(request),
    });

    return await response.json();
  }

  async listModels(subscriptionOnly: boolean = false): Promise<NanoGPTModel[]> {
    const cacheKey = subscriptionOnly ? 'subscription' : 'all';
    const cached = this.modelCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return cached.models;
    }

    let models: NanoGPTModel[] = [];
    
    try {
      let baseEndpoint = this.baseUrl;
      if (subscriptionOnly) {
        if (this.baseUrl.includes('/subscription/')) {
          baseEndpoint = this.baseUrl;
        } else if (/\/v1\/?$/.test(this.baseUrl)) {
          baseEndpoint = this.baseUrl.replace(/\/v1\/?$/, '/subscription/v1');
        } else {
          baseEndpoint = `${this.baseUrl.replace(/\/$/, '')}/subscription/v1`;
        }
      }

      const response = await this.fetchWithAuth(`${baseEndpoint}/models`);
      const data = await response.json();
      models = data.data || [];
    } catch (e) {
      console.error('Failed to fetch models', e);
      // Fallback
      return [
        { id: 'zai-org/glm-4.7', object: 'model', name: 'GLM 4.7' },
        { id: 'gpt-4o', object: 'model', name: 'GPT-4o' },
        { id: 'claude-3-5-sonnet-20240620', object: 'model', name: 'Claude 3.5 Sonnet' },
      ];
    }

    this.modelCache.set(cacheKey, {
      models,
      timestamp: Date.now(),
    });

    return models;
  }

  async checkBalance(): Promise<number> {
    const response = await this.fetchWithAuth(`${this.baseUrl}/check-balance`, {
      method: 'GET',
    });

    const data = await response.json();
    return data.balance || 0;
  }

  invalidateCache() {
    this.modelCache.clear();
    this.imageModelCache = null;
  }
}
