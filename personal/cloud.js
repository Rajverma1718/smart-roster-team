import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {getFirestore,doc,getDoc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';
const app=initializeApp({apiKey:'AIzaSyAYriou8WAcapMaHL7XAsBtSAmXtnsQh6U',authDomain:'raj-smart-roster.firebaseapp.com',projectId:'raj-smart-roster',appId:'1:113783855089:web:2a94f402c79427cf5d5650'});
const auth=getAuth(app),db=getFirestore(app),record=doc(db,'workspaces','personal');
const gate=document.getElementById('login'),workspace=document.querySelector('main'),sync=document.getElementById('cloudStatus');
let version=0,pending=0,unsubscribe;
document.getElementById('signIn').onclick=async()=>{
  try {await signInWithPopup(auth,new GoogleAuthProvider());}
  catch(error){document.getElementById('loginError').textContent=error.message;}
};
document.getElementById('signOut').onclick=async()=>{await saveQueue;await signOut(auth);};
function unpack(payload){
  const value=JSON.parse(payload);
  for(const [month,p] of Object.entries(value.plans))p.days=generate(value,month,p);
  return value;
}
window.cloudSave=async snapshot=>{
  if(!auth.currentUser)throw Error('Please sign in again.');
  const packed=JSON.parse(snapshot);
  for(const p of Object.values(packed.plans))delete p.days;
  const payload=JSON.stringify(packed);
  if(new TextEncoder().encode(payload).length>800000)throw Error('Workspace storage limit reached. Export your data before adding more.');
  pending++;
  sync.textContent='Saving...';
  try{
    version=await runTransaction(db,async transaction=>{
      const current=await transaction.get(record);
      const actual=current.exists()?current.data().revision:0;
      if(actual!==version)throw Error('Another device changed the schedule. Reload to get the latest saved version.');
      const next=actual+1;
      transaction.set(record,{payload,revision:next,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});
      return next;
    });
    sync.textContent='Saved to Firebase';
  }finally{pending--;}
};
onAuthStateChanged(auth,async user=>{
  if(unsubscribe)unsubscribe();
  workspace.hidden=true;gate.hidden=false;
  document.getElementById('signOut').hidden=!user;
  if(!user){sync.textContent='Signed out';return;}
  if(!user.emailVerified){
    document.getElementById('loginError').textContent='Use a verified Google account.';return;
  }
  sync.textContent='Loading...';
  try{
    const current=await getDoc(record);
    version=current.exists()?current.data().revision:0;
    state=current.exists()?unpack(current.data().payload):seed();
    syncError='';
    await window.startRoster();
    gate.hidden=true;workspace.hidden=false;
    if(!current.exists())persist();
    unsubscribe=onSnapshot(record,snapshot=>{
      if(pending||snapshot.metadata.hasPendingWrites||!snapshot.exists())return;
      const data=snapshot.data();
      if(data.revision<=version)return;
      version=data.revision;state=unpack(data.payload);render();sync.textContent='Updated from Firebase';
    },error=>{syncError=error.message;render();});
    sync.textContent='Saved to Firebase';
  }catch(error){document.getElementById('loginError').textContent=error.message;sync.textContent='Connection error';}
});


