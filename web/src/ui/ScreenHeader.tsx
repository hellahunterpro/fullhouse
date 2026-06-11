import { StatPill } from './StatPill';
import './ScreenHeader.css';

interface Props {
  title: string;
  balance?: number | null;
  onBack?: () => void;
}

export function ScreenHeader({ title, balance, onBack }: Props) {
  return (
    <header className="ui-screen-header">
      <div className="ui-screen-header-left">
        {onBack && (
          <button className="ui-screen-header-back" onClick={onBack} aria-label="Back">
            ←
          </button>
        )}
        <h1 className="ui-screen-header-title">{title}</h1>
      </div>
      {balance != null && <StatPill value={balance} />}
    </header>
  );
}
