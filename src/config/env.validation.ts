type Environment = Record<string, unknown>;

const REQUIRED_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'RESEND_API_KEY',
  'EMAIL_FROM',
  'FRONTEND_URL',
] as const;

const PLACEHOLDER_PATTERN = /(replace|placeholder|change[-_ ]?me)/i;

function asPositiveInteger(
  value: unknown,
  fallback: number,
  key: string,
  errors: string[],
): number {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    errors.push(`${key} deve ser um inteiro positivo`);
    return fallback;
  }

  return parsed;
}

function isValidUrl(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function validateEnvironment(input: Environment): Environment {
  const environment = { ...input };
  const errors: string[] = [];
  const nodeEnvironment = String(environment.NODE_ENV ?? 'development');

  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    errors.push('NODE_ENV deve ser development, test ou production');
  }

  for (const key of REQUIRED_KEYS) {
    if (typeof environment[key] !== 'string' || environment[key] === '') {
      errors.push(`${key} é obrigatório`);
    }
  }

  const databaseUrl = String(environment.DATABASE_URL ?? '');
  if (databaseUrl && !isValidUrl(databaseUrl, ['postgres:', 'postgresql:'])) {
    errors.push('DATABASE_URL deve ser uma URL PostgreSQL válida');
  }

  const jwtSecret = String(environment.JWT_SECRET ?? '');
  if (jwtSecret && Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    errors.push('JWT_SECRET deve ter pelo menos 32 bytes');
  } else if (jwtSecret && PLACEHOLDER_PATTERN.test(jwtSecret)) {
    errors.push('JWT_SECRET não pode ser placeholder');
  }

  const resendApiKey = String(environment.RESEND_API_KEY ?? '');
  if (
    resendApiKey &&
    (!resendApiKey.startsWith('re_') || PLACEHOLDER_PATTERN.test(resendApiKey))
  ) {
    errors.push('RESEND_API_KEY deve ser uma chave real do Resend');
  }

  const frontendUrl = String(environment.FRONTEND_URL ?? '');
  if (frontendUrl && !isValidUrl(frontendUrl, ['http:', 'https:'])) {
    errors.push('FRONTEND_URL deve ser uma URL HTTP válida');
  } else if (
    nodeEnvironment === 'production' &&
    frontendUrl &&
    new URL(frontendUrl).protocol !== 'https:'
  ) {
    errors.push('FRONTEND_URL deve usar HTTPS em produção');
  }

  const hibpApiUrl = String(
    environment.HIBP_API_URL ?? 'https://api.pwnedpasswords.com',
  );
  if (!isValidUrl(hibpApiUrl, ['https:'])) {
    errors.push('HIBP_API_URL deve ser uma URL HTTPS válida');
  }

  const hibpTimeoutMs = asPositiveInteger(
    environment.HIBP_TIMEOUT_MS,
    3000,
    'HIBP_TIMEOUT_MS',
    errors,
  );
  const authMinResponseMs = asPositiveInteger(
    environment.AUTH_MIN_RESPONSE_MS,
    500,
    'AUTH_MIN_RESPONSE_MS',
    errors,
  );

  if (errors.length > 0) {
    throw new Error(`Configuração inválida: ${errors.join('; ')}`);
  }

  return {
    ...environment,
    NODE_ENV: nodeEnvironment,
    HIBP_API_URL: hibpApiUrl,
    HIBP_TIMEOUT_MS: hibpTimeoutMs,
    AUTH_MIN_RESPONSE_MS: authMinResponseMs,
  };
}
