export type ErrorCode = 'SESSION_EXPIRED' | 'FORBIDDEN' | 'UNKNOWN_FUNCTION' | 'SERVER' | 'APP_ERROR' | 'NETWORK' | 'TIMEOUT' | 'BAD_RESPONSE' | 'NO_API';

export class ApiError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** A message the user can read, in their language when we wrote it ourselves. Server messages are already Arabic. */
export function errorText(e: unknown, lang: 'ar' | 'en'): string {
  if (e instanceof ApiError) {
    const own: Partial<Record<ErrorCode, [string, string]>> = {
      SESSION_EXPIRED: ['الجلسة خلصت، سجّل دخول تاني', 'Your session ended, sign in again'],
      NETWORK: ['مفيش اتصال بالسيرفر، اتأكد من النت وجرّب تاني', 'Can’t reach the server, check your connection'],
      TIMEOUT: ['السيرفر اتأخر في الرد، جرّب تاني', 'The server took too long, try again'],
      BAD_RESPONSE: ['السيرفر رجّع رد مش متوقع', 'The server sent an unexpected response'],
      SERVER: ['حصلت مشكلة في السيرفر، جرّب تاني', 'Something went wrong on the server, try again'],
      NO_API: ['رابط الـ API مش متظبط (VITE_API_URL)', 'The API URL is not configured (VITE_API_URL)'],
      UNKNOWN_FUNCTION: ['الخاصية دي لسه مش متفعّلة في السيرفر', 'This feature is not enabled on the server yet']
    };
    const o = own[e.code];
    if (o && (e.code !== 'SERVER' || !e.message)) return lang === 'ar' ? o[0] : o[1];
    return e.message;
  }
  return String((e as Error)?.message || e);
}
