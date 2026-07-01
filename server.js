const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://neondb_owner:npg_gGWrE4tQp1oX@ep-little-flower-ata9rfhv-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const app = express();
app.use(express.static('public'));
app.use(express.json());
const server = http.createServer(app);

const SUPER_ADMIN = 'jinzhengen';

// ═══ Database init ═══
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS room_config (
      room_id TEXT PRIMARY KEY, admins TEXT[] DEFAULT '{}', password TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY, room_id TEXT, msg_id TEXT, type TEXT DEFAULT 'chat',
      username TEXT, text TEXT, time BIGINT, deleted BOOLEAN DEFAULT false,
      delete_by TEXT, read_by TEXT[] DEFAULT '{}', reply_to TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_msg_room ON messages(room_id, time DESC);
    CREATE TABLE IF NOT EXISTS checkins (
      room_id TEXT, username TEXT, date TEXT,
      PRIMARY KEY(room_id, username, date)
    );
    CREATE TABLE IF NOT EXISTS join_logs (
      id SERIAL PRIMARY KEY, room_id TEXT, username TEXT, ip TEXT,
      action TEXT, time BIGINT
    );
  `);
  console.log('📦 PostgreSQL ready');
}
initDB().catch(e => console.error('DB init error:', e.message));

// ═══ Helpers ═══
async function ensureRoom(id) {
  await pool.query('INSERT INTO room_config (room_id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
}

async function getRoomAdmins(id) {
  const r = await pool.query('SELECT admins, password FROM room_config WHERE room_id=$1', [id]);
  const row = r.rows[0] || { admins: [], password: null };
  return row;
}

// ═══ In-memory clients ═══
const rooms = new Map(); // roomId → Map<ws, {userName, ip}>

function getClients(id) {
  if (!rooms.has(id)) rooms.set(id, { clients: new Map(), joinTimes: new Map() });
  return rooms.get(id);
}

// ═══ WebSocket ═══
const wss = new WebSocketServer({ server });

function getIP(req) {
  const x = req.headers['x-forwarded-for'];
  return x ? x.split(',')[0].trim() : req.socket.remoteAddress || '?';
}

wss.on('connection', async (ws, req) => {
  const q = new URLSearchParams(req.url.split('?')[1] || '');
  const roomId = q.get('room') || '1';
  const userName = q.get('user') || 'guest';
  const ip = getIP(req);

  await ensureRoom(roomId);
  let cfg = await getRoomAdmins(roomId);
  let admins = cfg.admins || [];

  // jinzhengen always admin
  if (!admins.includes(SUPER_ADMIN)) {
    admins.push(SUPER_ADMIN);
    await pool.query('UPDATE room_config SET admins=$1 WHERE room_id=$2', [admins, roomId]);
  }

  const room = getClients(roomId);
  room.clients.set(ws, { userName, ip });
  room.joinTimes.set(ws, Date.now());
  ws._roomId = roomId; ws._userName = userName; ws._ip = ip;
  const isAdmin = admins.includes(userName);

  // Insert join log
  await pool.query('INSERT INTO join_logs (room_id, username, ip, action, time) VALUES ($1,$2,$3,$4,$5)', [roomId, userName, ip, 'join', Date.now()]);

  broadcast(roomId, { type: 'system', text: `${userName} joined` + (isAdmin ? ' 👑' : ''), user: 'SYSTEM', time: Date.now(), online: room.clients.size });

  // Send history
  try {
    const msgs = await pool.query('SELECT * FROM messages WHERE room_id=$1 ORDER BY time DESC LIMIT 200', [roomId]);
    ws.send(JSON.stringify({
      type: 'history',
      messages: msgs.rows.reverse().map(r => ({
        type: r.type, id: r.msg_id, user: r.username, text: r.text, time: Number(r.time),
        deleted: r.deleted, deleteBy: r.delete_by, readBy: r.read_by, replyTo: r.reply_to,
      })),
      online: room.clients.size, roomId, admins, isAdmin,
      hasPassword: !!cfg.password,
    }));
  } catch(e) { ws.send(JSON.stringify({ type:'history', messages:[], online:0, roomId, admins, isAdmin })); }

  // Read receipts
  try {
    await pool.query("UPDATE messages SET read_by = array_append(read_by, $1) WHERE room_id=$2 AND NOT ($1 = ANY(read_by))", [userName, roomId]);
    broadcast(roomId, { type: 'readUpdate', user: userName, online: room.clients.size });
  } catch(e) {}

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw);

      if (msg.type === 'chat' && msg.text?.trim()) {
        const msgId = crypto.randomBytes(6).toString('hex');
        const now = Date.now();
        await pool.query(
          'INSERT INTO messages (room_id, msg_id, username, text, time, read_by, reply_to) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [roomId, msgId, userName, msg.text.trim().slice(0, 2000), now, [userName], msg.replyTo || null]
        );
        const cm = { type:'chat', id: msgId, user: userName, text: msg.text.trim().slice(0,2000), time: now, readBy: [userName], replyTo: msg.replyTo || null };
        broadcast(roomId, cm);
      }

      if (msg.type === 'delete') {
        await pool.query("UPDATE messages SET deleted=true, delete_by=$1 WHERE msg_id=$2 AND room_id=$3 AND (username=$1 OR $4=ANY((SELECT admins FROM room_config WHERE room_id=$3)))",
          [userName, msg.msgId, roomId, userName]);
        broadcast(roomId, { type:'msgDeleted', msgId: msg.msgId, deleteBy: userName });
      }

      if (msg.type === 'setAdmin' && admins.includes(userName)) {
        if (!admins.includes(msg.newAdmin)) {
          admins.push(msg.newAdmin);
          await pool.query('UPDATE room_config SET admins=$1 WHERE room_id=$2', [admins, roomId]);
          await pool.query('INSERT INTO join_logs (room_id, username, ip, action, time) VALUES ($1,$2,$3,$4,$5)', [roomId, userName, ip, 'addAdmin:'+msg.newAdmin, Date.now()]);
          broadcast(roomId, { type:'system', text:`👑 ${msg.newAdmin} が管理者に`, user:'SYSTEM', time: Date.now(), online: room.clients.size, admins });
        }
      }

      if (msg.type === 'removeAdmin' && admins.includes(userName)) {
        if (msg.target !== SUPER_ADMIN) {
          admins = admins.filter(a => a !== msg.target);
          await pool.query('UPDATE room_config SET admins=$1 WHERE room_id=$2', [admins, roomId]);
          broadcast(roomId, { type:'system', text:`${msg.target} 管理者解除`, user:'SYSTEM', time: Date.now(), online: room.clients.size, admins });
        }
      }

      if (msg.type === 'read') {
        await pool.query("UPDATE messages SET read_by = array_append(read_by, $1) WHERE room_id=$2 AND NOT ($1 = ANY(read_by))", [userName, roomId]);
        broadcast(roomId, { type: 'readUpdate', user: userName, online: room.clients.size });
      }
    } catch(e) {}
  });

  ws.on('close', async () => {
    room.clients.delete(ws); room.joinTimes.delete(ws);
    await pool.query('INSERT INTO join_logs (room_id, username, ip, action, time) VALUES ($1,$2,$3,$4,$5)', [roomId, userName, ip, 'leave', Date.now()]);
    broadcast(roomId, { type:'system', text:`${userName} left`, user:'SYSTEM', time: Date.now(), online: room.clients.size });
  });
});

function broadcast(roomId, msg) {
  const d = JSON.stringify(msg);
  const room = rooms.get(roomId);
  if (room) room.clients.forEach((_, c) => { if (c.readyState === 1) c.send(d); });
}

// ═══ Admin API ═══
const ADMIN = { user: 'jinzhengen', pass: 'aabbcc123' };
function check(req, res) {
  const u = req.query.user || (req.body||{}).user || '';
  const p = req.query.pwd || (req.body||{}).pwd || '';
  if (u !== ADMIN.user || p !== ADMIN.pass) { res.status(401).json({e:'bad auth'}); return false; }
  return true;
}

app.get('/api/admin/rooms', async (req, res) => {
  if (!check(req, res)) return;
  const list = [];
  for (let i = 1; i <= 10; i++) {
    const id = String(i);
    const room = rooms.get(id);
    const online = room ? Array.from(room.clients.values()).map(v => ({userName:v.userName,ip:v.ip})) : [];
    try {
      const cfg = await getRoomAdmins(id);
      const mc = await pool.query('SELECT COUNT(*) as c FROM messages WHERE room_id=$1', [id]);
      const jc = await pool.query('SELECT COUNT(*) as c FROM join_logs WHERE room_id=$1', [id]);
      list.push({ roomId: id, admins: cfg.admins||[], password: cfg.password, online, onlineCount: online.length, messageCount: parseInt(mc.rows[0].c), joinLogCount: parseInt(jc.rows[0].c) });
    } catch(e) {
      list.push({ roomId: id, admins:[], password:null, online:[], onlineCount:0, messageCount:0, joinLogCount:0 });
    }
  }
  res.json(list);
});

app.get('/api/admin/:roomId', async (req, res) => {
  if (!check(req, res)) return;
  const room = rooms.get(req.params.roomId);
  const cfg = await getRoomAdmins(req.params.roomId);
  const online = room ? Array.from(room.clients.values()).map(v => ({userName:v.userName,ip:v.ip,isAdmin:(cfg.admins||[]).includes(v.userName)})) : [];
  const msgs = await pool.query('SELECT COUNT(*) as c FROM messages WHERE room_id=$1', [req.params.roomId]);
  const logs = await pool.query('SELECT * FROM join_logs WHERE room_id=$1 ORDER BY time DESC LIMIT 100', [req.params.roomId]);
  res.json({
    roomId: req.params.roomId, admins: cfg.admins||[], password: cfg.password,
    online, onlineCount: online.length, messageCount: parseInt(msgs.rows[0].c),
    joinLog: logs.rows.map(r => ({userName:r.username, ip:r.ip, action:r.action, time:Number(r.time)})),
  });
});

app.post('/api/admin/:roomId/setAdmin', async (req, res) => {
  if (!check(req, res)) return;
  const cfg = await getRoomAdmins(req.params.roomId);
  const admins = cfg.admins || [];
  if (!admins.includes(req.body.newAdmin)) {
    admins.push(req.body.newAdmin);
    await pool.query('UPDATE room_config SET admins=$1 WHERE room_id=$2', [admins, req.params.roomId]);
  }
  broadcast(req.params.roomId, { type:'system', text:`👑 ${req.body.newAdmin} → 管理者`, user:'SYSTEM', time:Date.now(), online:0, admins });
  res.json({ok:true});
});

app.post('/api/admin/:roomId/removeAdmin', async (req, res) => {
  if (!check(req, res)) return;
  if (req.body.target === SUPER_ADMIN) return res.json({ok:false});
  const cfg = await getRoomAdmins(req.params.roomId);
  const admins = (cfg.admins||[]).filter(a => a !== req.body.target);
  await pool.query('UPDATE room_config SET admins=$1 WHERE room_id=$2', [admins, req.params.roomId]);
  broadcast(req.params.roomId, { type:'system', text:`${req.body.target} 管理者解除`, user:'SYSTEM', time:Date.now(), online:0, admins });
  res.json({ok:true});
});

app.post('/api/admin/:roomId/setPassword', async (req, res) => {
  if (!check(req, res)) return;
  await pool.query('UPDATE room_config SET password=$1 WHERE room_id=$2', [req.body.newPassword||null, req.params.roomId]);
  res.json({ok:true});
});

// ═══ Room APIs ═══
app.get('/api/room/:roomId/check', async (req, res) => {
  const cfg = await getRoomAdmins(req.params.roomId);
  res.json({exists:!!cfg, hasPassword:!!cfg.password});
});

app.post('/api/room/:roomId/verify', async (req, res) => {
  const cfg = await getRoomAdmins(req.params.roomId);
  if (!cfg.password || cfg.password === req.body.password) return res.json({ok:true});
  res.status(403).json({error:'wrong password'});
});

// ═══ Check-in ═══
app.get('/api/checkin/:roomId/status', async (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room || !req.query.user) return res.json({ canCheckin:false, elapsed:0 });
  let joinTime = 0;
  room.joinTimes.forEach((jt, ws) => { if (room.clients.get(ws)?.userName === req.query.user && jt > joinTime) joinTime = jt; });
  const elapsed = Math.floor((Date.now() - joinTime) / 1000);
  const need = 600;
  const today = new Date().toISOString().slice(0,10);
  const r = await pool.query('SELECT 1 FROM checkins WHERE room_id=$1 AND username=$2 AND date=$3', [req.params.roomId, req.query.user, today]);
  const already = r.rows.length > 0;
  const tc = await pool.query('SELECT COUNT(*) as c FROM checkins WHERE room_id=$1 AND username=$2', [req.params.roomId, req.query.user]);
  res.json({ canCheckin: elapsed>=need && !already, elapsed, need, alreadyChecked:already, total:parseInt(tc.rows[0].c) });
});

app.post('/api/checkin/:roomId', async (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) return res.status(400).json({e:'no room'});
  let joinTime = 0;
  room.joinTimes.forEach((jt, ws) => { if (room.clients.get(ws)?.userName === req.body.user && jt > joinTime) joinTime = jt; });
  if ((Date.now()-joinTime)/1000 < 600) return res.status(403).json({e:'need 10 min'});
  const today = new Date().toISOString().slice(0,10);
  try {
    await pool.query('INSERT INTO checkins (room_id, username, date) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.roomId, req.body.user, today]);
    const all = await pool.query('SELECT date FROM checkins WHERE room_id=$1 AND username=$2 ORDER BY date', [req.params.roomId, req.body.user]);
    const dates = all.rows.map(r=>r.date);
    broadcast(req.params.roomId, { type:'system', text:`📅 ${req.body.user} 签到！(${dates.length}日目)`, user:'SYSTEM', time:Date.now(), online:room.clients.size });
    res.json({ok:true, today, total:dates.length, all:dates});
  } catch(e) { res.status(409).json({e:'already'}); }
});

app.get('/api/checkin/:roomId/all', async (req, res) => {
  const all = await pool.query('SELECT username, date FROM checkins WHERE room_id=$1 ORDER BY date', [req.params.roomId]);
  const result = {};
  all.rows.forEach(r => { if (!result[r.username]) result[r.username] = []; result[r.username].push(r.date); });
  res.json(result);
});

app.get('/', (req, res) => res.sendFile(__dirname + '/public/index.html'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('💬 http://localhost:'+PORT));
