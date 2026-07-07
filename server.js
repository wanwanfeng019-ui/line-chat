const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const DATA_FILE = path.join(__dirname, 'data.json');
const app = express();
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
const server = http.createServer(app);

// ═══ LINE OAuth ═══
const LINE_ID = '2010620651';
const LINE_SECRET = 'ebdac45321392b1876f06b3c18b279ce';
const LINE_CB = 'https://kabu-chat.com/api/line-callback';

app.get('/api/line-login', (req, res) => {
  const state = crypto.randomBytes(8).toString('hex');
  res.redirect('https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=' + LINE_ID + '&redirect_uri=' + encodeURIComponent(LINE_CB) + '&state=' + state + '&scope=profile%20openid');
});

app.get('/api/line-callback', (req, res) => {
  const { code, error } = req.query;
  if (error || !code) return res.redirect('/?login=error');
  const body = 'grant_type=authorization_code&code=' + encodeURIComponent(code) + '&redirect_uri=' + encodeURIComponent(LINE_CB) + '&client_id=' + LINE_ID + '&client_secret=' + LINE_SECRET;
  const hr = require('https').request({ hostname: 'api.line.me', path: '/oauth2/v2.1/token', method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }, (r2) => { let d = ''; r2.on('data', c => d += c); r2.on('end', () => {
    try {
      const td = JSON.parse(d);
      if (!td.access_token) return res.redirect('/?login=error');
      require('https').get({ hostname: 'api.line.me', path: '/v2/profile', headers: { 'Authorization': 'Bearer ' + td.access_token } }, (r3) => { let p = ''; r3.on('data', c => p += c); r3.on('end', () => {
        try {
          const prof = JSON.parse(p);
          const token = crypto.randomBytes(16).toString('hex');
          res.redirect('/?token=' + token + '&name=' + encodeURIComponent(prof.displayName || 'LINE User'));
        } catch(e) { res.redirect('/?login=error'); }
      }); }).on('error', () => res.redirect('/?login=error'));
    } catch(e) { res.redirect('/?login=error'); }
  }); });
  hr.on('error', () => res.redirect('/?login=error'));
  hr.write(body); hr.end();
});

// ── Store ──
const rooms = new Map();
const SUPER_ADMIN = 'jinzhengen';

function getRoom(id) {
  if (!rooms.has(id)) rooms.set(id, {
    admins: [], messages: [], password: null, clients: new Map(), joinLog: [], checkins: {},
  });
  // Track join time for each client
  if (!rooms.get(id)._joinTimes) rooms.get(id)._joinTimes = new Map();
  return rooms.get(id);
}

// Persistence
function saveNow() {
  try {
    const obj = {};
    for (const [id, r] of rooms) {
      obj[id] = { admins: r.admins, password: r.password, messages: r.messages.slice(-300), joinLog: r.joinLog.slice(-100), checkins: r.checkins || {} };
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj));
  } catch(e) {}
}
function loadNow() {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const obj = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const [id, d] of Object.entries(obj)) {
      rooms.set(id, { admins: d.admins || [], password: d.password || null, messages: d.messages || [], clients: new Map(), joinLog: d.joinLog || [], checkins: d.checkins || {} });
    }
    console.log('📂 ' + Object.keys(obj).length + ' rooms loaded');
  } catch(e) {}
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

  // jinzhengen is always admin
  if (!room.admins.includes(SUPER_ADMIN)) room.admins.push(SUPER_ADMIN);

  ws._roomId = roomId; ws._userName = userName; ws._ip = ip;
  room._joinTimes.set(ws, Date.now());
  const isAdmin = room.admins.includes(userName);

  room.joinLog.push({ userName, ip, action: 'join', time: Date.now() });
  if (room.joinLog.length > 500) room.joinLog = room.joinLog.slice(-500);
  saveNow();

  broadcast(room, { type: 'system', text: `${userName} joined` + (isAdmin ? ' 👑' : ''), user: 'SYSTEM', time: Date.now(), online: room.clients.size });

  ws.send(JSON.stringify({ type: 'history', messages: room.messages.slice(-200), online: room.clients.size, roomId, admins: room.admins, isAdmin, hasPassword: !!room.password }));

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'chat' && msg.text?.trim()) {
        const cm = { type:'chat', id: crypto.randomBytes(6).toString('hex'), user: ws._userName, text: msg.text.trim().slice(0,2000), time: Date.now(), readBy:[ws._userName], replyTo: msg.replyTo || null };
        room.messages.push(cm);
        if (room.messages.length > 1000) room.messages = room.messages.slice(-1000);
        broadcast(room, cm);
        saveNow();
      }
      if (msg.type === 'read') {
        // Mark all messages as read by this user
        let changed = false;
        for (const m of room.messages) {
          if (!m.readBy) m.readBy = [];
          if (!m.readBy.includes(ws._userName)) { m.readBy.push(ws._userName); changed = true; }
        }
        if (changed) { broadcast(room, { type:'readUpdate', user: ws._userName, online: room.clients.size }); saveNow(); }
      }
      if (msg.type === 'delete') {
        const t = room.messages.find(m => m.id === msg.msgId);
        if (!t) return;
        if (t.user !== ws._userName && !room.admins.includes(ws._userName)) return;
        t.deleted = true; t.deleteBy = ws._userName; t.deleteTime = Date.now();
        broadcast(room, { type:'msgDeleted', msgId: msg.msgId, deleteBy: ws._userName });
        saveNow();
      }
      if (msg.type === 'setAdmin' && room.admins.includes(ws._userName)) {
        if (!room.admins.includes(msg.newAdmin)) room.admins.push(msg.newAdmin);
        room.joinLog.push({ userName: ws._userName, ip, action:'addAdmin:'+msg.newAdmin, time: Date.now() });
        broadcast(room, { type:'system', text:`👑 ${msg.newAdmin} が管理者になりました`, user:'SYSTEM', time: Date.now(), online: room.clients.size, admins: room.admins });
        saveNow();
      }
      if (msg.type === 'removeAdmin' && room.admins.includes(ws._userName)) {
        if (msg.target !== SUPER_ADMIN) {
          room.admins = room.admins.filter(a => a !== msg.target);
          room.joinLog.push({ userName: ws._userName, ip, action:'removeAdmin:'+msg.target, time: Date.now() });
          broadcast(room, { type:'system', text:`${msg.target} の管理者権限が解除されました`, user:'SYSTEM', time: Date.now(), online: room.clients.size, admins: room.admins });
          saveNow();
        }
      }
    } catch(e) {}
  });

  ws.on('close', () => {
    room.clients.delete(ws); room._joinTimes.delete(ws);
    room.joinLog.push({ userName: ws._userName, ip, action:'leave', time: Date.now() });
    broadcast(room, { type:'system', text:`${ws._userName} left`, user:'SYSTEM', time: Date.now(), online: room.clients.size });
    if (room.clients.size === 0) setTimeout(() => { if (room.clients.size === 0) rooms.delete(roomId); }, 600000);
    saveNow();
  });
});

function broadcast(room, msg) {
  const d = JSON.stringify(msg);
  room.clients.forEach((_, c) => { if (c.readyState === 1) c.send(d); });
}

// ── Admin API ──
const ADMIN = { user: 'jinzhengen', pass: 'aabbcc123' };
function check(req, res) {
  const u = req.query.user || (req.body||{}).user || '';
  const p = req.query.pwd || (req.body||{}).pwd || '';
  if (u !== ADMIN.user || p !== ADMIN.pass) { res.status(401).json({e:'bad auth'}); return false; }
  return true;
}

app.get('/api/admin/rooms', (req, res) => {
  if (!check(req, res)) return;
  const list = [];
  for (const [id, r] of rooms) {
    list.push({
      roomId: id, admins: r.admins, password: r.password,
      online: Array.from(r.clients.values()).map(i=>({userName:i.userName,ip:i.ip,isAdmin:r.admins.includes(i.userName)})),
      onlineCount: r.clients.size, messageCount: r.messages.length, joinLogCount: r.joinLog.length,
    });
  }
  for (let i=1; i<=10; i++) {
    if (!list.find(r=>r.roomId===String(i))) list.push({roomId:String(i),admins:[],password:null,online:[],onlineCount:0,messageCount:0,joinLogCount:0});
  }
  list.sort((a,b)=>parseInt(a.roomId)-parseInt(b.roomId));
  res.json(list);
});

app.get('/api/admin/:roomId', (req, res) => {
  if (!check(req, res)) return;
  const room = getRoom(req.params.roomId);
  res.json({
    roomId: req.params.roomId, admins: room.admins, password: room.password,
    online: Array.from(room.clients.values()).map(i=>({userName:i.userName,ip:i.ip,isAdmin:room.admins.includes(i.userName)})),
    onlineCount: room.clients.size, messageCount: room.messages.length,
    joinLog: room.joinLog.slice(-100).reverse(),
  });
});

app.post('/api/admin/:roomId/setAdmin', (req, res) => {
  if (!check(req, res)) return;
  const room = getRoom(req.params.roomId);
  if (!room.admins.includes(req.body.newAdmin)) room.admins.push(req.body.newAdmin);
  broadcast(room, { type:'system', text:`👑 ${req.body.newAdmin} → 管理者`, user:'SYSTEM', time:Date.now(), online:room.clients.size, admins:room.admins });
  saveNow();
  res.json({ok:true});
});

app.post('/api/admin/:roomId/removeAdmin', (req, res) => {
  if (!check(req, res)) return;
  const room = getRoom(req.params.roomId);
  if (req.body.target !== SUPER_ADMIN) {
    room.admins = room.admins.filter(a => a !== req.body.target);
    broadcast(room, { type:'system', text:`${req.body.target} の管理者解除`, user:'SYSTEM', time:Date.now(), online:room.clients.size, admins:room.admins });
    saveNow();
  }
  res.json({ok:true});
});

app.post('/api/admin/:roomId/setPassword', (req, res) => {
  if (!check(req, res)) return;
  const room = getRoom(req.params.roomId);
  room.password = req.body.newPassword || null;
  saveNow();
  res.json({ok:true, hasPassword:!!room.password});
});

app.get('/api/room/:roomId/check', (req, res) => {
  const room = rooms.get(req.params.roomId);
  res.json({exists:!!room, hasPassword:!!(room&&room.password)});
});

app.post('/api/room/:roomId/verify', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(404).json({error:'not found'});
  if (!room.password || room.password===req.body.password) return res.json({ok:true});
  res.status(403).json({error:'wrong password'});
});

// ═══ Check-in API ═══
app.get('/api/checkin/:roomId/status', (req, res) => {
  const room = rooms.get(req.params.roomId);
  const user = req.query.user;
  if (!room || !user) return res.json({ canCheckin: false, elapsed: 0 });

  // Find this user's join time
  let joinTime = 0;
  for (const [ws, info] of room.clients) {
    if (info.userName === user) {
      const jt = room._joinTimes.get(ws);
      if (jt && jt > joinTime) joinTime = jt;
    }
  }
  const elapsed = (Date.now() - joinTime) / 1000;
  const need = 600; // 10 minutes
  const canCheckin = elapsed >= need;
  const today = new Date().toISOString().slice(0,10);
  const alreadyChecked = (room.checkins[user] || []).includes(today);
  res.json({ canCheckin: canCheckin && !alreadyChecked, elapsed: Math.floor(elapsed), need, alreadyChecked, total: (room.checkins[user]||[]).length });
});

app.post('/api/checkin/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  const user = req.body.user;
  if (!room || !user) return res.status(400).json({ error: 'bad request' });

  // Verify 10 min
  let joinTime = 0;
  for (const [ws, info] of room.clients) {
    if (info.userName === user) {
      const jt = room._joinTimes.get(ws);
      if (jt && jt > joinTime) joinTime = jt;
    }
  }
  const elapsed = (Date.now() - joinTime) / 1000;
  if (elapsed < 600) return res.status(403).json({ error: 'need 10 min', elapsed: Math.floor(elapsed) });

  const today = new Date().toISOString().slice(0,10);
  if (!room.checkins[user]) room.checkins[user] = [];
  if (room.checkins[user].includes(today)) return res.status(409).json({ error: 'already' });

  room.checkins[user].push(today);
  saveNow();

  broadcast(room, { type:'system', text:`📅 ${user} が签到しました！(${room.checkins[user].length}日目)`, user:'SYSTEM', time:Date.now(), online:room.clients.size });

  res.json({ ok: true, date: today, total: room.checkins[user].length, all: room.checkins[user] });
});

app.get('/api/checkin/:roomId/all', (req, res) => {
  const room = rooms.get(req.params.roomId);
  res.json(room ? room.checkins : {});
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

loadNow();
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('💬 http://localhost:'+PORT+'\n🔧 /admin.html'));
