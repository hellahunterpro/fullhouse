import type { ButtonHTMLAttributes } from 'react';
import './Button.css';

type Variant = 'primary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  block = false,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  const classes = ['ui-btn', `ui-btn--${variant}`];
  if (block) classes.push('ui-btn--block');
  if (loading) classes.push('ui-btn--loading');
  if (className) classes.push(className);

  return (
    <button className={classes.join(' ')} disabled={disabled || loading} {...rest}>
      {loading && <span className="ui-btn-spinner" aria-hidden="true" />}
      <span className="ui-btn-label">{children}</span>
    </button>
  );
}
