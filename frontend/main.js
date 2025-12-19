const apiBase = '/api';

// 简单状态（存本地）
const state = {
  user: JSON.parse(localStorage.getItem('yuyu_user') || 'null'),
  feed: []
};

function setUser(user){
  state.user = user;
  if(user) localStorage.setItem('yuyu_user', JSON.stringify(user)); else localStorage.removeItem('yuyu_user');
  document.getElementById('currentUser').textContent = user ? user.username || ('用户#'+user.user_id) : '未登录';
}

async function apiPost(path, body){
  try{
    const r = await fetch(apiBase+path, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j = await r.json();
    return {ok:r.ok, status:r.status, body:j};
  }catch(e){ return {ok:false, error:e.message}; }
}

async function apiGet(path){
  try{ const r = await fetch(apiBase+path); const j = await r.json(); return {ok:r.ok, body:j}; }
  catch(e){ return {ok:false, error:e.message}; }
}

// UI helpers
function formatTime(ts){
  const d = new Date(ts);
  return d.toLocaleString();
}

function renderWeiboList(){
  const cont = document.getElementById('weiboList'); cont.innerHTML='';
  if(state.feed.length===0){ cont.innerHTML = '<div class="card">暂无微博，快发布第一条吧！</div>'; return; }
  for(const w of state.feed){
    const el = document.createElement('div'); el.className='weibo-item';
    el.innerHTML = `
      <div class="avatar">${(w.username||'U').slice(0,1).toUpperCase()}</div>
      <div class="weibo-body">
        <div class="weibo-meta">${w.username||('用户#'+(w.user_id||''))} · ${formatTime(w.created_at||Date.now())}</div>
        <div class="weibo-content">${escapeHtml(w.content||'')}</div>
        ${w.media?('<div style="margin-top:8px"><img src="'+escapeHtml(w.media)+'" style="max-width:100%;border-radius:6px"></div>'):''}
      </div>
    `;
    cont.appendChild(el);
  }
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

async function loadFeed(){
  // 试图从后端获取，失败则保持本地 state.feed
  const res = await apiGet('/weibos');
  if(res.ok && res.body){
    state.feed = res.body.weibos || [];
  }
  renderWeiboList();
}

// 登录/注册/发布逻辑
document.getElementById('registerForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const username = document.getElementById('r_username').value.trim();
  const email = document.getElementById('r_email').value.trim();
  const password = document.getElementById('r_password').value;
  if(!username||!email||!password){ alert('请填写完整'); return; }
  const r = await apiPost('/register',{username,email,password});
  if(r.ok && r.body && r.body.ok){ setUser({user_id:r.body.user_id,username}); alert('注册成功'); }
  else { alert('注册失败：'+(r.body?.error||r.error||r.status)); }
});

document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = document.getElementById('l_email').value.trim();
  const password = document.getElementById('l_password').value;
  if(!email||!password){ alert('请填写完整'); return; }
  const r = await apiPost('/login',{email,password});
  if(r.ok && r.body && r.body.ok){ setUser({user_id:r.body.user_id,username:email}); alert('登录成功'); }
  else { alert('登录失败：'+(r.body?.error||r.error||r.status)); }
});

document.getElementById('weiboPostBtn').addEventListener('click', async ()=>{
  const content = document.getElementById('weiboContent').value.trim();
  const media = document.getElementById('weiboMedia').value.trim();
  if(!state.user){ alert('请先登录'); return; }
  if(!content){ alert('内容不能为空'); return; }
  const r = await apiPost('/weibo',{user_id:state.user.user_id,content,media});
  if(r.ok && r.body && r.body.ok){
    // 将返回的微博追加到本地 feed（简单显示）
    state.feed.unshift({weibo_id:r.body.weibo_id,user_id:state.user.user_id,username:state.user.username,content,media,created_at:Date.now()});
    document.getElementById('weiboContent').value=''; document.getElementById('weiboMedia').value='';
    renderWeiboList();
  } else { alert('发布失败：'+(r.body?.error||r.error||r.status)); }
});

// tab 切换
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.form').forEach(f=>f.classList.remove('active'));
  t.classList.add('active');
  const tab = t.dataset.tab;
  if(tab==='login') document.getElementById('loginForm').classList.add('active');
  else document.getElementById('registerForm').classList.add('active');
}));

// init
setUser(state.user);
loadFeed();

