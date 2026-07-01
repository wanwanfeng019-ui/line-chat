const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);

// ── In-memory store ──
const rooms = new Map(); // roomId → { messages[], clients: Set<ws> }

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { messages: [], clients: new Set() });
  return rooms.get(id);
}

// ── WebSocket ──
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  // Parse room from URL: /ws?room=ROOMID&user=NAME
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const roomId = params.get('room') || 'default';
  const userName = params.get('user') || '名無し';

  const room = getRoom(roomId);
  room.clients.add(ws);
  ws._roomId = roomId;
  ws._userName = userName;

  // Send join notification
  const joinMsg = {
    type: 'system',
    text: `${userName} が参加しました`,
    user: 'SYSTEM',
    time: Date.now(),
    online: room.clients.size,
  };
  broadcast(room, joinMsg);

  // Send recent history (last 100 messages)
  ws.send(JSON.stringify({
    type: 'history',
    messages: room.messages.slice(-100),
    online: room.clients.size,
    roomId,
  }));

  console.log(`👤 ${userName} joined room:${roomId} (${room.clients.size} online)`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'chat' && msg.text?.trim()) {
        const chatMsg = {
          type: 'chat',
          id: crypto.randomBytes(4).toString('hex'),
          user: ws._userName,
          text: msg.text.trim().slice(0, 2000),
          time: Date.now(),
        };
        room.messages.push(chatMsg);
        if (room.messages.length > 500) room.messages = room.messages.slice(-500);
        broadcast(room, chatMsg);
      }
    } catch (e) { /* ignore bad messages */ }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    const leaveMsg = {
      type: 'system',
      text: `${ws._userName} が退出しました`,
      user: 'SYSTEM',
      time: Date.now(),
      online: room.clients.size,
    };
    broadcast(room, leaveMsg);
    console.log(`👋 ${ws._userName} left room:${roomId} (${room.clients.size} online)`);
    // Clean empty rooms
    if (room.clients.size === 0 && room.messages.length === 0) rooms.delete(roomId);
  });
});

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.clients.forEach(client => {
    if (client.readyState === 1) client.send(data);
  });
}

// ── Routes ──
app.get('/:roomId', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.get('/', (req, res) => {
  // Homepage: create a room
  res.sendFile(__dirname + '/public/index.html');
});

// ── Start ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════╗
║  💬 LINE風 Webチャット 起動中   ║
║  http://localhost:${PORT}          ║
║                                  ║
║  部屋を作る:                     ║
║  http://localhost:${PORT}/部屋名   ║
╚══════════════════════════════════╝
`);
});
