import {
  credit,
  debit,
  getBalance,
  generateServerSeed,
  commit as commitSeed,
  reveal,
  DuplicateTransactionError,
  InsufficientFundsError,
  trackDuelJoined,
  trackDuelResolved,
  trackDuelRematch,
  resolveDuelOutcome,
  DUEL_GAMES,
  DUEL_MIN_STAKE,
  DUEL_MAX_STAKE,
  type DuelGame,
} from '@fullhouse/core';
import type { Env } from './index.js';

interface PeerInfo {
  userId: string;
  walletId: string;
  name: string;
}

type DuelState = 'created' | 'joined' | 'committed' | 'resolved' | 'cancelled';

interface DuelData {
  id: string;
  game: DuelGame;
  stake: number;
  state: DuelState;
  round: number;
  creator: PeerInfo;
  opponent: PeerInfo | null;
  /** Server seed per round; the next round's seed is pre-committed at resolve. */
  seeds: Record<number, string>;
  seedHashes: Record<number, string>;
  /** Current round client seeds by userId. */
  commits: Record<string, string>;
  /** UserIds whose stake is locked for the current round. */
  locked: string[];
  /** Next-round client seeds by userId (rematch votes). */
  rematchVotes: Record<string, string>;
  winnerId: string | null;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_CLEANUP_MS = 30 * 60 * 1000;

/**
 * One Durable Object per duel.
 *
 * State machine: created → joined → committed → resolved → (rematch → committed → …),
 * with alarms cancelling unjoined duels after a timeout and refunding any locked
 * stakes on abandonment. Chips never move here directly — every stake lock,
 * payout, and refund goes through the core wallet against D1 with idempotency
 * keys derived from the duel id and round.
 */
export class DuelObject implements DurableObject {
  /** Serializes state-mutating operations within an awake instance. */
  private opQueue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private get timeoutMs(): number {
    return parseInt(this.env.DUEL_TIMEOUT_MS ?? '', 10) || DEFAULT_TIMEOUT_MS;
  }

  private get cleanupMs(): number {
    return parseInt(this.env.DUEL_CLEANUP_MS ?? '', 10) || DEFAULT_CLEANUP_MS;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'Expected a WebSocket upgrade' }, { status: 426 });
    }

    const userId = request.headers.get('X-User-Id');
    const walletId = request.headers.get('X-Wallet-Id');
    const name = request.headers.get('X-User-Name') ?? 'Player';
    if (!userId || !walletId) {
      return Response.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const url = new URL(request.url);
    const duelId = url.searchParams.get('duel') ?? this.state.id.toString();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    for (const ws of this.state.getWebSockets(userId)) {
      ws.close(1000, 'replaced by a new connection');
    }

    this.state.acceptWebSocket(server, [userId]);
    const peer: PeerInfo = { userId, walletId, name };
    server.serializeAttachment(peer);

    this.send(server, {
      type: 'hello',
      duelId,
      you: { userId, name },
      peers: this.peers().map((p) => ({ userId: p.userId, name: p.name })),
    });

    const duel = await this.loadDuel(duelId);
    if (duel) {
      this.send(server, this.stateMessage(duel));
    }

    this.broadcast(
      { type: 'presence', peers: this.peers().map((p) => ({ userId: p.userId, name: p.name })) },
      userId,
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== 'string') return;
    const peer = ws.deserializeAttachment() as PeerInfo | null;
    if (!peer) return;

    let parsed: { type?: string; [key: string]: unknown };
    try {
      parsed = JSON.parse(message);
    } catch {
      this.send(ws, { type: 'error', error: 'Malformed message' });
      return;
    }

    const duelId = parsed.duelId;
    const handler = async () => {
      switch (parsed.type) {
        case 'create':
          return this.handleCreate(ws, peer, parsed);
        case 'join':
          return this.handleJoin(ws, peer);
        case 'commit':
          return this.handleCommit(ws, peer, String(parsed.clientSeed ?? ''));
        case 'rematch':
          return this.handleRematch(ws, peer, String(parsed.clientSeed ?? ''));
        case 'leave':
          return this.handleLeave(ws, peer);
        default:
          this.send(ws, { type: 'error', error: `Unknown message type: ${parsed.type ?? 'none'}` });
      }
    };

    void duelId; // duel identity comes from the object, not client payloads
    await this.enqueue(handler);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.broadcast(
      {
        type: 'presence',
        peers: this.peers(ws).map((p) => ({ userId: p.userId, name: p.name })),
      },
      undefined,
      ws,
    );
  }

  async alarm(): Promise<void> {
    await this.enqueue(async () => {
      const duel = await this.loadDuel(null);
      if (!duel) return;
      if (duel.state === 'created') {
        await this.cancelDuel(duel, 'Duel expired before an opponent joined');
      } else if (duel.state === 'joined') {
        await this.cancelDuel(duel, 'Duel timed out');
      } else if (duel.state === 'committed') {
        // Stakes are locked and both seeds are fixed, so the outcome is fully
        // determined: recover an interrupted resolution instead of refunding.
        await this.resolveRound(duel);
      } else if (duel.state === 'resolved') {
        for (const ws of this.state.getWebSockets()) {
          ws.close(1000, 'duel closed');
        }
        await this.state.storage.deleteAll();
        this.duelCache = null;
      }
    });
  }

  // --- message handlers ---------------------------------------------------

  private async handleCreate(
    ws: WebSocket,
    peer: PeerInfo,
    msg: { [key: string]: unknown },
  ): Promise<void> {
    const existing = await this.loadDuel(null);
    if (existing) {
      if (existing.creator.userId === peer.userId) {
        this.send(ws, this.stateMessage(existing));
      } else {
        this.send(ws, { type: 'error', error: 'Duel already exists' });
      }
      return;
    }

    const game = msg.game as DuelGame;
    const stake = msg.stake as number;
    const duelId = typeof msg.duelId === 'string' && msg.duelId ? msg.duelId : null;
    if (!DUEL_GAMES.includes(game)) {
      this.send(ws, { type: 'error', error: 'Unknown duel game' });
      return;
    }
    if (!Number.isInteger(stake) || stake < DUEL_MIN_STAKE || stake > DUEL_MAX_STAKE) {
      this.send(ws, { type: 'error', error: `Stake must be an integer between ${DUEL_MIN_STAKE} and ${DUEL_MAX_STAKE}` });
      return;
    }
    if (!duelId) {
      this.send(ws, { type: 'error', error: 'Missing duel id' });
      return;
    }

    const balance = await getBalance(this.env.DB, peer.walletId);
    if (balance < stake) {
      this.send(ws, { type: 'error', error: 'Insufficient balance for this stake' });
      return;
    }

    const seed = await generateServerSeed();
    const { serverSeedHash } = await commitSeed(seed);

    const duel: DuelData = {
      id: duelId,
      game,
      stake,
      state: 'created',
      round: 0,
      creator: peer,
      opponent: null,
      seeds: { 0: seed },
      seedHashes: { 0: serverSeedHash },
      commits: {},
      locked: [],
      rematchVotes: {},
      winnerId: null,
    };

    await this.env.DB.prepare(
      `INSERT INTO duels (id, creator_id, game, stake, state, round, server_seed_hash)
       VALUES (?, ?, ?, ?, 'created', 0, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(duel.id, peer.userId, game, stake, serverSeedHash)
      .run();

    await this.saveDuel(duel);
    await this.state.storage.setAlarm(Date.now() + this.timeoutMs);
    this.broadcast(this.stateMessage(duel));
  }

  private async handleJoin(ws: WebSocket, peer: PeerInfo): Promise<void> {
    const duel = await this.loadDuel(null);
    if (!duel) {
      this.send(ws, { type: 'error', error: 'Duel not found' });
      return;
    }
    if (duel.creator.userId === peer.userId) {
      this.send(ws, { type: 'error', error: 'You cannot join your own duel' });
      return;
    }
    if (duel.opponent && duel.opponent.userId !== peer.userId) {
      this.send(ws, { type: 'error', error: 'Duel already has an opponent' });
      return;
    }
    if (duel.opponent?.userId === peer.userId) {
      this.send(ws, this.stateMessage(duel));
      return;
    }
    if (duel.state !== 'created') {
      this.send(ws, { type: 'error', error: `Cannot join a duel in state ${duel.state}` });
      return;
    }

    const balance = await getBalance(this.env.DB, peer.walletId);
    if (balance < duel.stake) {
      this.send(ws, { type: 'error', error: 'Insufficient balance for this stake' });
      return;
    }

    duel.opponent = peer;
    duel.state = 'joined';
    await this.env.DB.prepare(`UPDATE duels SET opponent_id = ?, state = 'joined' WHERE id = ?`)
      .bind(peer.userId, duel.id)
      .run();
    await this.saveDuel(duel);
    await this.state.storage.setAlarm(Date.now() + this.timeoutMs);
    await trackDuelJoined(this.env.DB, peer.userId, duel.id);
    this.broadcast(this.stateMessage(duel));
  }

  private async handleCommit(ws: WebSocket, peer: PeerInfo, clientSeed: string): Promise<void> {
    const duel = await this.loadDuel(null);
    if (!duel) {
      this.send(ws, { type: 'error', error: 'Duel not found' });
      return;
    }
    if (duel.state !== 'joined') {
      this.send(ws, { type: 'error', error: `Cannot commit in state ${duel.state}` });
      return;
    }
    if (!this.isPlayer(duel, peer.userId)) {
      this.send(ws, { type: 'error', error: 'You are not part of this duel' });
      return;
    }
    if (!clientSeed || clientSeed.length > 128) {
      this.send(ws, { type: 'error', error: 'Invalid client seed' });
      return;
    }
    if (duel.commits[peer.userId]) {
      this.send(ws, this.stateMessage(duel));
      return;
    }

    const lockOk = await this.lockStake(duel, peer);
    if (!lockOk) {
      this.send(ws, { type: 'error', error: 'Insufficient balance to lock the stake' });
      return;
    }

    duel.commits[peer.userId] = clientSeed;
    await this.saveDuel(duel);
    this.broadcast(this.stateMessage(duel));

    if (duel.opponent && duel.commits[duel.creator.userId] && duel.commits[duel.opponent.userId]) {
      duel.state = 'committed';
      await this.saveDuel(duel);
      this.broadcast(this.stateMessage(duel));
      await this.resolveRound(duel);
    }
  }

  private async handleRematch(ws: WebSocket, peer: PeerInfo, clientSeed: string): Promise<void> {
    const duel = await this.loadDuel(null);
    if (!duel) {
      this.send(ws, { type: 'error', error: 'Duel not found' });
      return;
    }
    if (duel.state !== 'resolved') {
      this.send(ws, { type: 'error', error: `Cannot rematch in state ${duel.state}` });
      return;
    }
    if (!this.isPlayer(duel, peer.userId) || !duel.opponent) {
      this.send(ws, { type: 'error', error: 'You are not part of this duel' });
      return;
    }
    if (!clientSeed || clientSeed.length > 128) {
      this.send(ws, { type: 'error', error: 'Invalid client seed' });
      return;
    }

    duel.rematchVotes[peer.userId] = clientSeed;
    await this.saveDuel(duel);
    this.broadcast(this.stateMessage(duel));
    await this.state.storage.setAlarm(Date.now() + this.timeoutMs);

    const creatorSeed = duel.rematchVotes[duel.creator.userId];
    const opponentSeed = duel.rematchVotes[duel.opponent.userId];
    if (!creatorSeed || !opponentSeed) return;

    // Both want a rematch: start the next round against the pre-committed seed.
    duel.round += 1;
    duel.commits = { [duel.creator.userId]: creatorSeed, [duel.opponent.userId]: opponentSeed };
    duel.rematchVotes = {};
    duel.locked = [];
    duel.winnerId = null;
    await trackDuelRematch(this.env.DB, peer.userId, duel.id, duel.round);

    if (!duel.seeds[duel.round]) {
      // Defensive: the next seed is normally pre-committed at resolve time.
      const seed = await generateServerSeed();
      duel.seeds[duel.round] = seed;
      duel.seedHashes[duel.round] = (await commitSeed(seed)).serverSeedHash;
    }

    const creatorLocked = await this.lockStake(duel, duel.creator);
    const opponentLocked = creatorLocked && (await this.lockStake(duel, duel.opponent));
    if (!creatorLocked || !opponentLocked) {
      await this.cancelDuel(duel, 'Insufficient balance for the rematch');
      return;
    }

    duel.state = 'committed';
    await this.saveDuel(duel);
    this.broadcast(this.stateMessage(duel));
    await this.resolveRound(duel);
  }

  private async handleLeave(ws: WebSocket, peer: PeerInfo): Promise<void> {
    const duel = await this.loadDuel(null);
    if (!duel || !this.isPlayer(duel, peer.userId)) {
      ws.close(1000, 'left');
      return;
    }
    if (duel.state === 'created' || duel.state === 'joined') {
      await this.cancelDuel(duel, `${peer.name} left the duel`);
    } else {
      ws.close(1000, 'left');
    }
  }

  // --- duel mechanics -----------------------------------------------------

  /** Locks a player's stake idempotently; returns false on insufficient funds. */
  private async lockStake(duel: DuelData, player: PeerInfo): Promise<boolean> {
    const refKey = `duel:${duel.id}:r${duel.round}:stake:${player.userId}`;
    try {
      await debit(this.env.DB, player.walletId, duel.stake, 'duel_stake', {
        refKey,
        description: `Duel ${duel.id} round ${duel.round} stake`,
      });
    } catch (err) {
      if (err instanceof DuplicateTransactionError) {
        // Already locked (replayed message or retried round) — fine.
      } else if (err instanceof InsufficientFundsError) {
        return false;
      } else {
        throw err;
      }
    }
    if (!duel.locked.includes(player.userId)) duel.locked.push(player.userId);
    return true;
  }

  private async resolveRound(duel: DuelData): Promise<void> {
    if (!duel.opponent) return;
    const serverSeed = duel.seeds[duel.round];
    const clientSeeds = [duel.commits[duel.creator.userId], duel.commits[duel.opponent.userId]];

    const { roll, proof } = await reveal(
      { serverSeed, clientSeeds, nonce: duel.round },
      2,
    );
    const resolution = resolveDuelOutcome(duel.game, roll, proof.combinedHmac);
    const players = [duel.creator, duel.opponent] as const;
    const winner = players[resolution.winnerIdx];
    const payout = duel.stake * 2;

    try {
      await credit(this.env.DB, winner.walletId, payout, 'duel_payout', {
        refKey: `duel:${duel.id}:r${duel.round}:payout`,
        description: `Duel ${duel.id} round ${duel.round} payout`,
      });
    } catch (err) {
      if (!(err instanceof DuplicateTransactionError)) throw err;
    }

    // Pre-commit the next round's seed so rematch commits are made against a
    // published commitment, never a seed chosen after the client seeds are known.
    const nextRound = duel.round + 1;
    if (!duel.seeds[nextRound]) {
      const nextSeed = await generateServerSeed();
      duel.seeds[nextRound] = nextSeed;
      duel.seedHashes[nextRound] = (await commitSeed(nextSeed)).serverSeedHash;
    }

    duel.state = 'resolved';
    duel.winnerId = winner.userId;
    await this.env.DB.prepare(
      `UPDATE duels SET state = 'resolved', winner_id = ?, round = ?, server_seed_hash = ?,
        resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    )
      .bind(winner.userId, duel.round, duel.seedHashes[nextRound], duel.id)
      .run();
    await this.saveDuel(duel);

    const loser = players[resolution.winnerIdx === 0 ? 1 : 0];
    await trackDuelResolved(this.env.DB, winner.userId, duel.id, duel.round, payout, loser.userId);

    this.broadcast({
      type: 'resolved',
      duelId: duel.id,
      round: duel.round,
      winnerId: winner.userId,
      winnerName: winner.name,
      payout,
      outcome: resolution.outcome,
      proof: {
        serverSeed,
        serverSeedHash: duel.seedHashes[duel.round],
        clientSeeds,
        nonce: duel.round,
        combinedHmac: proof.combinedHmac,
        roll,
      },
      nextSeedHash: duel.seedHashes[nextRound],
    });
    this.broadcast(this.stateMessage(duel));
    await this.state.storage.setAlarm(Date.now() + this.cleanupMs);
  }

  private async cancelDuel(duel: DuelData, reason: string): Promise<void> {
    for (const userId of duel.locked) {
      const player = duel.creator.userId === userId ? duel.creator : duel.opponent;
      if (!player) continue;
      try {
        await credit(this.env.DB, player.walletId, duel.stake, 'duel_refund', {
          refKey: `duel:${duel.id}:r${duel.round}:refund:${userId}`,
          description: `Duel ${duel.id} round ${duel.round} refund`,
        });
      } catch (err) {
        if (!(err instanceof DuplicateTransactionError)) throw err;
      }
    }

    duel.state = 'cancelled';
    await this.env.DB.prepare(`UPDATE duels SET state = 'cancelled' WHERE id = ?`)
      .bind(duel.id)
      .run();

    this.broadcast({ type: 'cancelled', duelId: duel.id, reason });
    for (const ws of this.state.getWebSockets()) {
      ws.close(1000, 'duel cancelled');
    }
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
    this.duelCache = null;
  }

  // --- helpers --------------------------------------------------------------

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.opQueue.then(fn, fn);
    this.opQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private duelCache: DuelData | null = null;

  private async loadDuel(duelId: string | null): Promise<DuelData | null> {
    if (this.duelCache) return this.duelCache;
    const stored = await this.state.storage.get<DuelData>('duel');
    if (stored) {
      this.duelCache = stored;
      return stored;
    }
    if (!duelId) return null;

    // First contact with this DO for an API-created duel: hydrate the config
    // from the D1 row (authoritative) and commit the round-0 server seed.
    const row = await this.env.DB.prepare(
      `SELECT d.id, d.creator_id, d.game, d.stake, d.state,
              u.username, u.first_name, w.id AS wallet_id
       FROM duels d
       JOIN users u ON u.id = d.creator_id
       JOIN wallets w ON w.user_id = u.id
       WHERE d.id = ?`,
    )
      .bind(duelId)
      .first<{
        id: string;
        creator_id: string;
        game: string;
        stake: number;
        state: string;
        username: string | null;
        first_name: string | null;
        wallet_id: string;
      }>();
    if (!row || row.state !== 'created') return null;

    const seed = await generateServerSeed();
    const { serverSeedHash } = await commitSeed(seed);
    const duel: DuelData = {
      id: row.id,
      game: row.game as DuelGame,
      stake: row.stake,
      state: 'created',
      round: 0,
      creator: {
        userId: row.creator_id,
        walletId: row.wallet_id,
        name: row.username || row.first_name || 'Player',
      },
      opponent: null,
      seeds: { 0: seed },
      seedHashes: { 0: serverSeedHash },
      commits: {},
      locked: [],
      rematchVotes: {},
      winnerId: null,
    };
    await this.env.DB.prepare('UPDATE duels SET server_seed_hash = ? WHERE id = ?')
      .bind(serverSeedHash, row.id)
      .run();
    await this.saveDuel(duel);
    await this.state.storage.setAlarm(Date.now() + this.timeoutMs);
    return duel;
  }

  private async saveDuel(duel: DuelData): Promise<void> {
    this.duelCache = duel;
    await this.state.storage.put('duel', duel);
  }

  private isPlayer(duel: DuelData, userId: string): boolean {
    return duel.creator.userId === userId || duel.opponent?.userId === userId;
  }

  private stateMessage(duel: DuelData) {
    return {
      type: 'duel_state',
      duelId: duel.id,
      state: duel.state,
      game: duel.game,
      stake: duel.stake,
      round: duel.round,
      creator: { userId: duel.creator.userId, name: duel.creator.name },
      opponent: duel.opponent ? { userId: duel.opponent.userId, name: duel.opponent.name } : null,
      seedHash: duel.seedHashes[duel.round] ?? null,
      committed: Object.keys(duel.commits),
      rematchVotes: Object.keys(duel.rematchVotes),
      winnerId: duel.winnerId,
    };
  }

  private peers(excludeWs?: WebSocket): PeerInfo[] {
    return this.state
      .getWebSockets()
      .filter((ws) => ws !== excludeWs)
      .map((ws) => ws.deserializeAttachment() as PeerInfo | null)
      .filter((p): p is PeerInfo => p !== null);
  }

  private send(ws: WebSocket, data: unknown): void {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Socket already closing; presence updates will follow from close events.
    }
  }

  private broadcast(data: unknown, excludeUserId?: string, excludeWs?: WebSocket): void {
    const payload = JSON.stringify(data);
    for (const ws of this.state.getWebSockets()) {
      if (ws === excludeWs) continue;
      const peer = ws.deserializeAttachment() as PeerInfo | null;
      if (excludeUserId && peer?.userId === excludeUserId) continue;
      try {
        ws.send(payload);
      } catch {
        // Ignore sockets mid-close.
      }
    }
  }
}
