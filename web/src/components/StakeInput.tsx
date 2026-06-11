import './StakeInput.css';

interface Props {
  stake: number;
  balance: number;
  onChange: (stake: number) => void;
  disabled?: boolean;
}

const PRESETS = [10, 100, 500, 1000];

export function StakeInput({ stake, balance, onChange, disabled }: Props) {
  const clamp = (v: number) => Math.max(1, Math.min(balance, Math.floor(v) || 1));

  return (
    <div className="stake-input">
      <div className="stake-input-row">
        <label className="stake-input-label" htmlFor="stake">
          Stake
        </label>
        <div className="stake-input-mods">
          <button
            className="stake-mod"
            disabled={disabled}
            onClick={() => onChange(clamp(stake / 2))}
          >
            ½
          </button>
          <button
            className="stake-mod"
            disabled={disabled}
            onClick={() => onChange(clamp(stake * 2))}
          >
            2×
          </button>
          <button className="stake-mod" disabled={disabled} onClick={() => onChange(clamp(balance))}>
            Max
          </button>
        </div>
      </div>
      <input
        id="stake"
        className="stake-input-field"
        type="number"
        inputMode="numeric"
        value={stake}
        disabled={disabled}
        onChange={(e) => onChange(clamp(parseInt(e.target.value, 10)))}
      />
      <div className="stake-input-presets">
        {PRESETS.map((v) => (
          <button
            key={v}
            className={stake === Math.min(v, balance) ? 'stake-preset stake-preset--active' : 'stake-preset'}
            disabled={disabled}
            onClick={() => onChange(clamp(v))}
          >
            {v >= 1000 ? `${v / 1000}k` : v}
          </button>
        ))}
      </div>
    </div>
  );
}
