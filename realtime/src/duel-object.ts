import type { Env } from './index.js';

interface PeerInfo {
  userId: string;
  walletId: string;
  name: string;
}

/**
 * One Durable Object per duel. This scaffold handles the WebSocket lifecycle:
 * authenticated connect (identity arrives via internal headers), presence
 * broadcasts, heartbeat (ping/pong auto-response so hibernation works), and
 * close handling. The duel state machine builds on top of this.
 */
export class DuelObject implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    // Kept for parity with the worker Env; wallet calls use it in later tasks.
    private readonly env: Env,
  ) {
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
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

    // Replace any previous socket for the same user (reconnects).
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
    this.broadcast(
      { type: 'presence', peers: this.peers().map((p) => ({ userId: p.userId, name: p.name })) },
      userId,
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): Promise<void> {
    if (typeof message !== 'string') return;
    let parsed: { type?: string };
    try {
      parsed = JSON.parse(message);
    } catch {
      this.send(ws, { type: 'error', error: 'Malformed message' });
      return;
    }
    // The state machine handles real message types in later tasks.
    this.send(ws, { type: 'error', error: `Unknown message type: ${parsed.type ?? 'none'}` });
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    // The closing socket can still appear in getWebSockets() here — exclude it.
    this.broadcast(
      {
        type: 'presence',
        peers: this.peers(ws).map((p) => ({ userId: p.userId, name: p.name })),
      },
      undefined,
      ws,
    );
  }

  protected peers(excludeWs?: WebSocket): PeerInfo[] {
    return this.state
      .getWebSockets()
      .filter((ws) => ws !== excludeWs)
      .map((ws) => ws.deserializeAttachment() as PeerInfo | null)
      .filter((p): p is PeerInfo => p !== null);
  }

  protected send(ws: WebSocket, data: unknown): void {
    try {
      ws.send(JSON.stringify(data));
    } catch {
      // Socket already closing; presence updates will follow from close events.
    }
  }

  protected broadcast(data: unknown, excludeUserId?: string, excludeWs?: WebSocket): void {
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
