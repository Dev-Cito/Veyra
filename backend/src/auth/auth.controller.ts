import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { RATE_LIMITS, RateLimit } from '../common/rate-limits.js';
import type { User } from '../users/user.entity.js';
import { AUTH_COOKIE, JWT_EXPIRES_IN_SECONDS } from './auth.constants.js';
import { AuthService } from './auth.service.js';
import { CurrentUser } from './current-user.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { sessionCookieOptions } from './session-cookie.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @RateLimit(RATE_LIMITS.register)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const { user, token } = await this.authService.register(dto);
    res.cookie(AUTH_COOKIE, token, {
      ...sessionCookieOptions(),
      maxAge: JWT_EXPIRES_IN_SECONDS * 1000,
    });
    return user;
  }

  @Post('login')
  @RateLimit(RATE_LIMITS.login)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<User> {
    const { user, token } = await this.authService.login(dto);
    res.cookie(AUTH_COOKIE, token, {
      ...sessionCookieOptions(),
      maxAge: JWT_EXPIRES_IN_SECONDS * 1000,
    });
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response): void {
    res.clearCookie(AUTH_COOKIE, sessionCookieOptions());
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User): User {
    return user;
  }
}
