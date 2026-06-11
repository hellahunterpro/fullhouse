import type { HTMLAttributes } from 'react';
import './Panel.css';

export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={className ? `ui-panel ${className}` : 'ui-panel'} {...rest}>
      {children}
    </div>
  );
}
