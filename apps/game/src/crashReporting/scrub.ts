/**
 * Minimize PII and strip secrets before any event leaves the device.
 * Never log service-role keys, passwords, or auth tokens into Sentry.
 */

const SENSITIVE_KEY =
  /pass(word|wd)?|secret|token|authorization|service[_-]?role|anon[_-]?key|api[_-]?key|cookie|set-cookie|refresh[_-]?token|access[_-]?token|private[_-]?key|dsn/i;

const SENSITIVE_VALUE =
  /service_role|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.|password\s*[:=]|Bearer\s+[A-Za-z0-9._~+/=-]+/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

function scrubPrimitive(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (SENSITIVE_VALUE.test(value)) return '[Filtered]';
  return value;
}

export function scrubRecord(input: unknown, depth = 0): unknown {
  if (depth > 6 || input == null) return input;
  if (Array.isArray(input)) {
    return input.map((item) => scrubRecord(item, depth + 1));
  }
  if (typeof input !== 'object') return scrubPrimitive(input);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isSensitiveKey(key)) {
      out[key] = '[Filtered]';
      continue;
    }
    out[key] = scrubRecord(value, depth + 1);
  }
  return out;
}

/** Shape compatible with Sentry Event extras / contexts (loose). */
export type ScrubbableEvent = {
  user?: { email?: string | null; ip_address?: string | null; username?: string | null } | null;
  request?: { headers?: Record<string, unknown> | null; cookies?: unknown; data?: unknown } | null;
  extra?: Record<string, unknown> | null;
  contexts?: Record<string, unknown> | null;
  breadcrumbs?: Array<{ data?: Record<string, unknown> | null } | null> | null;
  tags?: Record<string, unknown> | null;
};

/**
 * Drop emails / usernames / IPs and scrub nested bags. Mutates and returns the
 * same event reference for Sentry `beforeSend` convenience.
 */
export function scrubCrashEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.user) {
    // Keep an opaque id if present; strip contact-shaped fields.
    const id =
      typeof (event.user as { id?: unknown }).id === 'string'
        ? (event.user as { id: string }).id
        : undefined;
    event.user = id ? ({ id } as typeof event.user) : null;
  }

  if (event.request) {
    if (event.request.headers) {
      event.request.headers = scrubRecord(event.request.headers) as Record<string, unknown>;
    }
    if (event.request.cookies != null) event.request.cookies = '[Filtered]';
    if (event.request.data != null) {
      event.request.data = scrubRecord(event.request.data);
    }
  }

  if (event.extra) event.extra = scrubRecord(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubRecord(event.contexts) as Record<string, unknown>;
  if (event.tags) event.tags = scrubRecord(event.tags) as Record<string, unknown>;

  if (Array.isArray(event.breadcrumbs)) {
    for (const crumb of event.breadcrumbs) {
      if (crumb?.data) crumb.data = scrubRecord(crumb.data) as Record<string, unknown>;
    }
  }

  return event;
}
