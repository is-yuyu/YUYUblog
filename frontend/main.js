// 可通过页面注入覆盖（例如：<script>window.__YUYU_API_BASE__ = 'http://localhost:8080/api'</script>)
// 在直接以 file:// 协议打开时，默认回退到本地后端地址，便于开发测试
const apiBase = window.__YUYU_API_BASE__ || (location.protocol === 'file:' ? 'http://localhost:8080/api' : '/api');

const state = {
  user: JSON.parse(localStorage.getItem('yuyu_user') || 'null'),
  feed: [],
  user_likes: new Set(),
  following: new Set()
};
state.view = 'all';

function setUser(user){
  state.user = user;
  if(user) localStorage.setItem('yuyu_user', JSON.stringify(user)); else localStorage.removeItem('yuyu_user');
  const el = document.getElementById('currentUser'); if(el) el.textContent = user ? (user.username || ('用户#'+user.user_id)) : '未登录';
  // if logged in, show profile panel
  if(user) renderProfilePanel();
}

async function apiPost(path, body){
  try{
    const headers = {'Content-Type':'application/json'};
    if(state.user && state.user.token) headers['Authorization'] = 'Bearer ' + state.user.token;
    const r = await fetch(apiBase + path, {method:'POST', headers, body: JSON.stringify(body || {})});
    const j = await r.json();
    return {ok:r.ok, status:r.status, body:j};
  }catch(e){ return {ok:false, error:e.message}; }
}

async function apiGet(path){
  try{
    const headers = {};
    if(state.user && state.user.token) headers['Authorization'] = 'Bearer ' + state.user.token;
    const r = await fetch(apiBase + path, {headers});
    const j = await r.json();
    return {ok:r.ok, status:r.status, body:j};
  }catch(e){ return {ok:false, error:e.message}; }
}

function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function formatTime(ts){ const d = new Date(ts); return d.toLocaleString(); }

function initAuth(){
  const loginTab = document.getElementById('login-tab');
  const registerTab = document.getElementById('register-tab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  if(loginTab && registerTab){
    loginTab.addEventListener('click', ()=>{ loginTab.classList.add('active'); registerTab.classList.remove('active'); loginForm.classList.add('active'); registerForm.classList.remove('active'); registerForm.setAttribute('aria-hidden','true'); });
    registerTab.addEventListener('click', ()=>{ registerTab.classList.add('active'); loginTab.classList.remove('active'); registerForm.classList.add('active'); loginForm.classList.remove('active'); registerForm.removeAttribute('aria-hidden'); });
  }

  if(loginForm){
    loginForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const email = (document.getElementById('l_email')||{}).value || '';
      const password = (document.getElementById('l_password')||{}).value || '';
      if(!email || !password){ alert('请输入邮箱和密码'); return; }
      const r = await apiPost('/login', {email, password});
      if(r.ok && r.body && r.body.ok){
        const user = { user_id: r.body.user_id, token: r.body.token, username: email.split('@')[0] };
        setUser(user);
        // 获取完整用户信息（包括头像）
        const userInfoResp = await apiGet('/user/info');
        if(userInfoResp.ok && userInfoResp.body && userInfoResp.body.ok && userInfoResp.body.data){
          state.user.avatar = userInfoResp.body.data.avatar;
          state.user.username = userInfoResp.body.data.username;
          setUser(state.user);
        }
        await loadFeed();
        alert('登录成功');
      } else alert('登录失败：' + (r.body?.error || r.error || r.status));
    });
  }

  if(registerForm){
    registerForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const username = (document.getElementById('r_username')||{}).value || '';
      const email = (document.getElementById('r_email')||{}).value || '';
      const password = (document.getElementById('r_password')||{}).value || '';
      if(!username || !email || !password){ alert('请输入用户名、邮箱和密码'); return; }
      const r = await apiPost('/register', {username, email, password});
      if(r.ok && r.body && r.body.ok){
        const user = { user_id: r.body.user_id, token: r.body.token, username };
        setUser(user);
        // 获取完整用户信息（包括头像）
        const userInfoResp = await apiGet('/user/info');
        if(userInfoResp.ok && userInfoResp.body && userInfoResp.body.ok && userInfoResp.body.data){
          state.user.avatar = userInfoResp.body.data.avatar;
          state.user.username = userInfoResp.body.data.username;
          setUser(state.user);
        }
        await loadFeed();
        alert('注册并登录成功');
      } else alert('注册失败：' + (r.body?.error || r.error || r.status));
    });
  }
}

function renderProfilePanel(){
  const aside = document.querySelector('.auth-panel');
  if(!aside || !state.user) return;
  aside.innerHTML = `
    <div class="profile card">
      <div style="display:flex;align-items:center">
        <div class="avatar-container" style="position:relative">
          <img id="profileAvatar" src="" alt="avatar" style="width:56px;height:56px;border-radius:8px;margin-right:12px;object-fit:cover">
          <div id="avatarPreview" class="avatar-preview" style="display:none;position:absolute;top:0;left:0;width:56px;height:56px;border-radius:8px;background:rgba(0,0,0,0.7);color:white;font-size:12px;display:flex;align-items:center;justify-content:center;pointer-events:none"></div>
        </div>
        <div>
          <div id="profileName" style="font-weight:600">${escapeHtml(state.user.username||('用户#'+state.user.user_id))}</div>
          <div style="font-size:12px;color:#666">ID: ${state.user.user_id}</div>
        </div>
      </div>
      <div style="margin-top:12px">
        <label>更改用户名</label>
        <input id="editUsername" placeholder="用户名" style="width:100%;margin-top:6px" value="${escapeHtml(state.user.username||'')}">
        <div style="margin-top:8px">
          <label>更换头像</label>
          <div style="display:flex;align-items:center;gap:8px">
            <input id="editAvatarFile" type="file" accept="image/jpeg,image/png,image/gif,image/webp" style="display:none">
            <button id="avatarSelectBtn" class="btn" style="flex:1">选择图片</button>
            <button id="avatarClearBtn" class="btn" style="${!state.user.avatar ? 'display:none' : ''}">清除头像</button>
          </div>
          <div id="avatarInfo" style="font-size:12px;color:#666;margin-top:4px">支持 JPG、PNG、GIF、WebP，最大 2MB</div>
          <div id="avatarError" style="font-size:12px;color:#e74c3c;margin-top:4px;display:none"></div>
        </div>
        <div style="margin-top:8px">
          <button id="saveProfileBtn" class="btn primary">保存资料</button>
          <button id="logoutBtn" class="btn" style="margin-left:8px">登出</button>
        </div>
      </div>
    </div>
  `;
  
  // 设置头像
  const avatarImg = document.getElementById('profileAvatar');
  if(avatarImg) avatarImg.src = state.user.avatar || ('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="100%" height="100%" fill="#ddd"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#666">'+escapeHtml((state.user.username||'U').slice(0,1).toUpperCase())+'</text></svg>');
  
  // 头像选择按钮
  const avatarSelectBtn = document.getElementById('avatarSelectBtn');
  const avatarFileInput = document.getElementById('editAvatarFile');
  const avatarClearBtn = document.getElementById('avatarClearBtn');
  const avatarPreview = document.getElementById('avatarPreview');
  const avatarError = document.getElementById('avatarError');
  
  avatarSelectBtn.addEventListener('click', () => avatarFileInput.click());
  
  avatarClearBtn.addEventListener('click', () => {
    state.user.avatar = '';
    setUser(state.user);
    renderProfilePanel();
  });
  
  avatarFileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if(!file) return;
    
    // 验证文件类型
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if(!validTypes.includes(file.type)) {
      showAvatarError('请选择 JPG、PNG、GIF 或 WebP 格式的图片');
      return;
    }
    
    // 验证文件大小（最大 2MB）
    if(file.size > 2 * 1024 * 1024) {
      showAvatarError('图片大小不能超过 2MB');
      return;
    }
    
    // 显示预览
    const reader = new FileReader();
    reader.onload = function(e) {
      avatarImg.src = e.target.result;
      avatarPreview.textContent = '预览';
      avatarPreview.style.display = 'flex';
      setTimeout(() => avatarPreview.style.display = 'none', 2000);
      hideAvatarError();
    };
    reader.readAsDataURL(file);
  });
  
  function showAvatarError(message) {
    avatarError.textContent = message;
    avatarError.style.display = 'block';
    avatarFileInput.value = '';
  }
  
  function hideAvatarError() {
    avatarError.style.display = 'none';
  }
  
  // 保存资料按钮
  document.getElementById('saveProfileBtn').addEventListener('click', async ()=>{
    const newName = (document.getElementById('editUsername')||{}).value || '';
    const fileIn = document.getElementById('editAvatarFile');
    let avatarData = '';
    
    if(fileIn && fileIn.files && fileIn.files[0]){
      const file = fileIn.files[0];
      
      // 再次验证文件
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if(!validTypes.includes(file.type)) {
        showAvatarError('请选择有效的图片格式');
        return;
      }
      
      if(file.size > 2 * 1024 * 1024) {
        showAvatarError('图片大小不能超过 2MB');
        return;
      }
      
      avatarData = await new Promise((res)=>{ 
        const r = new FileReader(); 
        r.onload=()=>res(r.result); 
        r.onerror=()=>{ showAvatarError('图片读取失败'); res(''); }; 
        r.readAsDataURL(file); 
      });
    }
    
    if(!newName && !avatarData && newName === state.user.username){ 
      alert('请输入新的用户名或选择头像'); 
      return; 
    }
    
    // 显示加载状态
    const saveBtn = document.getElementById('saveProfileBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = '保存中...';
    saveBtn.disabled = true;
    
    try {
      const r = await apiPost('/user/update', { username: newName, avatar: avatarData });
      if(r.ok && r.body && r.body.ok){
        state.user.username = newName || state.user.username;
        if(avatarData) state.user.avatar = avatarData;
        setUser(state.user);
        avatarFileInput.value = ''; // 清空文件选择
        alert('更新成功');
      } else {
        alert('更新失败：'+(r.body?.error||r.error||r.status));
      }
    } catch(error) {
      alert('网络错误，请重试');
    } finally {
      saveBtn.textContent = originalText;
      saveBtn.disabled = false;
    }
  });
  
  document.getElementById('logoutBtn').addEventListener('click', ()=>{ localStorage.removeItem('yuyu_user'); location.reload(); });
}

function initHeaderNav(){
  const btn = document.getElementById('followingFeedBtn');
  if(!btn) return;
  function updateBtn(){ btn.textContent = state.view === 'following' ? '全部' : '关注的人'; }
  updateBtn();
  btn.addEventListener('click', ()=>{
    state.view = state.view === 'following' ? 'all' : 'following';
    updateBtn();
    renderWeiboList();
  });
}

function initComposer(){
  const txt = document.getElementById('weiboContent');
  const uploadBtn = document.getElementById('weiboUploadBtn');
  const postBtn = document.getElementById('weiboPostBtn');
  const charCount = document.getElementById('charCount');
  const mediaPreview = document.getElementById('weiboMediaPreview');
  
  if(txt && charCount){ txt.addEventListener('input', ()=>{ charCount.textContent = `${txt.value.length}/140`; }); }
  
  let mediaFileInput = document.getElementById('weiboMediaFile');
  if(!mediaFileInput){
    mediaFileInput = document.createElement('input'); 
    mediaFileInput.type='file'; 
    mediaFileInput.accept='image/*'; 
    mediaFileInput.id='weiboMediaFile';
    mediaFileInput.style.display='none';
    document.body.appendChild(mediaFileInput);
  }
  
  // 上传按钮点击
  if(uploadBtn){
    uploadBtn.addEventListener('click', ()=>{
      mediaFileInput.click();
    });
  }
  
  // 文件选择后显示提示
  mediaFileInput.addEventListener('change', function(e){
    if(e.target.files && e.target.files[0]){
      mediaPreview.textContent = '已选择: ' + e.target.files[0].name;
      mediaPreview.style.display = 'block';
    }
  });
  
  if(postBtn){
    postBtn.addEventListener('click', async ()=>{
      const content = txt ? txt.value.trim() : '';
      let mediaUrl = '';
      if(mediaFileInput && mediaFileInput.files && mediaFileInput.files[0]){
        const f = mediaFileInput.files[0];
        mediaUrl = await new Promise((res)=>{ 
          const r = new FileReader(); 
          r.onload=()=>res(r.result); 
          r.onerror=()=>res(''); 
          r.readAsDataURL(f); 
        });
      }
      if(!content){ alert('请输入微博内容'); return; }
      if(!state.user){ alert('请先登录'); return; }
      const body = { user_id: Number(state.user.user_id), content, media: mediaUrl };
      const r = await apiPost('/weibo', body);
      if(r.ok && r.body && r.body.ok){ 
        txt.value=''; 
        if(charCount) charCount.textContent='0/140'; 
        mediaFileInput.value='';
        mediaPreview.style.display='none';
        loadFeed(); 
        alert('发布成功'); 
      }
      else alert('发布失败：' + (r.body?.error || r.error || r.status));
    });
  }
}

async function loadFeed(){
  // 显示加载指示器
  const weiboList = document.getElementById('weiboList');
  if(weiboList) weiboList.innerHTML = '<div class="card" style="text-align: center; padding: 20px;"><div class="loading"></div><p style="margin-top: 8px; color: var(--muted);">加载中...</p></div>';
  
  const r = await apiGet('/weibos');
  if(r.ok && r.body) state.feed = r.body.weibos || [];
  else state.feed = [];
  if(state.user){
    const r2 = await apiGet('/user_likes');
    if(r2.ok && r2.body && Array.isArray(r2.body.weibo_ids)) state.user_likes = new Set(r2.body.weibo_ids.map(x=>Number(x)));
    else state.user_likes = new Set();
    try{
      const ff = await apiGet('/following?user_id='+encodeURIComponent(Number(state.user.user_id)));
      if(ff.ok && ff.body && Array.isArray(ff.body.users)) state.following = new Set(ff.body.users.map(u=>Number(u.user_id)));
      else state.following = new Set();
    }catch(e){ state.following = new Set(); }
  } else { state.user_likes = new Set(); state.following = new Set(); }
  
  renderWeiboList();
}

function renderWeiboList(){
  const cont = document.getElementById('weiboList'); 
  if(!cont) return; 
  
  cont.innerHTML = '';
  if(!state.feed || state.feed.length===0){ cont.innerHTML = '<div class="card">暂无微博，快发布第一条吧！</div>'; return; }
  const feedToShow = state.view === 'following' && state.user ? state.feed.filter(x=> state.following.has(Number(x.user_id))) : state.feed;
  if(feedToShow.length === 0){ cont.innerHTML = '<div class="card">暂无可显示的微博</div>'; return; }
  for(const w of feedToShow){
    const id = Number(w.weibo_id || 0);
    const liked = state.user && state.user_likes.has(id);
    const el = document.createElement('div'); el.className='weibo-item';
    el.dataset.author = String(Number(w.user_id || 0));
    // 统一使用圆角方形头像
    const avatarHtml = w.avatar ? 
      ('<div class="avatar"><img src="'+escapeHtml(w.avatar)+'" style="width:48px;height:48px;border-radius:8px;object-fit:cover"></div>') : 
      ('<div class="avatar">'+escapeHtml((w.username||'U').slice(0,1).toUpperCase())+'</div>');
    // add follow button under avatar when logged in and not the author
    let avatarWithFollow = avatarHtml;
    if(state.user && Number(state.user.user_id) !== Number(w.user_id)){
      const aid = Number(w.user_id);
      const isFollowing = state.following.has(aid);
      avatarWithFollow = `
        <div class="avatar-wrap">
          ${avatarHtml}
          <div class="follow-wrap">
            <button class="icon-btn follow-btn ${isFollowing ? 'following' : ''}">
              <svg class="icon icon-follow" viewBox="0 0 24 24">
                <path d="${isFollowing ? 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z' : 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'}"/>
              </svg>
              ${isFollowing ? '已关注' : '关注'}
            </button>
          </div>
        </div>`;
    }
    el.innerHTML = `
      ${avatarWithFollow}
      <div class="weibo-body">
        <div class="weibo-meta">${escapeHtml(w.username||('用户#'+(w.user_id||'')))} · ${formatTime(w.created_at||Date.now())}</div>
        <div class="weibo-content">${escapeHtml(w.content||'')}</div>
        ${w.media?('<div style="margin-top:8px"><img src="'+escapeHtml(w.media)+'" style="max-width:100%;border-radius:8px"></div>'):''}
        <div class="weibo-actions" style="margin-top:8px">
          <button class="icon-btn like-btn ${liked ? 'liked' : ''}">
            <svg class="icon icon-like ${liked ? 'liked' : ''}" viewBox="0 0 24 24">
              <path d="${liked ? 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z' : 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'}"/>
            </svg>
            ${liked ? '已赞' : '点赞'} (${Number(w.like_count||0)})
          </button>
          <button class="icon-btn comment-toggle comment">
            <svg class="icon icon-comment" viewBox="0 0 24 24">
              <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h11c.55 0 1-.45 1-1z"/>
            </svg>
            评论 (${Number(w.comment_count||0)})
          </button>
          ${state.user && Number(state.user.user_id) === Number(w.user_id) ? 
            `<button class="icon-btn delete-btn delete">
              <svg class="icon icon-delete" viewBox="0 0 24 24">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
              删除
            </button>` : ''}
        </div>
        <div class="comment-area" style="display:none;margin-top:8px">
          <div class="comments-list"></div>
          <div class="comment-form" style="margin-top:6px">
            <input class="comment-input" placeholder="写评论...">
            <button class="btn submit-comment">提交</button>
          </div>
        </div>
      </div>
    `;
    cont.appendChild(el);

    const likeBtn = el.querySelector('.like-btn');
    const commentToggle = el.querySelector('.comment-toggle');
    const deleteBtn = el.querySelector('.delete-btn');
    const followBtn = el.querySelector('.follow-btn');
    const commentsList = el.querySelector('.comments-list');
    const commentArea = el.querySelector('.comment-area');
    const commentInput = el.querySelector('.comment-input');
    const submitComment = el.querySelector('.submit-comment');

    if(followBtn){
      const authorId = Number(w.user_id);
      function updateFollowBtn(btn, isFollowing){
        btn.innerHTML = `
          <svg class="icon icon-follow" viewBox="0 0 24 24">
            <path d="${isFollowing ? 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z' : 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'}"/>
          </svg>
          ${isFollowing ? '已关注' : '关注'}
        `;
        btn.className = `icon-btn follow-btn ${isFollowing ? 'following' : ''}`;
      }
      // update initial text
      updateFollowBtn(followBtn, state.following.has(authorId));
      followBtn.addEventListener('click', async ()=>{
        if(!state.user){ alert('请先登录'); return; }
        const action = state.following.has(authorId) ? 'unfollow' : 'follow';
        // disable all buttons for this author while request in flight
        const buttons = document.querySelectorAll(`[data-author="${authorId}"] .follow-btn`);
        buttons.forEach(b=>b.disabled = true);
        try{
          const r = await apiPost('/follow', { followee_id: authorId, action });
          if(r.ok && r.body && r.body.ok){
            if(action==='follow') state.following.add(authorId); else state.following.delete(authorId);
            // update all follow buttons for this author
            const btns = document.querySelectorAll(`[data-author="${authorId}"] .follow-btn`);
            btns.forEach(b=> updateFollowBtn(b, state.following.has(authorId)));
            // if viewing 'following' feed, re-render to reflect adds/removals
            if(state.view === 'following') renderWeiboList();
          } else {
            alert('操作失败：'+(r.body?.error||r.error||r.status));
          }
        }catch(e){ alert('操作失败：'+e.message); }
        finally{ buttons.forEach(b=>b.disabled = false); }
      });
    }

    if(likeBtn){
      function updateLikeBtn(btn, liked, count){
        btn.innerHTML = `
          <svg class="icon icon-like ${liked ? 'liked' : ''}" viewBox="0 0 24 24">
            <path d="${liked ? 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z' : 'M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z'}"/>
          </svg>
          ${liked ? '已赞' : '点赞'} (${count})
        `;
        btn.className = `icon-btn like-btn ${liked ? 'liked' : ''}`;
      }
      likeBtn.addEventListener('click', async ()=>{
        if(!state.user){ alert('请先登录'); return; }
        const action = state.user_likes.has(id) ? 'unlike' : 'like';
        const r = await apiPost('/like', { weibo_id: id, action });
        if(r.ok && r.body && r.body.ok){ 
          if(action==='like'){ 
            state.user_likes.add(id); 
            w.like_count = Number(w.like_count||0)+1; 
            updateLikeBtn(likeBtn, true, w.like_count);
            // 添加点赞动画
            const icon = likeBtn.querySelector('.icon-like');
            icon.classList.add('liked');
            setTimeout(() => icon.classList.remove('liked'), 600);
          } else { 
            state.user_likes.delete(id); 
            w.like_count = Math.max(0, Number(w.like_count||0)-1); 
            updateLikeBtn(likeBtn, false, w.like_count);
          } 
        } else alert('操作失败：' + (r.body?.error || r.error || r.status));
      });
    }

    if(commentToggle){
      commentToggle.addEventListener('click', async ()=>{
        if(commentArea.style.display === 'none'){
          commentArea.style.display = 'block';
          commentsList.innerHTML = '<div class="muted">加载中...</div>';
          const r = await apiGet('/comments?weibo_id='+encodeURIComponent(id));
          if(r.ok && r.body && Array.isArray(r.body.comments)){
            const comments = r.body.comments || [];
            const byParent = {};
            for(const c of comments){ const pid = Number(c.parent_id||0); if(!byParent[pid]) byParent[pid]=[]; byParent[pid].push(c); }
            function renderComments(parentId, container, level){
              const arr = byParent[parentId] || [];
              for(const c of arr){
                const ce = document.createElement('div'); ce.className='comment-item'; ce.style.marginLeft = (level*12)+'px';
                const userIsAuthor = state.user && Number(state.user.user_id) === Number(c.user_id);
                ce.innerHTML = `<div><strong>${escapeHtml(c.username)}</strong> · ${formatTime(c.created_at)}</div><div>${escapeHtml(c.content)}</div>`;
                const ops = document.createElement('div'); ops.style.marginTop='6px';
                const replyBtn = document.createElement('button'); 
                replyBtn.className='icon-btn comment';
                replyBtn.innerHTML = `
                  <svg class="icon icon-comment" viewBox="0 0 24 24">
                    <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h11c.55 0 1-.45 1-1z"/>
                  </svg>
                  回复
                `;
                ops.appendChild(replyBtn);
                if(userIsAuthor){ 
                  const delBtn = document.createElement('button'); 
                  delBtn.className='icon-btn delete';
                  delBtn.innerHTML = `
                    <svg class="icon icon-delete" viewBox="0 0 24 24">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                    删除
                  `;
                  delBtn.style.marginLeft='6px'; 
                  ops.appendChild(delBtn);
                  delBtn.addEventListener('click', async ()=>{ 
                    if(!confirm('确认删除该评论？')) return; 
                    const rr = await apiPost('/comment/delete',{comment_id: Number(c.comment_id)}); 
                    if(rr.ok && rr.body && rr.body.ok){ await loadFeed(); } 
                    else alert('删除失败：'+(rr.body?.error||rr.error||rr.status)); 
                  }); 
                }
                ce.appendChild(ops);
                container.appendChild(ce);
                replyBtn.addEventListener('click', ()=>{
                  let replyForm = ce.querySelector('.reply-form');
                  if(replyForm){ replyForm.style.display = replyForm.style.display==='none'?'block':'none'; return; }
                  replyForm = document.createElement('div'); replyForm.className='reply-form'; replyForm.style.marginTop='6px';
                  replyForm.innerHTML = `
                    <input class="reply-input" placeholder="回复..."> 
                    <button class="icon-btn comment">
                      <svg class="icon icon-comment" viewBox="0 0 24 24">
                        <path d="M21 6h-2v9H6v2c0 .55.45 1 1 1h11l4 4V7c0-.55-.45-1-1-1zm-4 6V3c0-.55-.45-1-1-1H3c-.55 0-1 .45-1 1v14l4-4h11c.55 0 1-.45 1-1z"/>
                      </svg>
                      提交
                    </button>
                  `;
                  ce.appendChild(replyForm);
                  replyForm.querySelector('button').addEventListener('click', async ()=>{
                    const txt = (replyForm.querySelector('.reply-input').value||'').trim(); if(!txt){ alert('请输入回复'); return; }
                    if(!state.user){ alert('请先登录'); return; }
                    const rr = await apiPost('/comment',{ weibo_id: id, content: txt, parent_id: Number(c.comment_id) });
                    if(rr.ok && rr.body && rr.body.ok){ await loadFeed(); } else alert('回复失败：'+(rr.body?.error||rr.error||rr.status));
                  });
                });
                renderComments(Number(c.comment_id), container, level+1);
              }
            }
            commentsList.innerHTML=''; renderComments(0, commentsList, 0);
          } else commentsList.innerHTML = '<div class="muted">暂无评论</div>';
        } else commentArea.style.display = 'none';
      });
    }

    if(deleteBtn){
      deleteBtn.addEventListener('click', async ()=>{
        if(!confirm('确认删除该微博？')) return;
        if(!state.user){ alert('请先登录'); return; }
        const r = await apiPost('/weibo/delete', { weibo_id: id });
        if(r.ok && r.body && r.body.ok){ state.feed = state.feed.filter(x=>Number(x.weibo_id)!==id); renderWeiboList(); }
        else alert('删除失败：' + (r.body?.error || r.error || r.status));
      });
    }

    if(submitComment){
      submitComment.addEventListener('click', async ()=>{
        const txt = (commentInput.value || '').trim(); if(!txt){ alert('请输入评论'); return; }
        if(!state.user){ alert('请先登录'); return; }
        const r = await apiPost('/comment', { weibo_id: id, content: txt });
        if(r.ok && r.body && r.body.ok){ await loadFeed(); } else alert('评论失败：' + (r.body?.error || r.error || r.status));
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', ()=>{
  setUser(state.user);
  initAuth();
  initComposer();
  initHeaderNav();
  loadFeed();
});