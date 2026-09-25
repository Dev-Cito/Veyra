import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { buildDataSourceOptions } from './database/data-source.options.js';
import { WorkspacesModule } from './workspaces/workspaces.module.js';

@Module({
  imports: [
    // Loads .env into process.env; real environment variables take precedence.
    ConfigModule.forRoot({ isGlobal: true }),
    // Factory so the options are built after ConfigModule has loaded .env.
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDataSourceOptions(),
    }),
    AuthModule,
    WorkspacesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
