import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { LLM_CLIENT, type LlmClient } from './llm.client.js';

export interface Features {
  /** POST …/tasks/parse is configured: the interface shows its button. */
  assistedTaskCreation: boolean;
}

/** What this deployment offers, so the interface never shows a dead button. */
@Controller('features')
@UseGuards(JwtAuthGuard)
export class FeaturesController {
  constructor(@Inject(LLM_CLIENT) private readonly client: LlmClient | null) {}

  @Get()
  get(): Features {
    return { assistedTaskCreation: this.client !== null };
  }
}
