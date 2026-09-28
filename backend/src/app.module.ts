import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BoardsModule } from './boards/boards.module.js';
import {
  RATE_LIMIT_MESSAGE,
  RATE_LIMIT_WINDOW_MS,
} from './common/rate-limits.js';
import { buildDataSourceOptions } from './database/data-source.options.js';
import { InvitationsModule } from './invitations/invitations.module.js';
import { ListsModule } from './lists/lists.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';

@Module({
  imports: [
    // Loads .env into process.env; real environment variables take precedence.
    ConfigModule.forRoot({ isGlobal: true }),
    // Factory so the options are built after ConfigModule has loaded .env.
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDataSourceOptions(),
    }),
    // Only routes decorated with @RateLimit() are throttled; these defaults
    // are overridden per route.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: RATE_LIMIT_WINDOW_MS, limit: 10 }],
      errorMessage: RATE_LIMIT_MESSAGE,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    WorkspacesModule,
    BoardsModule,
    ListsModule,
    TasksModule,
    InvitationsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
