import { describe, it, expect } from 'vitest';
import { loadConfig, ConfigError } from '../src/index.js';

describe('config', () => {
  it('loads with defaults in development', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgresql://localhost:5432/botore' });
    expect(cfg.environment).toBe('development');
    expect(cfg.port).toBe(8080);
    expect(cfg.serviceVersion).toBe('0.0.0-dev');
  });

  it('fails fast with all problems listed', () => {
    try {
      loadConfig({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toContain('DATABASE_URL');
    }
    expect(() => loadConfig({ DATABASE_URL: 'x', PORT: '99999' })).toThrow(/PORT/);
    expect(() => loadConfig({ DATABASE_URL: 'x', BOTORE_ENV: 'staging' })).toThrow(/BOTORE_ENV/);
  });

  it('accepts explicit production shape', () => {
    const cfg = loadConfig({
      BOTORE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL: 'postgresql://prod/db',
      SERVICE_VERSION: '1.2.3',
    });
    expect(cfg.port).toBe(3000);
    expect(cfg.serviceVersion).toBe('1.2.3');
  });
});
