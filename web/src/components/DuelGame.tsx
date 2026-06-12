import { useState, useEffect, useRef, useCallback } from 'react';
import { createDuel, type DuelGame as DuelGameType } from '../api';
import { Button, Panel, useToast } from '../ui';
import { getClientSeed } from '../clientSeed';
import { hapticImpact, hapticResult } from '../haptics';
import { StakeInput } from './StakeInput';
import { CopyField } from '../ui';
import { useDuelChannel } from './duelChannel';
import { flipTarget } from './flipMath';
import { DiceArt, CoinArt } from './GameArt';
import './DuelGame.css';

interface Props {
  balance: number;
  realtimeUrl: string;
  joinDuelId: string | null;
  onBalanceRefresh: () => void;
}

const COUNTDOWN_FROM = 3;
const COIN_REVEAL_MS = 900;
const DICE_REVEAL_MS = 700;

function CoinFace({ side }: { side: 'creator' | 'opponent' }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="47" fill="var(--bg-1)" stroke="var(--gold)" strokeWidth="4" />
      <circle cx="50" cy="50" r="36" fill="none" stroke="var(--gold)" strokeWidth="1.5" opacity="0.6" />
      {side === 'creator' ? (
        <path
          d="M50 22l6.5 13.5 14.5 2-10.5 10 2.5 14.5L50 55l-13 7 2.5-14.5-10.5-10 14.5-2z"
          fill="var(--gold)"
        />
      ) : (
        <circle cx="50" cy="50" r="14" fill="none" stroke="var(--gold)" strokeWidth="6" />
      )}
    </svg>
  );
}

export function DuelGame({ balance, realtimeUrl, joinDuelId, onBalanceRefresh }: Props) {
  const toast = useToast();
  const [game, setGame] = useState<DuelGameType>('coinflip');
  const [stake, setStake] = useState(100);
  const [duelId, setDuelId] = useState<string | null>(joinDuelId);
  const [shareLink, setShareLink] = useState('');
  const [creating, setCreating] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [reveal, setReveal] = useState<'pending' | 'animating' | 'done'>('pending');
  const [coinDeg, setCoinDeg] = useState(0);
  const [diceDisplay, setDiceDisplay] = useState<[number, number] | null>(null);
  const committedRoundRef = useRef(-1);
  const revealedRoundRef = useRef(-1);
  const coinDegRef = useRef(0);
  const timersRef = useRef<number[]>([]);
  const rafRef = useRef(0);

  const channel = useDuelChannel(realtimeUrl || null, duelId);
  const { duel, resolved, you, peers, cancelled, lastError, send } = channel;

  useEffect(
    () => () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  useEffect(() => {
    if (lastError) toast(lastError, 'error');
  }, [lastError, toast]);

  const isCreator = duel !== null && you !== null && duel.creator.userId === you.userId;
  const isPlayer =
    duel !== null &&
    you !== null &&
    (duel.creator.userId === you.userId || duel.opponent?.userId === you.userId);
  const iCommitted = duel !== null && you !== null && duel.committed.includes(you.userId);
  const opponentPresent =
    duel !== null && peers.some((p) => p.userId !== you?.userId);

  // Auto-commit after a short shared countdown once both players are in.
  useEffect(() => {
    if (!duel || duel.state !== 'joined' || !isPlayer) return;
    if (iCommitted || committedRoundRef.current === duel.round) return;
    if (countdown === null) {
      setCountdown(COUNTDOWN_FROM);
      return;
    }
    if (countdown > 0) {
      const t = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 800);
      timersRef.current.push(t);
      return;
    }
    committedRoundRef.current = duel.round;
    setCountdown(null);
    send({ type: 'commit', clientSeed: getClientSeed() });
  }, [duel, countdown, iCommitted, isPlayer, send]);

  // Play the reveal animation when a round resolves.
  useEffect(() => {
    if (!resolved || revealedRoundRef.current === resolved.round) return;
    revealedRoundRef.current = resolved.round;
    setReveal('animating');
    hapticImpact('medium');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;

    const finish = (after: number) => {
      const t = window.setTimeout(() => {
        setReveal('done');
        onBalanceRefresh();
        if (you) hapticResult(resolved.winnerId === you.userId);
      }, after);
      timersRef.current.push(t);
    };

    if (resolved.outcome.kind === 'coinflip') {
      const face = resolved.outcome.result === 0 ? 'heads' : 'tails';
      const target = flipTarget(coinDegRef.current, face);
      coinDegRef.current = target;
      setCoinDeg(target);
      finish(reduced ? 0 : COIN_REVEAL_MS);
    } else {
      const rolls = resolved.outcome.rolls;
      if (reduced) {
        setDiceDisplay(rolls);
        finish(0);
      } else {
        const started = performance.now();
        const tick = () => {
          setDiceDisplay([Math.floor(Math.random() * 100), Math.floor(Math.random() * 100)]);
          if (performance.now() - started < DICE_REVEAL_MS) {
            rafRef.current = requestAnimationFrame(tick);
          } else {
            setDiceDisplay(rolls);
          }
        };
        rafRef.current = requestAnimationFrame(tick);
        finish(DICE_REVEAL_MS + 80);
      }
    }
  }, [resolved, you, onBalanceRefresh]);

  const handleCreate = useCallback(async () => {
    hapticImpact('medium');
    setCreating(true);
    try {
      const created = await createDuel(game, stake);
      setShareLink(created.shareLink);
      setDuelId(created.duelId);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create duel', 'error');
    } finally {
      setCreating(false);
    }
  }, [game, stake, toast]);

  const handleShare = useCallback(() => {
    hapticImpact('light');
    const text = 'Duel me in Full House!';
    if (shareLink && window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(
        `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(text)}`,
      );
    } else if (shareLink) {
      navigator.clipboard?.writeText(shareLink).catch(() => {});
      toast('Link copied', 'success');
    }
  }, [shareLink, toast]);

  const handleJoin = useCallback(() => {
    hapticImpact('medium');
    send({ type: 'join' });
  }, [send]);

  const handleRematch = useCallback(() => {
    hapticImpact('medium');
    setReveal('pending');
    send({ type: 'rematch', clientSeed: getClientSeed() });
  }, [send]);

  // --- render stages -------------------------------------------------------

  if (cancelled) {
    return (
      <div className="duel">
        <Panel className="duel-notice">
          <p className="duel-notice-title">Duel over</p>
          <p className="duel-notice-text">{cancelled}</p>
        </Panel>
      </div>
    );
  }

  if (!duelId) {
    return (
      <div className="duel">
        <Panel className="duel-setup">
          <p className="duel-setup-label">Game</p>
          <div className="duel-game-choice">
            <button
              className={game === 'coinflip' ? 'duel-game-card duel-game-card--active' : 'duel-game-card'}
              onClick={() => setGame('coinflip')}
            >
              <CoinArt size={44} />
              <span>Coin Flip</span>
            </button>
            <button
              className={game === 'dice' ? 'duel-game-card duel-game-card--active' : 'duel-game-card'}
              onClick={() => setGame('dice')}
            >
              <DiceArt size={44} />
              <span>Dice</span>
            </button>
          </div>
          <StakeInput stake={stake} balance={balance} onChange={setStake} />
        </Panel>
        <p className="duel-hint">
          Winner takes both stakes. Your friend opens the link, accepts, and the duel resolves
          live for both of you.
        </p>
        <Button block loading={creating} disabled={stake < 1 || stake > balance} onClick={handleCreate}>
          Create Challenge
        </Button>
      </div>
    );
  }

  if (!duel) {
    return (
      <div className="duel">
        <Panel className="duel-notice">
          <p className="duel-notice-title">
            {channel.status === 'closed' ? 'Connection lost' : 'Connecting…'}
          </p>
          {channel.status === 'closed' && (
            <p className="duel-notice-text">
              {realtimeUrl ? 'Could not reach the duel server.' : 'Realtime server is not configured.'}
            </p>
          )}
        </Panel>
      </div>
    );
  }

  const youWon = resolved !== null && you !== null && resolved.winnerId === you.userId;

  return (
    <div className="duel">
      <Panel className="duel-arena">
        <div className="duel-versus">
          <div className={duel.winnerId === duel.creator.userId && reveal === 'done' ? 'duel-side duel-side--winner' : 'duel-side'}>
            <span className="duel-side-name">{duel.creator.name}</span>
            <span className="duel-side-role">creator</span>
          </div>
          <span className="duel-vs">vs</span>
          <div
            className={
              duel.opponent && duel.winnerId === duel.opponent.userId && reveal === 'done'
                ? 'duel-side duel-side--winner'
                : 'duel-side'
            }
          >
            <span className="duel-side-name">{duel.opponent?.name ?? '…'}</span>
            <span className="duel-side-role">{duel.opponent ? 'opponent' : 'waiting'}</span>
          </div>
        </div>

        <div className="duel-stage">
          {duel.state === 'created' && (
            <div className="duel-waiting">
              <span className="duel-waiting-pulse" aria-hidden="true" />
              <p>Waiting for an opponent…</p>
              {opponentPresent && !isCreator && <p className="duel-waiting-sub">You are watching this duel</p>}
            </div>
          )}

          {countdown !== null && countdown > 0 && (
            <div className="duel-countdown" data-testid="countdown">{countdown}</div>
          )}

          {duel.state !== 'created' && countdown === null && reveal !== 'done' && !resolved && (
            <div className="duel-waiting">
              <span className="duel-waiting-pulse" aria-hidden="true" />
              <p>{iCommitted ? 'Locking stakes…' : 'Get ready…'}</p>
            </div>
          )}

          {resolved && reveal !== 'pending' && resolved.outcome.kind === 'coinflip' && (
            <div className="duel-coin-stage">
              <div className="duel-coin" style={{ transform: `rotateX(${coinDeg}deg)` }}>
                <div className="duel-coin-face duel-coin-face--front">
                  <CoinFace side="creator" />
                </div>
                <div className="duel-coin-face duel-coin-face--back">
                  <CoinFace side="opponent" />
                </div>
              </div>
              <span className="duel-coin-legend">★ {duel.creator.name} · ○ {duel.opponent?.name}</span>
            </div>
          )}

          {resolved && reveal !== 'pending' && resolved.outcome.kind === 'dice' && diceDisplay && (
            <div className="duel-dice-stage" data-testid="duel-dice">
              <div className="duel-dice-roll">
                <span className="duel-dice-num">{diceDisplay[0]}</span>
                <span className="duel-dice-owner">{duel.creator.name}</span>
              </div>
              <div className="duel-dice-roll">
                <span className="duel-dice-num">{diceDisplay[1]}</span>
                <span className="duel-dice-owner">{duel.opponent?.name}</span>
              </div>
            </div>
          )}

          {reveal === 'done' && resolved && (
            <div className={youWon ? 'duel-result duel-result--win' : 'duel-result duel-result--lose'}>
              {isPlayer
                ? youWon
                  ? `You won ${resolved.payout.toLocaleString()} chips!`
                  : 'You lost this one'
                : `${resolved.winnerName} won ${resolved.payout.toLocaleString()} chips`}
            </div>
          )}
        </div>

        <div className="duel-meta">
          <span>{duel.game === 'coinflip' ? 'Coin Flip' : 'Dice'}</span>
          <span className="duel-meta-stake">{duel.stake.toLocaleString()} chips each</span>
          <span>round {duel.round + 1}</span>
        </div>
      </Panel>

      {duel.state === 'created' && isCreator && (
        <>
          {shareLink && <CopyField label="Challenge link" value={shareLink} />}
          <Button block onClick={handleShare}>Share Challenge</Button>
          <Button variant="ghost" block onClick={() => send({ type: 'leave' })}>
            Cancel Duel
          </Button>
        </>
      )}

      {duel.state === 'created' && !isCreator && (
        <Button block onClick={handleJoin} disabled={balance < duel.stake}>
          {balance < duel.stake ? 'Not enough chips' : `Accept — stake ${duel.stake.toLocaleString()}`}
        </Button>
      )}

      {reveal === 'done' && resolved && isPlayer && (
        <Button
          block
          onClick={handleRematch}
          loading={you !== null && duel.rematchVotes.includes(you.userId)}
        >
          {you !== null && duel.rematchVotes.includes(you.userId)
            ? 'Waiting for opponent…'
            : 'Rematch — same stake'}
        </Button>
      )}

      {reveal === 'done' && resolved && (
        <Panel className="duel-proof">
          <p className="duel-proof-title">Round proof</p>
          <CopyField label="Server seed" value={resolved.proof.serverSeed} />
          <CopyField label="Seed hash (committed)" value={resolved.proof.serverSeedHash} />
          <CopyField label="Client seeds" value={resolved.proof.clientSeeds.join(' · ')} />
          <CopyField label="Nonce" value={String(resolved.proof.nonce)} />
          <CopyField label="HMAC" value={resolved.proof.combinedHmac} />
          <CopyField label="Next round commitment" value={resolved.nextSeedHash} />
        </Panel>
      )}
    </div>
  );
}
