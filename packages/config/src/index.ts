/**
 * Environment configuration parsing — runtime-validated, fail-fast.
 *
 * No secrets are ever committed; `.env.example` documents every variable.
 * This package parses a plain record (typically process.env) into a typed,
 * validated config object. It imports nothing provider-specific.
 */
import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const EnvironmentSchema = Type.Union([
  Type.Literal('development'),
  Type.Literal('test'),
  Type.Literal('production'),
]);

export const AppConfigSchema = Type.Object({
  environment: EnvironmentSchema,
  port: Type.Integer({ minimum: 1, maximum: 65535 }),
  /** PostgreSQL connection string for the API's server credential. */
  databaseUrl: Type.String({ minLength: 1 }),
  serviceVersion: Type.String({ minLength: 1 }),
});

export type AppConfig = Static<typeof AppConfigSchema>;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Parses and validates raw env values; throws ConfigError listing all problems. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  const issues: string[] = [];
  const environment = env['BOTORE_ENV'] ?? 'development';
  if (!['development', 'test', 'production'].includes(environment)) {
    issues.push(`BOTORE_ENV invalid: ${environment}`);
  }
  const portRaw = env['PORT'] ?? '8080';
  const port = Number.parseInt(portRaw, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    issues.push(`PORT invalid: ${portRaw}`);
  }
  const databaseUrl = env['DATABASE_URL'];
  if (!databaseUrl) issues.push('DATABASE_URL missing');
  const serviceVersion = env['SERVICE_VERSION'] ?? '0.0.0-dev';
  if (serviceVersion.length === 0) issues.push('SERVICE_VERSION empty');

  if (issues.length > 0) {
    throw new ConfigError(`invalid configuration: ${issues.join('; ')}`);
  }

  const candidate: unknown = { environment, port, databaseUrl, serviceVersion };
  if (!Value.Check(AppConfigSchema, candidate)) {
    throw new ConfigError('configuration failed schema validation');
  }
  return candidate as AppConfig;
}
