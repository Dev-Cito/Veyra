import { Module } from '@nestjs/common';
import {
  createMailTransport,
  MAIL_TRANSPORT,
  readMailConfig,
} from './mail.config.js';
import { MailService } from './mail.service.js';

@Module({
  providers: [
    {
      // null when mail is disabled. Tests override it with an in-memory fake.
      provide: MAIL_TRANSPORT,
      useFactory: () => createMailTransport(readMailConfig(process.env)),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
