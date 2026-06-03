export const STRONG_PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
export const PASSWORD_POLICY_MSG = 'Password must be at least 8 characters with uppercase, lowercase, and number';

export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || !password) return 'Password is required';
  if (password.length > 128) return 'Password too long';
  if (!STRONG_PASSWORD_RE.test(password)) return PASSWORD_POLICY_MSG;
  return null;
}
