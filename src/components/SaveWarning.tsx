import { useState } from 'react';
import { retrySaves, useSaveFailure } from '../storage/projects';
import s from './SaveWarning.module.css';

export function SaveWarning() {
  const failed = useSaveFailure();
  const [retrying, setRetrying] = useState(false);
  if (!failed) return null;
  return (
    <div className={s.warning} role="alert">
      <span>Changes could not be saved on this device. Keep this app open. Free up storage, then retry. You can also export a PDF to keep a copy.</span>
      <button disabled={retrying} onClick={async () => {
        setRetrying(true);
        try { await retrySaves(); } finally { setRetrying(false); }
      }}>{retrying ? 'Retrying…' : 'Retry Save'}</button>
    </div>
  );
}
