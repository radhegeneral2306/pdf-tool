import { LockSimpleIcon, ScanIcon, StackIcon } from '@phosphor-icons/react';
import { Button } from '../components/Controls';
import { updateSettings } from '../storage/settings';
import s from './Welcome.module.css';

const ROWS = [
  { Icon: ScanIcon, title: 'Scan Documents', text: 'Take photos of papers and get a clean, sharp PDF.' },
  { Icon: StackIcon, title: 'Merge Anything', text: 'Join PDFs and photos into one file, in any order.' },
  { Icon: LockSimpleIcon, title: 'Private and Offline', text: 'Your files stay on this device. Nothing is uploaded.' },
];

/** Classic Apple "What's New" style welcome, shown once. */
export function Welcome() {
  return (
    <div className={s.layer} role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className={s.card}>
        <h1 id="welcome-title">
          Welcome to <span>PDF Tool</span>
        </h1>
        <ul>
          {ROWS.map(({ Icon, title, text }) => (
            <li key={title}>
              <Icon size={36} weight="regular" className={s.icon} />
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ul>
        <div className={s.btn}>
          <Button onClick={() => updateSettings({ welcomed: true })}>Continue</Button>
        </div>
      </div>
    </div>
  );
}
