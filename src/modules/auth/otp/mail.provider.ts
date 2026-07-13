import { Logger } from '@nestjs/common';

export interface MailProvider {
  readonly name: string;
  send(email: string, code: string): Promise<void>;
}

export class ConsoleMailProvider implements MailProvider {
  readonly name = 'console';
  private readonly logger = new Logger(ConsoleMailProvider.name);

  async send(email: string, code: string): Promise<void> {
    this.logger.log(`[OTP/MAIL] -> ${email}  code=${code}`);
  }
}

export class SmtpMailProvider implements MailProvider {
  readonly name = 'smtp';

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly user: string,
    private readonly pass: string,
    private readonly from: string,
  ) {}

  async send(email: string, code: string): Promise<void> {
    const optionalRequire = (name: string): unknown => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require(name);
      } catch {
        return null;
      }
    };
    const nodemailer = optionalRequire('nodemailer');
    if (!nodemailer) {
      throw new Error('SmtpMailProvider is configured but nodemailer is not installed (run: npm i nodemailer)');
    }
    const transport = (nodemailer as any).createTransport({
      host: this.host,
      port: this.port,
      secure: this.port === 465,
      auth: { user: this.user, pass: this.pass },
    });
    await transport.sendMail({
      from: this.from,
      to: email,
      subject: 'StudyConnect 验证码',
      text: `您的验证码：${code}，5 分钟内有效。请勿向他人泄露。`,
    });
  }
}

export function createMailProvider(env: Record<string, string | undefined>): MailProvider {
  const host = env.SMTP_HOST;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  if (host && user && pass) {
    return new SmtpMailProvider(
      host,
      Number(env.SMTP_PORT ?? 587),
      user,
      pass,
      env.SMTP_FROM ?? user,
    );
  }
  // The console fallback logs OTP codes in cleartext — acceptable for local dev only. Refuse to
  // start in production without a real mail provider rather than silently leak live codes to logs.
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'Mail OTP provider is not configured in production. Set SMTP_* env vars; the console provider (which logs codes in cleartext) is disabled in production.',
    );
  }
  return new ConsoleMailProvider();
}
