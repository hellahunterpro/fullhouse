import { useState, useEffect, useCallback } from 'react';
import {
  fetchFairness,
  rotateFairness,
  verifyRound,
  type Commitment,
  type PublicProof,
  type RevealedSeed,
} from '../api';
import { Button, CopyField, useToast } from '../ui';
import { getClientSeed, setClientSeed } from '../clientSeed';
import { hapticImpact } from '../haptics';
import './FairnessSheet.css';

interface Props {
  open: boolean;
  onClose: () => void;
  lastProof: PublicProof | null;
}

export function FairnessSheet({ open, onClose, lastProof }: Props) {
  const toast = useToast();
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [seedInput, setSeedInput] = useState('');
  const [revealed, setRevealed] = useState<RevealedSeed | null>(null);
  const [rotating, setRotating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verdict, setVerdict] = useState<'valid' | 'invalid' | null>(null);

  useEffect(() => {
    if (open) {
      setSeedInput(getClientSeed());
      setVerdict(null);
      fetchFairness()
        .then((d) => setCommitment(d.commitment))
        .catch(() => {});
    }
  }, [open]);

  const saveSeed = useCallback(() => {
    const trimmed = seedInput.trim();
    if (!trimmed) {
      toast('Seed cannot be empty', 'error');
      return;
    }
    setClientSeed(trimmed);
    toast('Client seed saved', 'success');
  }, [seedInput, toast]);

  const handleRotate = useCallback(async () => {
    hapticImpact('medium');
    setRotating(true);
    setVerdict(null);
    try {
      const { revealed: r } = await rotateFairness();
      setRevealed(r);
      const d = await fetchFairness();
      setCommitment(d.commitment);
      toast('Seed rotated — previous seed revealed', 'success');
    } catch {
      toast('Failed to rotate seed', 'error');
    } finally {
      setRotating(false);
    }
  }, [toast]);

  const canVerify =
    lastProof !== null && revealed !== null && revealed.seedHash === lastProof.serverSeedHash;

  const handleVerify = useCallback(async () => {
    if (!lastProof || !revealed) return;
    setVerifying(true);
    setVerdict(null);
    try {
      const { valid } = await verifyRound(lastProof, revealed.seed);
      setVerdict(valid ? 'valid' : 'invalid');
    } catch {
      toast('Verification request failed', 'error');
    } finally {
      setVerifying(false);
    }
  }, [lastProof, revealed, toast]);

  if (!open) return null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-label="Provably fair"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2 className="sheet-title">Provably fair</h2>
          <button className="sheet-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <section className="sheet-section">
          <h3 className="sheet-section-title">Current commitment</h3>
          <p className="sheet-section-note">
            The hash of the server seed in use — fixed before any of your bets.
          </p>
          {commitment ? (
            <>
              <CopyField label="Seed hash" value={commitment.seedHash} />
              <div className="sheet-nonce">Next nonce: {commitment.nonce}</div>
            </>
          ) : (
            <div className="sheet-nonce">Loading…</div>
          )}
        </section>

        <section className="sheet-section">
          <h3 className="sheet-section-title">Client seed</h3>
          <p className="sheet-section-note">Your entropy, mixed into every roll. Change it any time.</p>
          <div className="sheet-seed-row">
            <input
              className="sheet-seed-input"
              value={seedInput}
              onChange={(e) => setSeedInput(e.target.value)}
              maxLength={64}
              aria-label="Client seed"
            />
            <Button variant="ghost" onClick={saveSeed}>
              Save
            </Button>
          </div>
        </section>

        <section className="sheet-section">
          <h3 className="sheet-section-title">Rotate &amp; reveal</h3>
          <p className="sheet-section-note">
            Retires the current server seed and reveals it so past rounds can be checked.
          </p>
          <Button variant="ghost" block loading={rotating} onClick={handleRotate}>
            Rotate &amp; reveal seed
          </Button>
          {revealed && (
            <div className="sheet-revealed">
              <CopyField label="Revealed seed" value={revealed.seed} />
              <CopyField label="Seed hash" value={revealed.seedHash} />
            </div>
          )}
        </section>

        <section className="sheet-section">
          <h3 className="sheet-section-title">Verify last round</h3>
          {lastProof ? (
            <>
              <p className="sheet-section-note">
                Re-computes round roll {lastProof.roll} (nonce {lastProof.nonce}) from the revealed
                seed on the server.
              </p>
              {!canVerify && (
                <p className="sheet-hint">
                  {revealed
                    ? 'The revealed seed does not cover the last round — it was played on the new seed.'
                    : 'Rotate first to reveal the seed for this round.'}
                </p>
              )}
              <Button variant="ghost" block disabled={!canVerify} loading={verifying} onClick={handleVerify}>
                Verify round
              </Button>
              {verdict === 'valid' && <div className="sheet-verdict sheet-verdict--ok">Round verified — outcome matches the commitment</div>}
              {verdict === 'invalid' && <div className="sheet-verdict sheet-verdict--bad">Verification failed — proof does not match</div>}
            </>
          ) : (
            <p className="sheet-section-note">Play a round first, then verify it here.</p>
          )}
        </section>
      </div>
    </div>
  );
}
