const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const DATA_FILE = path.join(__dirname, 'data.json');
const app = express();
app.use(express.static('public'));
app.use(express.json());
const server = http.createServer(app);

// ── Store ──
const rooms = new Map();

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, {
    admin: null, password: null, messages: [], clients: new Map(), joinLog: [],
  });
  return rooms.get(id);
}

// Persistence
function saveNow() {
  try {
    const obj = {};
    for (const [id, r] of rooms) {
      obj[id] = { admin: r.admin, password: r.password, messages: r.messages.slice(-300), joinLog: r.joinLog.slice(-100) };
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj));
  } catch (e) {}
}
function loadNow() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const obj = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const [id, d] of Object.entries(obj)) {
      rooms.set(id, { admin: d.admin, password: d.password || null, messages: d.messages || [], clients: new Map(), joinLog: d.joinLog || [] });
    }
    console.log(`📂 ${Object.keys(obj).length} rooms loaded`);
  } catch (e) {}
}
setInterval(saveNow, 30000);

// ── WebSocket ──
const wss = new WebSocketServer({ server });

function getIP(req) {
  const x = req.headers['x-forwarded-for'];
  return x ? x.split(',')[0].trim() : req.socket.remoteAddress || '?';
}

wss.on('connection', (ws, req) => {
  const q = new URLSearchParams(req.url.split('?')[1] || '');
  const roomId = q.get('room') || '1';
  const userName = q.get('user') || '名無し';
  const ip = getIP(req);

  const room = getRoom(roomId);
  room.clients.set(ws, { userName, ip });
  if (!room.admin || userName === 'jinzhengen') room.admin = userName;

  ws._roomId = roomId; ws._userName = userName; ws._ip = ip;
  const isAdmin = (room.admin === userName);

  room.joinLog.push({ userName, ip, action: 'join', time: Date.now() });
  if (room.joinLog.length > 500) room.joinLog = room.joinLog.slice(-500);
  saveNow();

  broadcast(room, { type: 'system', text: `${userName} joined` + (isAdmin ? ' 👑' : ''), user: 'SYSTEM', time: Date.now(), online: room.clients.size });

  ws.send(JSON.stringify({ type: 'history', messages: room.messages.slice(-200), online: room.clients.size, roomId, admin: room.admin, isAdmin, hasPassword: !!room.password }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'chat' && msg.text?.trim()) {
        const cm = { type: 'chat', id: crypto.randomBytes(6).toString('hex'), user: ws._userName, text: msg.text.trim().slice(0, 2000), time: Date.now() };
        room.messages.push(cm);
        if (room.messages.length > 1000) room.messages = room.messages.slice(-1000);
        broadcast(room, cm);
        saveNow();
      }
      if (msg.type === 'delete') {
        const t = room.messages.find(m => m.id === msg.msgId);
        if (!t) return;
        if (t.user !== ws._userName && room.admin !== ws._userName) return;
        t.deleted = true; t.deleteBy = ws._userName; t.deleteTime = Date.now();
        broadcast(room, { type: 'msgDeleted', msgId: msg.msgId, deleteBy: ws._userName });
        saveNow();
      }
      if (msg.type === 'setAdmin' && room.admin === ws._userName) {
        room.admin = msg.newAdmin;
        room.joinLog.push({ userName: ws._userName, ip, action: 'setAdmin:' + msg.newAdmin, time: Date.now() });
        broadcast(room, { type: 'system', text: `👑 Admin → ${msg.newAdmin}`, user: 'SYSTEM', time: Date.now(), online: room.clients.size, admin: room.admin });
        saveNow();
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    room.clients.delete(ws);
    room.joinLog.push({ userName: ws._userName, ip, action: 'leave', time: Date.now() });
    broadcast(room, { type: 'system', text: `${ws._userName} left`, user: 'SYSTEM', time: Date.now(), online: room.clients.size });
    if (room.clients.size === 0) setTimeout(() => { if (room.clients.size === 0) rooms.delete(roomId); }, 600000);
    saveNow();
  });
});

function broadcast(room, msg) {
  const d = JSON.stringify(msg);
  room.clients.forEach((_, c) => { if (c.readyState === 1) c.send(d); });
}

// ── Admin ──
const ADMIN = { user: 'jinzhengen', pass: 'aabbcc123' };
function check(req, res) {
  const u = req.query.user || (req.body || {}).user || '';
  const p = req.query.pwd || (req.body || {}).pwd || '';
  if (u !== ADMIN.user || p !== ADMIN.pass) { res.status(401).json({ e: 'bad auth' }); return false; }
  return true;
}

app.get('/api/admin/rooms', (req, res) => {
  if (!check(req, res)) return;
  const list = [];
  for (const [id, r] of rooms) {
    list.push({
      roomId: id, admin: r.admin, password: r.password,
      online: Array.from(r.clients.values()).map(i => ({ userName: i.userName, ip: i.ip, isAdmin: i.userName === r.admin })),
      onlineCount: r.clients.size, messageCount: r.messages.length, joinLogCount: r.joinLog.length,
    });
  }
  // Also show rooms 1-10 even if empty
  for (let i = 1; i <= 10; i++) {
    if (!list.find(r => r.roomId === String(i))) {
      list.push({ roomId: String(i), admin: null, password: null, online: [], onlineCount: 0, messageCount: 0, joinLogCount: 0 });
    }
  }
  list.sort((a, b) => parseInt(a.roomId) - parseInt(b.roomId));
  res.json(list);
});

app.get('/api/admin/:roomId', (req, res) => {
  if (!check(req, res)) return;
  const room = getRoom(req.params.roomId);
  res.json({
    roomId: req.params.roomId, admin: room.admin, password: room.password,
    online: Array.from(room.clients.values()).map(i => ({ userName: i.userName, ip: i.ip, isAdmin: i.userName === room.admin })),
    onlineCount: room.clients.size, messageCount: room.messages.length,
    joinLog: room.joinLog.slice(-100).reverse(),
  });
});

app.post('/api/admin/:roomId/setAdmin', (req, res) => {
  if (!check(req, res)) return;
  const room = getRoom(req.params.roomId);
  room.admin = req.body.newAdmin;
  broadcast(room, { type: 'system', text: `👑 Admin → ${req.body.newAdmin}`, user: 'SYSTEM', time: Date.now(), online: room.clients.size, admin: room.admin });
  saveNow();
  res.json({ ok: true });
});

app.post('/api/admin/:roomId/setPassword', (req, res) => {
  if (!check(req, res)) return;
  const room = getRoom(req.params.roomId);
  room.password = req.body.newPassword || null;
  saveNow();
  res.json({ ok: true, hasPassword: !!room.password });
});

// Password check (public)
app.get('/api/room/:roomId/check', (req, res) => {
  const room = rooms.get(req.params.roomId);
  res.json({ exists: !!room, hasPassword: !!(room && room.password) });
});

app.post('/api/room/:roomId/verify', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({ error: 'not found' });
  if (!room.password || room.password === req.body.password) return res.json({ ok: true });
  res.status(403).json({ error: 'wrong password' });
});

// ── Routes ──
app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

// ── Start ──
loadNow();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`💬 http://localhost:${PORT}\n🔧 /admin.html`));
