import { useEffect, useRef, useState, useCallback } from 'react';
import { getDevUserId } from '../api';

export interface DuelPeer {
  userId: string;
  name: string;
}

export interface DuelStateMsg {
  type: 'duel_state';
  duelId: string;
  state: 'created' | 'joined' | 'committed' | 'resolved' | 'cancelled';
  game: 'coinflip' | 'dice';
  stake: number;
  round: number;
  creator: DuelPeer;
  opponent: DuelPeer | null;
  seedHash: string | null;
  committed: string[];
  rematchVotes: string[];
  winnerId: string | null;
}

export interface DuelResolvedMsg {
  type: 'resolved';
  duelId: string;
  round: number;
  winnerId: string;
  winnerName: string;
  payout: number;
  outcome: { kind: 'coinflip'; result: 0 | 1 } | { kind: 'dice'; rolls: [number, number] };
  proof: {
    serverSeed: string;
    serverSeedHash: string;
    clientSeeds: string[];
    nonce: number;
    combinedHmac: string;
    roll: number;
  };
  nextSeedHash: string;
}

export interface DuelChannel {
  status: 'connecting' | 'open' | 'closed';
  you: DuelPeer | null;
  peers: DuelPeer[];
  duel: DuelStateMsg | null;
  resolved: DuelResolvedMsg | null;
  cancelled: string | null;
  lastError: string | null;
  send: (msg: Record<string, unknown>) => void;
}

const HEARTBEAT_MS = 25_000;

export function buildWsUrl(realtimeUrl: string, duelId: string): string {
  const base = realtimeUrl.replace(/\/$/, '');
  const params = new URLSearchParams({ duel: duelId });
  const initData = window.Telegram?.WebApp?.initData ?? '';
  if (initData) {
    params.set('initData', initData);
  } else {
    const devUser = getDevUserId();
    if (devUser) params.set('dev_tg_id', devUser);
  }
  return `${base}/ws?${params}`;
}

export function useDuelChannel(realtimeUrl: string | null, duelId: string | null): DuelChannel {
  const [status, setStatus] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [you, setYou] = useState<DuelPeer | null>(null);
  const [peers, setPeers] = useState<DuelPeer[]>([]);
  const [duel, setDuel] = useState<DuelStateMsg | null>(null);
  const [resolved, setResolved] = useState<DuelResolvedMsg | null>(null);
  const [cancelled, setCancelled] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!realtimeUrl || !duelId) return;

    let alive = true;
    let heartbeat = 0;
    const ws = new WebSocket(buildWsUrl(realtimeUrl, duelId));
    wsRef.current = ws;
    setStatus('connecting');

    ws.addEventListener('open', () => {
      if (!alive) return;
      setStatus('open');
      heartbeat = window.setInterval(() => {
        try {
          ws.send('ping');
        } catch {
          // closing
        }
      }, HEARTBEAT_MS);
    });

    ws.addEventListener('message', (event) => {
      if (!alive || typeof event.data !== 'string' || event.data === 'pong') return;
      let msg: { type?: string };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case 'hello': {
          const hello = msg as unknown as { you: DuelPeer; peers: DuelPeer[] };
          setYou(hello.you);
          setPeers(hello.peers);
          break;
        }
        case 'presence':
          setPeers((msg as unknown as { peers: DuelPeer[] }).peers);
          break;
        case 'duel_state':
          setDuel(msg as DuelStateMsg);
          break;
        case 'resolved':
          setResolved(msg as DuelResolvedMsg);
          break;
        case 'cancelled':
          setCancelled((msg as unknown as { reason: string }).reason);
          break;
        case 'error':
          setLastError((msg as unknown as { error: string }).error);
          break;
      }
    });

    ws.addEventListener('close', () => {
      if (!alive) return;
      setStatus('closed');
    });
    ws.addEventListener('error', () => {
      if (!alive) return;
      setStatus('closed');
    });

    return () => {
      alive = false;
      clearInterval(heartbeat);
      wsRef.current = null;
      try {
        ws.close();
      } catch {
        // already closed
      }
    };
  }, [realtimeUrl, duelId]);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  return { status, you, peers, duel, resolved, cancelled, lastError, send };
}
