export type EmbeddingEndpointKind = "embeddings" | "multimodal_embeddings";

export interface EmbeddingUsage {
  inputTokens?: number;
}

export interface EmbeddingResult {
  model: string;
  dimensions: number;
  vectors: number[][];
  usage?: EmbeddingUsage;
}

export interface EmbeddingRequestOptions {
  abortSignal?: AbortSignal;
}

export interface EmbeddingClient {
  embedDocuments(
    texts: string[],
    options?: EmbeddingRequestOptions,
  ): Promise<EmbeddingResult>;
  embedQuery(
    text: string,
    options?: EmbeddingRequestOptions,
  ): Promise<EmbeddingResult>;
}

export interface EmbeddingClientConfig {
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  model: string;
  dimensions: number;
  endpointKind: EmbeddingEndpointKind;
  timeoutMs: number;
  maxRetries: number;
}
