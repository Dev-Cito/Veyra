import { Inject, Logger, Module, type OnModuleInit } from '@nestjs/common';
import { createLlmClient, LLM_CLIENT, type LlmClient } from './llm.client.js';
import { readLlmConfig } from './llm.config.js';
import { FeaturesController } from './features.controller.js';

@Module({
  providers: [
    {
      // null when the LLM is disabled: no client, no connection ever opened.
      // Tests override it with a fake.
      provide: LLM_CLIENT,
      useFactory: () => createLlmClient(readLlmConfig(process.env)),
    },
  ],
  controllers: [FeaturesController],
  exports: [LLM_CLIENT],
})
export class LlmModule implements OnModuleInit {
  private readonly logger = new Logger('Llm');

  constructor(@Inject(LLM_CLIENT) private readonly client: LlmClient | null) {}

  onModuleInit(): void {
    const config = readLlmConfig(process.env);
    if (this.client) {
      // The model and the host only: never the key.
      const host = config.enabled
        ? new URL(config.baseUrl).host
        : 'injected client';
      this.logger.log(
        `Assisted task creation enabled: ${this.client.model} via ${host}`,
      );
    } else {
      const disabled = `Assisted task creation disabled (${config.enabled ? 'no client' : config.reason})`;
      // Asking for it and not getting it deserves a warning; not asking does not.
      if (process.env.LLM_ENABLED === 'true') {
        this.logger.warn(disabled);
      } else {
        this.logger.log(disabled);
      }
    }
  }
}
