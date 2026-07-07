const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// Add FEED arrays
h = h.replace(
  "const ROOM_AVATARS={1:'/uploads/4d2c21fa054c5c50.jpg',2:'/uploads/676b78e0db064a0c.jpg',3:'/uploads/6a5520e3429b83bc.jpg'};",
  "const ROOM_AVATARS={1:'/uploads/4d2c21fa054c5c50.jpg',2:'/uploads/676b78e0db064a0c.jpg',3:'/uploads/6a5520e3429b83bc.jpg'};const FEED_ICONS=['📰','📊','💱','🌐','📈','📝','🔔'];const FEED_NAMES=['📰 日経ニュース','📊 マーケット速報','💱 為替市況','🌐 Yahoo Finance','📈 テクニカル','📝 企業ニュース','🔔 重要アラート'];"
);

// Update sidebar: isFeed check + different names for rooms 4-10
h = h.replace(
  "d.innerHTML=`<div class=\"r-avatar\" style=\"background:${ROOM_AVATARS[i]?\"url(\"+ROOM_AVATARS[i]+\") center/cover\":ROOM_COLORS[i-1]}\">${ROOM_AVATARS[i]?\"\":ROOM_ICONS[i-1]}</div><div class=\"r-info\"><div class=\"r-name\">部屋 ${i}</div>",
  "const isFeed=i>3;const aBg=isFeed?ROOM_COLORS[i-1]:(ROOM_AVATARS[i]?\"url(\"+ROOM_AVATARS[i]+\") center/cover\":ROOM_COLORS[i-1]);const aIco=isFeed?FEED_ICONS[i-4]:(ROOM_AVATARS[i]?\"\":ROOM_ICONS[i-1]);d.innerHTML=`<div class=\"r-avatar\" style=\"background:${aBg}\">${aIco}</div><div class=\"r-info\"><div class=\"r-name\">${isFeed?FEED_NAMES[i-4]:'部屋 '+i}</div>"
);

// selectRoom: redirect rooms 4-10
h = h.replace(
  "async function selectRoom(id){\n  if(id===currentRoom&&ws&&ws.readyState===1)return;",
  "async function selectRoom(id){\n  if(id===currentRoom&&ws&&ws.readyState===1)return;\n  if(parseInt(id)>3){openFeed(id);return;}"
);

// Add openFeed + appendFeedItem functions before initSidebar
const feedJS = `
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
  document.getElementById('chatMembers').textContent='ニュースフィード';
  document.getElementById('messages').innerHTML='<div class=\"msg-system\">読込中…</div>';
  document.querySelectorAll('.room-item').forEach(r=>r.classList.remove('active'));
  document.getElementById('room-item-'+id)?.classList.add('active');
  try{
    const r=await fetch('/api/feed/'+id);const data=await r.json();
    document.getElementById('messages').innerHTML='';
    data.items.forEach((item,i)=>{
      const d=new Date(item.pubDate);const ds=d.toLocaleDateString('ja-JP',{month:'long',day:'numeric'});
      if(i===0||ds!==feedDate){addDateDivider(ds);feedDate=ds};
      const wrap=document.createElement('div');wrap.className='msg-wrap you';wrap.style.maxWidth='90%';
      const body=document.createElement('div');body.className='msg-body';
      const bubble=document.createElement('div');bubble.className='msg-bubble';bubble.style.background='#202c33';bubble.style.cursor='pointer';
      bubble.innerHTML='<div style=\"font-weight:700;margin-bottom:4px;color:#e9edef\">'+item.title+'</div><div style=\"font-size:.78em;color:#8696a0;line-height:1.5\">'+item.content+'</div><div style=\"font-size:.68em;color:#06C755;margin-top:6px\">🔗 '+item.source+'</div>';
      bubble.onclick=()=>window.open(item.link);
      body.appendChild(bubble);body.appendChild(document.createElement('div'));wrap.appendChild(body);
      document.getElementById('messages').appendChild(wrap);
    });
    if(!data.items.length)document.getElementById('messages').innerHTML='<div class=\"msg-system\">記事がありません</div>';
  }catch(e){document.getElementById('messages').innerHTML='<div class=\"msg-system\">読込失敗</div>'}
}
`;
h = h.replace('function initSidebar()', feedJS + '\nfunction initSidebar()');

fs.writeFileSync('public/index.html', h);
console.log('Has FEED:', h.includes('FEED_ICONS'));
console.log('Has openFeed:', h.includes('openFeed'));
