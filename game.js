(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const $ = (id) => document.getElementById(id);
  const ui = {
    start: $('startScreen'), end: $('endScreen'), startButton: $('startButton'), again: $('againButton'),
    restart: $('restartButton'), count: $('fileCount'), alertFill: $('alertFill'), alertPercent: $('alertPercent'),
    alertWord: $('alertWord'), alertHint: $('alertHint'), exit: $('exitStatus'), timer: $('timer'),
    pause: $('pauseBadge'), sound: $('soundButton'), mobilePad: $('mobilePad'), sprint: $('sprintButton'),
    endIcon: $('endIcon'), endEyebrow: $('endEyebrow'), endTitle: $('endTitle'), endCopy: $('endCopy'),
    finalScore: $('finalScore'), finalTime: $('finalTime'), quip: $('quip')
  };
  const desks = [
    {x:185,y:110,w:135,h:64}, {x:420,y:100,w:125,h:60}, {x:690,y:125,w:145,h:65},
    {x:175,y:270,w:145,h:65}, {x:410,y:260,w:145,h:64}, {x:680,y:300,w:145,h:64},
    {x:265,y:430,w:135,h:58}, {x:540,y:440,w:135,h:58}
  ];
  const fileSpots = [
    {x:82,y:85}, {x:365,y:202}, {x:603,y:85}, {x:880,y:250},
    {x:615,y:390}, {x:448,y:535}, {x:83,y:365}, {x:866,y:520}
  ];
  const patrol = [{x:584,y:213},{x:641,y:215},{x:644,y:390},{x:858,y:390},{x:857,y:215},{x:740,y:215}];
  const quips = [
    'Per my last email,<br>I was never here.', 'My camera is off<br>for bandwidth.', 'Let’s circle back<br>never.',
    'This could’ve been<br>a Slack message.', 'I am aligned with<br>leaving early.', 'Moving this to<br>my personal drive.'
  ];
  let state = 'ready', lastTime = 0, timeLeft = 75, attention = 0, collected = 0, soundOn = true, audio = null, quipIndex = 0;
  let player = {x:78,y:530,r:12,face:0}, boss = {x:584,y:213,angle:0,target:1,scan:0};
  let files = [], keys = new Set(), touchDirs = new Set(), sprintHeld = false, walkCycle = 0, flash = 0;

  function reset() {
    state = 'running'; lastTime = performance.now(); timeLeft = 75; attention = 0; collected = 0; flash = 0;
    player = {x:78,y:530,r:12,face:-Math.PI/2}; boss = {x:584,y:213,angle:0,target:1,scan:0};
    files = fileSpots.map(p => ({...p,got:false,phase:Math.random()*6.28}));
    document.body.classList.add('playing');
    ui.start.classList.add('hidden'); ui.end.classList.add('hidden'); ui.pause.classList.add('hidden');
    ui.count.innerHTML = '00<span> / 08</span>'; ui.exit.textContent = 'LOCKED'; ui.exit.style.color = '';
    ui.timer.textContent = '01:15'; ui.quip.innerHTML = quips[0]; quipIndex = 0; updateAlert();
  }
  function startAudio() { if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {} } if (audio && audio.state === 'suspended') audio.resume(); }
  function beep(freq=520,duration=.08,type='sine',volume=.035) {
    if (!soundOn || !audio) return;
    const osc=audio.createOscillator(), gain=audio.createGain(); osc.type=type; osc.frequency.value=freq;
    gain.gain.setValueAtTime(volume,audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
    osc.connect(gain); gain.connect(audio.destination); osc.start(); osc.stop(audio.currentTime+duration);
  }
  function rectCircleHit(cx,cy,r,rect) {
    const x=Math.max(rect.x,Math.min(cx,rect.x+rect.w)), y=Math.max(rect.y,Math.min(cy,rect.y+rect.h));
    return (cx-x)**2+(cy-y)**2 < r*r;
  }
  function blocked(x,y,r=12) {
    if(x<34+r||x>W-34-r||y<34+r||y>H-34-r) return true;
    return desks.some(d=>rectCircleHit(x,y,r,d));
  }
  function lineBlocked(ax,ay,bx,by) {
    const steps=30;
    for(let i=1;i<steps;i++){const t=i/steps,x=ax+(bx-ax)*t,y=ay+(by-ay)*t;if(desks.some(d=>x>d.x-4&&x<d.x+d.w+4&&y>d.y-4&&y<d.y+d.h+4))return true;}
    return false;
  }
  function movePlayer(dx,dy,dt) {
    const mag=Math.hypot(dx,dy); if(mag>0){dx/=mag;dy/=mag;player.face=Math.atan2(dy,dx);}
    const running=sprintHeld||keys.has('Shift'); const speed=running?216:145;
    const mx=dx*speed*dt,my=dy*speed*dt;
    let nx=player.x+mx;if(!blocked(nx,player.y))player.x=nx;
    let ny=player.y+my;if(!blocked(player.x,ny))player.y=ny;
    if(mag>0){walkCycle+=dt*(running?13:8); if(running) attention=Math.min(100,attention+dt*4.3);}
  }
  function canBossSee() {
    const dx=player.x-boss.x,dy=player.y-boss.y,dist=Math.hypot(dx,dy);
    if(dist>255||lineBlocked(boss.x,boss.y,player.x,player.y))return 0;
    const a=Math.atan2(dy,dx),delta=Math.atan2(Math.sin(a-boss.angle),Math.cos(a-boss.angle));
    const half=.63;
    if(Math.abs(delta)>half)return 0;
    return (1-dist/310)*(1-Math.abs(delta)/half*.3);
  }
  function updateBoss(dt) {
    const goal=patrol[boss.target],dx=goal.x-boss.x,dy=goal.y-boss.y,dist=Math.hypot(dx,dy);
    if(dist<8){boss.target=(boss.target+1)%patrol.length;boss.scan=1.1;}
    else {const speed=42;boss.x+=dx/dist*speed*dt;boss.y+=dy/dist*speed*dt;boss.angle=Math.atan2(dy,dx);}
    if(boss.scan>0){boss.scan-=dt;boss.angle+=Math.sin(performance.now()/370)*dt*1.6;}
    const seen=canBossSee();
    if(seen>0) attention=Math.min(100,attention+dt*(22+seen*26));
    else attention=Math.max(0,attention-dt*(sprintHeld||keys.has('Shift')?7:13));
    if(attention>=100){finish(false,'caught');}
  }
  function update(dt) {
    if(state!=='running')return;
    timeLeft-=dt; if(timeLeft<=0){timeLeft=0;finish(false,'late');return;}
    ui.timer.textContent=String(Math.floor(timeLeft/60)).padStart(2,'0')+':'+String(Math.ceil(timeLeft%60)).padStart(2,'0');
    const x=(keys.has('ArrowRight')||keys.has('d')?1:0)-(keys.has('ArrowLeft')||keys.has('a')?1:0)+(touchDirs.has('right')?1:0)-(touchDirs.has('left')?1:0);
    const y=(keys.has('ArrowDown')||keys.has('s')?1:0)-(keys.has('ArrowUp')||keys.has('w')?1:0)+(touchDirs.has('down')?1:0)-(touchDirs.has('up')?1:0);
    movePlayer(x,y,dt); updateBoss(dt);
    files.forEach(f=>{if(!f.got&&Math.hypot(f.x-player.x,f.y-player.y)<24){f.got=true;collected++;attention=Math.max(0,attention-5);ui.count.innerHTML=String(collected).padStart(2,'0')+'<span> / 08</span>';beep(740+collected*45,.12,'triangle',.05);quipIndex=(quipIndex+1)%quips.length;ui.quip.innerHTML=quips[quipIndex];if(collected===8){ui.exit.textContent='OPEN';ui.exit.style.color='var(--lime)';}}});
    if(collected===8&&Math.hypot(player.x-900,player.y-57)<40){finish(true,'win');return;}
    updateAlert();
  }
  function updateAlert(){
    const n=Math.max(0,Math.min(100,attention));ui.alertFill.style.width=n+'%';ui.alertPercent.textContent=String(Math.round(n)).padStart(2,'0')+'%';
    ui.alertFill.classList.toggle('danger',n>57);
    ui.alertWord.textContent=n>72?'PANIC':n>38?'SUSPICIOUS':'LOW';
    ui.alertWord.style.color=n>72?'var(--orange)':n>38?'#ffbf63':'';
    ui.alertHint.textContent=n>72?'They are drafting the follow-up email.':n>38?'Someone is looking very busy.':n>8?'A little eye contact. Nothing serious.':'Completely invisible. As it should be.';
  }
  function finish(win,reason){
    if(state==='ended')return;state='ended';document.body.classList.remove('playing');ui.end.classList.remove('hidden');
    if(win){ui.endIcon.textContent='✦';ui.endEyebrow.textContent='SHIFT COMPLETE';ui.endTitle.innerHTML='Beautifully<br><em>unemployed.</em>';ui.endCopy.textContent='You escaped with all your files. Your productivity score remains a mystery.';beep(880,.2,'triangle',.06);setTimeout(()=>beep(1175,.3,'triangle',.04),120);}
    else if(reason==='caught'){ui.endIcon.textContent='☹';ui.endEyebrow.textContent='QUICK CHAT?';ui.endTitle.innerHTML='We noticed<br><em>your absence.</em>';ui.endCopy.textContent='The manager caught you wandering. Maybe try using the furniture next time.';beep(170,.35,'sawtooth',.05);}
    else{ui.endIcon.textContent='◷';ui.endEyebrow.textContent='CALENDAR INVITE: NOW';ui.endTitle.innerHTML='The meeting<br><em>found you.</em>';ui.endCopy.textContent='Time ran out before you could make your graceful exit. Don’t accept the follow-up.';beep(220,.25,'triangle',.04);}
    ui.finalScore.textContent=String(collected).padStart(2,'0')+' / 08';ui.finalTime.textContent=String(Math.floor(timeLeft/60)).padStart(2,'0')+':'+String(Math.ceil(timeLeft%60)).padStart(2,'0');
  }
  function roundRect(c,x,y,w,h,r){c.beginPath();c.roundRect(x,y,w,h,r);}
  function drawFloor(){
    ctx.fillStyle='#252d27';ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#29322b';ctx.fillRect(34,34,W-68,H-68);
    for(let y=42;y<H-35;y+=48){ctx.strokeStyle=y%96===42?'#d9e3ce0a':'#d9e3ce06';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(35,y);ctx.lineTo(W-35,y);ctx.stroke();}
    for(let x=45;x<W-35;x+=64){ctx.strokeStyle='#d9e3ce05';ctx.beginPath();ctx.moveTo(x,35);ctx.lineTo(x,H-35);ctx.stroke();}
    // perimeter walls and windows
    ctx.fillStyle='#18201b';ctx.fillRect(0,0,W,34);ctx.fillRect(0,H-34,W,34);ctx.fillRect(0,0,34,H);ctx.fillRect(W-34,0,34,H);
    for(let x=57;x<900;x+=116){ctx.fillStyle='#a1c5a526';roundRect(ctx,x,8,74,14,2);ctx.fill();ctx.strokeStyle='#a8c9ae40';ctx.stroke();}
    // floor lamp pools
    ctx.save();ctx.globalAlpha=.12;for(const p of [{x:120,y:220,r:100},{x:530,y:505,r:100},{x:860,y:460,r:95}]){const g=ctx.createRadialGradient(p.x,p.y,5,p.x,p.y,p.r);g.addColorStop(0,'#e1f19b');g.addColorStop(1,'#e1f19b00');ctx.fillStyle=g;ctx.fillRect(p.x-p.r,p.y-p.r,p.r*2,p.r*2);}ctx.restore();
  }
  function drawDesk(d,i){
    // subtle desk shadow
    ctx.fillStyle='#10161288';roundRect(ctx,d.x+5,d.y+8,d.w,d.h,5);ctx.fill();
    ctx.fillStyle='#39443b';roundRect(ctx,d.x,d.y,d.w,d.h,5);ctx.fill();
    ctx.fillStyle='#505d50';roundRect(ctx,d.x+3,d.y+2,d.w-6,d.h-8,4);ctx.fill();
    ctx.strokeStyle='#82927b42';ctx.lineWidth=1;roundRect(ctx,d.x+1,d.y+1,d.w-2,d.h-3,5);ctx.stroke();
    // laptop + papers + coffee
    const flip=i%2;ctx.fillStyle='#202b23';roundRect(ctx,d.x+(flip?14:d.w-56),d.y+10,43,29,3);ctx.fill();ctx.fillStyle='#86a074';roundRect(ctx,d.x+(flip?17:d.w-53),d.y+13,37,22,2);ctx.fill();
    ctx.fillStyle='#d9dac4';ctx.save();ctx.translate(d.x+(flip?d.w-43:11),d.y+17);ctx.rotate(-.08);ctx.fillRect(0,0,31,23);ctx.fillStyle='#a7ac9a';ctx.fillRect(4,5,21,1);ctx.fillRect(4,10,17,1);ctx.fillRect(4,15,20,1);ctx.restore();
    ctx.fillStyle='#9d6546';ctx.beginPath();ctx.arc(d.x+d.w/2,d.y+d.h-17,5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#dba17a';ctx.lineWidth=2;ctx.beginPath();ctx.arc(d.x+d.w/2+5,d.y+d.h-17,3,-Math.PI/2,Math.PI/2);ctx.stroke();
    // legs
    ctx.fillStyle='#202922';ctx.fillRect(d.x+12,d.y+d.h-2,7,9);ctx.fillRect(d.x+d.w-19,d.y+d.h-2,7,9);
  }
  function drawExit(t){
    const open=collected===8;ctx.save();ctx.translate(900,57);
    ctx.fillStyle=open?'#d7ff6338':'#ff735b20';ctx.beginPath();ctx.arc(0,0,34+Math.sin(t*3)*2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#172019';roundRect(ctx,-19,-25,38,50,3);ctx.fill();ctx.fillStyle=open?'#d7ff63':'#ff735b';roundRect(ctx,-14,-21,28,42,2);ctx.fill();
    ctx.fillStyle='#253026';ctx.fillRect(-8,-15,15,26);ctx.fillStyle='#fff5b4';ctx.beginPath();ctx.arc(7,0,1.8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=open?'#d7ff63':'#d0a49a';ctx.font='8px "DM Mono"';ctx.textAlign='center';ctx.fillText(open?'EXIT →':'LOCKED',0,39);ctx.restore();
  }
  function drawFiles(t){
    files.forEach(f=>{if(f.got)return;const bob=Math.sin(t*3+f.phase)*3;ctx.save();ctx.translate(f.x,f.y+bob);ctx.shadowColor='#d7ff63';ctx.shadowBlur=15;ctx.fillStyle='#d7ff63';ctx.beginPath();ctx.moveTo(-8,-8);ctx.lineTo(3,-8);ctx.lineTo(9,-2);ctx.lineTo(9,9);ctx.lineTo(-8,9);ctx.closePath();ctx.fill();ctx.shadowBlur=0;ctx.fillStyle='#495533';ctx.beginPath();ctx.moveTo(3,-8);ctx.lineTo(3,-2);ctx.lineTo(9,-2);ctx.fill();ctx.fillStyle='#566343';ctx.fillRect(-5,0,10,1);ctx.fillRect(-5,4,7,1);ctx.restore();});
  }
  function drawBoss(t){
    // boss vision cone, with furniture occlusion implied by low opacity
    ctx.save();ctx.translate(boss.x,boss.y);const a=boss.angle;
    const gradient=ctx.createRadialGradient(0,0,16,0,0,255);gradient.addColorStop(0,'#ffb25d35');gradient.addColorStop(1,'#ff735b00');
    ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(0,0);ctx.arc(0,0,255,a-.63,a+.63);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#ff9d6040';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a-.63)*255,Math.sin(a-.63)*255);ctx.moveTo(0,0);ctx.lineTo(Math.cos(a+.63)*255,Math.sin(a+.63)*255);ctx.stroke();ctx.restore();
    // manager shadow and body
    ctx.save();ctx.translate(boss.x,boss.y);ctx.fillStyle='#121711aa';ctx.beginPath();ctx.ellipse(2,8,17,10,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#e8755c';ctx.beginPath();ctx.arc(0,0,13,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f6d5bd';ctx.beginPath();ctx.arc(0,-2,7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#4b2c2a';ctx.beginPath();ctx.arc(0,-5,7,Math.PI,Math.PI*2);ctx.fill();ctx.fillRect(-7,-5,14,3);
    ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(2,-2,1.3,0,Math.PI*2);ctx.fill();ctx.fillStyle='#422b25';ctx.beginPath();ctx.arc(2.5,-2,0.7,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffbd64';ctx.beginPath();ctx.arc(0,-19,3,0,Math.PI*2);ctx.fill();ctx.restore();
    ctx.fillStyle='#f8b178';ctx.font='7px "DM Mono"';ctx.textAlign='center';ctx.fillText('MANAGEMENT',boss.x,boss.y-25);
  }
  function drawPlayer(t){
    ctx.save();ctx.translate(player.x,player.y);ctx.rotate(player.face+Math.PI/2);
    ctx.fillStyle='#1015109c';ctx.beginPath();ctx.ellipse(2,9,13,8,0,0,Math.PI*2);ctx.fill();
    const step=Math.sin(walkCycle)*2.2;
    ctx.fillStyle='#c8e36a';ctx.fillRect(-7,1+step,5,9);ctx.fillRect(2,1-step,5,9);
    ctx.fillStyle='#b9cc70';ctx.beginPath();ctx.moveTo(-10,-5);ctx.quadraticCurveTo(-10,-13,0,-13);ctx.quadraticCurveTo(10,-13,10,-5);ctx.lineTo(8,5);ctx.lineTo(-8,5);ctx.closePath();ctx.fill();
    ctx.fillStyle='#e4c4a2';ctx.beginPath();ctx.arc(0,-12,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#35402b';ctx.beginPath();ctx.arc(0,-14,6,Math.PI,Math.PI*2);ctx.fill();
    ctx.fillStyle='#d7ff63';ctx.beginPath();ctx.arc(0,-20,2,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  function draw(t){
    ctx.clearRect(0,0,W,H);drawFloor();drawExit(t);desks.forEach(drawDesk);drawFiles(t);drawBoss(t);drawPlayer(t);
    if(attention>50&&state==='running'){ctx.strokeStyle=`rgba(255,115,91,${.08+Math.sin(t*12)*.04})`;ctx.lineWidth=7;ctx.strokeRect(4,4,W-8,H-8);}
    if(state==='running'&&collected<8){ctx.fillStyle='#dce2d340';ctx.font='8px "DM Mono"';ctx.textAlign='left';ctx.fillText('FIND THE FILES',49,568);}
  }
  function frame(now){const dt=Math.min(.035,(now-lastTime)/1000||0);lastTime=now;if(state==='running')update(dt);draw(now/1000);requestAnimationFrame(frame);}
  function togglePause(){if(state==='running'){state='paused';ui.pause.classList.remove('hidden');}else if(state==='paused'){state='running';lastTime=performance.now();ui.pause.classList.add('hidden');}}
  ui.startButton.addEventListener('click',()=>{startAudio();reset();});ui.again.addEventListener('click',()=>{startAudio();reset();});ui.restart.addEventListener('click',()=>{startAudio();reset();});
  ui.sound.addEventListener('click',()=>{soundOn=!soundOn;ui.sound.innerHTML=(soundOn?'♪ <span>SOUND ON</span>':'♪ <span>SOUND OFF</span>');ui.sound.setAttribute('aria-label',soundOn?'Turn sound off':'Turn sound on');if(soundOn)startAudio();});
  window.addEventListener('keydown',e=>{const key=e.key.length===1?e.key.toLowerCase():e.key;if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(key))e.preventDefault();if(key==='p'||key==='Escape'){if(state==='running'||state==='paused')togglePause();return;}if(key==='r'&&state!=='ready'){reset();return;}keys.add(key);});
  window.addEventListener('keyup',e=>keys.delete(e.key.length===1?e.key.toLowerCase():e.key));window.addEventListener('blur',()=>{keys.clear();touchDirs.clear();sprintHeld=false;});
  document.querySelectorAll('.pad-cross button').forEach(button=>{
    const dir=button.dataset.dir;const down=e=>{e.preventDefault();touchDirs.add(dir);button.setPointerCapture?.(e.pointerId);};const up=e=>{e.preventDefault();touchDirs.delete(dir);};
    button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',up);button.addEventListener('lostpointercapture',up);
  });
  ui.sprint.addEventListener('pointerdown',e=>{e.preventDefault();sprintHeld=true;ui.sprint.setPointerCapture?.(e.pointerId);});['pointerup','pointercancel','lostpointercapture'].forEach(ev=>ui.sprint.addEventListener(ev,e=>{e.preventDefault();sprintHeld=false;}));
  ui.mobilePad.addEventListener('contextmenu',e=>e.preventDefault());
  files=fileSpots.map(p=>({...p,got:false,phase:Math.random()*6.28}));updateAlert();requestAnimationFrame(frame);
})();
