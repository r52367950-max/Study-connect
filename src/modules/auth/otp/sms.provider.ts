import { Logger } from '@nestjs/common';

export interface SmsProvider {
  readonly name: string;
  send(phone: string, code: string): Promise<void>;
}

export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleSmsProvider.name);

  async send(phone: string, code: string): Promise<void> {
    this.logger.log(`[OTP/SMS] -> ${phone}  code=${code}`);
  }
}

export class AliyunSmsProvider implements SmsProvider {
  readonly name = 'aliyun';

  constructor(
    private readonly accessKeyId: string,
    private readonly accessKeySecret: string,
    private readonly signName: string,
    private readonly templateCode: string,
    private readonly endpoint = 'dysmsapi.aliyuncs.com',
  ) {}

  async send(phone: string, code: string): Promise<void> {
    // Use eval'd dynamic require so the optional SDK does not become a hard
    // TS resolution target during build / ts-node compilation.
    const optionalRequire = (name: string): unknown => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require(name);
      } catch {
        return null;
      }
    };
    const sdk = optionalRequire('@alicloud/dysmsapi20170525');
    if (!sdk) {
      throw new Error(
        'AliyunSmsProvider is configured but @alicloud/dysmsapi20170525 is not installed (run: npm i @alicloud/dysmsapi20170525 @alicloud/openapi-client)',
      );
    }

    const openApi = optionalRequire('@alicloud/openapi-client');
    if (!openApi) {
      throw new Error('AliyunSmsProvider is configured but @alicloud/openapi-client is not installed');
    }

    const ClientCtor = (sdk as { default?: { default?: unknown }; default_?: unknown }).default;
    const Dysmsapi: any =
      (ClientCtor as { default?: unknown })?.default ?? ClientCtor ?? sdk;
    const Config = (openApi as { default?: unknown; Config?: unknown });
    const ConfigCtor: any = (Config as { default?: any }).default?.Config ?? (Config as any).Config;
    const SendSmsRequestCtor: any =
      (sdk as any).SendSmsRequest ??
      (sdk as any).default?.SendSmsRequest ??
      (sdk as any).default?.default?.SendSmsRequest;

    const config = new ConfigCtor({
      accessKeyId: this.accessKeyId,
      accessKeySecret: this.accessKeySecret,
      endpoint: this.endpoint,
    });
    const client = new Dysmsapi(config);
    const request = new SendSmsRequestCtor({
      phoneNumbers: phone,
      signName: this.signName,
      templateCode: this.templateCode,
      templateParam: JSON.stringify({ code }),
    });

    const response = await client.sendSms(request);
    const body = response?.body;
    if (body?.code && body.code !== 'OK') {
      throw new Error(`Aliyun SMS failed: ${body.code} ${body.message ?? ''}`);
    }
  }
}

export function createSmsProvider(env: Record<string, string | undefined>): SmsProvider {
  const id = env.ALIYUN_SMS_ACCESS_KEY_ID;
  const secret = env.ALIYUN_SMS_ACCESS_KEY_SECRET;
  const sign = env.ALIYUN_SMS_SIGN_NAME;
  const template = env.ALIYUN_SMS_TEMPLATE_CODE;
  if (id && secret && sign && template) {
    return new AliyunSmsProvider(id, secret, sign, template, env.ALIYUN_SMS_ENDPOINT);
  }
  // The console fallback logs OTP codes in cleartext — acceptable for local dev only. Refuse to
  // start in production without a real SMS provider rather than silently leak live codes to logs.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'SMS OTP provider is not configured in production. Set ALIYUN_SMS_* env vars; the console provider (which logs codes in cleartext) is disabled in production.',
    );
  }
  return new ConsoleSmsProvider();
}
