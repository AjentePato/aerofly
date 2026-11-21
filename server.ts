import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RoomState {
  sim: WebSocket | null;
  controllers: Set<WebSocket>;
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(code: string): RoomState {
  const key = code.toUpperCase();
  let room = rooms.get(key);
  if (!room) {
    room = { sim: null, controllers: new Set() };
    rooms.set(key, room);
  }
  return room;
}

function broadcastStatus(code: string, room: RoomState) {
  const statusPayload = JSON.stringify({
    type: 'room:status',
    room: code,
    controllerCount: room.controllers.size,
    simConnected: Boolean(room.sim && room.sim.readyState === WebSocket.OPEN),
  });
  if (room.sim && room.sim.readyState === WebSocket.OPEN) {
    room.sim.send(statusPayload);
  }
  for (const ctrl of room.controllers) {
    if (ctrl.readyState === WebSocket.OPEN) {
      ctrl.send(statusPayload);
    }
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    let joinedRoom = '';
    let role: 'sim' | 'controller' | '' = '';

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          room?: string;
          role?: 'sim' | 'controller';
          throttle?: number;
          yaw?: number;
          pitch?: number;
          roll?: number;
          action?: string;
          telemetry?: unknown;
        };

        if (msg.type === 'register' && msg.room && (msg.role === 'sim' || msg.role === 'controller')) {
          joinedRoom = msg.room.trim().toUpperCase().slice(0, 8);
          role = msg.role;
          const room = getOrCreateRoom(joinedRoom);

          if (role === 'sim') {
            room.sim = ws;
          } else {
            room.controllers.add(ws);
          }
          broadcastStatus(joinedRoom, room);
          return;
        }

        if (!joinedRoom) return;
        const room = rooms.get(joinedRoom);
        if (!room) return;

        // Relay stick & action packets from phone controller -> PC simulator
        if ((msg.type === 'stick' || msg.type === 'action') && role === 'controller') {
          if (room.sim && room.sim.readyState === WebSocket.OPEN) {
            room.sim.send(JSON.stringify(msg));
          }
          return;
        }

        // Relay live telemetry from PC simulator -> connected phone controllers
        if (msg.type === 'telemetry' && role === 'sim') {
          const payload = JSON.stringify(msg);
          for (const ctrl of room.controllers) {
            if (ctrl.readyState === WebSocket.OPEN) {
              ctrl.send(payload);
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
        room.controllers.delete(ws);
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

  const PORT = 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`AeroTrainer 3D server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
