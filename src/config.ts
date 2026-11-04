export const config = {
  apiUrl: (import.meta.env.VITE_API_URL as string | undefined) || '',
  mock: import.meta.env.VITE_MOCK === '1',
  router: (import.meta.env.VITE_ROUTER as string | undefined) === 'hash' ? 'hash' : 'browser',
  basePath: (import.meta.env.BASE_URL as string) || '/',
  defaultLang: ((import.meta.env.VITE_DEFAULT_LANG as string | undefined) === 'en' ? 'en' : 'ar') as 'ar' | 'en',
  defaultTheme: ((import.meta.env.VITE_DEFAULT_THEME as string | undefined) === 'dark' ? 'dark' : 'light') as 'dark' | 'light'
};
