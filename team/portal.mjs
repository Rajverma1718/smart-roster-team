import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, runTransaction, serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

const app = initializeApp({apiKey:'AIzaSyAYriou8WAcapMaHL7XAsBtSAmXtnsQh6U',authDomain:'raj-smart-roster.firebaseapp.com',projectId:'raj-smart-roster',appId:'1:113783855089:web:2a94f402c79427cf5d5650'});
const auth = getAuth(app);
const db = getFirestore(app);
const roster = doc(db,'workspaces','personal');
const members = collection(db,'teamMembers');
const notice = document.querySelector('#notice');
const portal = document.querySelector('#portal');
const sections = document.querySelector('#sections');
const login = document.querySelector('#login');
const logout = document.querySelector('#logout');
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const table = (headers,rows) => '<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th>'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+escape(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const records = async ref => (await getDocs(ref)).docs.map(d=>({id:d.id,...d.data()}));
const today = () => new Date().toLocaleDateString('en-CA');
const dateField = name => '<label>'+name+'<input name="'+name+'" type="date" required></label>';

async function safely(action) {
  try { await action(); }
  catch (error) { notice.textContent = error.message; }
}
login.onclick = () => safely(()=>signInWithPopup(auth,new GoogleAuthProvider()));
logout.onclick = () => safely(()=>signOut(auth));

function form(id, handler) {
  const element = document.getElementById(id);
  element.onsubmit = event => {
    event.preventDefault();
    const button = element.querySelector('button');
    button.disabled = true;
    safely(async ()=>{
      try {
        await handler(Object.fromEntries(new FormData(element)));
        await render(auth.currentUser);
        notice.textContent = 'Saved.';
      } finally { button.disabled = false; }
    });
  };
}

async function employee(user) {
  const member = doc(members,user.email);
  const snapshot = await getDoc(member);
  if (!snapshot.exists()) throw Error('Ask your manager to add your Google email to the team.');
  const [tasks,leave,schedules] = await Promise.all(['tasks','leave','schedules'].map(key=>records(collection(member,key))));
  const alerts = [...tasks.map(t=>'Task: '+t.title+' (due '+t.due+')'),...leave.filter(r=>r.status!=='Pending').map(r=>'Leave for '+r.date+': '+r.status)];
  portal.innerHTML = '<h2>'+escape(snapshot.data().name)+'</h2><h3>Notifications</h3>'+
    (alerts.length?'<ul>'+alerts.map(a=>'<li>'+escape(a)+'</li>').join('')+'</ul>':'<p>No notifications yet.</p>')+
    '<h3>My schedule</h3>'+table(['Date','Status','Work'],schedules.sort((a,b)=>a.id.localeCompare(b.id)).flatMap(s=>s.days.map(d=>[d.date,d.status,d.work])))+
    '<h3>My tasks</h3>'+table(['Task','Deadline','Status'],tasks.map(t=>[t.title,t.due,t.status]))+
    '<form id="task"><label>Task<select name="id" required>'+tasks.filter(t=>t.status!=='Done').map(t=>'<option value="'+escape(t.id)+'">'+escape(t.title)+'</option>').join('')+'</select></label><label>Status<select name="status"><option>In progress</option><option>Done</option></select></label><button '+(tasks.some(t=>t.status!=='Done')?'':'disabled')+'>Update task</button></form>'+
    '<h3>Leave requests</h3>'+table(['Date','Reason','Status'],leave.map(r=>[r.date,r.reason,r.status]))+
    '<form id="leave">'+dateField('Date')+'<label>Reason<input name="reason" required maxlength="500"></label><button>Apply for leave</button></form>';
  form('task',d=>updateDoc(doc(member,'tasks',d.id),{status:d.status}));
  form('leave',d=>setDoc(doc(member,'leave',d.Date),{date:d.Date,reason:d.reason.trim(),status:'Pending',createdAt:serverTimestamp()}));
}

async function admin(snapshot,user) {
  const state = JSON.parse(snapshot.data().payload);
  const people = await records(members);
  const emails = people.map(p=>'<option value="'+escape(p.id)+'">'+escape(p.name)+'</option>').join('');
  const data = await Promise.all(people.map(async p=>{
    const ref = doc(members,p.id);
    const [tasks,leave] = await Promise.all(['tasks','leave'].map(key=>records(collection(ref,key))));
    return {p,tasks,leave};
  }));
  const month = today().slice(0,7);
  const day = daily(state,today(),state.plans[month]?.locks?.[today()]);
  const requestedMonth = new URLSearchParams(location.search).get('month');
  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth ?? '') ? requestedMonth : month;
  const pending = data.flatMap(({p,leave})=>leave.filter(r=>r.status==='Pending').map(r=>({p,r})));
  portal.innerHTML = '<h2>Manager dashboard</h2>'+table(['Working today','On leave today','Open tasks'],[[Object.values(day.status).filter(s=>s==='work').length,Object.values(day.status).filter(s=>s==='leave').length,data.flatMap(x=>x.tasks).filter(t=>t.status!=='Done').length]])+
    '<h3>Employee access</h3><form id="invite"><label>Employee<select name="id">'+state.employees.map(e=>'<option value="'+escape(e.id)+'">'+escape(e.name)+'</option>').join('')+'</select></label><label>Google email<input name="email" type="email" required></label><button>Add employee login</button></form>'+
    '<h3>Publish individual schedules</h3><form id="publish"><label>Month<input name="month" type="month" value="'+selectedMonth+'" required></label><button>Publish schedules</button></form>'+
    '<h3>Assign a task</h3><form id="assign"><label>Employee<select name="email" required>'+emails+'</select></label><label>Task<input name="title" maxlength="160" required></label>'+dateField('Deadline')+'<button '+(people.length?'':'disabled')+'>Assign task</button></form>'+
    '<h3>Pending leave requests</h3>'+table(['Employee','Date','Reason'],pending.map(({p,r})=>[p.name,r.date,r.reason]))+
    (pending.length?'<form id="decide"><label>Request<select name="index">'+pending.map(({p,r},i)=>'<option value="'+i+'">'+escape(p.name+' / '+r.date)+'</option>').join('')+'</select></label><label>Decision<select name="status"><option>Approved</option><option>Rejected</option></select></label><button>Save decision</button></form>':'<p>No pending requests.</p>')+
    '<h3>Reports</h3><p>Schedule totals describe planned work, without clock-in data.</p><form id="report"><label>Month<input name="month" type="month" value="'+selectedMonth+'" required></label><button>View report</button></form><div id="summary"></div>';
  form('invite',async d=>{
    if(people.some(p=>p.employeeId===d.id)) throw Error('This employee already has a login.');
    const person = state.employees.find(e=>e.id===d.id);
    const target = doc(members,d.email.trim());
    await runTransaction(db,async tx=>{
      if((await tx.get(target)).exists()) throw Error('That email is already registered.');
      tx.set(target,{employeeId:person.id,name:person.name});
    });
  });
  form('assign',d=>addDoc(collection(doc(members,d.email),'tasks'),{title:d.title.trim(),due:d.Deadline,status:'To do',createdAt:serverTimestamp()}));
  form('publish',async d=>{
    const plan = state.plans[d.month];
    if(!plan?.published) throw Error('Finalise that month in the admin roster first.');
    const days = generate(state,d.month,plan);
    await runTransaction(db,async tx=>{
      const latest = await tx.get(roster);
      if(latest.data().revision!==snapshot.data().revision) throw Error('The roster changed. Refresh before publishing.');
      for(const p of people){
        const personalDays = Object.entries(days).map(([date,result])=>({
          date,status:labels[result.status[p.employeeId]] || 'Unavailable',
          work:result.needs.filter(n=>n.staff.includes(p.employeeId)).map(n=>[n.rule.slot,state.brands.find(b=>b.id===n.rule.brand)?.name,state.processes.find(b=>b.id===n.rule.process)?.name].join(' ')).join(', ')
        }));
        tx.set(doc(members,p.id,'schedules',d.month),{days:personalDays});
      }
    });
  });
  if(pending.length) form('decide',async d=>{
    const {p,r} = pending[Number(d.index)];
    const request = doc(members,p.id,'leave',r.id);
    await runTransaction(db,async tx=>{
      const current = await tx.get(request);
      if(current.data()?.status!=='Pending') throw Error('This request has already been decided.');
      if(d.status==='Approved'){
        const base = (await tx.get(roster)).data();
        const next = JSON.parse(base.payload);
        next.exceptions[r.date] ??= {};
        next.exceptions[r.date][p.employeeId] = 'leave';
        const plan = next.plans[r.date.slice(0,7)];
        if(plan) plan.published = false;
        tx.update(roster,{payload:JSON.stringify(next),revision:base.revision+1,updatedAt:serverTimestamp(),updatedBy:user.uid});
        for(const person of people) tx.delete(doc(members,person.id,'schedules',r.date.slice(0,7)));
      }
      tx.update(request,{status:d.status,decidedAt:serverTimestamp()});
    });
  });
  document.querySelector('#report').onsubmit = event=>{
    event.preventDefault();
    const period = new FormData(event.currentTarget).get('month');
    const plan = state.plans[period];
    const days = plan ? Object.values(generate(state,period,plan)) : [];
    document.querySelector('#summary').innerHTML = (plan?'':'<p>No roster exists for this month.</p>')+table(['Employee','Scheduled work days','Roster leave days','Tasks due','Tasks done'],data.map(({p,tasks})=>{
      const due = tasks.filter(t=>t.due.startsWith(period));
      return [p.name,days.filter(d=>d.status[p.employeeId]==='work').length,days.filter(d=>d.status[p.employeeId]==='leave').length,due.length,due.filter(t=>t.status==='Done').length];
    }));
  };
}

let session = 0;
async function render(user) {
  const stamp = ++session;
  portal.hidden = true;
  sections.hidden = true;
  login.hidden = Boolean(user);
  logout.hidden = !user;
  if (!user) { portal.replaceChildren(); notice.textContent = 'Sign in to view your workspace.'; return; }
  notice.textContent = 'Loading.';
  let snapshot;
  try { snapshot = await getDoc(roster); }
  catch (error) { if(error.code!=='permission-denied') throw error; }
  if(stamp!==session) return;
  if(snapshot?.exists()) await admin(snapshot,user);
  else await employee(user);
  if(stamp!==session) return;
  organiseSections(Boolean(snapshot?.exists()));
  portal.hidden = false;
  sections.hidden = false;
  notice.textContent = '';
}
function organiseSections(isManager) {
  const cards = [];
  for (const node of [...portal.children]) {
    if (node.matches('h2,h3')) {
      const card = document.createElement('section');
      card.className = 'team-card';
      card.id = node.textContent.toLowerCase().replace(/[^a-z0-9]+/g,'-');
      if (node.matches('h2') || /schedule|reports/i.test(node.textContent)) card.classList.add('wide');
      portal.append(card);
      cards.push({card,title:node.textContent});
    }
    cards.at(-1)?.card.append(node);
  }
  sections.replaceChildren();
  if (isManager) {
    const link = document.createElement('a');
    link.href = '../personal/';
    link.textContent = '← Open Roster Planner';
    sections.append(link);
    const stats = cards[0]?.card.querySelector('.table-wrap');
    if (stats) {
      const metrics = document.createElement('div');
      metrics.className = 'team-metrics';
      const values = stats.querySelectorAll('td');
      stats.querySelectorAll('th').forEach((label,index)=>{
        const tile = document.createElement('article');
        const number = document.createElement('strong');
        number.textContent = values[index].textContent;
        tile.append(number,label.textContent);
        metrics.append(tile);
      });
      stats.replaceWith(metrics);
    }
  }
  for (const {card,title} of cards.slice(1)) {
    const link = document.createElement('a');
    link.href = '#'+card.id;
    link.textContent = title;
    sections.append(link);
  }
}

onAuthStateChanged(auth,user=>safely(()=>render(user)));
