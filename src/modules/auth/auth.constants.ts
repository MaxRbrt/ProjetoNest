export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;
export const VERIFICATION_COOLDOWN_MS = 5 * 60 * 1000;
export const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const REFRESH_COOKIE_NAME = 'refresh_token';

export const GENERIC_ACCEPTED_RESPONSE = {
  message:
    'Se os dados forem elegíveis, você receberá as instruções por email.',
} as const;
