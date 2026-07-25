import {
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  StreamableFile,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileSafetyStatus, MaterialStatus, UserStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import { Response } from "express";
import { MinioService, PrismaService } from "../../infra";
import {
  DEFAULT_DOWNLOAD_TOKEN_TTL_SECONDS,
  DEFAULT_DOWNLOAD_URL_TTL_SECONDS,
  DOWNLOAD_BASE_URL_KEY,
  DOWNLOAD_TOKEN_TTL_SECONDS_KEY,
  DOWNLOAD_URL_TTL_SECONDS_KEY,
  decideDownloadDeliveryPolicy,
  parsePositiveInt,
} from "./download-policy";

/** Bare `host` or `host:port` — no scheme, path, credentials or comma-joined values. */
const HOST_PATTERN = /^[A-Za-z0-9.-]+(:\d{1,5})?$/;

@Injectable()
export class DownloadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minioService: MinioService,
    private readonly configService: ConfigService,
  ) {}

  async createTokenForApprovedMaterial(
    materialId: string,
    userId: string,
    request?: { protocol?: string; get?: (name: string) => string | undefined },
  ) {
    const material = await this.ensureDownloadableMaterial(materialId, {
      publicOnly: true,
    });
    await this.ensureActiveUser(userId);

    const token = randomBytes(32).toString("base64url");
    const ttlSeconds = parsePositiveInt(
      this.configService.get<string>(DOWNLOAD_TOKEN_TTL_SECONDS_KEY),
      DEFAULT_DOWNLOAD_TOKEN_TTL_SECONDS,
    );
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.downloadToken.create({
      data: { token, materialId: material.id, userId, expiresAt },
      select: { token: true },
    });

    return {
      materialId: material.id,
      downloadUrl: `${this.getBaseUrl(request)}/downloads/${token}`,
      tokenExpiresAt: expiresAt,
      deliveryDefault:
        this.configService.get<string>("DOWNLOAD_DELIVERY_DEFAULT") === "direct"
          ? "direct"
          : "proxy",
    };
  }

  async redeemToken(
    token: string,
    userId: string,
    res: Response,
  ): Promise<
    | StreamableFile
    | {
        downloadUrl: string;
        materialId: string;
        expiresInSeconds: number;
        deliveryMode: "direct";
      }
  > {
    const record = await this.prisma.downloadToken.findUnique({
      where: { token },
      select: {
        token: true,
        materialId: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (!record || record.userId !== userId) {
      throw new NotFoundException("DOWNLOAD_TOKEN_NOT_FOUND");
    }
    if (record.usedAt) {
      throw new GoneException("DOWNLOAD_TOKEN_USED");
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new GoneException("DOWNLOAD_TOKEN_EXPIRED");
    }

    await this.ensureActiveUser(userId);
    const material = await this.ensureDownloadableMaterial(record.materialId);

    // The usedAt check above is advisory only — it reads a snapshot, so two
    // concurrent redemptions of the same token both observe usedAt = null. The
    // claim below is what actually enforces single use: the `usedAt: null`
    // predicate makes the two writers race on the same row and exactly one
    // update matches. The loser gets 410 and never reaches the file, so a
    // token cannot be spent twice (nor inflate downloadCount twice).
    if (!(await this.claimTokenAndCountDownload(token, material.id, userId))) {
      throw new GoneException("DOWNLOAD_TOKEN_USED");
    }

    const urlTtlSeconds = parsePositiveInt(
      this.configService.get<string>(DOWNLOAD_URL_TTL_SECONDS_KEY),
      DEFAULT_DOWNLOAD_URL_TTL_SECONDS,
    );
    const policy = decideDownloadDeliveryPolicy(this.configService, material);

    if (policy.mode === "direct") {
      return {
        materialId: material.id,
        downloadUrl: this.minioService.getSignedDownloadUrl(
          material.fileKey,
          urlTtlSeconds,
        ),
        expiresInSeconds: urlTtlSeconds,
        deliveryMode: "direct",
      };
    }

    const upstream = await this.minioService.getObjectResponse(
      material.fileKey,
      urlTtlSeconds,
    );
    if (!upstream.ok || !upstream.body) {
      throw new NotFoundException("DOWNLOAD_FILE_NOT_FOUND");
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");
    res.setHeader("content-type", contentType);
    if (contentLength) {
      res.setHeader("content-length", contentLength);
    }
    res.setHeader(
      "content-disposition",
      `attachment; filename="${material.id}"`,
    );
    res.setHeader("x-download-delivery-mode", "proxy");
    res.setHeader("x-download-policy-reason", policy.reason);

    return new StreamableFile(upstream.body as any);
  }

  private async ensureDownloadableMaterial(
    materialId: string,
    options?: { publicOnly?: boolean },
  ) {
    const material = await this.prisma.material.findFirst({
      where: {
        id: materialId,
        status: MaterialStatus.APPROVED,
        ...(options?.publicOnly ? { visibility: "PUBLIC" as const } : {}),
        fileSafetyStatus: { in: [FileSafetyStatus.PASSED] },
      },
      select: {
        id: true,
        fileKey: true,
        visibility: true,
        status: true,
        fileSafetyStatus: true,
      },
    });

    if (!material) {
      throw new NotFoundException("MATERIAL_NOT_DOWNLOADABLE");
    }
    return material;
  }

  private async ensureActiveUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("USER_NOT_ACTIVE");
    }
  }

  /**
   * Atomically claim a one-time download token and record the download.
   *
   * Returns false when the token was already spent (another request won the
   * race, or it was redeemed earlier), in which case nothing is written — the
   * Download row and the downloadCount increment are inside the same
   * transaction as the claim, so they can only happen for the single winner.
   */
  private async claimTokenAndCountDownload(
    token: string,
    materialId: string,
    userId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.downloadToken.updateMany({
        where: { token, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (claimed.count !== 1) {
        return false;
      }

      await tx.download.create({
        data: { userId, materialId },
        select: { id: true },
      });
      await tx.material.update({
        where: { id: materialId },
        data: { downloadCount: { increment: 1 } },
        select: { id: true },
      });

      return true;
    });
  }

  /**
   * Base URL the returned `downloadUrl` is built from.
   *
   * `Host` is attacker-controlled, so reflecting it would let a caller shape the
   * download link this API hands back (and any link it gets pasted into). A
   * configured DOWNLOAD_BASE_URL always wins, and in production it is required:
   * booting without it would otherwise silently fall back to the Host header.
   * Outside production the header is still accepted for local/dev convenience,
   * but only after validating it looks like a bare host[:port].
   */
  private getBaseUrl(request?: {
    protocol?: string;
    get?: (name: string) => string | undefined;
  }): string {
    const configured = this.configService.get<string>(DOWNLOAD_BASE_URL_KEY);
    if (configured) {
      return configured.replace(/\/$/, "");
    }

    if (this.configService.get<string>("NODE_ENV") === "production") {
      throw new InternalServerErrorException(
        "DOWNLOAD_BASE_URL must be configured in production",
      );
    }

    const host = request?.get?.("host");
    const safeHost = host && HOST_PATTERN.test(host) ? host : "localhost:3000";
    const protocol = request?.protocol === "https" ? "https" : "http";
    return `${protocol}://${safeHost}`;
  }
}
