import { useCountUp } from './useCountUp';
import './StatPill.css';

interface Props {
  value: number;
  suffix?: string;
}

export function StatPill({ value, suffix }: Props) {
  const display = useCountUp(value);
  return (
    <div className="ui-statpill">
      <svg className="ui-statpill-chip" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="8" cy="8" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path
          d="M8 1v2.4M8 12.6V15M1 8h2.4M12.6 8H15M3.05 3.05l1.7 1.7M11.25 11.25l1.7 1.7M12.95 3.05l-1.7 1.7M4.75 11.25l-1.7 1.7"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
      <span className="ui-statpill-value">{display.toLocaleString()}</span>
      {suffix && <span className="ui-statpill-suffix">{suffix}</span>}
    </div>
  );
}
