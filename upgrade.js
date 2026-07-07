// Apply all features to the working server version
const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// ═══ 1. ROOM_AVATARS for rooms 1-3 ═══
// Find ROOM_COLORS declaration and add ROOM_AVATARS after it
html = html.replace(
  "const ROOM_COLORS=['#06C755','#3498db','#e74c3c','#9b59b6','#f39c12','#1abc9c','#e91e63','#00bcd4','#ff5722','#607d8b'];",
  "const ROOM_COLORS=['#06C755','#3498db','#e74c3c','#9b59b6','#f39c12','#1abc9c','#e91e63','#00bcd4','#ff5722','#607d8b'];\nconst ROOM_AVATARS={1:'/uploads/4d2c21fa054c5c50.jpg',2:'/uploads/676b78e0db064a0c.jpg',3:'/uploads/6a5520e3429b83bc.jpg'};\nconst FEED_ICONS=['📰','📊','💱','🌐','📈','📝','🔔'];\nconst FEED_NAMES=['📰 日経ニュース','📊 マーケット速報','💱 為替市況','🌐 Yahoo Finance','📈 テクニカル','📝 企業ニュース','🔔 重要アラート'];"
);

// ═══ 2. Change sidebar: rooms 1-3 chat, 4-10 feed ═══
// Replace avatar display in initSidebar
html = html.replace(
  "d.innerHTML='<div class=\"r-avatar\" style=\"background:'+ROOM_COLORS[i-1]+'\">'+ROOM_ICONS[i-1]+'</div>",
  "const isFeed=i>3;const avaBg=ROOM_AVATARS[i]?\"background:url(\"+ROOM_AVATARS[i]+\") center/cover\":\"background:\"+ROOM_COLORS[i-1];const icon=ROOM_AVATARS[i]?\"\":(isFeed?FEED_ICONS[i-4]:ROOM_ICONS[i-1]);d.innerHTML='<div class=\"r-avatar\" style=\"'+avaBg+'\">'+icon+'</div>'"
);

// Replace room name display
html = html.replace(
  "<span class=\"r-name\">部屋 '+i+'</span>",
  "<span class=\"r-name\">'+(i>3?FEED_NAMES[i-4]:'部屋 '+i)+'</span>"
);

// ═══ 3. selectRoom: redirect rooms 4-10 to openFeed ═══
html = html.replace(
  "async function selectRoom(id){\n  if(id===currentRoom&&ws&&ws.readyState===1)return;",
  "async function selectRoom(id){\n  if(id===currentRoom&&ws&&ws.readyState===1)return;\n  if(parseInt(id)>3){openFeed(id);return;}"
);

// ═══ 4. Update connectChat to show room avatars ═══
html = html.replace(
  "document.getElementById('chatAvatar').style.background=ROOM_COLORS[parseInt(id)-1];\n  document.getElementById('chatAvatar').textContent=ROOM_ICONS[parseInt(id)-1];",
  "if(ROOM_AVATARS[id]){document.getElementById('chatAvatar').style.background='url('+ROOM_AVATARS[id]+') center/cover';document.getElementById('chatAvatar').textContent='';}\n  else{document.getElementById('chatAvatar').style.background=ROOM_COLORS[parseInt(id)-1];document.getElementById('chatAvatar').textContent=ROOM_ICONS[parseInt(id)-1];}"
);

// ═══ 5. Add openFeed + appendFeedItem functions ═══
const feedJS = `
// Feed rooms
let feedDate='';
async function openFeed(id){
  if(ws){ws.onclose=null;ws.close();ws=null}currentRoom=id;feedDate='';
  document.getElementById('emptyState').style.display='none';
  document.getElementById('chatHeader').style.display='flex';
  document.getElementById('messages').style.display='flex';
  document.getElementById('inputBar').style.display='none';
  document.getElementById('chatAvatar').style.background=ROOM_COLORS[4];
  document.getElementById('chatAvatar').textContent=FEED_ICONS[parseInt(id)-4];
  document.getElementById('chatName').textContent=FEED_NAMES[parseInt(id)-4];
  document.getElementById('chatMembers').textContent='ニュース';
  document.getElementById('messages').innerHTML='<div class=\"msg-system\">読込中…</div>';
  document.querySelectorAll('.room-item').forEach(r=>r.classList.remove('active'));
  document.getElementById('room-item-'+id)?.classList.add('active');
  try{
    const r=await fetch('/api/feed/'+id);const data=await r.json();
    document.getElementById('messages').innerHTML='';
    data.items.forEach((item,i)=>{
      const d=new Date(item.pubDate);const ds=d.toLocaleDateString('ja-JP',{month:'long',day:'numeric'});
      if(i===0||ds!==feedDate){addDateDivider(ds);feedDate=ds}
      appendFeedItem(item);
    });
    if(!data.items.length)document.getElementById('messages').innerHTML='<div class=\"msg-system\">記事がありません</div>';
  }catch(e){document.getElementById('messages').innerHTML='<div class=\"msg-system\">読込失敗</div>'}
}
function appendFeedItem(item){
  const area=document.getElementById('messages');
  const wrap=document.createElement('div');wrap.className='msg-wrap you';wrap.style.maxWidth='90%';
  const body=document.createElement('div');body.className='msg-body';
  const bubble=document.createElement('div');bubble.className='msg-bubble';bubble.style.background='#202c33';bubble.style.cursor='pointer';
  bubble.innerHTML='<div style=\"font-weight:700;margin-bottom:4px;color:#e9edef\">'+item.title+'</div><div style=\"font-size:.78em;color:#8696a0;line-height:1.5\">'+item.content+'</div><div style=\"font-size:.68em;color:#06C755;margin-top:6px\">🔗 '+item.source+'</div>';
  bubble.onclick=()=>window.open(item.link);
  const meta=document.createElement('div');meta.className='msg-meta';
  meta.textContent=new Date(item.pubDate).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
  body.appendChild(bubble);body.appendChild(meta);wrap.appendChild(body);area.appendChild(wrap);
}
`;
html = html.replace('</script>', feedJS + '\n</script>');

fs.writeFileSync('public/index.html', html);
console.log('Upgraded: ROOM_AVATARS=' + html.includes('ROOM_AVATARS') + ' openFeed=' + html.includes('openFeed'));
