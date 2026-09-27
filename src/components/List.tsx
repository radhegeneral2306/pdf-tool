import { CaretRightIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import s from './List.module.css';

/** iOS "inset grouped" section with optional header and footer text. */
export function Section({ header, footer, children }: { header?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.section}>
      {header && <h2 className={s.header}>{header}</h2>}
      <div className={s.group}>{children}</div>
      {footer && <p className={s.footer}>{footer}</p>}
    </section>
  );
}

interface CellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Grey value text on the right, like iOS Settings. */
  detail?: ReactNode;
  /** Icon inside a colored rounded square (Settings style). */
  icon?: ReactNode;
  iconBg?: string;
  /** Any leading content (e.g. a thumbnail) instead of `icon`. */
  leading?: ReactNode;
  accessory?: ReactNode;
  chevron?: boolean;
  destructive?: boolean;
  tint?: boolean;
  onClick?: () => void;
  label?: string;
}

export function Cell({ title, subtitle, detail, icon, iconBg, leading, accessory, chevron, destructive, tint, onClick, label }: CellProps) {
  const body = (
    <>
      {icon && (
        <span className={s.icon} style={{ background: iconBg }} aria-hidden>
          {icon}
        </span>
      )}
      {leading}
      <span className={s.content}>
        <span className={s.text}>
          <span className={`${s.title} ${destructive ? s.destructive : ''} ${tint ? s.tint : ''}`}>{title}</span>
          {subtitle && <span className={s.subtitle}>{subtitle}</span>}
        </span>
        {detail !== undefined && <span className={s.detail}>{detail}</span>}
        {accessory}
        {chevron && <CaretRightIcon className={s.chevron} size={15} weight="bold" aria-hidden />}
      </span>
    </>
  );
  return onClick ? (
    <button className={`${s.cell} ${s.pressable}`} onClick={onClick} aria-label={label}>
      {body}
    </button>
  ) : (
    <div className={s.cell}>{body}</div>
  );
}
