// Build complete index.html with all features
const fs = require('fs');

// Read current file for the CSS (which is correct from git)
const old = fs.readFileSync('public/index.html', 'utf8');
const cssMatch = old.match(/<style>([\s\S]*?)<\/style>/);
const css = cssMatch ? cssMatch[1] : '';

// Now read the JS from a known-good structure
// We will rebuild by keeping the CSS and completely rewriting the JS

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover">
<title>KabuChat</title>
<style>
${css}
</style>
</head>
<body>

<!-- Sidebar -->
<div class="sidebar" id="sidebar">
  <div class="sidebar-header"><h2>💬 チャット</h2></div>
  <div class="room-list" id="roomList"></div>
  <div class="sidebar-footer" onclick="showProfile()">
    <div class="my-avatar" id="myAvatar">?</div>
    <div class="my-info"><div class="my-name" id="myName">---</div><div class="my-type">タップで詳細</div></div>
    <span class="my-logout" onclick="event.stopPropagation();doLogout()">↪</span>
  </div>
</div>

<div class="main" id="mainChat">
  <div class="empty-state" id="emptyState"><div style="font-size:3em">💬</div><div>← ルームを選択</div></div>
  <div class="chat-header" id="chatHeader" style="display:none">
    <div class="avatar" id="chatAvatar" onclick="showRoomInfo()"></div>
    <div class="info"><div class="name" id="chatName">---</div><div class="members" id="chatMembers">---</div></div>
    <span class="hdr-icon" id="checkinBtn" onclick="toggleCalendar()" title="签到">📅</span>
  </div>
  <div class="messages" id="messages" style="display:none"></div>
  <button class="scroll-btn" id="scrollBtn" onclick="scrollToBottom()">↓</button>
  <div class="reply-bar" id="replyBar"><span style="color:var(--green)">↩</span><span class="r-text" id="replyText"></span><span class="r-close" onclick="cancelReply()">✕</span></div>
  <div class="input-bar" id="inputBar" style="display:none">
    <button class="icon-btn" onclick="toggleEmoji(event)">😊</button>
    <button class="icon-btn" onclick="document.getElementById('imgInput').click()">＋</button>
    <input type="file" id="imgInput" accept="image/*" style="display:none" onchange="sendImage(this)">
    <input id="msgInput" placeholder="メッセージ" maxlength="2000" disabled>
    <button class="send-btn" onclick="send()">➤</button>
    <div class="mention-drop" id="mentionDrop"></div>
    <div class="emoji-picker" id="emojiPicker"><input id="emojiSearch" placeholder="絵文字を検索..." oninput="filterEmoji()"><div class="emoji-grid" id="emojiGrid"></div></div>
  </div>
</div>

<div class="lightbox" id="lightbox" onclick="closeLightbox()"><span class="close-lb">✕</span><img id="lightboxImg" onclick="event.stopPropagation()"></div>

<div class="overlay hidden" id="nameOverlay"><div class="dialog">
  <h3>💬 KabuChat</h3><p>入室方法を選択</p>
  <button onclick="lineLogin()" class="line-login-btn">🟢 LINEでログイン</button>
  <div style="margin:18px 0;display:flex;align-items:center;gap:10px;color:#aaa;font-size:.75em"><span style="flex:1;height:1px;background:#eee"></span>または<span style="flex:1;height:1px;background:#eee"></span></div>
  <input id="guestName" placeholder="ゲスト名を入力" maxlength="20">
  <button onclick="setGuest()" style="background:#f5f5f5;color:#666;border:1px solid #ddd">ゲストとして入室</button>
</div></div>

<div class="overlay hidden" id="pwdOverlay"><div class="dialog"><h3>🔒 パスワード</h3><p id="pwdDesc"></p><input type="password" id="pwdInput" placeholder="パスワード"><div class="err" id="pwdErr"></div><button onclick="checkPwd()">入室</button></div></div>

<div class="overlay hidden" id="calOverlay"><div class="dialog" style="max-width:360px">
  <h3>📅 签到カレンダー</h3>
  <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0"><button onclick="calMonth(-1)" style="background:none;border:none;font-size:1.1em;cursor:pointer;color:#333">◀</button><span id="calTitle" style="font-weight:600"></span><button onclick="calMonth(1)" style="background:none;border:none;font-size:1.1em;cursor:pointer;color:#333">▶</button></div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center"><div style="font-size:.65em;color:#aaa">日</div><div style="font-size:.65em;color:#aaa">月</div><div style="font-size:.65em;color:#aaa">火</div><div style="font-size:.65em;color:#aaa">水</div><div style="font-size:.65em;color:#aaa">木</div><div style="font-size:.65em;color:#aaa">金</div><div style="font-size:.65em;color:#aaa">土</div></div>
  <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center" id="calGrid"></div>
  <div style="margin-top:10px;font-size:.8em;color:#888">連続: <strong id="calStreak" style="color:var(--green)">0日</strong> · 累計: <strong id="calTotal" style="color:#f39c12">0日</strong></div>
  <div id="calTimer" style="font-size:.72em;color:#aaa;margin-top:4px"></div>
  <button id="calCheckBtn" onclick="doCheckin()" disabled>⏳ あと10分</button>
  <button onclick="document.getElementById('calOverlay').classList.add('hidden')" style="background:#eee;color:#666;margin-top:6px">閉じる</button>
</div></div>

<div class="overlay hidden" id="profileOverlay"><div class="dialog" style="text-align:center">
  <div id="profileAvatar2" style="width:60px;height:60px;border-radius:50%;background:var(--green);color:#fff;display:flex;align-items:center;justify-content:center;font-size:1.4em;font-weight:700;margin:0 auto 10px">?</div>
  <h3 id="profileName2">---</h3>
  <p style="font-size:.75em;color:#888;margin-bottom:12px">ユーザー</p>
  <div style="text-align:left;font-size:.78em;color:#666;line-height:2.2">
    <div>🏠 部屋: <strong id="profileRoom">---</strong></div>
    <div>📅 签到: <strong id="profileCheckins">0日</strong></div>
  </div>
  <button onclick="doLogout();document.getElementById('profileOverlay').classList.add('hidden')" style="border:1px solid #e74c3c;background:#fff;color:#e74c3c">ログアウト</button>
  <button onclick="document.getElementById('profileOverlay').classList.add('hidden')" style="background:#eee;color:#666;margin-top:6px">閉じる</button>
</div></div>

<div class="overlay hidden" id="roomInfoOverlay"><div class="dialog" style="text-align:center">
  <div id="roomInfoAvatar" style="width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.8em;margin:0 auto 10px;color:#fff;background:#06C755"></div>
  <h3 id="roomInfoName">---</h3>
  <p style="font-size:.8em;color:#555;padding:14px;background:#f8f8f8;border-radius:10px;line-height:1.6" id="roomInfoDesc">国内外知名投資情報交流コミュニティ。株式・為替・暗号資産など幅広い金融情報を共有。</p>
  <button onclick="document.getElementById('roomInfoOverlay').classList.add('hidden')" style="background:#eee;color:#666">閉じる</button>
</div></div>

<div class="ctx-menu" id="ctxMenu"></div>
<div class="toast" id="toast"></div>

<script>
const USER_KEY='line_name', ROOM_ICONS=['💬','🏠','💼','🎮','🎵','📚','🍔','✈️','⚽','🌟'];
const ROOM_COLORS=['#06C755','#3498db','#e74c3c','#9b59b6','#f39c12','#1abc9c','#e91e63','#00bcd4','#ff5722','#607d8b'];
const ROOM_AVATARS={1:'/uploads/4d2c21fa054c5c50.jpg',2:'/uploads/676b78e0db064a0c.jpg',3:'/uploads/6a5520e3429b83bc.jpg'};
const FEED_ICONS=['📰','📊','💱','🌐','📈','📝','🔔'];
const FEED_NAMES=['📰 日経ニュース','📊 マーケット速報','💱 為替市況','🌐 Yahoo Finance','📈 テクニカル','📝 企業ニュース','🔔 重要アラート'];
const EMOJIS='😀😃😄😁😅😂🤣😊😇🙂😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳😏😒😞😔😟😕🙁😣😖😫😩🥺😢😭😤😠😡🤬🤯😳🥵🥶😱😨😰😥😓🤗🤔🤭🤫🤥😶😐😑😬🙄😯😦😧😮😲🥱😴🤤😪😵🤐🥴🤢🤮🤧😷🤒🤕🤑🤠😈👿👹👺🤡💩👻💀☠️👽👾🤖🎃😺😸😹😻😼😽🙀😿😾❤️🧡💛💚💙💜🖤🤍🤎💔❣️💕💞💓💗💖💘💝👍👎👏🙌🤝💪🦾🦿🖐✋🤚👋🤙🤌🤞🤟🤘🤏👌👉👈👆👇☝️✌️🤞🖕✍️🙏🦶🦵🙇🙋💁🙆🙅🤷🤦🙍💆💇🧏🧖🕺💃👯👭👫👬🐶🐱🐭🐹🐰🦊🐻🐼🐨🐯🦁🐮🐷🐸🐵🐔🐧🐦🐤🐣🐥🦆🦅🦉🦇🐺🐗🐴🦄🐝🪱🐛🦋🐌🐞🐜🪰🪲🪳🦟🦗🕷🕸🦂🐢🐍🦎🦖🦕🐙🦑🦐🦞🦀🐡🐠🐟🐬🐳🐋🦈🐊🐅🐆🦓🦍🦧🐘🦛🦏🐪🐫🦒🦘🐃🐂🐄🐎🐖🐏🐑🦙🐐🦌🐕🐩🦮🐕‍🦺🐈🐈‍⬛🪶🐓🦃🦤🦚🦜🦢🦩🕊🐇🦝🦨🦡🦦🦥🐁🐀🐿🦔🐉🐲🌵🎄🌲🌳🌴🌱🌿☘️🍀🎍🪴🎋🍃🍂🍁🍄🐚🌾💐🌷🌹🥀🌺🌸🌼🌻🌞🌝🌛🌜🌚🌕🌖🌗🌘🌑🌒🌓🌔🌙🌎🌍🌏🪐💫⭐🌟✨⚡☄️💥🔥🌪🌈☀️🌤⛅🌥☁️🌦🌧⛈🌩🌨❄☃️⛄🌬💨💧💦🫧☔☂️🌊🌫🍏🍎🍐🍊🍋🍌🍉🍇🍓🫐🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶🫑🌽🥕🫒🧄🧅🥔🍠🥐🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥩🍗🍖🦴🌭🍔🍟🍕🫓🥪🥙🧆🌮🌯🫔🥗🥘🫕🥫🍝🍜🍲🍛🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🥧🧁🍰🎂🍮🍭🍬🍫🍿🍩🍪🌰🥜🍯🥛🍼🫖☕🍵🧃🥤🧋🍶🍺🍻🥂🍷🥃🍸🍹🧉🔪🍴🥄🍽🥣🥡🥢🧂⚽🏀🏈⚾🥎🎾🏐🏉🥏🎱🪀🏓🏸🏒🏑🥍🏏🎿⛷🏂🪂🏋️🤼🤸🤺⛹️🤾🏌️🏇🧘🏄🏊🤽🚣🧗🚵🚴🏆🥇🥈🥉🏅🎖🏵🎗🎪🎭🩰🎨🎬🎤🎧🎼🎹🥁🪘🎷🎺🪗🎸🪕🎻🎲♟🎯🎳🎮🎰🧩🚗🚕🚙🚌🚎🏎🚓🚑🚒🚐🛻🚚🚛🚜🏍🛵🚲🛴🛹🚨🚔🚍🚘🚖🚡🚠🚟🚃🚋🚞🚝🚄🚅🚈🚂🚆🚇🚊🚉✈️🛫🛬🛩💺🛰🚀🛸🚁🛶⛵🚤🛥🛳⛴🚢⚓🪝⛽🚧🚦🚥🚏🗺🗿🗽🗼🏰🏯🏟🎡🎢🎠⛲⛱🏖🏝🏜🌋⛰🏔🗻🏕⛺🛖🏠🏡🏘🏚🏗🏭🏢🏬🏣🏤🏥🏦🏨🏪🏫🏩💒🏛⛪🕌🕍🛕🕋⛩🛤🛣🗾🎑🏞🌅🌄🌠🎇🎆🌇🌆🏙🌃🌌🌉🌁⌚📱📲💻⌨🖥🖨🖱🖲🕹🗜💽💾💿📀📼📷📸📹🎥📽🎞📞☎📟📠📺📻🎙🎚🎛🧭⏱⏲⏰🕰⌛📡🔋';
</script>
</body>
</html>`;

fs.writeFileSync('public/index.html', html);
console.log('Built base HTML with CSS. Length:', html.length);
