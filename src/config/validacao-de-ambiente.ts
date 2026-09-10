type Environment = Record<string, unknown>;

// ---------------------------------------------
// Variáveis obrigatórias
// RESEND_API_KEY fica fora desta lista porque só é exigida quando o provedor
// de email é o Resend; com o provedor de arquivo, cobrar uma chave que não
// será usada faria o ambiente de desenvolvimento depender de uma conta externa
// sem necessidade.
// ---------------------------------------------
const REQUIRED_KEYS = [
  'DATABASE_URL',
  'JWT_SECRET',
  'JWT_ISSUER',
  'JWT_AUDIENCE',
  'EMAIL_FROM',
  'FRONTEND_URL',
  'PAYMENT_WEBHOOK_SECRET',
] as const;

const PLACEHOLDER_PATTERN = /(replace|placeholder|change[-_ ]?me)/i;

const MAX_PORT = 65535;

export const EMAIL_PROVIDERS = ['resend', 'file'] as const;
export type EmailProvider = (typeof EMAIL_PROVIDERS)[number];

// ---------------------------------------------
// Leitura de variável como texto
// A entrada chega tipada como unknown, e passar unknown por String() produz
// "[object Object]" para qualquer valor que não seja primitivo — validaríamos
// um texto que ninguém escreveu. Aqui, o que não é string vira string vazia e
// cai na checagem de obrigatoriedade, que é onde o erro deve aparecer.
// ---------------------------------------------
function asText(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

// ---------------------------------------------
// Normalização de números positivos
// ---------------------------------------------
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

// ---------------------------------------------
// Validação de URL por protocolo
// ---------------------------------------------
function isValidUrl(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

// ---------------------------------------------
// Validação completa do ambiente
// Todos os problemas são acumulados para que a configuração seja corrigida
// numa única inicialização, em vez de falhar uma vez por variável. Os valores
// normalizados voltam no mesmo objeto consumido pelo ConfigModule, e é esse
// retorno que o ConfigService serve — por isso os números chegam como número
// em quem os injeta, e não como texto de process.env.
// ---------------------------------------------
export function validarAmbiente(input: Environment): Environment {
  const environment = { ...input };
  const errors: string[] = [];
  const nodeEnvironment = asText(environment.NODE_ENV, 'development');

  // ---------------------------------------------
  // Ambiente e presença das chaves
  // ---------------------------------------------
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    errors.push('NODE_ENV deve ser development, test ou production');
  }

  for (const key of REQUIRED_KEYS) {
    if (typeof environment[key] !== 'string' || environment[key] === '') {
      errors.push(`${key} é obrigatório`);
    }
  }

  // ---------------------------------------------
  // Porta do servidor HTTP
  // Validada junto com o resto: lida direto de process.env, PORT=abc viraria
  // NaN no listen e a aplicação subiria num estado indefinido em vez de
  // falhar no boot com o motivo escrito. O teto de MAX_PORT é necessário
  // porque "inteiro positivo" sozinho aceitaria 99999, que só quebraria no
  // listen — a mesma falha tardia, de outro jeito.
  // ---------------------------------------------
  const port = asPositiveInteger(environment.PORT, 3000, 'PORT', errors);
  if (port > MAX_PORT) {
    errors.push(`PORT deve estar entre 1 e ${MAX_PORT}`);
  }

  // ---------------------------------------------
  // Provedor de email
  // O provedor de arquivo grava o email em disco e escreve o link de
  // verificação no log, em claro — é o que o torna útil em desenvolvimento e
  // inaceitável em produção, onde o link é credencial. Por isso a combinação
  // com NODE_ENV=production falha no boot, em vez de depender de alguém
  // lembrar de trocar a variável no deploy.
  // ---------------------------------------------
  const emailProvider = asText(environment.EMAIL_PROVIDER, 'resend');
  if (!EMAIL_PROVIDERS.includes(emailProvider as EmailProvider)) {
    errors.push(`EMAIL_PROVIDER deve ser ${EMAIL_PROVIDERS.join(' ou ')}`);
  }
  if (emailProvider === 'file' && nodeEnvironment === 'production') {
    errors.push(
      'EMAIL_PROVIDER=file não pode ser usado com NODE_ENV=production: ' +
        'o provedor de arquivo grava o link de verificação em claro',
    );
  }

  // ---------------------------------------------
  // Banco de dados e credenciais externas
  // ---------------------------------------------
  const databaseUrl = asText(environment.DATABASE_URL);
  if (databaseUrl && !isValidUrl(databaseUrl, ['postgres:', 'postgresql:'])) {
    errors.push('DATABASE_URL deve ser uma URL PostgreSQL válida');
  }

  const jwtSecret = asText(environment.JWT_SECRET);
  if (jwtSecret && Buffer.byteLength(jwtSecret, 'utf8') < 32) {
    errors.push('JWT_SECRET deve ter pelo menos 32 bytes');
  } else if (jwtSecret && PLACEHOLDER_PATTERN.test(jwtSecret)) {
    errors.push('JWT_SECRET não pode ser placeholder');
  }

  // ---------------------------------------------
  // Segredo de assinatura do webhook de pagamento
  // Mesma exigência de tamanho do JWT_SECRET: é a chave HMAC que autentica
  // POST /payments/webhook — curta ou previsível, um atacante forjaria
  // confirmação de pagamento sem nunca ter cobrado ninguém.
  // ---------------------------------------------
  const paymentWebhookSecret = asText(environment.PAYMENT_WEBHOOK_SECRET);
  if (paymentWebhookSecret && Buffer.byteLength(paymentWebhookSecret, 'utf8') < 32) {
    errors.push('PAYMENT_WEBHOOK_SECRET deve ter pelo menos 32 bytes');
  } else if (
    paymentWebhookSecret &&
    PLACEHOLDER_PATTERN.test(paymentWebhookSecret)
  ) {
    errors.push('PAYMENT_WEBHOOK_SECRET não pode ser placeholder');
  }

  const resendApiKey = asText(environment.RESEND_API_KEY);
  if (emailProvider === 'resend' && !resendApiKey) {
    errors.push('RESEND_API_KEY é obrigatório quando EMAIL_PROVIDER=resend');
  } else if (
    resendApiKey &&
    (!resendApiKey.startsWith('re_') || PLACEHOLDER_PATTERN.test(resendApiKey))
  ) {
    errors.push('RESEND_API_KEY deve ser uma chave real do Resend');
  }

  // ---------------------------------------------
  // URLs públicas e integração de senhas vazadas
  // ---------------------------------------------
  const frontendUrl = asText(environment.FRONTEND_URL);
  if (frontendUrl && !isValidUrl(frontendUrl, ['http:', 'https:'])) {
    errors.push('FRONTEND_URL deve ser uma URL HTTP válida');
  } else if (
    nodeEnvironment === 'production' &&
    frontendUrl &&
    new URL(frontendUrl).protocol !== 'https:'
  ) {
    errors.push('FRONTEND_URL deve usar HTTPS em produção');
  }

  const hibpApiUrl = asText(
    environment.HIBP_API_URL,
    'https://api.pwnedpasswords.com',
  );
  if (!isValidUrl(hibpApiUrl, ['https:'])) {
    errors.push('HIBP_API_URL deve ser uma URL HTTPS válida');
  }

  // ---------------------------------------------
  // Limites temporais de segurança
  // ---------------------------------------------
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
    PORT: port,
    EMAIL_PROVIDER: emailProvider,
    HIBP_API_URL: hibpApiUrl,
    HIBP_TIMEOUT_MS: hibpTimeoutMs,
    AUTH_MIN_RESPONSE_MS: authMinResponseMs,
  };
}
