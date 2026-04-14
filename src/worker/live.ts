const ROOM_NAME = 'have-you-seen-my-shell-live-room';

export class LiveRoom implements DurableObject {
  private sessions: Set<WebSocket> = new Set();

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const message = await request.json();
      await this.broadcast(message);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    if (request.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected websocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.sessions.add(server);

    const cleanUp = () => {
      this.sessions.delete(server);
    };

    server.addEventListener('close', cleanUp);
    server.addEventListener('error', cleanUp);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  private async broadcast(message: unknown): Promise<void> {
    const payload = JSON.stringify(message);

    for (const ws of this.sessions) {
      try {
        ws.send(payload);
      } catch {
        this.sessions.delete(ws);
      }
    }
  }
}

export function getLiveRoomStub(namespace: DurableObjectNamespace): DurableObjectStub {
  const id = namespace.idFromName(ROOM_NAME);
  return namespace.get(id);
}

export async function broadcast(
  namespace: DurableObjectNamespace,
  message: Record<string, unknown>,
): Promise<void> {
  const stub = getLiveRoomStub(namespace);
  await stub.fetch('https://live-room/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(message),
  });
}
