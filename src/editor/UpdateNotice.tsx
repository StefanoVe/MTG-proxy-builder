import { useEffect, useState } from 'react';
import { Icon } from './Icon.js';
import { useI18n } from './i18n.js';
import './update-notice.css';

export function UpdateNotice() {
  const { t } = useI18n();
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void window.proxy.checkForUpdate().then(update => {
      if (active) setVersion(update);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  return <div className="update-notice" aria-live="polite">
    {version && <>
      <button className="update-notice-link" onClick={() => { void window.proxy.openReleases().catch(() => {}); }}>
        <Icon name="import" />
        <span><strong>{t('updateAvailable', { version })}</strong><small>{t('openReleases')}</small></span>
      </button>
      <button className="icon-button" aria-label={t('dismissUpdate')} title={t('dismissUpdate')} onClick={() => setVersion(null)}>
        <Icon name="close" />
      </button>
    </>}
  </div>;
}
