const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// ═══ 1. Sidebar footer (profile) CSS ═══
html = html.replace('.room-list{flex:1;overflow-y:auto}',
  '.room-list{flex:1;overflow-y:auto}.sidebar-footer{cursor:pointer;padding:12px 16px;border-top:1px solid var(--border);display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.02)}.my-avatar{width:36px;height:36px;border-radius:50%;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9em;flex-shrink:0;background:var(--green)}.my-info{flex:1;min-width:0}.my-name{font-size:.82em;font-weight:600}.my-type{font-size:.65em;color:var(--text3)}.my-logout{font-size:1.3em;cursor:pointer;color:var(--text3);padding:4px;z-index:1}');

// ═══ 2. Sidebar footer HTML ═══
html = html.replace('</div>\n</div>\n\n<!-- Main -->',
  '<div class="sidebar-footer" onclick="showProfile()"><div class="my-avatar" id="myAvatar">?</div><div class="my-info"><div class="my-name" id="myName">---</div><div class="my-type">Tap for details</div></div><span class="my-logout" onclick="event.stopPropagation();doLogout()">OUT</span></div>\n</div>\n</div>\n\n<!-- Main -->');

// ═══ 3. Login overlay (replace existing dialog html) ═══
html = html.replace(
  '<div class="overlay hidden" id="nameOverlay"><div class="dialog"><h3>名前を入力</h3><input id="nameInput" placeholder="あなたの名前" maxlength="20"><button onclick="setName()">OK</button></div></div>',
  '<div class="overlay hidden" id="nameOverlay"><div class="dialog"><h3>KabuChat</h3><p style="font-size:.75em;color:var(--text2);margin-bottom:16px">How to enter</p><button onclick="lineLogin()" style="width:100%;padding:14px;border-radius:12px;border:none;background:#06C755;color:#fff;font-size:.95em;font-weight:700;cursor:pointer;font-family:var(--font);margin-bottom:6px;box-shadow:0 3px 8px rgba(6,199,85,.3)">LINE Login</button><div style="margin:16px 0;display:flex;align-items:center;gap:10px;color:var(--text3);font-size:.75em"><span style="flex:1;height:1px;background:var(--border)"></span>or<span style="flex:1;height:1px;background:var(--border)"></span></div><input id="guestName" placeholder="Guest name" maxlength="20"><button onclick="setGuest()" style="width:100%;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--bubble-you);color:var(--text2);font-size:.85em;cursor:pointer;font-family:var(--font);margin-top:8px">Enter as Guest</button></div></div>'
);

// ═══ 4. Room avatar click = showRoomInfo ═══
html = html.replace('<div class="avatar" id="chatAvatar">',
  '<div class="avatar" id="chatAvatar" onclick="showRoomInfo()" style="cursor:pointer">');

// ═══ 5. Profile + RoomInfo overlays ═══
const overlays = `<div class="overlay hidden" id="profileOverlay"><div class="dialog" style="text-align:center"><div id="pAvatar" style="width:60px;height:60px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4em;font-weight:700;margin:0 auto 10px">?</div><h3 id="pName">---</h3><p style="font-size:.75em;color:var(--text2);margin-bottom:12px">User</p><div style="text-align:left;font-size:.78em;color:var(--text2);line-height:2.2"><div>Room: <strong id="pRoom">---</strong></div></div><button onclick="doLogout();document.getElementById('profileOverlay').classList.add('hidden')" style="border:1px solid #e74c3c;background:transparent;color:#e74c3c">Logout</button><button onclick="document.getElementById('profileOverlay').classList.add('hidden')" style="background:var(--bubble-you);color:var(--text2);margin-top:6px">Close</button></div></div>
<div class="overlay hidden" id="roomInfoOverlay"><div class="dialog" style="text-align:center"><div id="riAvatar" style="width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8em;margin:0 auto 10px;color:#fff;background:var(--green)">R</div><h3 id="riName">---</h3><p style="font-size:.8em;color:var(--text2);padding:14px;background:rgba(255,255,255,.03);border-radius:10px;line-height:1.6" id="riDesc">Investor community for stocks, forex & crypto analysis. All levels welcome.</p><button onclick="document.getElementById('roomInfoOverlay').classList.add('hidden')" style="background:var(--bubble-you);color:var(--text2);margin-top:6px">Close</button></div></div>`;
html = html.replace('<div class="ctx-menu" id="ctxMenu"></div>', overlays + '\n<div class="ctx-menu" id="ctxMenu"></div>');

// ═══ 6. JS: replace old init logic + add new functions ═══
const oldInit = `if(!userName){document.getElementById('nameOverlay').classList.remove('hidden');document.getElementById('nameInput').focus()}else document.getElementById('nameOverlay').classList.add('hidden');
initSidebar();
document.getElementById('nameInput').addEventListener('keydown',e=>{if(e.key==='Enter')setName()});`;
const newInit = `if(!userName){document.getElementById('nameOverlay').classList.remove('hidden')}else{document.getElementById('nameOverlay').classList.add('hidden');updateProfile()}
initSidebar();
document.getElementById('guestName').addEventListener('keydown',e=>{if(e.key==='Enter')setGuest()});`;
html = html.replace(oldInit, newInit);

// Replace old setName/guestName
html = html.replace("function setName(){const n=document.getElementById('nameInput').value.trim();if(!n)return;userName=n;localStorage.setItem(USER_KEY,n);document.getElementById('nameOverlay').classList.add('hidden');initSidebar()}",
  "function setGuest(){const n=document.getElementById('guestName').value.trim();if(!n)return;userName=n;localStorage.setItem(USER_KEY,n);document.getElementById('nameOverlay').classList.add('hidden');updateProfile();initSidebar()}"
);
html = html.replace("function setName(){const n=document.getElementById('nameInput').value.trim();if(!n)return;userName=n;localStorage.setItem('line_name',n);document.getElementById('nameOverlay').classList.add('hidden');initSidebar()}",
  "function setGuest(){const n=document.getElementById('guestName').value.trim();if(!n)return;userName=n;localStorage.setItem('line_name',n);document.getElementById('nameOverlay').classList.add('hidden');updateProfile();initSidebar()}"
);

// Add LINE login + profile + roomInfo + avatarColor functions
const newFuncs = `
function avatarColor(n){let h=0;for(let i=0;i<n.length;i++)h=((h<<5)-h)+n.charCodeAt(i);return ['#e74c3c','#e67e22','#f1c40f','#2ecc71','#1abc9c','#3498db','#9b59b6','#e91e63','#00bcd4','#ff5722'][Math.abs(h)%10]}
function updateProfile(){document.getElementById('myAvatar').textContent=(userName||'?').charAt(0).toUpperCase();document.getElementById('myAvatar').style.background=avatarColor(userName||'?');document.getElementById('myName').textContent=userName||'---'}
function showProfile(){document.getElementById('pAvatar').textContent=(userName||'?').charAt(0).toUpperCase();document.getElementById('pAvatar').style.background=avatarColor(userName||'?');document.getElementById('pName').textContent=userName||'---';document.getElementById('pRoom').textContent=currentRoom||'none';document.getElementById('profileOverlay').classList.remove('hidden')}
function showRoomInfo(){if(!currentRoom)return;const i=parseInt(currentRoom);const a=document.getElementById('riAvatar');a.style.background=ROOM_COLORS[(i-1+10)%10];a.textContent=ROOM_ICONS[(i-1+10)%10];if(i<=3&&ROOM_AVATARS[i]){a.style.background='url('+ROOM_AVATARS[i]+') center/cover';a.textContent=''}document.getElementById('riName').textContent=i<=3?'Room '+i:FEED_NAMES[i-4];document.getElementById('riDesc').textContent='Global investor community for stocks, forex & crypto analysis. All levels welcome.';document.getElementById('roomInfoOverlay').classList.remove('hidden')}
function lineLogin(){location.href='/api/line-login'}
function doLogout(){localStorage.removeItem('line_name');userName='';document.getElementById('nameOverlay').classList.remove('hidden');document.getElementById('myName').textContent='---';if(ws){ws.close();ws=null}currentRoom='';document.getElementById('emptyState').style.display='flex';document.getElementById('chatHeader').style.display='none';document.getElementById('messages').style.display='none';document.getElementById('inputBar').style.display='none'}
const up=new URLSearchParams(location.search);if(up.get('token')){userName=up.get('name')||'';localStorage.setItem('line_name',userName);history.replaceState(null,'','/');updateProfile()}
if(userName)updateProfile();
`;
html = html.replace('function initSidebar()', newFuncs + '\nfunction initSidebar()');

fs.writeFileSync('public/index.html', html);
console.log('Done. Has profile:', html.includes('showProfile'), 'Has roomInfo:', html.includes('showRoomInfo'), 'Has LINE:', html.includes('lineLogin'));
