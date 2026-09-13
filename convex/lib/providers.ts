/**
 * Provider catalog for Convex functions — re-exported from `shared/` so the
 * server, the web app and the machine runtime agree on driver kinds, mention
 * handles and model slugs.
 */
export {
  cursorEffortFromOptions,
  resolveCursorCliModel,
} from "../../shared/cursorModels.ts";
export {
  MENTION_TO_PROVIDER,
  MODEL_SLUG_MAX_LENGTH,
  PROVIDER_CATALOG,
  PROVIDER_DRIVER_KINDS,
  catalogFor,
  formatAgentMention,
  isProviderDriverKind,
  isValidModelSlug,
  mentionHandleFor,
  providerKindFromHandle,
  modelDisplayName,
  resolveModelSlug,
} from "../../shared/providers.ts";
export type {
  ProviderCatalogEntry,
  ProviderDriverKind,
  ProviderModel,
} from "../../shared/providers.ts";
