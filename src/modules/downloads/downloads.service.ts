import {
  GoneException,
  Injectable,
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

    await (this.prisma as any).downloadToken.create({
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
    const record = await (this.prisma as any).downloadToken.findUnique({
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

    const usedAt = new Date();
    await this.markTokenUsedAndCountDownload(
      token,
      material.id,
      userId,
      usedAt,
    );

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

  private async markTokenUsedAndCountDownload(
    token: string,
    materialId: string,
    userId: string,
    usedAt: Date,
  ) {
    await this.prisma.$transaction([
      (this.prisma as any).downloadToken.update({
        where: { token },
        data: { usedAt },
        select: { token: true },
      }),
      this.prisma.download.create({
        data: { userId, materialId },
        select: {
          id: true,
          userId: true,
          materialId: true,
          downloadedAt: true,
        },
      }),
      this.prisma.material.update({
        where: { id: materialId },
        data: { downloadCount: { increment: 1 } },
        select: { id: true },
      }),
    ]);
  }

  private getBaseUrl(request?: {
    protocol?: string;
    get?: (name: string) => string | undefined;
  }): string {
    const configured = this.configService.get<string>(DOWNLOAD_BASE_URL_KEY);
    if (configured) {
      return configured.replace(/\/$/, "");
    }
    const host = request?.get?.("host") ?? "localhost:3000";
    const protocol = request?.protocol ?? "http";
    return `${protocol}://${host}`;
  }
}
