import type { ReactNode } from 'react';
import s from './Controls.module.css';

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  dark,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  /** Forces the dark look (camera / editor screens). */
  dark?: boolean;
}) {
  return (
    <div className={`${s.segmented} ${dark ? s.segDark : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={o.value === value}
          className={`${s.seg} ${o.value === value ? s.segOn : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className={`${s.switch} ${checked ? s.on : ''}`} onClick={() => onChange(!checked)}>
      <span className={s.knob} />
    </button>
  );
}

export function Button({
  children,
  onClick,
  variant = 'filled',
  disabled,
  icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'filled' | 'tinted' | 'plain';
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button className={`${s.button} ${s[variant]}`} onClick={onClick} disabled={disabled}>
      {icon}
      {children}
    </button>
  );
}

/** Classic iOS activity indicator. */
export function Spinner({ size = 20, light }: { size?: number; light?: boolean }) {
  return (
    <span className={s.spinner} style={{ width: size, height: size, color: light ? '#fff' : undefined }} role="progressbar" aria-label="Loading">
      {Array.from({ length: 8 }, (_, i) => (
        <i key={i} style={{ transform: `rotate(${i * 45}deg)`, animationDelay: `${-0.8 + i * 0.1}s` }} />
      ))}
    </span>
  );
}
