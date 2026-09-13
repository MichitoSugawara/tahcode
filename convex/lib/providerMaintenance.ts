/**
 * Maintenance allowlist for Convex functions — re-exported from `shared/` so
 * the server, the web app and the machine bridge agree on what a machine may
 * be asked to do and who may ask.
 */
export {
  BRIDGE_CAPABILITY_LIVE_MODELS,
  BRIDGE_CAPABILITY_MAINTENANCE,
  PROVIDER_MAINTENANCE,
  STALE_RUNNING_MS,
  canRequestMaintenance,
  supportsLiveModels,
  updatePlanFor,
} from "../../shared/providerMaintenance.ts";
export type {
  MaintenanceKind,
  MaintenanceStatus,
} from "../../shared/providerMaintenance.ts";
