import { FileTextIcon } from '@phosphor-icons/react';
import type { PageItem } from '../types';
import { useThumb } from '../lib/thumbs';
import s from './DocThumb.module.css';

/** Small page preview used in lists. */
export function DocThumb({ page, size = 44 }: { page?: PageItem; size?: number }) {
  const url = useThumb(page);
  return (
    <span className={s.thumb} style={{ width: size * 0.78, height: size }}>
      {url ? <img src={url} alt="" /> : url === undefined ? <span className={s.loading} /> : <FileTextIcon size={size * 0.45} />}
    </span>
  );
}
