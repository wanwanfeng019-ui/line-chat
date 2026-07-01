const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const crypto = require('crypto');

const app = express();
app.use(express.static('public'));
app.use(express.json());
const server = http.createServer(app);

// ── In-memory store ──
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, {
    admin: null,
    messages: [],
    clients: new Map(),       // ws → { userName, ip }
    joinLog: [],              // [{ userName, ip, action, time }]
  });
  return rooms.get(id);
}

// ── WebSocket ──
const wss = new WebSocketServer({ server });

function getClientIP(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1] || '');
  const roomId = params.get('room') || 'default';
  const userName = params.get('user') || '名無し';
  const ip = getClientIP(req);

  const room = getRoom(roomId);
  room.clients.set(ws, { userName, ip });

  // jinzhengen is always admin
  if (!room.admin || userName === 'jinzhengen') room.admin = userName;

  ws._roomId = roomId;
  ws._userName = userName;
  ws._ip = ip;
  const isAdmin = (room.admin === userName);

  // Log join
  room.joinLog.push({ userName, ip, action: 'join', time: Date.now() });
  if (room.joinLog.length > 500) room.joinLog = room.joinLog.slice(-500);

  broadcast(room, {
    type: 'system',
    text: `${userName} が参加しました` + (isAdmin ? ' 👑' : ''),
    user: 'SYSTEM', time: Date.now(), online: room.clients.size,
  });

  ws.send(JSON.stringify({
    type: 'history',
    messages: room.messages.slice(-200),
    online: room.clients.size, roomId,
    admin: room.admin, isAdmin,
  }));

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
        if (target.user !== ws._userName && room.admin !== ws._userName) return;
        target.deleted = true;
        target.deleteBy = ws._userName;
        target.deleteTime = Date.now();
        broadcast(room, { type: 'msgDeleted', msgId: msg.msgId, deleteBy: ws._userName });
      }

      if (msg.type === 'setAdmin') {
        if (room.admin !== ws._userName) return;
        room.admin = msg.newAdmin;
        room.joinLog.push({ userName: ws._userName, ip: ws._ip, action: 'setAdmin:' + msg.newAdmin, time: Date.now() });
        broadcast(room, {
          type: 'system',
          text: `👑 管理者が ${msg.newAdmin} に変更されました`,
          user: 'SYSTEM', time: Date.now(), online: room.clients.size, admin: room.admin,
        });
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    const info = room.clients.get(ws);
    room.clients.delete(ws);
    room.joinLog.push({ userName: ws._userName, ip: ws._ip, action: 'leave', time: Date.now() });
    if (room.joinLog.length > 500) room.joinLog = room.joinLog.slice(-500);

    broadcast(room, {
      type: 'system',
      text: `${ws._userName} が退出しました`,
      user: 'SYSTEM', time: Date.now(), online: room.clients.size,
    });

    if (room.clients.size === 0) {
      setTimeout(() => { if (room.clients.size === 0) rooms.delete(roomId); }, 600000);
    }
  });
});

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  room.clients.forEach((_, client) => {
    if (client.readyState === 1) client.send(data);
  });
}

// ── Admin API ──
const ADMIN_ACCOUNT = { user: 'jinzhengen', pass: 'aabbcc123' };

function checkAdmin(req, res) {
  const user = req.query.user || req.body?.user || '';
  const pass = req.query.pwd || req.body?.pwd || '';
  if (user !== ADMIN_ACCOUNT.user || pass !== ADMIN_ACCOUNT.pass) {
    res.status(401).json({ error: 'アカウントまたはパスワードが違います' });
    return false;
  }
  return true;
}

// List all rooms
app.get('/api/admin/rooms', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const list = [];
  for (const [id, room] of rooms) {
    const online = Array.from(room.clients.values()).map(info => ({
      userName: info.userName,
      ip: info.ip,
      isAdmin: info.userName === room.admin,
    }));
    list.push({
      roomId: id,
      admin: room.admin,
      online,
      onlineCount: room.clients.size,
      messageCount: room.messages.length,
      joinLogCount: room.joinLog.length,
    });
  }
  res.json(list);
});

app.get('/api/admin/:roomId', (req, res) => {
  const { roomId } = req.params;
  if (!checkAdmin(req, res)) return;

  const room = rooms.get(roomId);
  if (!room) return res.json({ roomId, exists: false, online: [], joinLog: [] });

  const online = Array.from(room.clients.entries()).map(([ws, info]) => ({
    userName: info.userName,
    ip: info.ip,
    isAdmin: info.userName === room.admin,
  }));

  res.json({
    roomId,
    admin: room.admin,
    online,
    onlineCount: room.clients.size,
    messageCount: room.messages.length,
    joinLog: room.joinLog.slice(-100).reverse(),
  });
});

app.post('/api/admin/:roomId/setAdmin', (req, res) => {
  const { roomId } = req.params;
  if (!checkAdmin(req, res)) return;
  const { newAdmin } = req.body;

  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: '部屋が存在しません' });

  room.admin = newAdmin;
  room.joinLog.push({ userName: 'BACKEND', ip: '0.0.0.0', action: 'setAdmin:' + newAdmin, time: Date.now() });
  broadcast(room, {
    type: 'system',
    text: `👑 管理者が ${newAdmin} に変更されました（バックエンド）`,
    user: 'SYSTEM', time: Date.now(), online: room.clients.size, admin: room.admin,
  });

  res.json({ ok: true, admin: newAdmin });
});

app.post('/api/admin/:roomId/deleteMsg', (req, res) => {
  const { roomId } = req.params;
  if (!checkAdmin(req, res)) return;
  const { msgId } = req.body;

  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: '部屋が存在しません' });

  const target = room.messages.find(m => m.id === msgId);
  if (!target) return res.status(404).json({ error: 'メッセージが見つかりません' });

  target.deleted = true;
  target.deleteBy = 'BACKEND';
  target.deleteTime = Date.now();
  broadcast(room, { type: 'msgDeleted', msgId, deleteBy: 'BACKEND' });

  res.json({ ok: true });
});

// ── Routes ──
app.get('/:roomId', (req, res) => res.sendFile(__dirname + '/public/index.html'));
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

// ── Start ──
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`💬 LINE風チャット http://localhost:${PORT}`);
  console.log(`🔧 管理画面 http://localhost:${PORT}/admin?room=部屋名&pwd=admin888`);
});
