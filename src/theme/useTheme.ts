import { useEffect } from 'react';
import { useSettings } from '../storage/settings';

const media = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Applies Automatic / Light / Dark to the page and keeps it in sync with the phone's setting. */
export function useApplyTheme() {
  const { theme } = useSettings();
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media().matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#F2F2F7');
    };
    apply();
    if (theme !== 'system') return;
    const m = media();
    m.addEventListener('change', apply);
    return () => m.removeEventListener('change', apply);
  }, [theme]);
}

/** Whether the app is currently shown in dark mode. */
export function useIsDark() {
  const { theme } = useSettings();
  return theme === 'dark' || (theme === 'system' && media().matches);
}
