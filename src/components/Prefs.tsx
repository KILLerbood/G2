import { useI18n } from '../i18n';
import { useTheme } from '../app/theme';
import { IconButton } from './ui';

/** Theme + language quick toggles (login screens and mobile header). */
export function QuickPrefs() {
  const { lang, setLang, t } = useI18n();
  const { theme, setPref } = useTheme();
  return (
    <>
      <IconButton icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? t('الوضع الفاتح', 'Light mode') : t('الوضع الغامق', 'Dark mode')} onClick={() => setPref(theme === 'dark' ? 'light' : 'dark')} />
      <IconButton icon="globe" label={lang === 'ar' ? 'English' : 'العربية'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} />
    </>
  );
}
