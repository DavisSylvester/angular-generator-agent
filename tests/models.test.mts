import { describe, expect, it } from 'bun:test';
import { PROVIDER_MODEL_MAP, getFallbackTiers } from '../src/config/models.mts';

describe(`Model configuration`, () => {
  it(`should have models for all providers`, () => {
    expect(PROVIDER_MODEL_MAP.ollama).toBeDefined();
    expect(PROVIDER_MODEL_MAP.openai).toBeDefined();
    expect(PROVIDER_MODEL_MAP.anthropic).toBeDefined();
  });

  it(`should have all agent roles for each provider`, () => {
    for (const provider of [`ollama`, `openai`, `anthropic`] as const) {
      const models = PROVIDER_MODEL_MAP[provider];
      expect(models.planning).toBeDefined();
      expect(models.codegen).toBeDefined();
      expect(models.validation).toBeDefined();
    }
  });

  it(`should have temperature between 0 and 1 for all models`, () => {
    for (const provider of [`ollama`, `openai`, `anthropic`] as const) {
      const models = PROVIDER_MODEL_MAP[provider];
      for (const role of [`planning`, `codegen`, `validation`] as const) {
        expect(models[role].temperature).toBeGreaterThanOrEqual(0);
        expect(models[role].temperature).toBeLessThanOrEqual(1);
      }
    }
  });

  it(`should return fallback tiers excluding primary provider`, () => {
    const ollamaFallbacks = getFallbackTiers(`ollama`);
    expect(ollamaFallbacks.every((t) => t.provider !== `ollama`)).toBe(true);

    const openaiFallbacks = getFallbackTiers(`openai`);
    expect(openaiFallbacks.every((t) => t.provider !== `openai`)).toBe(true);

    const anthropicFallbacks = getFallbackTiers(`anthropic`);
    expect(anthropicFallbacks.every((t) => t.provider !== `anthropic`)).toBe(true);
  });
});
