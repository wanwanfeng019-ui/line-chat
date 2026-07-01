const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
app.use(express.static('public'));
const server = http.createServer(app);

// ── In-memory store ──
const rooms = new Map(); // roomId → { admin, messages[], clients: Map<ws, userName> }

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, { admin: null, messages: [], clients: new Map() });
  return rooms.get(id);
}

// ── WebSocket ──
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const roomId = params.get('room') || 'default';
  const userName = params.get('user') || '名無し';

  const room = getRoom(roomId);
  room.clients.set(ws, userName);

  // First person in room becomes admin
  if (!room.admin) room.admin = userName;

  ws._roomId = roomId;
  ws._userName = userName;
  const isAdmin = (room.admin === userName);

  // Send join notification
  broadcast(room, {
    type: 'system',
    text: `${userName} が参加しました` + (isAdmin ? ' 👑' : ''),
    user: 'SYSTEM',
    time: Date.now(),
    online: room.clients.size,
  });

  // Send history to the new client only
  ws.send(JSON.stringify({
    type: 'history',
    messages: room.messages.slice(-200),
    online: room.clients.size,
    roomId,
    admin: room.admin,
    isAdmin,
  }));

  console.log(`👤 ${userName} ${isAdmin?'👑':''} joined room:${roomId} (${room.clients.size} online)`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'chat' && msg.text?.trim()) {
        const chatMsg = {
          type: 'chat',
          id: crypto.randomBytes(6).toString('hex'),
          user: ws._userName,
          text: msg.text.trim().slice(0, 2000),
          time: Date.now(),
        };
        room.messages.push(chatMsg);
        if (room.messages.length > 1000) room.messages = room.messages.slice(-1000);
        broadcast(room, chatMsg);
      }

      if (msg.type === 'delete') {
        const target = room.messages.find(m => m.id === msg.msgId);
        if (!target) return;
        // Check permission: own message OR admin
        if (target.user !== ws._userName && room.admin !== ws._userName) return;
        target.deleted = true;
        target.deleteBy = ws._userName;
        target.deleteTime = Date.now();
        broadcast(room, {
          type: 'msgDeleted',
          msgId: msg.msgId,
          deleteBy: ws._userName,
        });
      }

      if (msg.type === 'setAdmin') {
        if (room.admin !== ws._userName) return;
        room.admin = msg.newAdmin;
        broadcast(room, {
          type: 'system',
          text: `👑 管理者が ${msg.newAdmin} に変更されました`,
          user: 'SYSTEM',
          time: Date.now(),
          online: room.clients.size,
          admin: room.admin,
        });
      }
    } catch (e) { /* ignore bad messages */ }
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    broadcast(room, {
      type: 'system',
      text: `${ws._userName} が退出しました`,
      user: 'SYSTEM',
      time: Date.now(),
      online: room.clients.size,
    });
    console.log(`👋 ${ws._userName} left room:${roomId}`);
    // Clean empty rooms after 10 minutes
    if (room.clients.size === 0) {
      setTimeout(() => {
        if (room.clients.size === 0) rooms.delete(roomId);
      }, 600000);
    }
  });
});

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.clients.forEach((_, client) => {
    if (client.readyState === 1) client.send(data);
  });
}

// ── Routes ──
app.get('/:roomId', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// ── Start ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════╗
║  💬 LINE風 Webチャット 起動中   ║
║  http://localhost:${PORT}          ║
║  部屋: /?room=部屋名              ║
╚══════════════════════════════════╝
`);
});
