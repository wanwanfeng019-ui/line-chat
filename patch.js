const fs = require('fs');
let html = fs.readFileSync('public/index.html', 'utf8');

// Build updated initSidebar
const old1 = "function initSidebar(){const l=document.getElementById(\"roomList\");l.innerHTML=\"\";for(let i=1;i<=10;i++){";
const new1 = "function initSidebar(){const l=document.getElementById(\"roomList\");l.innerHTML=\"\";for(let i=1;i<=10;i++){const isFeed=i>3;";
html = html.replace(old1, new1);

// Room names - chat for 1-3, feed names for 4-10
const feedAvatars = ['📰','📊','💱','🌐','📈','📝','🔔'];
const feedNames = ['📰 日経ニュース','📊 マーケット速報','💱 為替市況','🌐 Yahoo Finance','📈 テクニカル','📝 企業ニュース','🔔 重要アラート'];

// Replace avatar
const oldAva = "d.innerHTML=`<div class=\"r-avatar\" style=\"${ava}\">${ROOM_AVATARS[i]?\"\":ROOM_ICONS[i-1]}</div>";
const newAva = "d.innerHTML=`<div class=\"r-avatar\" style=\"${ava}\">${ROOM_AVATARS[i]?\"\":(isFeed?['📰','📊','💱','🌐','📈','📝','🔔'][i-4]:ROOM_ICONS[i-1])}</div>";
html = html.replace(oldAva, newAva);

// Replace name
const oldName = `<span class=\"r-name\">部屋 \${i}</span>`;
const newName = `<span class=\"r-name\">\${isFeed?['📰 日経ニュース','📊 マーケット速報','💱 為替市況','🌐 Yahoo Finance','📈 テクニカル','📝 企業ニュース','🔔 重要アラート'][i-4]:\"部屋 \"+i}</span>`;
html = html.replace(oldName, newName);

// Add feed handler to selectRoom
const oldSelect = `async function selectRoom(id){
  if(id===currentRoom&&ws&&ws.readyState===1)return;
  document.querySelectorAll('.room-item').forEach(r=>r.classList.remove('active'));`;
const newSelect = `async function selectRoom(id){
  if(id===currentRoom&&ws&&ws.readyState===1)return;
  if(parseInt(id)>3){openFeed(id);return;}
  document.querySelectorAll('.room-item').forEach(r=>r.classList.remove('active'));`;
html = html.replace(oldSelect, newSelect);

// Add feed functions before closing script
const feedJS = `
// ═══ Feed Rooms ═══
let feedDate='';
async function openFeed(id){
  if(ws){ws.onclose=null;ws.close();ws=null}currentRoom=id;feedDate='';
  document.getElementById('emptyState').style.display='none';
  document.getElementById('chatHeader').style.display='flex';
  document.getElementById('messages').style.display='flex';
  document.getElementById('inputBar').style.display='none';
  document.getElementById('chatAvatar').style.background=ROOM_COLORS[parseInt(id)-1];
  document.getElementById('chatAvatar').textContent=feedAvatars[parseInt(id)-4]||'📰';
  document.getElementById('chatName').textContent=feedNames[parseInt(id)-4]||'---';
  document.getElementById('chatMembers').textContent='ニュースフィード';
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
  const area=document.getElementById('messages');const wrap=document.createElement('div');
  wrap.className='msg-wrap you';wrap.style.maxWidth='90%';
  const body=document.createElement('div');body.className='msg-body';
  const bubble=document.createElement('div');bubble.className='msg-bubble';bubble.style.background='#fff';bubble.style.cursor='pointer';
  bubble.innerHTML='<div style=\"font-weight:700;margin-bottom:4px\">'+item.title+'</div><div style=\"font-size:.78em;color:#666;line-height:1.5\">'+item.content+'</div><div style=\"font-size:.68em;color:#06C755;margin-top:6px\">🔗 '+item.source+'</div>';
  bubble.onclick=()=>window.open(item.link);
  const meta=document.createElement('div');meta.className='msg-meta';
  meta.textContent=new Date(item.pubDate).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'});
  body.appendChild(bubble);body.appendChild(meta);wrap.appendChild(body);area.appendChild(wrap);
}
`;
html = html.replace('</script>', feedJS + '\n</script>');
fs.writeFileSync('public/index.html', html);
console.log('Patched');
