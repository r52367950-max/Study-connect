import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';

type SignedRequestOptions = {
  method: 'PUT' | 'HEAD' | 'DELETE';
  canonicalUri: string;
  payload?: Buffer;
  contentType?: string;
};

@Injectable()
export class MinioService {
  private static readonly DEFAULT_SIGNED_URL_TTL_SECONDS = 300;
  private static readonly MAX_SIGNED_URL_TTL_SECONDS = 900;
  private readonly endpoint: string;
  private readonly port: number;
  private readonly useSSL: boolean;
  private readonly accessKey: string;
  private readonly secretKey: string;
  private readonly bucket: string;
  private readonly region: string;
  private readonly signedUrlTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.get<string>('MINIO_ENDPOINT') ?? 'localhost';
    this.port = Number(this.configService.get<string>('MINIO_PORT') ?? 9000);
    this.useSSL = this.configService.get<string>('MINIO_USE_SSL') === 'true';
    this.accessKey = this.configService.get<string>('MINIO_ACCESS_KEY') ?? '';
    this.secretKey = this.configService.get<string>('MINIO_SECRET_KEY') ?? '';
    this.bucket = this.configService.get<string>('MINIO_BUCKET') ?? 'study-connect';
    this.region = this.configService.get<string>('MINIO_REGION') ?? 'us-east-1';
    this.signedUrlTtlSeconds = this.parseSignedUrlTtlSeconds(
      this.configService.get<string>('MINIO_SIGNED_URL_TTL_SECONDS'),
    );
  }

  async uploadObject(key: string, payload: Buffer, contentType: string): Promise<string> {
    await this.ensureBucket();

    await this.signedRequest({
      method: 'PUT',
      canonicalUri: `/${this.bucket}/${this.encodePath(key)}`,
      payload,
      contentType,
    });

    return `${this.bucket}/${key}`;
  }

  async deleteObject(key: string): Promise<void> {
    const response = await this.signedRequest({
      method: 'DELETE',
      canonicalUri: `/${this.bucket}/${this.encodePath(key)}` ,
    });

    if (!response.ok && response.status !== 404) {
      throw new InternalServerErrorException('Failed to delete object from MinIO');
    }
  }

  getObjectUrl(key: string): string {
    return `${this.baseUrl()}/${this.bucket}/${this.encodePath(key)}`;
  }

  getSignedDownloadUrl(key: string, ttlSeconds: number = this.signedUrlTtlSeconds): string {
    if (!this.accessKey || !this.secretKey) {
      throw new InternalServerErrorException('MinIO credentials are not configured');
    }

    const safeTtlSeconds = this.parseSignedUrlTtlSeconds(String(ttlSeconds));
    const canonicalUri = `/${this.bucket}/${this.encodePath(key)}`;
    const host = `${this.endpoint}:${this.port}`;
    const amzDate = this.getAmzDate();
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const signedHeaders = 'host';

    const queryParams = [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
      ['X-Amz-Credential', `${this.accessKey}/${credentialScope}`],
      ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', String(safeTtlSeconds)],
      ['X-Amz-SignedHeaders', signedHeaders],
    ] as const;

    const canonicalQueryString = queryParams
      .map(([queryKey, queryValue]) => `${this.encodeQuery(queryKey)}=${this.encodeQuery(queryValue)}`)
      .join('&');

    const canonicalRequest = [
      'GET',
      canonicalUri,
      canonicalQueryString,
      `host:${host}\n`,
      signedHeaders,
      'UNSIGNED-PAYLOAD',
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSigningKey(dateStamp);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    return `${this.baseUrl()}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  }

  private async ensureBucket(): Promise<void> {
    const headResponse = await this.signedRequest({
      method: 'HEAD',
      canonicalUri: `/${this.bucket}`,
    });

    if (headResponse.status === 404) {
      const createResponse = await this.signedRequest({
        method: 'PUT',
        canonicalUri: `/${this.bucket}`,
      });

      if (!createResponse.ok) {
        throw new InternalServerErrorException('Failed to create MinIO bucket');
      }
      return;
    }

    if (!headResponse.ok) {
      throw new InternalServerErrorException('Failed to access MinIO bucket');
    }
  }

  private async signedRequest(options: SignedRequestOptions): Promise<Response> {
    if (!this.accessKey || !this.secretKey) {
      throw new InternalServerErrorException('MinIO credentials are not configured');
    }

    const payload = options.payload ?? Buffer.alloc(0);
    const payloadHash = this.sha256Hex(payload);
    const amzDate = this.getAmzDate();
    const dateStamp = amzDate.slice(0, 8);
    const host = `${this.endpoint}:${this.port}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

    const canonicalRequest = [
      options.method,
      options.canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join('\n');

    const signingKey = this.getSigningKey(dateStamp);
    const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const authorization =
      `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(`${this.baseUrl()}${options.canonicalUri}`, {
      method: options.method,
      headers: {
        host,
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        authorization,
        ...(options.contentType ? { 'content-type': options.contentType } : {}),
      },
      body: options.method === 'PUT' ? new Uint8Array(payload) : undefined,
    });
  }

  private baseUrl(): string {
    return `${this.useSSL ? 'https' : 'http'}://${this.endpoint}:${this.port}`;
  }

  private encodePath(pathValue: string): string {
    return pathValue
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  private encodeQuery(value: string): string {
    return encodeURIComponent(value);
  }

  private parseSignedUrlTtlSeconds(raw: string | undefined): number {
    const parsed = Number(raw ?? MinioService.DEFAULT_SIGNED_URL_TTL_SECONDS);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return MinioService.DEFAULT_SIGNED_URL_TTL_SECONDS;
    }

    return Math.min(Math.floor(parsed), MinioService.MAX_SIGNED_URL_TTL_SECONDS);
  }

  private sha256Hex(input: string | Buffer): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private getAmzDate(): string {
    return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  private getSigningKey(dateStamp: string): Buffer {
    const kDate = createHmac('sha256', `AWS4${this.secretKey}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(this.region).digest();
    const kService = createHmac('sha256', kRegion).update('s3').digest();
    return createHmac('sha256', kService).update('aws4_request').digest();
  }
}
