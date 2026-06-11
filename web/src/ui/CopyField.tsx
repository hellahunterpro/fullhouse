import { useRef, useState, useEffect } from 'react';
import './CopyField.css';

interface Props {
  label: string;
  value: string;
}

export function CopyField({ label, value }: Props) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const copy = () => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="ui-copyfield">
      <div className="ui-copyfield-main">
        <span className="ui-copyfield-label">{label}</span>
        <span className="ui-copyfield-value">{value}</span>
      </div>
      <button className="ui-copyfield-btn" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? '✓' : (
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="M11 3.5V3a1.5 1.5 0 00-1.5-1.5h-6A1.5 1.5 0 002 3v6a1.5 1.5 0 001.5 1.5H4" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        )}
      </button>
    </div>
  );
}
