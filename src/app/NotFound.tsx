import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="empty" style={{ paddingTop: '18vh' }}>
      <h1 className="display" style={{ fontSize: 72, margin: 0 }}>404</h1>
      <b>{t('الصفحة دي مش موجودة', 'This page doesn’t exist')}</b>
      <Link className="btn btn--primary btn--plain" to="/" style={{ marginTop: 18 }}>{t('رجوع لمساحة العمل', 'Back to the workspace')}</Link>
    </div>
  );
}
