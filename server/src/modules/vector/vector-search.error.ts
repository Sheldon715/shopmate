export class VectorSearchError extends Error {
  readonly code = "VECTOR_SEARCH_FAILED";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VectorSearchError";
  }
}
