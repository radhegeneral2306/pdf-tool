import { FolderSimpleIcon, GearSixIcon, SquaresFourIcon } from '@phosphor-icons/react';
import { navigate } from '../router';
import s from './TabBar.module.css';

const TABS = [
  { key: 'tools', path: '/', label: 'Tools', Icon: SquaresFourIcon },
  { key: 'documents', path: '/documents', label: 'Documents', Icon: FolderSimpleIcon },
  { key: 'settings', path: '/settings', label: 'Settings', Icon: GearSixIcon },
] as const;

export function TabBar({ active }: { active: string }) {
  return (
    <nav className={s.bar} aria-label="Main">
      {TABS.map(({ key, path, label, Icon }) => (
        <button
          key={key}
          className={`${s.tab} ${active === key ? s.active : ''}`}
          aria-current={active === key ? 'page' : undefined}
          onClick={() => active !== key && navigate(path, { replace: true })}
        >
          <Icon size={27} weight={active === key ? 'fill' : 'regular'} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
