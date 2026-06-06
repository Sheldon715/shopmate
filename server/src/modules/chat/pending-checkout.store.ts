import type { PendingCheckoutDraft } from "../orders/checkout.types";

export type PendingCheckoutLookup =
  | { status: "found"; draft: PendingCheckoutDraft }
  | { status: "missing" }
  | { status: "expired"; draft: PendingCheckoutDraft };

export interface PendingCheckoutStoreOptions {
  now?: () => Date;
}

const DEFAULT_STORE = new Map<string, PendingCheckoutDraft>();

export class PendingCheckoutStore {
  private readonly now: () => Date;
  private readonly drafts: Map<string, PendingCheckoutDraft>;

  constructor(
    options: PendingCheckoutStoreOptions = {},
    drafts: Map<string, PendingCheckoutDraft> = DEFAULT_STORE,
  ) {
    this.now = options.now ?? (() => new Date());
    this.drafts = drafts;
  }

  get(input: {
    conversationId?: string;
    userKey: string;
  }): PendingCheckoutLookup {
    const key = createDraftKey(input.conversationId, input.userKey);
    const draft = this.drafts.get(key);

    if (!draft) {
      return { status: "missing" };
    }

    if (new Date(draft.expiresAt).getTime() <= this.now().getTime()) {
      this.drafts.delete(key);
      return { status: "expired", draft };
    }

    return { status: "found", draft };
  }

  save(draft: PendingCheckoutDraft): PendingCheckoutDraft {
    this.drafts.set(createDraftKey(draft.conversationId, draft.userKey), draft);
    return draft;
  }

  clear(input: {
    conversationId?: string;
    userKey: string;
  }): PendingCheckoutLookup {
    const lookup = this.get(input);

    if (lookup.status === "found") {
      this.drafts.delete(createDraftKey(lookup.draft.conversationId, lookup.draft.userKey));
    }

    return lookup;
  }

  clearAll(): void {
    this.drafts.clear();
  }
}

function createDraftKey(
  conversationId: string | undefined,
  userKey: string,
): string {
  return `${userKey}:${conversationId ?? "default"}`;
}
