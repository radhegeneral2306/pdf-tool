import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import s from './UpdateBanner.module.css';

/** Registers the offline service worker and offers a reload when a new version is published. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<((reload?: boolean) => Promise<void>) | null>(null);
  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh: () => setUpdate(() => updateSW),
    });
  }, []);
  if (!update) return null;
  return (
    <div className={s.banner} role="status">
      <span>A new version is available.</span>
      <button onClick={() => update(true)}>Reload</button>
    </div>
  );
}
