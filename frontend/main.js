const apiBase = '/api';

const state = {
  user: JSON.parse(localStorage.getItem('yuyu_user') || 'null'),
  feed: [],
  user_likes: new Set()
};

function setUser(user){
  state.user = user;
  if(user) localStorage.setItem('yuyu_user', JSON.stringify(user)); else localStorage.removeItem('yuyu_user');
  const el = document.getElementById('currentUser'); if(el) el.textContent = user ? (user.username || ('用户#'+user.user_id)) : '未登录';
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
  // tabs
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
        setUser(user); loadFeed();
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
        setUser(user); loadFeed();
        alert('注册并登录成功');
      } else alert('注册失败：' + (r.body?.error || r.error || r.status));
    });
  }
}

function initComposer(){
  const txt = document.getElementById('weiboContent');
  const media = document.getElementById('weiboMedia');
  const postBtn = document.getElementById('weiboPostBtn');
  const charCount = document.getElementById('charCount');
  if(txt && charCount){ txt.addEventListener('input', ()=>{ charCount.textContent = `${txt.value.length}/140`; }); }
  if(postBtn){
    postBtn.addEventListener('click', async ()=>{
      const content = txt ? txt.value.trim() : '';
      const mediaUrl = media ? media.value.trim() : '';
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
  } else state.user_likes = new Set();
  renderWeiboList();
}

function renderWeiboList(){
  const cont = document.getElementById('weiboList'); if(!cont) return; cont.innerHTML = '';
  if(!state.feed || state.feed.length===0){ cont.innerHTML = '<div class="card">暂无微博，快发布第一条吧！</div>'; return; }
  for(const w of state.feed){
    const id = Number(w.weibo_id || 0);
    const liked = state.user && state.user_likes.has(id);
    const el = document.createElement('div'); el.className='weibo-item';
    el.innerHTML = `
      <div class="avatar">${escapeHtml((w.username||'U').slice(0,1).toUpperCase())}</div>
      <div class="weibo-body">
        <div class="weibo-meta">${escapeHtml(w.username||('用户#'+(w.user_id||'')))} · ${formatTime(w.created_at||Date.now())}</div>
        <div class="weibo-content">${escapeHtml(w.content||'')}</div>
        ${w.media?('<div style="margin-top:8px"><img src="'+escapeHtml(w.media)+'" style="max-width:100%;border-radius:6px"></div>'):''}
        <div class="weibo-actions" style="margin-top:8px">
          <button class="btn like-btn">${liked? '已赞' : '点赞'} (${Number(w.like_count||0)})</button>
          <button class="btn comment-toggle">评论 (${Number(w.comment_count||0)})</button>
          ${state.user && Number(state.user.user_id) === Number(w.user_id) ? '<button class="btn delete-btn">删除</button>' : ''}
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
    const commentsList = el.querySelector('.comments-list');
    const commentArea = el.querySelector('.comment-area');
    const commentInput = el.querySelector('.comment-input');
    const submitComment = el.querySelector('.submit-comment');

    if(likeBtn){
      likeBtn.addEventListener('click', async ()=>{
        if(!state.user){ alert('请先登录'); return; }
        const action = state.user_likes.has(id) ? 'unlike' : 'like';
        const r = await apiPost('/like', { weibo_id: id, action });
        if(r.ok && r.body && r.body.ok){
          if(action==='like'){ state.user_likes.add(id); w.like_count = Number(w.like_count||0)+1; likeBtn.textContent = `已赞 (${w.like_count})`; }
          else { state.user_likes.delete(id); w.like_count = Math.max(0, Number(w.like_count||0)-1); likeBtn.textContent = `点赞 (${w.like_count})`; }
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
            commentsList.innerHTML='';
            for(const c of r.body.comments){
              const ce = document.createElement('div'); ce.className='comment-item';
              ce.innerHTML = `<strong>${escapeHtml(c.username)}</strong> · ${formatTime(c.created_at)}<div>${escapeHtml(c.content)}</div>`;
              commentsList.appendChild(ce);
            }
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
        if(r.ok && r.body && r.body.ok){
          const ce = document.createElement('div'); ce.className='comment-item';
          ce.innerHTML = `<strong>${escapeHtml(state.user.username||('用户#'+state.user.user_id))}</strong> · ${formatTime(Date.now())}<div>${escapeHtml(txt)}</div>`;
          commentsList.appendChild(ce); commentInput.value='';
          w.comment_count = Number(w.comment_count||0)+1; el.querySelector('.comment-toggle').textContent = `评论 (${w.comment_count})`;
        } else alert('评论失败：' + (r.body?.error || r.error || r.status));
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