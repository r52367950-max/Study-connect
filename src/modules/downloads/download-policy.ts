import { ConfigService } from "@nestjs/config";
import { MaterialVisibility } from "@prisma/client";

export const DOWNLOAD_TOKEN_TTL_SECONDS_KEY = "DOWNLOAD_TOKEN_TTL_SECONDS";
export const DOWNLOAD_URL_TTL_SECONDS_KEY = "DOWNLOAD_URL_TTL_SECONDS";
export const DOWNLOAD_BASE_URL_KEY = "DOWNLOAD_BASE_URL";
export const DOWNLOAD_DELIVERY_DEFAULT_KEY = "DOWNLOAD_DELIVERY_DEFAULT";
export const DOWNLOAD_PUBLIC_DIRECT_ENABLED_KEY =
  "DOWNLOAD_PUBLIC_DIRECT_ENABLED";

export type DownloadDeliveryMode = "proxy" | "direct";

export type DownloadPolicyDecision = {
  mode: DownloadDeliveryMode;
  reason: string;
};

export const DEFAULT_DOWNLOAD_TOKEN_TTL_SECONDS = 120;
export const DEFAULT_DOWNLOAD_URL_TTL_SECONDS = 60;

/**
 * Default strategy: all token redemptions are served through the backend proxy.
 * Low-risk public materials may opt back into the old MinIO direct-sign flow only
 * when DOWNLOAD_PUBLIC_DIRECT_ENABLED=true and DOWNLOAD_DELIVERY_DEFAULT=direct.
 */
export function decideDownloadDeliveryPolicy(
  configService: ConfigService,
  material: { visibility: MaterialVisibility },
): DownloadPolicyDecision {
  const defaultMode =
    configService.get<string>(DOWNLOAD_DELIVERY_DEFAULT_KEY) === "direct"
      ? "direct"
      : "proxy";
  const publicDirectEnabled =
    configService.get<string>(DOWNLOAD_PUBLIC_DIRECT_ENABLED_KEY) === "true";

  if (material.visibility !== MaterialVisibility.PUBLIC) {
    return {
      mode: "proxy",
      reason: "sensitive_material_requires_backend_proxy",
    };
  }

  if (defaultMode === "direct" && publicDirectEnabled) {
    return { mode: "direct", reason: "low_risk_public_direct_sign_enabled" };
  }

  return { mode: "proxy", reason: "default_backend_proxy_policy" };
}

export function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}
