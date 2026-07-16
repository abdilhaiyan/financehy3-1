const ADMIN='along', IMG='images/';
const fbAvatar=u=>'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#4f46e5"/><text x="40" y="50" font-size="32" fill="#fff" text-anchor="middle" font-family="sans-serif">${(u||'?').slice(0,2).toUpperCase()}</text></svg>`);

function seed(){
  if(!localStorage.getItem('appUsers')){
    localStorage.setItem('appUsers',JSON.stringify([
      {username:'along',password:'along123',role:'admin',avatar:IMG+'along.png'},
      {username:'kakcik',password:'kakcik123',role:'user',avatar:IMG+'kakcik.png'},
      {username:'kaksu',password:'kaksu123',role:'user',avatar:IMG+'kaksu.png'},
      {username:'kakak',password:'kakak123',role:'user',avatar:IMG+'kakak.png'},
    ]));
  }
  const old=localStorage.getItem('transactions');
  if(old&&!localStorage.getItem('migrated')){
    const d=ud('along'); d.transactions=d.transactions.concat(JSON.parse(old)); saveUd('along',d);
    localStorage.setItem('migrated','1');
  }
}
function users(){return JSON.parse(localStorage.getItem('appUsers'))||[];}
function saveUsers(u){localStorage.setItem('appUsers',JSON.stringify(u));}
function ud(un){const k='ledger_'+un;let d=JSON.parse(localStorage.getItem(k));if(!d){d={accounts:[{id:1,name:'Main',color:'#4f46e5'}],transactions:[],recurring:[],budget:0};localStorage.setItem(k,JSON.stringify(d));}return d;}
function saveUd(un,d){localStorage.setItem('ledger_'+un,JSON.stringify(d));}
function comments(){return JSON.parse(localStorage.getItem('ledger_comments'))||[];}
function saveComments(c){localStorage.setItem('ledger_comments',JSON.stringify(c));}

let session=JSON.parse(localStorage.getItem('session'))||null;
let selectedMonth='all',selectedAccount='all',expenseChart=null,cur=null;

const $=id=>document.getElementById(id);
seed();

function initTheme(){const t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');setTheme(t);}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);$('theme-toggle').textContent=t==='dark'?'☀️':'🌙';}
$('theme-toggle').onclick=()=>setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');

// LOGIN
$('loginForm').addEventListener('submit',e=>{
  e.preventDefault();
  const u=$('loginUser').value.trim(),p=$('loginPass').value;
  const found=users().find(x=>x.username===u&&x.password===p);
  if(!found){$('loginErr').textContent='Invalid username or password';return;}
  session={username:found.username,role:found.role,avatar:found.avatar};
  localStorage.setItem('session',JSON.stringify(session));
  showApp();
});
function logout(){localStorage.removeItem('session');location.reload();}

function showApp(){
  $('loginOverlay').style.display='none';
  $('appUI').style.display='flex';
  $('mainUI').style.display='block';
  cur=session.username;
  const av=users().find(x=>x.username===cur).avatar;
  $('navAvatar').src=av; $('navAvatar').onerror=()=>{$('navAvatar').src=fbAvatar(cur);};
  $('navUser').textContent=cur;
  $('loginAvatar').src=av; $('loginAvatar').onerror=()=>{$('loginAvatar').src=fbAvatar(cur);};
  if(session.role==='admin')$('adminPanel').style.display='block';
  buildMenu();
  $('date').valueAsDate=new Date();
  $('budget-input').value=ud(cur).budget>0?ud(cur).budget:'';
  populateAccounts();populateMonths();renderAll();
}

function buildMenu(){
  let h=`
    <label>Change Username</label>
    <input id="chUser" value="${cur}">
    <label>Change Password</label>
    <input id="chPass" type="password" placeholder="new password">
    <button id="saveCred" class="mini-btn" style="margin-top:8px">Save Changes</button>
    <hr style="margin:14px 0;border-color:var(--border)">
    <button id="logoutBtn" class="mini-btn" style="background:var(--danger)">Logout</button>`;
  $('menuBody').innerHTML=h;
  $('saveCred').onclick=()=>{
    const nu=$('chUser').value.trim(),np=$('chPass').value;
    let u=users();const i=u.findIndex(x=>x.username===cur);
    if(u.some(x=>x.username===nu&&x.username!==cur)){alert('Username taken');return;}
    if(np)u[i].password=np;
    u[i].username=nu;saveUsers(u);
    if(localStorage.getItem('ledger_'+cur)){localStorage.setItem('ledger_'+nu,localStorage.getItem('ledger_'+cur));localStorage.removeItem('ledger_'+cur);}
    session.username=nu;localStorage.setItem('session',JSON.stringify(session));cur=nu;
    alert('Saved. Reloading...');location.reload();
  };
  $('logoutBtn').onclick=logout;
}
$('userMenuBtn').onclick=()=>$('userMenu').classList.toggle('hidden');
$('closeMenu').onclick=()=>$('userMenu').classList.add('hidden');

// ACCOUNTS / MONTHS
function populateAccounts(){const a=ud(cur).accounts;accountFilter.innerHTML='<option value="all">All Accounts</option>';a.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.name;accountFilter.appendChild(o);});accountFilter.value=selectedAccount;}
$('add-account').onclick=()=>{const n=prompt('Account name:');if(!n)return;const a=ud(cur).accounts;const cols=['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];a.push({id:Date.now(),name:n,color:cols[a.length%cols.length]});saveUd(cur,ud(cur));populateAccounts();};
accountFilter.onchange=()=>{selectedAccount=accountFilter.value;renderAll();};
function monthKey(d){return d.slice(0,7);}
function monthLabel(ym){const[y,m]=ym.split('-');return new Date(y,parseInt(m)-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});}
function populateMonths(){const set=new Set();getAll().forEach(t=>set.add(monthKey(t.date)));set.add(monthKey(new Date().toISOString().slice(0,10)));const s=[...set].sort().reverse();monthFilter.innerHTML='<option value="all">All Time</option>';s.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=monthLabel(m);monthFilter.appendChild(o);});monthFilter.value=selectedMonth;}
monthFilter.onchange=()=>{selectedMonth=monthFilter.value;renderAll();};

// RECURRING
function genOcc(r){const out=[];let d=new Date(r.startDate+'T00:00:00');const today=new Date();const end=r.endDate?new Date(r.endDate+'T00:00:00'):today;const lim=end>today?today:end;let g=0;while(d<=lim&&g<5000){g++;out.push({id:r.id+'_'+d.toISOString().slice(0,10),accountId:r.accountId,description:r.description,amount:r.amount,type:r.type,category:r.category,date:d.toISOString().slice(0,10),recurring:true});if(r.frequency==='daily')d.setDate(d.getDate()+1);else if(r.frequency==='weekly')d.setDate(d.getDate()+7);else d.setMonth(d.getMonth()+1);}return out;}
function getAll(){let l=[...ud(cur).transactions];ud(cur).recurring.forEach(r=>l.push(...genOcc(r)));return l;}
function getFiltered(){let l=getAll();if(selectedAccount!=='all')l=l.filter(t=>t.accountId==selectedAccount);if(selectedMonth!=='all')l=l.filter(t=>monthKey(t.date)===selectedMonth);return l;}

// FORM
function toggleCustomCat(){const c=$('category').value;$('customCategory').classList.toggle('hidden',c!=='Other');}
$('recurring-toggle').onchange=e=>$('recurring-fields').classList.toggle('hidden',!e.target.checked);
$('transaction-form').addEventListener('submit',e=>{
  e.preventDefault();
  const acc=selectedAccount==='all'?ud(cur).accounts[0].id:parseInt(selectedAccount);
  let cat=$('category').value; if(cat==='Other')cat=$('customCategory').value.trim()||'Other';
  const base={description:$('description').value.trim(),amount:parseFloat($('amount').value),type:$('type').value,category:cat,date:$('date').value,accountId:acc};
  const d=ud(cur);
  if($('recurring-toggle').checked){d.recurring.push({id:'r'+Date.now(),...base,frequency:$('frequency').value,startDate:base.date,endDate:$('recurring-end').value||null});}
  else{d.transactions.push({id:Date.now(),...base});}
  saveUd(cur,d);populateMonths();renderAll();e.target.reset();$('date').valueAsDate=new Date();$('recurring-fields').classList.add('hidden');$('customCategory').classList.add('hidden');
});
function deleteTransaction(id){const d=ud(cur);d.transactions=d.transactions.filter(t=>t.id!==id);saveUd(cur,d);populateMonths();renderAll();}
function deleteRecurring(id){const d=ud(cur);d.recurring=d.recurring.filter(r=>r.id!==id);saveUd(cur,d);renderAll();}
$('clear-all').onclick=()=>{if(confirm('Erase all your data?')){const d=ud(cur);d.transactions=[];d.recurring=[];saveUd(cur,d);populateMonths();renderAll();}};

// BUDGET
$('budget-input').oninput=()=>{const d=ud(cur);d.budget=parseFloat($('budget-input').value)||0;saveUd(cur,d);renderBudget(getFiltered());};
function renderBudget(f){const sp=f.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);$('budget-status').textContent=`$${sp.toFixed(2)} / $${ud(cur).budget.toFixed(2)}`;let pct=ud(cur).budget>0?(sp/ud(cur).budget)*100:0;const fill=$('budget-fill');fill.style.width=Math.min(pct,100)+'%';if(ud(cur).budget<=0){fill.style.background='var(--muted)';$('budget-msg').textContent='Set a budget to track spending';}else if(pct>100){fill.style.background='var(--danger)';$('budget-msg').textContent=`Over by $${(sp-ud(cur).budget).toFixed(2)}`;}else if(pct>=80){fill.style.background='#f59e0b';$('budget-msg').textContent=`${pct.toFixed(0)}% used`;}else{fill.style.background='var(--success)';$('budget-msg').textContent=`${(100-pct).toFixed(0)}% left`;}}

// RENDER
function renderAll(){const f=getFiltered();renderTable(f);renderSummary(f);renderBudget(f);renderChart(f);renderRecurring();renderComments();if(session.role==='admin')renderAdmin();}
function renderSummary(f){let inc=0,out=0;f.forEach(t=>t.type==='income'?inc+=t.amount:out+=t.amount);const net=inc-out;$('balance').textContent=`${net<0?'-':''}$${Math.abs(net).toFixed(2)}`;$('total-income').textContent=`$${inc.toFixed(2)}`;$('total-expense').textContent=`$${out.toFixed(2)}`;}
function renderTable(f){const tb=$('transaction-list');tb.innerHTML='';[...f].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(t=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${t.date}</td><td>${esc(t.description)}</td><td>${t.category}</td><td><span class="tag ${t.type}">${t.type}</span></td><td style="color:${t.type==='income'?'var(--success)':'var(--danger)'};font-weight:600">${t.type==='income'?'+':'-'}$${t.amount.toFixed(2)}</td><td><button class="del-row" onclick="deleteTransaction(${t.id})">✕</button></td>`;tb.appendChild(tr);});}
function renderRecurring(){const w=$('recurring-list');w.innerHTML='';const r=ud(cur).recurring;if(!r.length){w.innerHTML='<small style="color:var(--muted)">No recurring rules.</small>';return;}r.forEach(x=>{const d=document.createElement('div');d.className='rec-item';d.innerHTML=`<div><strong>${esc(x.description)}</strong><span class="meta"> · ${x.frequency} · ${x.type} · $${x.amount.toFixed(2)}</span></div><button class="rec-del" onclick="deleteRecurring('${x.id}')">Remove</button>`;w.appendChild(d);});}
function renderChart(f){const c=$('expense-chart');const ctx=c.getContext('2d');if(typeof Chart==='undefined'){ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#999';ctx.textAlign='center';ctx.fillText('Chart needs internet',c.width/2,c.height/2);return;}const cats={};f.forEach(t=>{if(t.type==='expense')cats[t.category]=(cats[t.category]||0)+t.amount;});const labels=Object.keys(cats),data=Object.values(cats);if(expenseChart)expenseChart.destroy();if(!labels.length){ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#999';ctx.textAlign='center';ctx.fillText('No spending yet',c.width/2,c.height/2);return;}expenseChart=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']}]},options:{responsive:true,plugins:{legend:{position:'bottom'}}}});}

// COMMENTS
$('postComment').onclick=()=>{const t=$('commentText').value.trim();if(!t)return;const c=comments();c.push({user:cur,text:t,date:new Date().toISOString().slice(0,10)});saveComments(c);$('commentText').value='';renderComments();if(session.role==='admin')renderAdmin();};
function renderComments(){const w=$('commentList');w.innerHTML='';comments().forEach(c=>{const d=document.createElement('div');d.className='c-item';d.innerHTML=`<div>${esc(c.text)}</div><div class="c-meta">${c.user} · ${c.date}</div>`;w.appendChild(d);});}

// ADMIN
function renderAdmin(){
  const u=users();$('userList').innerHTML=u.map(x=>`<div class="rec-item"><div><strong>${x.username}</strong><span class="meta"> · ${x.role}</span></div></div>`).join('');
  const c=comments();$('userList').innerHTML+=c.map(x=>`<div class="c-item"><div>${esc(x.text)}</div><div class="c-meta">${x.user} · ${x.date}</div></div>`).join('');
  const ai=JSON.parse(localStorage.getItem('ai_config')||'{}');$('aiKey').value=ai.key||'';$('aiUrl').value=ai.url||'https://api.openai.com/v1/chat/completions';$('aiModel').value=ai.model||'gpt-4o-mini';
}
$('addUserBtn').onclick=()=>{const nu=$('newUser').value.trim(),np=$('newPass').value;if(!nu||!np){alert('Fill both');return;}let u=users();if(u.some(x=>x.username===nu)){alert('Exists');return;}u.push({username:nu,password:np,role:'user',avatar:IMG+nu+'.png'});saveUsers(u);$('newUser').value='';$('newPass').value='';renderAdmin();};
$('saveAi').onclick=()=>{localStorage.setItem('ai_config',JSON.stringify({key:$('aiKey').value,url:$('aiUrl').value,model:$('aiModel').value}));alert('AI config saved');};
$('askAi').onclick=async()=>{const ai=JSON.parse(localStorage.getItem('ai_config')||'{}');if(!ai.key){alert('Set API key first');return;}const f=getAll();const ctx=f.map(t=>`${t.date} ${t.type} ${t.category} ${t.description} $${t.amount}`).join('\n');$('aiReply').textContent='Thinking...';try{const r=await fetch(ai.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,messages:[{role:'system',content:'You are a personal finance assistant.'},{role:'user',content:$('aiPrompt').value+'\n\nUser transactions:\n'+ctx}]})});const j=await r.json();$('aiReply').textContent=j.choices?.[0]?.message?.content||JSON.stringify(j);}catch(e){$('aiReply').textContent='Error: '+e.message;}};

// CSV
$('export-csv').onclick=()=>{const d=ud(cur).transactions;if(!d.length)return alert('Nothing to export');const head='id,date,description,category,type,amount,accountId';const rows=d.map(t=>[t.id,t.date,`"${t.description.replace(/"/g,'""')}"`,t.category,t.type,t.amount,t.accountId].join(','));const b=new Blob([head+'\n'+rows.join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ledger.csv';a.click();URL.revokeObjectURL(a.href);};
$('import-csv-btn').onclick=()=>$('import-csv').click();
$('import-csv').onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=ev=>{const lines=ev.target.result.split('\n').filter(l=>l.trim());let n=0;const d=ud(cur);const append=$('append-mode').checked;let maxId=d.transactions.reduce((m,t)=>Math.max(m,typeof t.id==='number'?t.id:0),0);for(let i=1;i<lines.length;i++){const c=parseLine(lines[i]);if(c.length<6)continue;const row={id:parseInt(c[0])||Date.now()+n,date:c[1],description:c[2].replace(/""/g,'"'),category:c[3],type:c[4],amount:parseFloat(c[5]),accountId:parseInt(c[6])||d.accounts[0].id};if(append){const dup=d.transactions.some(t=>t.date===row.date&&t.description===row.description&&t.amount===row.amount&&t.type===row.type);if(dup)continue;row.id=++maxId;}d.transactions.push(row);n++;}saveUd(cur,d);populateMonths();renderAll();alert(`Imported ${n} rows.`);};rd.readAsText(f);e.target.value='';};
function parseLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(q){if(ch==='"'){if(line[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}else{if(ch==='"')q=true;else if(ch===','){out.push(cur);cur='';}else cur+=ch;}}out.push(cur);return out;}

function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

// BOOT
initTheme();
if(session)showApp();
