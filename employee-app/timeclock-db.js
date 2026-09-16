(function(){
  const USERS={
    'yessicabrooks24@gmail.com':{name:'Yessica Brooks'},
    'ceo@riversideluxeretreats.com':{name:'Philip Brooks'}
  };
  let openShift=null;
  function fmt(iso){return iso?new Date(iso).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';}
  function render(shift,last){
    openShift=shift||null;
    const active=!!shift;
    const status=document.getElementById('clockStatus'),sub=document.getElementById('clockSub'),dot=document.getElementById('clockDot'),inBtn=document.getElementById('clockIn'),outBtn=document.getElementById('clockOut'),stat=document.getElementById('statClock'),statSmall=document.getElementById('statClockSmall');
    if(!status)return;
    status.textContent=active?'Clocked in':'Not clocked in';
    sub.textContent=active?'Since '+fmt(shift.clock_in):(last?.clock_out?'Last clock out: '+fmt(last.clock_out):'Tap Clock In when your work shift begins.');
    dot.classList.toggle('in',active);inBtn.disabled=active;outBtn.disabled=!active;stat.textContent=active?'On shift':'Off shift';statSmall.textContent=active?'Since '+fmt(shift.clock_in):'Not clocked in';
  }
  async function refresh(){
    const {data:{user}}=await sb.auth.getUser();if(!user)return;
    const {data,error}=await sb.from('time_entries').select('*').eq('user_id',user.id).order('clock_in',{ascending:false}).limit(20);
    if(error){document.getElementById('clockMsg').textContent='Timesheet connection error: '+error.message;return;}
    const open=(data||[]).find(x=>!x.clock_out);render(open,(data||[])[0]);
  }
  async function clockIn(){
    const msg=document.getElementById('clockMsg');const {data:{user}}=await sb.auth.getUser();if(!user)return;
    const email=(user.email||'').toLowerCase(),profile=USERS[email];if(!profile)return;
    document.getElementById('clockIn').disabled=true;msg.textContent='Clocking you in...';
    const {data,error}=await sb.from('time_entries').insert({user_id:user.id,employee_email:email,employee_name:profile.name,status:'clocked_in'}).select().single();
    if(error){msg.textContent='Could not clock in: '+error.message;await refresh();return;}
    render(data,data);msg.textContent='Clocked in successfully at '+new Date(data.clock_in).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  }
  async function clockOut(){
    const msg=document.getElementById('clockMsg');if(!openShift){await refresh();if(!openShift)return;}
    document.getElementById('clockOut').disabled=true;msg.textContent='Clocking you out...';const now=new Date().toISOString();
    const {data,error}=await sb.from('time_entries').update({clock_out:now,status:'clocked_out'}).eq('id',openShift.id).select().single();
    if(error){msg.textContent='Could not clock out: '+error.message;await refresh();return;}
    render(null,data);msg.textContent='Clocked out successfully at '+new Date(now).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
  }
  function attach(){const a=document.getElementById('clockIn'),b=document.getElementById('clockOut');if(!a||!b)return;a.onclick=clockIn;b.onclick=clockOut;refresh();}
  window.addEventListener('load',()=>setTimeout(attach,250));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();