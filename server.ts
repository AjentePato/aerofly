import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomState {
  sim: WebSocket | null;
  controllers: Map<string, WebSocket>;
}

const rooms = new Map<string, RoomState>();
let nextClientSeq = 1;

function getOrCreateRoom(code: string): RoomState {
  const key = code.toUpperCase();
  let room = rooms.get(key);
  if (!room) {
    room = { sim: null, controllers: new Map() };
    rooms.set(key, room);
  }
  return room;
}

function broadcastStatus(code: string, room: RoomState) {
  const controllerIds = Array.from(room.controllers.keys());
  const simConnected = Boolean(room.sim && room.sim.readyState === WebSocket.OPEN);

  if (simConnected && room.sim) {
    room.sim.send(
      JSON.stringify({
        type: 'room:status',
        room: code,
        controllerCount: room.controllers.size,
        controllerIds,
        simConnected: true,
      })
    );
  }

  for (const [ctrlId, ctrl] of room.controllers.entries()) {
    if (ctrl.readyState === WebSocket.OPEN) {
      ctrl.send(
        JSON.stringify({
          type: 'room:status',
          room: code,
          clientId: ctrlId,
          controllerCount: room.controllers.size,
          simConnected,
        })
      );
    }
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    perMessageDeflate: false,
  });

  wss.on('connection', (ws, req) => {
    req.socket?.setNoDelay?.(true);

    const clientId = `c${nextClientSeq++}`;
    let joinedRoom = '';
    let role: 'sim' | 'controller' | '' = '';

    ws.on('message', (raw, isBinary) => {
      // Zero-copy / zero-JSON binary fast path for 9-byte controller stick frames
      if (isBinary) {
        if (role !== 'controller' || !joinedRoom) return;
        const room = rooms.get(joinedRoom);
        if (
          room?.sim &&
          room.sim.readyState === WebSocket.OPEN &&
          room.sim.bufferedAmount < 4096
        ) {
          room.sim.send(raw, { binary: true });
        }
        return;
      }

      try {
        const rawText = raw.toString();
        const msg = JSON.parse(rawText) as {
          type: string;
          room?: string;
          role?: 'sim' | 'controller';
          targetId?: string;
          throttle?: number;
          yaw?: number;
          pitch?: number;
          roll?: number;
          action?: string;
          sdp?: unknown;
          candidate?: unknown;
          telemetry?: unknown;
        };

        if (msg.type === 'register' && msg.room && (msg.role === 'sim' || msg.role === 'controller')) {
          joinedRoom = msg.room.trim().toUpperCase().slice(0, 8);
          role = msg.role;
          const room = getOrCreateRoom(joinedRoom);

          if (role === 'sim') {
            room.sim = ws;
          } else {
            room.controllers.set(clientId, ws);
          }
          broadcastStatus(joinedRoom, room);
          return;
        }

        if (!joinedRoom) return;
        const room = rooms.get(joinedRoom);
        if (!room) return;

        // Relay stick (JSON fallback) & action packets from phone controller -> PC simulator
        if ((msg.type === 'stick' || msg.type === 'action') && role === 'controller') {
          if (room.sim && room.sim.readyState === WebSocket.OPEN) {
            if (msg.type !== 'stick' || room.sim.bufferedAmount < 4096) {
              room.sim.send(rawText);
            }
          }
          return;
        }

        // Relay WebRTC P2P signaling (offer/answer/ICE) between PC sim and phone controllers
        if (msg.type === 'rtc:offer' || msg.type === 'rtc:answer' || msg.type === 'rtc:ice') {
          if (role === 'sim') {
            const out = JSON.stringify({ ...msg, fromId: 'sim' });
            if (msg.targetId) {
              const target = room.controllers.get(msg.targetId);
              if (target && target.readyState === WebSocket.OPEN) {
                target.send(out);
              }
            } else {
              for (const ctrl of room.controllers.values()) {
                if (ctrl.readyState === WebSocket.OPEN) {
                  ctrl.send(out);
                }
              }
            }
          } else if (role === 'controller') {
            if (room.sim && room.sim.readyState === WebSocket.OPEN) {
              room.sim.send(JSON.stringify({ ...msg, fromId: clientId }));
            }
          }
          return;
        }

        // Relay live telemetry from PC simulator -> connected phone controllers
        if (msg.type === 'telemetry' && role === 'sim' && room.controllers.size > 0) {
          for (const ctrl of room.controllers.values()) {
            if (ctrl.readyState === WebSocket.OPEN && ctrl.bufferedAmount < 4096) {
              ctrl.send(rawText);
            }
          }
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      if (!joinedRoom) return;
      const room = rooms.get(joinedRoom);
      if (!room) return;
      if (role === 'sim' && room.sim === ws) {
        room.sim = null;
      } else if (role === 'controller') {
        room.controllers.delete(clientId);
      }
      broadcastStatus(joinedRoom, room);
      if (!room.sim && room.controllers.size === 0) {
        rooms.delete(joinedRoom);
      }
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AeroTrainer 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
