import type { ChatContextMemory } from "./chat-context-memory.types";

export interface ChatContextMemoryStoreOptions {
  ttlMs?: number;
  maxSessions?: number;
  now?: () => Date;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 100;

export class ChatContextMemoryStore {
  private readonly memories = new Map<string, ChatContextMemory>();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => Date;

  constructor(options: ChatContextMemoryStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.now = options.now ?? (() => new Date());
  }

  get(conversationId: string): ChatContextMemory | undefined {
    this.pruneExpired();
    return this.memories.get(conversationId);
  }

  set(memory: ChatContextMemory): void {
    this.pruneExpired();
    this.memories.set(memory.conversationId, memory);
    this.pruneOverflow();
  }

  delete(conversationId: string): void {
    this.memories.delete(conversationId);
  }

  private pruneExpired(): void {
    const nowMs = this.now().getTime();

    for (const [conversationId, memory] of this.memories.entries()) {
      if (nowMs - Date.parse(memory.updatedAt) > this.ttlMs) {
        this.memories.delete(conversationId);
      }
    }
  }

  private pruneOverflow(): void {
    while (this.memories.size > this.maxSessions) {
      const oldest = [...this.memories.values()]
        .sort((left, right) => Date.parse(left.updatedAt) - Date.parse(right.updatedAt))[0];

      if (!oldest) {
        return;
      }

      this.memories.delete(oldest.conversationId);
    }
  }
}
