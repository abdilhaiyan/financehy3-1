const ADMIN='along', IMG='images/';
const API="https://script.google.com/macros/s/AKfycbyPI7tbOKIcjN54NQd1gj7pMA2l3uYuVDWdik9C6p1jVr6Ix4cuO4ECUlmLULRUAYmMjA/exec";
const fbAvatar=u=>'data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#4f46e5"/><text x="40" y="50" font-size="32" fill="#fff" text-anchor="middle" font-family="sans-serif">${(u||'?').slice(0,2).toUpperCase()}</text></svg>`);

let session=JSON.parse(localStorage.getItem('session'))||null;
let state={transactions:[],accounts:[{id:1,name:'Main',color:'#4f46e5'}],budget:0,feedback:[]};
let selectedMonth='all',selectedAccount='all',expenseChart=null,cur=null,role=null;
const $=id=>document.getElementById(id);

function initTheme(){const t=localStorage.getItem('theme')||(window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light');setTheme(t);}
function setTheme(t){document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);$('theme-toggle').textContent=t==='dark'?'☀️':'🌙';}
$('theme-toggle').onclick=()=>setTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');

async function api(payload){
  const r=await fetch(API,{method:"POST",mode:"cors",redirect:"follow",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({username:session.username,password:session.password,...payload})});
  return await r.json();
}

// LOGIN
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const u=$('loginUser').value.trim(),p=$('loginPass').value;
  const res=await fetch(API,{method:"POST",mode:"cors",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({action:"fetchLedger",username:u,password:p})});
  const data=await res.json();
  if(data.success){session={username:u,password:p};localStorage.setItem('session',JSON.stringify(session));cur=u;role=data.role;boot(data);}
  else{$('loginErr').textContent=data.error||'Invalid username or password';}
});
function logout(){localStorage.removeItem('session');location.reload();}

function boot(data){
  $('loginOverlay').style.display='none';$('appUI').style.display='flex';$('mainUI').style.display='block';
  const av=IMG+cur+'.png';
  $('navAvatar').src=av;$('navAvatar').onerror=()=>$('navAvatar').src=fbAvatar(cur);
  $('navUser').textContent=cur;$('loginAvatar').src=av;$('loginAvatar').onerror=()=>$('loginAvatar').src=fbAvatar(cur);
  if(role==='admin')$('adminPanel').style.display='block';
  state.accounts=data.accounts.length?data.accounts:[{id:1,name:'Main',color:'#4f46e5'}];
  state.transactions=data.transactions;state.feedback=data.feedback;state.budget=data.budget||0;
  buildMenu();$('date').valueAsDate=new Date();$('budget-input').value=state.budget>0?state.budget:'';
  populateAccounts();populateMonths();renderAll();
}

function buildMenu(){
  $('menuBody').innerHTML=`
    <label>Change Username</label><input id="chUser" value="${cur}">
    <label>Change Password</label><input id="chPass" type="password" placeholder="new password">
    <button id="saveCred" class="mini-btn" style="margin-top:8px">Save Changes</button>
    <hr style="margin:14px 0;border-color:var(--border)">
    <button id="logoutBtn" class="mini-btn" style="background:var(--danger)">Logout</button>`;
  $('saveCred').onclick=async()=>{
    const nu=$('chUser').value.trim(),np=$('chPass').value;
    if(!nu){alert('Username required');return;}
    const r=await api({action:"updateUser",fields:{username:cur,password:np||undefined}});
    if(r.success&&np){session.password=np;localStorage.setItem('session',JSON.stringify(session));}
    if(r.success&&nu!==cur){const r2=await api({action:"updateUser",fields:{username:cur}});/* username change needs admin or backend rename; simplified: alert */}
    alert('Saved (password updated). Reloading...');location.reload();
  };
  $('logoutBtn').onclick=logout;
}
$('userMenuBtn').onclick=()=>$('userMenu').classList.toggle('hidden');
$('closeMenu').onclick=()=>$('userMenu').classList.add('hidden');

// ACCOUNTS / MONTHS
function accName(id){const a=state.accounts.find(x=>String(x.id)===String(id));return a?a.name:'Main';}
function populateAccounts(){accountFilter.innerHTML='<option value="all">All Accounts</option>';state.accounts.forEach(x=>{const o=document.createElement('option');o.value=x.id;o.textContent=x.name;accountFilter.appendChild(o);});accountFilter.value=selectedAccount;}
$('add-account').onclick=async()=>{const n=prompt('Account name:');if(!n)return;const cols=['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];const color=cols[state.accounts.length%cols.length];const r=await api({action:"addAccount",fields:{name:n,color}});if(r.success){const d=await api({action:"fetchLedger"});state.accounts=d.accounts;populateAccounts();}};
accountFilter.onchange=()=>{selectedAccount=accountFilter.value;renderAll();};
function monthKey(d){return d.slice(0,7);}
function monthLabel(ym){const[y,m]=ym.split('-');return new Date(y,parseInt(m)-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});}
function populateMonths(){const set=new Set();getAll().forEach(t=>set.add(monthKey(t.date)));set.add(monthKey(new Date().toISOString().slice(0,10)));const s=[...set].sort().reverse();monthFilter.innerHTML='<option value="all">All Time</option>';s.forEach(m=>{const o=document.createElement('option');o.value=m;o.textContent=monthLabel(m);monthFilter.appendChild(o);});monthFilter.value=selectedMonth;}
monthFilter.onchange=()=>{selectedMonth=monthFilter.value;renderAll();};

// RECURRING (generate instances, push each)
function genOcc(r){const out=[];let d=new Date(r.startDate+'T00:00:00');const today=new Date();const end=r.endDate?new Date(r.endDate+'T00:00:00'):today;const lim=end>today?today:end;let g=0;while(d<=lim&&g<5000){g++;out.push({date:d.toISOString().slice(0,10),description:r.description,amount:r.amount,type:r.type,category:r.category,accountId:r.accountId});if(r.frequency==='daily')d.setDate(d.getDate()+1);else if(r.frequency==='weekly')d.setDate(d.getDate()+7);else d.setMonth(d.getMonth()+1);}return out;}
function getAll(){let l=[...state.transactions];return l;}
function getFiltered(){let l=getAll();if(selectedAccount!=='all')l=l.filter(t=>String(t.accountId)===String(selectedAccount));if(selectedMonth!=='all')l=l.filter(t=>monthKey(t.date)===selectedMonth);return l;}

// FORM
function toggleCustomCat(){const c=$('category').value;$('customCategory').classList.toggle('hidden',c!=='Other');}
$('recurring-toggle').onchange=e=>$('recurring-fields').classList.toggle('hidden',!e.target.checked);
$('transaction-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const acc=selectedAccount==='all'?state.accounts[0].id:parseInt(selectedAccount);
  let cat=$('category').value;if(cat==='Other')cat=$('customCategory').value.trim()||'Other';
  const base={description:$('description').value.trim(),amount:parseFloat($('amount').value),type:$('type').value,category:cat,date:$('date').value,accountId:acc,accountName:accName(acc)};
  if($('recurring-toggle').checked){
    const rule={...base,frequency:$('frequency').value,startDate:base.date,endDate:$('recurring-end').value||null};
    const occ=genOcc(rule);
    for(const o of occ){await api({action:"addTransaction",fields:o});}
  }else{await api({action:"addTransaction",fields:base});}
  const d=await api({action:"fetchLedger"});state.transactions=d.transactions;populateMonths();renderAll();e.target.reset();$('date').valueAsDate=new Date();$('recurring-fields').classList.add('hidden');$('customCategory').classList.add('hidden');
});
async function deleteTransaction(id){await api({action:"deleteTransaction",itemId:id});const d=await api({action:"fetchLedger"});state.transactions=d.transactions;populateMonths();renderAll();}
$('clear-all').onclick=async()=>{if(confirm('Erase all your data?')){for(const t of state.transactions)await api({action:"deleteTransaction",itemId:t.id});const d=await api({action:"fetchLedger"});state.transactions=d.transactions;populateMonths();renderAll();}};

// BUDGET
$('budget-input').oninput=async()=>{const b=parseFloat($('budget-input').value)||0;state.budget=b;await api({action:"updateMeta",fields:{budget:b}});renderBudget(getFiltered());};
function renderBudget(f){const sp=f.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);$('budget-status').textContent=`$${sp.toFixed(2)} / $${state.budget.toFixed(2)}`;let pct=state.budget>0?(sp/state.budget)*100:0;const fill=$('budget-fill');fill.style.width=Math.min(pct,100)+'%';if(state.budget<=0){fill.style.background='var(--muted)';$('budget-msg').textContent='Set a budget to track spending';}else if(pct>100){fill.style.background='var(--danger)';$('budget-msg').textContent=`Over by $${(sp-state.budget).toFixed(2)}`;}else if(pct>=80){fill.style.background='#f59e0b';$('budget-msg').textContent=`${pct.toFixed(0)}% used`;}else{fill.style.background='var(--success)';$('budget-msg').textContent=`${(100-pct).toFixed(0)}% left`;}}

// RENDER
function renderAll(){const f=getFiltered();renderTable(f);renderSummary(f);renderBudget(f);renderChart(f);renderRecurring();renderComments();if(role==='admin')renderAdmin();}
function renderSummary(f){let inc=0,out=0;f.forEach(t=>t.type==='income'?inc+=t.amount:out+=t.amount);const net=inc-out;$('balance').textContent=`${net<0?'-':''}$${Math.abs(net).toFixed(2)}`;$('total-income').textContent=`$${inc.toFixed(2)}`;$('total-expense').textContent=`$${out.toFixed(2)}`;}
function renderTable(f){const tb=$('transaction-list');tb.innerHTML='';[...f].sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach(t=>{const tr=document.createElement('tr');tr.innerHTML=`<td>${t.date}</td><td>${esc(t.description)}</td><td>${t.category}</td><td><span class="tag ${t.type}">${t.type}</span></td><td style="color:${t.type==='income'?'var(--success)':'var(--danger)'};font-weight:600">${t.type==='income'?'+':'-'}$${t.amount.toFixed(2)}</td><td><button class="del-row" onclick="deleteTransaction('${t.id}')">✕</button></td>`;tb.appendChild(tr);});}
function renderRecurring(){const w=$('recurring-list');w.innerHTML='<small style="color:var(--muted)">Recurring rules expand on save (no separate list).</small>';}
function renderChart(f){const c=$('expense-chart');const ctx=c.getContext('2d');if(typeof Chart==='undefined'){ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#999';ctx.textAlign='center';ctx.fillText('Chart needs internet',c.width/2,c.height/2);return;}const cats={};f.forEach(t=>{if(t.type==='expense')cats[t.category]=(cats[t.category]||0)+t.amount;});const labels=Object.keys(cats),data=Object.values(cats);if(expenseChart)expenseChart.destroy();if(!labels.length){ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#999';ctx.textAlign='center';ctx.fillText('No spending yet',c.width/2,c.height/2);return;}expenseChart=new Chart(ctx,{type:'doughnut',data:{labels,datasets:[{data,backgroundColor:['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4']}]},options:{responsive:true,plugins:{legend:{position:'bottom'}}}});}

// COMMENTS
$('postComment').onclick=async()=>{const t=$('commentText').value.trim();if(!t)return;await api({action:"addFeedback",fields:{text:t}});const d=await api({action:"fetchLedger"});state.feedback=d.feedback;renderComments();$('commentText').value='';};
function renderComments(){const w=$('commentList');w.innerHTML='';state.feedback.forEach(c=>{const d=document.createElement('div');d.className='c-item';d.innerHTML=`<div>${esc(c.comments||c.accountName||'')}</div><div class="c-meta">${cur} · ${c.date||''}</div>`;w.appendChild(d);});}

// ADMIN
function renderAdmin(){
  const u=[]; // listUsers not fetched here; show feedback
  $('userList').innerHTML=state.feedback.map(x=>`<div class="c-item"><div>${esc(x.comments||'')}</div><div class="c-meta">${x.username||cur}</div></div>`).join('');
  const ai=JSON.parse(localStorage.getItem('ai_config')||'{}');$('aiKey').value=ai.key||'';$('aiUrl').value=ai.url||'https://api.openai.com/v1/chat/completions';$('aiModel').value=ai.model||'gpt-4o-mini';
}
$('addUserBtn').onclick=async()=>{const nu=$('newUser').value.trim(),np=$('newPass').value;if(!nu||!np){alert('Fill both');return;}const r=await api({action:"addUser",fields:{username:nu,password:np,role:'user'}});if(r.success){alert('User added');$('newUser').value='';$('newPass').value='';}else alert(r.error||'Failed');};
$('saveAi').onclick=()=>{localStorage.setItem('ai_config',JSON.stringify({key:$('aiKey').value,url:$('aiUrl').value,model:$('aiModel').value}));alert('AI config saved');};
$('askAi').onclick=async()=>{const ai=JSON.parse(localStorage.getItem('ai_config')||'{}');if(!ai.key){alert('Set API key first');return;}const f=getAll();const ctx=f.map(t=>`${t.date} ${t.type} ${t.category} ${t.description} $${t.amount}`).join('\n');$('aiReply').textContent='Thinking...';try{const r=await fetch(ai.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ai.key},body:JSON.stringify({model:ai.model,messages:[{role:'system',content:'You are a personal finance assistant.'},{role:'user',content:$('aiPrompt').value+'\n\nUser transactions:\n'+ctx}]})});const j=await r.json();$('aiReply').textContent=j.choices?.[0]?.message?.content||JSON.stringify(j);}catch(e){$('aiReply').textContent='Error: '+e.message;}};

// CSV
$('export-csv').onclick=()=>{if(!state.transactions.length)return alert('Nothing to export');const head='id,date,description,category,type,amount,accountId';const rows=state.transactions.map(t=>[t.id,t.date,`"${t.description.replace(/"/g,'""')}"`,t.category,t.type,t.amount,t.accountId].join(','));const b=new Blob([head+'\n'+rows.join('\n')],{type:'text/csv'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ledger.csv';a.click();URL.revokeObjectURL(a.href);};
$('import-csv-btn').onclick=()=>$('import-csv').click();
$('import-csv').onchange=async e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=async ev=>{const lines=ev.target.result.split('\n').filter(l=>l.trim());let n=0;const append=$('append-mode').checked;for(let i=1;i<lines.length;i++){const c=parseLine(lines[i]);if(c.length<6)continue;const row={date:c[1],description:c[2].replace(/""/g,'"'),category:c[3],type:c[4],amount:parseFloat(c[5]),accountId:parseInt(c[6])||state.accounts[0].id};if(append){const dup=state.transactions.some(t=>t.date===row.date&&t.description===row.description&&t.amount===row.amount&&t.type===row.type);if(dup)continue;}await api({action:"addTransaction",fields:row});n++;}const d=await api({action:"fetchLedger"});state.transactions=d.transactions;populateMonths();renderAll();alert(`Imported ${n} rows.`);};rd.readAsText(f);e.target.value='';};
function parseLine(line){const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(q){if(ch==='"'){if(line[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}else{if(ch==='"')q=true;else if(ch===','){out.push(cur);cur='';}else cur+=ch;}}out.push(cur);return out;}

function esc(t){const d=document.createElement('div');d.textContent=t;return d.innerHTML;}

// BOOT
initTheme();
if(session){api({action:"fetchLedger"}).then(d=>{if(d.success){cur=session.username;role=d.role;boot(d);}else{localStorage.removeItem('session');}});}
