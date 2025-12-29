const apiBase = '/api';

const state = {
  user: JSON.parse(localStorage.getItem('yuyu_user') || 'null'),
  feed: [],
  user_likes: new Set(),
  following: new Set()
};

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
        setUser(user); await loadFeed();
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
        setUser(user); await loadFeed();
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
        <img id="profileAvatar" src="" alt="avatar" style="width:56px;height:56px;border-radius:8px;margin-right:12px;object-fit:cover">
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
          <input id="editAvatarFile" type="file" accept="image/*" style="display:block;margin-top:6px">
        </div>
        <div style="margin-top:8px">
          <button id="saveProfileBtn" class="btn primary">保存资料</button>
          <button id="logoutBtn" class="btn" style="margin-left:8px">登出</button>
        </div>
      </div>
    </div>
  `;
  const avatarImg = document.getElementById('profileAvatar');
  if(avatarImg) avatarImg.src = state.user.avatar || ('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><rect width="100%" height="100%" fill="#ddd"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="24" fill="#666">'+escapeHtml((state.user.username||'U').slice(0,1).toUpperCase())+'</text></svg>');
  document.getElementById('saveProfileBtn').addEventListener('click', async ()=>{
    const newName = (document.getElementById('editUsername')||{}).value || '';
    const fileIn = document.getElementById('editAvatarFile');
    let avatarData = '';
    if(fileIn && fileIn.files && fileIn.files[0]){
      avatarData = await new Promise((res)=>{ const r = new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>res(''); r.readAsDataURL(fileIn.files[0]); });
    }
    if(!newName && !avatarData){ alert('请输入用户名或选择头像'); return; }
    const r = await apiPost('/user/update', { username: newName, avatar: avatarData });
    if(r.ok && r.body && r.body.ok){
      state.user.username = newName || state.user.username;
      if(avatarData) state.user.avatar = avatarData;
      setUser(state.user);
      alert('更新成功');
    } else alert('更新失败：'+(r.body?.error||r.error||r.status));
  });
  document.getElementById('logoutBtn').addEventListener('click', ()=>{ localStorage.removeItem('yuyu_user'); location.reload(); });
}

function initComposer(){
  const txt = document.getElementById('weiboContent');
  const media = document.getElementById('weiboMedia');
  const postBtn = document.getElementById('weiboPostBtn');
  const charCount = document.getElementById('charCount');
  if(txt && charCount){ txt.addEventListener('input', ()=>{ charCount.textContent = `${txt.value.length}/140`; }); }
  let mediaFileInput = document.getElementById('weiboMediaFile');
  if(!mediaFileInput){
    mediaFileInput = document.createElement('input'); mediaFileInput.type='file'; mediaFileInput.accept='image/*'; mediaFileInput.id='weiboMediaFile';
    mediaFileInput.style.marginLeft='8px';
    if(media && media.parentNode) media.parentNode.insertBefore(mediaFileInput, media.nextSibling);
  }
  if(postBtn){
    postBtn.addEventListener('click', async ()=>{
      const content = txt ? txt.value.trim() : '';
      let mediaUrl = media ? media.value.trim() : '';
      if(mediaFileInput && mediaFileInput.files && mediaFileInput.files[0]){
        const f = mediaFileInput.files[0];
        mediaUrl = await new Promise((res)=>{ const r = new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>res(''); r.readAsDataURL(f); });
      }
      if(!content){ alert('请输入微博内容'); return; }
      if(!state.user){ alert('请先登录'); return; }
      const body = { user_id: Number(state.user.user_id), content, media: mediaUrl };
      const r = await apiPost('/weibo', body);
      if(r.ok && r.body && r.body.ok){ txt.value=''; if(charCount) charCount.textContent='0/140'; loadFeed(); alert('发布成功'); }
      else alert('发布失败：' + (r.body?.error || r.error || r.status));
    });
  }
}

async function loadFeed(){
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
  const cont = document.getElementById('weiboList'); if(!cont) return; cont.innerHTML = '';
  if(!state.feed || state.feed.length===0){ cont.innerHTML = '<div class="card">暂无微博，快发布第一条吧！</div>'; return; }
  for(const w of state.feed){
    const id = Number(w.weibo_id || 0);
    const liked = state.user && state.user_likes.has(id);
    const el = document.createElement('div'); el.className='weibo-item';
    // 统一使用圆角方形头像
    const avatarHtml = w.avatar ? 
      ('<div class="avatar"><img src="'+escapeHtml(w.avatar)+'" style="width:48px;height:48px;border-radius:8px;object-fit:cover"></div>') : 
      ('<div class="avatar">'+escapeHtml((w.username||'U').slice(0,1).toUpperCase())+'</div>');
    el.innerHTML = `
      ${avatarHtml}
      <div class="weibo-body">
        <div class="weibo-meta">${escapeHtml(w.username||('用户#'+(w.user_id||'')))} · ${formatTime(w.created_at||Date.now())}</div>
        <div class="weibo-content">${escapeHtml(w.content||'')}</div>
        ${w.media?('<div style="margin-top:8px"><img src="'+escapeHtml(w.media)+'" style="max-width:100%;border-radius:8px"></div>'):''}
        <div class="weibo-actions" style="margin-top:8px">
          <button class="btn like-btn">${liked? '已赞' : '点赞'} (${Number(w.like_count||0)})</button>
          <button class="btn comment-toggle">评论 (${Number(w.comment_count||0)})</button>
          ${state.user && Number(state.user.user_id) === Number(w.user_id) ? '<button class="btn delete-btn">删除</button>' : ''}
          ${state.user && Number(state.user.user_id) !== Number(w.user_id) ? '<button class="btn follow-btn">关注</button>' : ''}
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
      function updateFollowText(){ followBtn.textContent = state.following.has(authorId) ? '已关注' : '关注'; }
      updateFollowText();
      followBtn.addEventListener('click', async ()=>{
        if(!state.user){ alert('请先登录'); return; }
        const action = state.following.has(authorId) ? 'unfollow' : 'follow';
        const r = await apiPost('/follow', { followee_id: authorId, action });
        if(r.ok && r.body && r.body.ok){ if(action==='follow') state.following.add(authorId); else state.following.delete(authorId); updateFollowText(); } else alert('操作失败：'+(r.body?.error||r.error||r.status));
      });
    }

    if(likeBtn){
      likeBtn.addEventListener('click', async ()=>{
        if(!state.user){ alert('请先登录'); return; }
        const action = state.user_likes.has(id) ? 'unlike' : 'like';
        const r = await apiPost('/like', { weibo_id: id, action });
        if(r.ok && r.body && r.body.ok){ if(action==='like'){ state.user_likes.add(id); w.like_count = Number(w.like_count||0)+1; likeBtn.textContent = `已赞 (${w.like_count})`; } else { state.user_likes.delete(id); w.like_count = Math.max(0, Number(w.like_count||0)-1); likeBtn.textContent = `点赞 (${w.like_count})`; } } else alert('操作失败：' + (r.body?.error || r.error || r.status));
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
                const replyBtn = document.createElement('button'); replyBtn.className='btn'; replyBtn.textContent='回复'; ops.appendChild(replyBtn);
                if(userIsAuthor){ const delBtn = document.createElement('button'); delBtn.className='btn'; delBtn.style.marginLeft='6px'; delBtn.textContent='删除'; ops.appendChild(delBtn);
                  delBtn.addEventListener('click', async ()=>{ if(!confirm('确认删除该评论？')) return; const rr = await apiPost('/comment/delete',{comment_id: Number(c.comment_id)}); if(rr.ok && rr.body && rr.body.ok){ await loadFeed(); } else alert('删除失败：'+(rr.body?.error||rr.error||rr.status)); }); }
                ce.appendChild(ops);
                container.appendChild(ce);
                replyBtn.addEventListener('click', ()=>{
                  let replyForm = ce.querySelector('.reply-form');
                  if(replyForm){ replyForm.style.display = replyForm.style.display==='none'?'block':'none'; return; }
                  replyForm = document.createElement('div'); replyForm.className='reply-form'; replyForm.style.marginTop='6px';
                  replyForm.innerHTML = `<input class="reply-input" placeholder="回复..."> <button class="btn submit-reply">提交</button>`;
                  ce.appendChild(replyForm);
                  replyForm.querySelector('.submit-reply').addEventListener('click', async ()=>{
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
  loadFeed();
});