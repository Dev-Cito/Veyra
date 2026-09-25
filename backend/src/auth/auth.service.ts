import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import type { User } from '../users/user.entity.js';
import { UsersService } from '../users/users.service.js';
import { BCRYPT_ROUNDS, type JwtPayload } from './auth.constants.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ user: User; token: string }> {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
    });
    return { user, token: await this.sign(user) };
  }

  async login(dto: LoginDto): Promise<{ user: User; token: string }> {
    const found = await this.usersService.findByEmailWithPassword(dto.email);
    const valid =
      found !== null &&
      (await bcrypt.compare(dto.password, found.passwordHash));
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const { passwordHash: _, ...user } = found;
    return { user: user as User, token: await this.sign(user as User) };
  }

  private sign(user: User): Promise<string> {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.signAsync(payload);
  }
}
