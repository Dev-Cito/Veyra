import { createMailTransport, readMailConfig } from './mail.config.js';

const complete = {
  MAIL_ENABLED: 'true',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: '587',
  SMTP_USER: 'user',
  SMTP_PASSWORD: 'secret',
  MAIL_FROM: 'Veyra <no-reply@example.com>',
  FRONTEND_URL: 'https://app.example.com',
};

describe('readMailConfig', () => {
  it('is disabled unless MAIL_ENABLED is exactly "true"', () => {
    for (const value of [undefined, 'false', '1', 'TRUE']) {
      expect(readMailConfig({ ...complete, MAIL_ENABLED: value }).enabled).toBe(
        false,
      );
    }
  });

  it('is disabled, never throwing, when the SMTP configuration is incomplete', () => {
    const config = readMailConfig({ MAIL_ENABLED: 'true' });
    expect(config).toEqual({
      enabled: false,
      reason: 'missing SMTP_HOST, SMTP_PORT, MAIL_FROM, FRONTEND_URL',
    });
    expect(readMailConfig({ ...complete, SMTP_PASSWORD: '' }).enabled).toBe(
      false,
    );
    expect(readMailConfig({ ...complete, SMTP_PORT: 'abc' }).enabled).toBe(
      false,
    );
  });

  it('is enabled with a complete configuration', () => {
    expect(readMailConfig(complete)).toMatchObject({
      enabled: true,
      host: 'smtp.example.com',
      port: 587,
      secure: false,
    });
  });
});

describe('createMailTransport', () => {
  it('creates no transport when disabled', () => {
    expect(createMailTransport(readMailConfig({}))).toBeNull();
  });
});
