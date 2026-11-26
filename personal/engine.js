const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DEMO_MONTH = '2026-12';
const DEMO_DAY = '2026-12-08';
const labels = {work:'Working',idle:'Available',off:'Weekly off',holiday:'Public holiday',leave:'Planned leave',comp:'Comp-off',unavailable:'Unavailable'};
const dateKey = (month, day) => month + '-' + String(day).padStart(2,'0');
const weekday = date => new Date(date + 'T12:00:00Z').getUTCDay();
function seed() {
  const names = ['Raj Verma','Neha Singh','Rajkumar','Priya Sharma','Amit Patel','Pooja Yadav','Rohit Tiwari','Anjali Gupta','Vikram Shah','Sneha Joshi','Rahul Nair','Kavya Rao','Arjun Mehta','Simran Kaur','Aditya Kumar'];
  const pods = ['Ganga','Yamuna','Narmada'].map((name,i)=>({id:'p'+i,name,lead:'e'+i*5}));
  const employees = names.map((name,i)=>({id:'e'+i,name,pod:'p'+Math.floor(i/5),off:i===11||i===13?6:0,preferred:null}));
  const brands = ['Bharat Bazaar','Apna Store','Sahyadri Foods','Nayi Disha','Desi Threads','Aangan Home','Udaan Mart','Surya Care','Ganga Organics','Navrang'].map((name,i)=>({id:'b'+i,name,pod:'p'+Math.min(2,Math.floor(i/4))}));
  const processes = ['Customer Support','Cart Follow-up','Delivery Follow-up','Customer Retention'].map((name,i)=>({id:'t'+i,name}));
  const rules=[],assignments=[];
  function add(brand,process,mode,slot,people,min=1) {
    const id='r'+rules.length;
    rules.push({id,brand:'b'+brand,process:'t'+process,mode,slot,min,days:{}});
    people.forEach(employee=>assignments.push({employee:'e'+employee,rule:id}));
  }
  for(let i=0;i<8;i++){
    add(i,0,'standard','AM',[i]);
    add(i,1,'standard','PM',[i]);
  }
  add(8,0,'always','AM',[8,11]);
  add(8,2,'holiday','PM',[11,8]);
  add(9,0,'always','AM',[9,13]);
  add(9,3,'standard','PM',[9,13]);
  add(9,2,'standard','PM',[10,12,14],2);
  assignments.push({employee:'e10',rule:'r2',backup:true},{employee:'e10',rule:'r3',backup:true});
  return {pods,brands,employees,processes,rules,assignments,holidays:{'2026-12-25':'Christmas'},exceptions:{},plans:{}};
}
function demand(rule,date,holiday) {
  const day=weekday(date);
  if(rule.mode==='standard' && day===0 || rule.mode!=='always' && holiday) return 0;
  return Object.hasOwn(rule.days,day)?rule.days[day]:rule.min;
}
function available(employee,date,state) {
  return state.exceptions[date]?.[employee.id] || (weekday(date)===employee.off?'off':null);
}
function daily(state,date,locks={},prior=null) {
  const holiday=state.holidays[date];
  const people=new Map(state.employees.map(e=>[e.id,e]));
  const status=Object.fromEntries(state.employees.map(e=>[e.id,available(e,date,state)||(holiday?'holiday':'idle')]));
  const needs=state.rules.map(rule=>({rule,required:demand(rule,date,holiday),staff:[]}));
  const conflicts=[];
  for(const window of ['AM','PM']){
    const tasks=[];
    const occupied=new Map();
    const current=needs.filter(item=>item.rule.slot===window);
    for(const item of current){
      const {rule,required,staff}=item;
      const linked=state.assignments.filter(a=>a.rule===rule.id && people.has(a.employee));
      const eligible=new Set(linked.map(a=>a.employee));
      const locked=Object.hasOwn(locks,rule.id);
      for(const id of locked?locks[rule.id]:[]){
        const reason=!required?'process closed':!eligible.has(id)?'employee is not assigned':available(people.get(id),date,state)?labels[available(people.get(id),date,state)]:occupied.has(id)?'overlapping '+window+' assignment':null;
        if(reason){conflicts.push({rule:rule.id,text:(people.get(id)?.name||id)+' cannot be scheduled: '+reason});continue;}
        staff.push(id);
        occupied.set(id,{fixed:true});
      }
      if(locked) continue;
      const candidates=linked.filter(a=>!a.backup && !available(people.get(a.employee),date,state)).map(a=>a.employee);
      candidates.sort((a,b)=> {
        const preference = id=>Number(people.get(id).preferred===weekday(date))*2-Number(prior?.[rule.id]?.includes(id));
        return preference(a)-preference(b);
      });
      for(let i=0;i<required;i++) tasks.push({item,candidates});
    }
    tasks.sort((a,b)=>a.candidates.length-b.candidates.length);
    function match(task,seen){
      for(const id of task.candidates){
        if(seen.has(id))continue;
        seen.add(id);
        const existing=occupied.get(id);
        if(existing?.fixed)continue;
        if(!existing || match(existing,seen)){occupied.set(id,task);return true;}
      }
      return false;
    }
    tasks.forEach(task=>match(task,new Set()));
    for(const [id,task] of occupied) if(!task.fixed) task.item.staff.push(id);
  }
  const warnings=[];
  for(const item of needs){
    const {rule,required,staff}=item;
    for(const id of staff){
      status[id]='work';
      if(people.get(id).preferred===weekday(date)) warnings.push({rule:rule.id,text:people.get(id).name+' is working on their preferred day off.'});
    }
    if(staff.length>=required)continue;
    const related=state.assignments.filter(a=>a.rule===rule.id);
    const details=related.map(a=>{
      const e=people.get(a.employee);
      if(!e)return '';
      const block=available(e,date,state);
      const booking=needs.find(n=>n.rule.slot===rule.slot && n.staff.includes(e.id));
      return e.name+' ('+(block?labels[block]:booking?'already booked in '+rule.slot:a.backup?'trained backup':'eligible')+')';
    }).filter(Boolean);
    const backups=related.filter(a=>a.backup && people.has(a.employee) && !available(people.get(a.employee),date,state) && !needs.some(n=>n.rule.slot===rule.slot && n.staff.includes(a.employee))).map(a=>a.employee);
    conflicts.push({rule:rule.id,backups,text:`${staff.length}/${required} staffed in ${rule.slot}. ${details.length?details.join(', '):'No employees assigned.'}`});
  }
  return {status,needs,conflicts,warnings};
}
function generate(state,month,plan){
  const [year,m]=month.split('-').map(Number);
  const count=new Date(Date.UTC(year,m,0)).getUTCDate();
  return Object.fromEntries(Array.from({length:count},(_,index)=>{
    const date=dateKey(month,index+1);
    const former=plan.days?.[date]?.needs;
    const previous=former&&Object.fromEntries(former.map(item=>[item.rule.id,item.staff]));
    return [date,daily(state,date,plan.locks[date],previous)];
  }));
}
if(typeof module!=='undefined')module.exports={seed,daily,generate,DEMO_DAY,DEMO_MONTH};


