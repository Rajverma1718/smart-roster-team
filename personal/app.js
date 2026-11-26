const STORAGE='raj-personal-roster-v1';
let state;
try { state=JSON.parse(localStorage.getItem(STORAGE)) || seed(); } catch { state=seed(); }
const byId=id=>document.getElementById(id);
const monthInput=byId('month'), panel=byId('panel'), dialog=byId('dialog');
const views=['Dashboard','Company','Pod','Brand','Process','Employee','Leave','Issues','Settings'];
const viewNames={Dashboard:'Home',Company:'Schedule',Pod:'Teams',Brand:'Clients',Process:'Work types',Employee:'People',Leave:'Time off',Issues:'Alerts',Settings:'Manage'};
let view='Dashboard', filter='', day='', message='';
monthInput.value=DEMO_MONTH;
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const name=(collection,id)=>state[collection].find(item=>item.id===id)?.name||'-';
const title=rule=>name('brands',rule.brand)+' / '+name('processes',rule.process);
let revision=null, saveQueue=Promise.resolve(), syncError='';
function persist(){
  const snapshot=JSON.stringify(state);
  if(window.CLOUD_REQUIRED){
    byId('cloudStatus').textContent='Saving...';
    saveQueue=saveQueue.then(()=>{if(syncError)throw Error(syncError);return window.cloudSave(snapshot);}).catch(error=>{syncError=error.message;byId('cloudStatus').textContent='Save failed';render();});
    return;
  }
  if(revision===null){
    localStorage.setItem(STORAGE,snapshot);
    return;
  }
  saveQueue=saveQueue.then(async ()=>{
    if(syncError)return;
    try {
      const response=await fetch('api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{"revision":'+revision+',"state":'+snapshot+'}',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error(response.status===409?'Someone updated this roster in another tab. Reload to get the saved roster.':'The roster could not be saved. Reload before making more edits.');
      revision=(await response.json()).revision;
    } catch(error){
      syncError=error.message||'The save failed. Reload to get the saved roster.';
      render();
    }
  });
}
function plan(){return state.plans[monthInput.value];}
function savePlan(){
  if(!monthInput.value){message='Choose a valid month.';render();return;}
  const p=plan()||{locks:{},days:{}};
  p.days=generate(state,monthInput.value,p);
  p.published=false;
  state.plans[monthInput.value]=p;
  persist();
}
function refresh(date){
  for(const p of Object.values(state.plans)){
    const dates=date?(p.days[date]?[date]:[]):Object.keys(p.days);
    for(const key of dates)p.days[key]=daily(state,key,p.locks[key],prior(p.days[key]));
    if(dates.length)p.published=false;
  }
  persist();
}
function prior(result){return Object.fromEntries(result.needs.map(n=>[n.rule.id,n.staff]));}
const option=(id,label,selected)=>'<option value="'+esc(id)+'"'+(String(id)===String(selected)?' selected':'')+'>'+esc(label)+'</option>';
const options=(all,selected)=>all.map(x=>option(x.id,x.name,selected)).join('');
const select=(key,label,all,value)=>'<label>'+label+'<select name="'+key+'">'+options(all,value)+'</select></label>';
const field=(key,label,value='',type='text',attributes='')=>'<label>'+label+'<input required name="'+key+'" type="'+type+'" value="'+esc(value)+'" '+attributes+'></label>';
const btn=(act,label,id='',extra='')=>'<button type="button" data-act="'+act+'" data-id="'+esc(id)+'" data-extra="'+esc(extra)+'">'+esc(label)+'</button>';
const pill=(label,style='')=>'<span class="pill '+style+'">'+esc(label)+'</span>';
function table(head,rows,cls=''){
  return '<div class="scroll"><table class="'+cls+'"><thead><tr>'+head.map(h=>'<th scope="col">'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map((x,i)=>i===0&&cls==='grid'?'<th scope="row" style="top:auto">'+x+'</th>':'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
}
function render(){
  const p=plan(), dates=Object.keys(p?.days||{});
  if(!dates.includes(day))day=dates[0]||'';
  const issues=dates.flatMap(date=>['conflicts','warnings'].flatMap(kind=>p.days[date][kind].map(error=>({...error,date,kind}))));
  const gaps=issues.filter(x=>x.kind==='conflicts').length;
  byId('notice').textContent=syncError||message;
  byId('generate').disabled=!monthInput.value||Boolean(syncError);
  byId('publish').disabled=!p||gaps>0||p.published||Boolean(syncError);
  byId('stats').innerHTML=[['Employees',state.employees.length],['Clients',state.brands.length],['Problems to fix',p?gaps:'-'],['Roster',p?(p.published?'Published':'Draft'):'Not generated']].map(([label,value])=>'<div class="card"><strong>'+value+'</strong><span>'+label+'</span></div>').join('');
  byId('nav').innerHTML=views.map(label=>'<button type="button" data-view="'+label+'" aria-current="'+(view===label)+'">'+viewNames[label]+'</button>').join('');
  if(view==='Settings'){settings();return;}
  if(view==='Leave'){leaveView();return;}
  if(view==='Dashboard'){dashboard();return;}
  if(!p){panel.innerHTML='<h2>'+view+'</h2><p>Choose a month and generate a roster.</p>';return;}
  if(view==='Issues'){showIssues(issues);return;}
  const key={Pod:'pods',Brand:'brands',Process:'processes',Employee:'employees'}[view];
  const pool=key?state[key]:[];
  if(key&&!pool.some(x=>x.id===filter))filter=pool[0]?.id||'';
  const chosen=pool.find(x=>x.id===filter);
  const pick=key?'<label>'+viewNames[view]+'<select id="filter">'+options(pool,filter)+'</select></label>':'';
  const calendar=dates.map(x=>option(x,x,day)).join('');
  const demo='';
  let markup='<h2>'+viewNames[view]+'</h2><div class="filters">'+pick+'<label>View date<select id="day">'+calendar+'</select></label>'+demo+'</div>';
  if(view==='Pod'&&chosen)markup+='<p>Team leader - '+esc(name('employees',chosen.lead))+'</p>';
  const relevant=n=>view==='Brand'?n.rule.brand===filter:view==='Process'?n.rule.process===filter:view==='Pod'?state.brands.some(b=>b.id===n.rule.brand&&b.pod===filter):view==='Employee'?state.assignments.some(a=>a.rule===n.rule.id&&a.employee===filter):true;
  if(view==='Brand'||view==='Process'){
    const rows=p.days[day].needs.filter(relevant).map(n=>[
      esc(title(n.rule)),esc(n.rule.slot),n.required?pill(n.staff.length+'/'+n.required,n.staff.length>=n.required?'ok':'bad'):pill('Closed'),
      esc(n.staff.map(id=>name('employees',id)).join(', ')||'-'),
      esc(state.assignments.filter(a=>a.rule===n.rule.id).map(a=>name('employees',a.employee)+(a.backup?' (backup)':'')).join(', ')||'-'),
      btn('staff','Choose people',n.rule.id,day)]);
    markup+=table(['Brand / process','Window','Coverage','Working','Assigned',''],rows);
    markup+='<h3 style="margin-top:17px">Monthly coverage</h3>'+table(['Brand / process',...dates.map(d=>d.slice(-2))],p.days[day].needs.filter(relevant).map(n=>[esc(title(n.rule)),...dates.map(d=>{
      const x=p.days[d].needs.find(row=>row.rule.id===n.rule.id);
      return x.required?pill(x.staff.length+'/'+x.required,x.staff.length>=x.required?'ok':'bad'):pill('-');
    })]),'grid');
  }else{
    const people=state.employees.filter(e=>view==='Employee'?e.id===filter:view==='Pod'?e.pod===filter:true);
    const short={work:'W',idle:'A',off:'O',holiday:'H',leave:'L',comp:'C',unavailable:'U'};
    markup+='<div class="legend">'+Object.entries(short).map(([key,val])=>pill(val+' - '+labels[key],key)).join('')+'</div>';
    markup+=table(['Employee',...dates.map(d=>d.slice(-2))],people.map(e=>[esc(e.name),...dates.map(d=>{
      const s=p.days[d].status[e.id];
      return '<button type="button" class="pill '+s+'" data-act="change" data-id="'+esc(e.id)+'" data-extra="'+d+'" aria-label="'+esc(e.name+' '+d+' '+labels[s])+'">'+short[s]+'</button>';
    })]),'grid');
    markup+='<h3 style="margin-top:17px">Staffing on '+day+'</h3>'+table(['Employee','Status','Scheduled work'],people.map(e=>[esc(e.name),pill(labels[p.days[day].status[e.id]],p.days[day].status[e.id]),esc(p.days[day].needs.filter(n=>n.staff.includes(e.id)).map(n=>n.rule.slot+' '+title(n.rule)).join(' - ')||'-')]));
  }
  panel.innerHTML=markup;
}
function showIssues(issues){
  panel.innerHTML='<h2>Alerts</h2><p>Fix staffing problems before finalising. A preferred day off is a request you can review.</p>'+
  (issues.length?table(['Date','Brand / process','Severity','Details','Action'],issues.map(x=>{
    const rule=state.rules.find(r=>r.id===x.rule);
    return [x.date,esc(title(rule)),x.kind==='conflicts'?pill('Blocking','bad'):pill('Preference','warn'),'<div class="details">'+esc(x.text)+(x.backups?.length?'<br><strong>Free trained backup:</strong> '+esc(x.backups.map(id=>name('employees',id)).join(', ')):'')+'</div>',btn('staff','Fix staffing',x.rule,x.date)];
  })):'<p>No coverage or preference issues found.</p>');
}
const configs={
  employees:{label:'Employees',fields:['name','pod','off','preferred'],head:['Name','Team','Weekly off','Preferred day off']},
  pods:{label:'Teams',fields:['name','lead'],head:['Name','Team leader']},
  brands:{label:'Clients',fields:['name','pod'],head:['Name','Pod']},
  processes:{label:'Work types',fields:['name'],head:['Name']},
  rules:{label:'Operating rules',fields:['brand','process','mode','slot','min','days'],head:['Brand','Process','Calendar','Window','Minimum','Overrides']},
  assignments:{label:'Resource assignments',fields:['employee','rule','backup'],head:['Employee','Brand / process','Role']},
  holidays:{label:'Public holidays',fields:['date','name'],head:['Date','Name']}
};
const calendars=[{id:'always',name:'365 days'},{id:'holiday',name:'Public holidays off'},{id:'standard',name:'Sundays and public holidays off'}];
const dayOptions=DAYS.map((name,id)=>({name,id}));
const calendarName=id=>calendars.find(x=>x.id===id)?.name||id;
const ruleOptions=()=>state.rules.map(r=>({id:r.id,name:title(r)}));
const entries=key=>key==='holidays'?Object.entries(state.holidays).sort().map(([date,name])=>({date,name})):state[key];
function settings(){
  panel.innerHTML='<h2>Settings</h2><p>Edit staffing and operating rules. Changes recalculate existing drafts.</p>'+Object.entries(configs).map(([key,cfg])=>{
    const rows=entries(key).map((row,index)=>{
      const values=cfg.fields.map(f=>{
        const v=row[f];
        if(f==='pod'||f==='brand'||f==='process'||f==='employee'||f==='lead')return name({pod:'pods',brand:'brands',process:'processes',employee:'employees',lead:'employees'}[f],v);
        if(f==='off'||f==='preferred')return DAYS[v]||'None';
        if(f==='rule')return ruleOptions().find(r=>r.id===v)?.name||'-';
        if(f==='mode')return calendarName(v);
        if(f==='backup')return v?'Trained backup':'Primary';
        if(f==='days')return Object.entries(v).map(([d,n])=>DAYS[d]+' '+n).join(', ')||'-';
        return v;
      });
      return [...values.map(esc),btn('edit','Edit',key,index)+btn('remove','Remove',key,index)];
    });
    return '<section class="manage"><h3>'+cfg.label+'</h3><div class="filters">'+btn('edit','Add '+({employees:'employee',pods:'pod',brands:'brand',processes:'process',rules:'rule',assignments:'assignment',holidays:'holiday'}[key]),key)+'</div>'+table([...cfg.head,''],rows)+'</section>';
  }).join('');
}
function openForm(heading,body,submit,save='Save'){
  dialog.innerHTML='<h2>'+esc(heading)+'</h2><form>'+body+'<div class="error" role="alert"></div><div class="actions"><button class="primary" type="submit">'+esc(save)+'</button><button type="button" id="closeDialog">Cancel</button></div></form>';
  byId('closeDialog').onclick=()=>dialog.close();
  dialog.querySelector('form').onsubmit=event=>{
    event.preventDefault();
    try {submit(new FormData(event.currentTarget));dialog.close();render();}
    catch(error){dialog.querySelector('.error').textContent=error.message;}
  };
  dialog.showModal();
}
function edit(key,index){
  const old=index===''?{}:entries(key)[Number(index)];
  const body=configs[key].fields.map(f=>{
    const v=old[f];
    if(f==='name')return field(f,'Name',v,'text','maxlength="80"');
    if(f==='date')return field(f,'Date',v,'date');
    if(['pod','brand','process','employee','lead'].includes(f)){
      const list=state[{pod:'pods',brand:'brands',process:'processes',employee:'employees',lead:'employees'}[f]];
      return select(f,{pod:'Pod',brand:'Brand',process:'Process',employee:'Employee',lead:'Team leader'}[f],f==='lead'?[{id:'',name:'Select later'},...list]:list,v);
    }
    if(f==='off'||f==='preferred')return select(f,f==='off'?'Fixed weekly off':'Preferred extra day off',f==='off'?dayOptions:[{id:'',name:'None'},...dayOptions],v);
    if(f==='rule')return select(f,'Brand / process',ruleOptions(),v);
    if(f==='mode')return select(f,'Operating calendar',calendars,v??'standard');
    if(f==='slot')return select(f,'Work window',['AM','PM'].map(name=>({id:name,name})),v);
    if(f==='min')return field(f,'Default minimum staff',v??1,'number','min="1" max="100"');
    if(f==='days')return '<div><strong>Minimum by weekday</strong><p>Leave blank to use the default. Enter 0 to close an open day.</p><div class="filters">'+dayOptions.map(d=>'<label>'+d.name+'<input style="width:65px" name="d'+d.id+'" type="number" min="0" max="100" value="'+esc(v?.[d.id])+'"></label>').join('')+'</div></div>';
    return select(f,'Assignment type',[{id:'false',name:'Primary'},{id:'true',name:'Trained backup'}],Boolean(v));
  }).join('');
  openForm(configs[key].label,body,data=>{
    const row=Object.fromEntries(data);
    if('name' in row){row.name=row.name.trim();if(!row.name)throw Error('Enter a name.');}
    if(key==='holidays'){
      if(old.date!==row.date&&Object.hasOwn(state.holidays,row.date))throw Error('A holiday already exists on that date.');
      if(old.date)delete state.holidays[old.date];
      state.holidays[row.date]=row.name;refresh();message='Holiday saved. Existing rosters rechecked.';return;
    }
    for(const f of ['pod','brand','process','employee','rule'])if(configs[key].fields.includes(f)&&!row[f])throw Error('Create the related record first.');
    if(key==='employees'){row.off=Number(row.off);row.preferred=row.preferred===''?null:Number(row.preferred);}
    if(key==='rules'){
      if(state.rules.some(x=>x.id!==old.id&&x.brand===row.brand&&x.process===row.process))throw Error('This brand already has a rule for that process.');
      row.min=Number(row.min);row.days={};
      for(let i=0;i<7;i++){if(row['d'+i]!=='')row.days[i]=Number(row['d'+i]);delete row['d'+i];}
    }
    if(key==='assignments'){
      row.backup=row.backup==='true';
      if(state.assignments.some((x,i)=>i!==Number(index===''?-1:index)&&x.rule===row.rule&&x.employee===row.employee))throw Error('This employee is already assigned to that process.');
    }else row.id=old.id||crypto.randomUUID();
    if(index==='')state[key].push(row);else state[key][Number(index)]=row;
    refresh();message='Settings saved. Existing rosters rechecked.';
  });
}
function remove(key,index){
  const row=entries(key)[Number(index)];
  openForm('Remove record','<p>Remove '+esc(row.name||(row.rule?name('employees',row.employee)+' from '+ruleOptions().find(x=>x.id===row.rule)?.name:title(row)))+'?</p>',()=>{
    if(key==='pods'&&(state.employees.some(e=>e.pod===row.id)||state.brands.some(b=>b.pod===row.id)))throw Error('Move employees and brands to a different pod first.');
    if(key==='brands'&&state.rules.some(r=>r.brand===row.id)||key==='processes'&&state.rules.some(r=>r.process===row.id))throw Error('Remove the linked operating rules first.');
    if(key==='rules'&&state.assignments.some(a=>a.rule===row.id))throw Error('Remove the linked assignments first.');
    if(key==='employees'&&(state.assignments.some(a=>a.employee===row.id)||state.pods.some(p=>p.lead===row.id)))throw Error('Remove resource assignments and pod lead responsibilities first.');
    if(key==='holidays')delete state.holidays[row.date];
    else state[key].splice(Number(index),1);
    if(key==='employees')for(const records of Object.values(state.exceptions))delete records[row.id];
    if(key==='rules')for(const p of Object.values(state.plans))for(const locks of Object.values(p.locks))delete locks[row.id];
    refresh();message='Record removed. Existing rosters rechecked.';
  },'Remove');
}
function change(id,date,demo){
  const choice=state.exceptions[date]?.[id]||(demo?'leave':'');
  const values=[{id:'',name:'Use regular schedule'},{id:'leave',name:'Planned leave'},{id:'comp',name:'Approved comp-off'},{id:'unavailable',name:'Unavailable'},{id:'off',name:'Additional weekly off'}];
  openForm(name('employees',id)+' - '+date,(demo?'<p>Neha covers Apna Store. Apply leave and review the resulting coverage gap.</p>':'')+select('status','Availability override',values,choice),data=>{
    state.exceptions[date]??={};
    const status=data.get('status');
    if(status)state.exceptions[date][id]=status;else delete state.exceptions[date][id];
    refresh(date);message='Availability saved. Coverage rechecked for '+date+'.';
    if(demo)view='Issues';
  });
}
function staff(id,date){
  const n=plan().days[date].needs.find(x=>x.rule.id===id);
  const list=state.assignments.filter(a=>a.rule===id);
  const selected=plan().locks[date]?.[id]??n.staff;
  const body='<p>'+date+' - '+n.rule.slot+' - Minimum '+n.required+'</p><label>Scheduling mode<select name="mode">'+option('manual','Manual staffing',Object.hasOwn(plan().locks[date]||{},id)?'manual':'')+option('auto','Automatic staffing','')+'</select></label><fieldset><legend>People to schedule</legend>'+list.map(a=>{
    const e=state.employees.find(x=>x.id===a.employee);
    return '<label class="check"><input type="checkbox" name="staff" value="'+esc(e.id)+'" '+(selected.includes(e.id)?'checked':'')+'>'+esc(e.name+(a.backup?' (backup)':'')+(available(e,date,state)?' - '+labels[available(e,date,state)] :''))+'</label>';
  }).join('')+'</fieldset><p>Select the people who will cover this work. Availability and overlaps are checked when you save.</p>';
  openForm(title(n.rule),body,data=>{
    plan().locks[date]??={};
    if(data.get('mode')==='auto')delete plan().locks[date][id];else plan().locks[date][id]=data.getAll('staff');
    refresh(date);message='Staffing updated and validated for '+date+'.';
  });
}
byId('nav').onclick=event=>{const next=event.target.dataset.view;if(next){view=next;filter='';render();}};
panel.onchange=event=>{if(event.target.id==='filter')filter=event.target.value;else if(event.target.id==='day')day=event.target.value;else return;render();};
panel.onclick=event=>{
  const b=event.target.closest('[data-act]');if(!b||syncError)return;
  const {act,id,extra}=b.dataset;
  if(act==='addLeave')addLeave();
  if(act==='demo')change('e1',DEMO_DAY,true);
  if(act==='change')change(id,extra,false);
  if(act==='staff')staff(id,extra);
  if(act==='edit')edit(id,extra);
  if(act==='remove')remove(id,extra);
  if(act==='reset')openForm('Reset sample data','<p>This replaces your local edits and restores the fictional assessment dataset.</p>',()=>{state=seed();monthInput.value=DEMO_MONTH;day='';view='Company';savePlan();message='Sample data restored.';},'Reset');
};
byId('generate').onclick=()=>{savePlan();message='Roster generated for '+monthInput.value+'.';render();};
byId('publish').onclick=()=>{
  if(!plan()||Object.values(plan().days).some(d=>d.conflicts.length))return;
  plan().published=true;persist();message='Schedule finalised and saved.';render();
};
monthInput.onchange=()=>{message='';render();};
async function init(){
  if(!window.CLOUD_REQUIRED && (location.protocol==='http:'||location.protocol==='https:')){
    try {
      const response=await fetch('api/state',{cache:'no-store',signal:AbortSignal.timeout(2500)});
      if(response.ok&&response.headers.get('content-type')?.includes('application/json')){
        const saved=await response.json();
        if(saved.state&&Number.isInteger(saved.revision)){state=saved.state;revision=saved.revision;}
      }
    } catch { /* Static hosting and offline copies use browser storage. */ }
  }
  if(!plan()){
    const draft={locks:{},days:{}};
    draft.days=generate(state,monthInput.value,draft);
    draft.published=false;
    state.plans[monthInput.value]=draft;
  }
  render();
}
window.startRoster=init;
if(!window.CLOUD_REQUIRED)init();


function dashboard(){
  const p=plan();
  const dates=Object.keys(p?.days||{});
  if(!dates.length){panel.innerHTML='<h2>Welcome, Raj</h2><p>Choose a month and select Create schedule to begin.</p>';return;}
  const date=dates.includes(new Date().toLocaleDateString('en-CA'))?new Date().toLocaleDateString('en-CA'):dates[0];
  const result=p.days[date];
  const working=Object.values(result.status).filter(x=>x==='work').length;
  const away=Object.values(result.status).filter(x=>['leave','comp','unavailable','off'].includes(x)).length;
  panel.innerHTML='<div class="section-head"><div><h2>Your team at a glance</h2><p>'+date+' - '+(p.published?'Final schedule':'Schedule being prepared')+'</p></div>'+btn('addLeave','Record time off')+'</div><div class="overview"><article><strong>'+working+'</strong><span>Working</span></article><article><strong>'+away+'</strong><span>Off or away</span></article><article><strong>'+result.conflicts.length+'</strong><span>Staffing problems today</span></article></div><h3>Who is working?</h3>'+table(['Person','Team','Status','Scheduled work'],state.employees.map(e=>[esc(e.name),esc(name('pods',e.pod)),pill(labels[result.status[e.id]],result.status[e.id]),esc(result.needs.filter(n=>n.staff.includes(e.id)).map(n=>n.rule.slot+' - '+title(n.rule)).join(', ')||'No work assigned')]));
}
function leaveView(){
  const rows=Object.entries(state.exceptions).sort().flatMap(([date,people])=>Object.entries(people).map(([id,status])=>[date,esc(name('employees',id)),pill(labels[status],status),btn('change','Edit',id,date)]));
  panel.innerHTML='<div class="section-head"><div><h2>Time off</h2><p>Record approved leave, a comp-off, or an unavailable day.</p></div>'+btn('addLeave','Record time off')+'</div>'+(rows.length?table(['Date','Person','Type',''],rows):'<p>No time off recorded yet.</p>');
}
function addLeave(){
  openForm('Record time off',select('employee','Person',state.employees,'')+field('date','Date',day||monthInput.value+'-01','date')+select('status','Type',[{id:'leave',name:'Approved leave'},{id:'comp',name:'Comp-off'},{id:'unavailable',name:'Unavailable'},{id:'off',name:'Extra day off'}],'leave'),data=>{
    const date=data.get('date');
    state.exceptions[date]??={};
    state.exceptions[date][data.get('employee')]=data.get('status');
    refresh(date);
    message='Time off saved. The schedule has been checked again.';
  });
}

