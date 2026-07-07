const fs = require('fs');
let h = fs.readFileSync('public/index.html', 'utf8');

// Add ROOM_AVATARS
h = h.replace(
  "const USER_KEY='line_name', ROOM_ICONS=['💬','🏠','💼','🎮','🎵','📚','🍔','✈️','⚽','🌟'];",
  "const USER_KEY='line_name', ROOM_ICONS=['💬','🏠','💼','🎮','🎵','📚','🍔','✈️','⚽','🌟'];const ROOM_AVATARS={1:'/uploads/4d2c21fa054c5c50.jpg',2:'/uploads/676b78e0db064a0c.jpg',3:'/uploads/6a5520e3429b83bc.jpg'};"
);

// Update sidebar avatar
h = h.replace(
  'd.innerHTML=`<div class="r-avatar" style="background:${ROOM_COLORS[i-1]}">${ROOM_ICONS[i-1]}</div>',
  'd.innerHTML=`<div class="r-avatar" style="background:${ROOM_AVATARS[i]?"url("+ROOM_AVATARS[i]+") center/cover":ROOM_COLORS[i-1]}">${ROOM_AVATARS[i]?"":ROOM_ICONS[i-1]}</div>'
);

// Update chat header avatar
h = h.replace(
  "document.getElementById('chatAvatar').style.background=ROOM_COLORS[parseInt(id)-1];document.getElementById('chatAvatar').textContent=ROOM_ICONS[parseInt(id)-1];",
  "if(ROOM_AVATARS[id]){document.getElementById('chatAvatar').style.background='url('+ROOM_AVATARS[id]+') center/cover';document.getElementById('chatAvatar').textContent=''}else{document.getElementById('chatAvatar').style.background=ROOM_COLORS[parseInt(id)-1];document.getElementById('chatAvatar').textContent=ROOM_ICONS[parseInt(id)-1]}"
);

fs.writeFileSync('public/index.html', h);
console.log('Has ROOM_AVATARS:', h.includes('ROOM_AVATARS'));
