import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

/**
 * Everything a tool is allowed to know about the caller. `userId` comes from
 * the verified Supabase session on the request — NEVER from the model, the
 * frontend body, or conversation history. A guest is `userId: null`.
 */
export type AgentContext = {
  userId: string | null;
  isMember: boolean;
  admin: SupabaseClient<Database>;
};

/** A product surfaced by a tool, for the chat UI to render as a card. */
export type AgentProductRef = {
  slug: string;
  name: string;
  category: string;
  price: number;
  memberPrice: number;
  image: string | null;
  membersOnly: boolean;
  inStock: boolean;
};

/** A navigation action the assistant can offer. */
export type AgentAction = {
  label: string;
  href: string;
};

/**
 * Tools push UI-renderable side effects here instead of trying to encode
 * them in prose. The service layer drains it after the run.
 */
export class AgentCollector {
  private products = new Map<string, AgentProductRef>();
  private actions = new Map<string, AgentAction>();
  toolCalls: { name: string; ok: boolean }[] = [];

  addProduct(p: AgentProductRef) {
    if (!this.products.has(p.slug)) this.products.set(p.slug, p);
  }
  addAction(a: AgentAction) {
    if (!this.actions.has(a.href)) this.actions.set(a.href, a);
  }
  drain() {
    return {
      products: [...this.products.values()],
      actions: [...this.actions.values()],
    };
  }
}
