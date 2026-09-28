import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';

/**
 * The global pipe: rejects malformed input with 400, except constraints
 * declared with asNotFound(), which answer 404 with their own message.
 */
class AppValidationPipe extends ValidationPipe {
  constructor() {
    super({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const badRequest = this.createExceptionFactory();
    this.exceptionFactory = (errors: ValidationError[]) => {
      const notFound = errors
        .flatMap((error) => Object.values(error.contexts ?? {}))
        .find(
          (context): context is { notFound: string } =>
            typeof (context as { notFound?: unknown })?.notFound === 'string',
        );
      return notFound
        ? new NotFoundException(notFound.notFound)
        : badRequest(errors);
    };
  }
}

/** Global app wiring shared by main.ts and the e2e tests. */
export function configureApp(app: INestApplication): void {
  // Behind Render's proxy, trust exactly one hop: req.ip becomes the address
  // that proxy appended to X-Forwarded-For (the real client), not the proxy's
  // own. Values a client puts further left are ignored. Rate limits key on it.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  app.use(cookieParser());
  app.useGlobalPipes(new AppValidationPipe());
  app.enableCors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  });
}
