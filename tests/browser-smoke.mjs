import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';
import { tmpdir } from 'node:os';
const root = fileURLToPath(new URL('../', import.meta.url));
const artifacts = root + '.artifacts/';
const BASE = process.env.ENVIEDU_TEST_URL || 'http://127.0.0.1:4173';
const downloads = path.join(artifacts, 'teacher-downloads-' + Date.now());
await mkdir(downloads, { recursive: true });
await mkdir(artifacts, { recursive: true });
const browserPath = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!browserPath) throw new Error('Set CHROME_PATH to a local Chromium browser executable.');
const browserProfile = path.join(tmpdir(), 'enviedu-browser-profile-' + Date.now());
const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + browserProfile, 'about:blank'], { stdio: 'ignore', windowsHide: true });
let ws, cdpId = 0, acceptDialogs = false;
const pending = new Map(), errors = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, attempts = 60) {
  for (let i = 0; i < attempts; i++) { try { const v = await fn(); if (v) return v; } catch {} await delay(100); }
  throw new Error('Timed out: ' + label);
}
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++cdpId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 12000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function run(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function route(name) {
  await run('location.hash=' + JSON.stringify('#' + name));
  await until(() => run('!!document.querySelector(' + JSON.stringify('.sidebar a[href="#' + name + '"][aria-current]') + ')'), 'route ' + name);
}
async function screenshot(name) {
  const result = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await writeFile(artifacts + name + '.png', Buffer.from(result.data, 'base64'));
}
async function fill(selector, value) {
  await run('(()=>{const el=document.querySelector('+JSON.stringify(selector)+');const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:el.tagName==="SELECT"?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,"value").set.call(el,'+JSON.stringify(value)+');el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));})()');
}
const protocol = JSON.parse(await readFile(new URL('../src/config/study.json', import.meta.url), 'utf8'));
const KEY = 'enviedu:stock-flow:' + protocol.version;
const state = () => run('JSON.parse(localStorage.getItem('+JSON.stringify(KEY)+'))');
async function awaitStage(stage) { await until(async () => (await state())?.stage === stage, 'stage '+stage); }
async function answerForm() {
  const fields = await run('Array.from(document.querySelectorAll(".answer-field")).map(f=>({type:f.querySelector("input")?.type||"textarea",name:f.querySelector("input,textarea").name}))');
  for (const field of fields) {
    if (field.type === 'radio') await run('document.getElementsByName('+JSON.stringify(field.name)+')[0].click()');
    else await fill('[name="'+field.name+'"]', field.type === 'number' ? '110' : 'Participant explanation: the difference between flows determines the change in stock.');
  }
  await run('document.querySelector("form.answer-form").requestSubmit()');
}
async function experiment(id) {
  const scale=id==='waste'?1:10;
  if(id==='flood') await call('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  assert.equal(await run('document.querySelector("[data-parameter=inflowAfter]").disabled'),true);
  assert.equal(await run('document.querySelector("[data-action=next-experiment]").disabled'),true);
  assert.equal(await run('document.querySelectorAll(".simulation-viewer").length'),0,'No dynamic result scene before the first run');
  await run('document.querySelector("[data-action=run]").click()');
  await until(()=>run('!!document.querySelector(".simulation-viewer")'),'result scene');
  if(id==='flood') assert.equal(await run('document.querySelector(".simulation-viewer").dataset.playing'),'false','Reduced motion disables automatic playback');
  if(await run('!!document.querySelector("button[aria-label=\\"Pause scene playback\\"]")')) await run('document.querySelector("button[aria-label=\\"Pause scene playback\\"]").click()');
  await fill('[data-testid=scene-timeline]','6');
  assert.equal(await run('Number(document.querySelector(".scene-canvas .scenario-scene").dataset.stock)'),44*scale);
  assert.equal(await run('document.querySelector(".simulation-viewer").dataset.frame'),'6');
  assert.equal(await run('document.querySelectorAll("[data-testid=chart-scene-cursor]").length'),1);
  await fill('[data-testid=scene-timeline]','12');
  assert.equal(await run('Number(document.querySelector(".scene-canvas .scenario-scene").dataset.stock)'),50*scale);
  assert.equal(await run('Number(document.querySelector(".scene-canvas .scenario-scene").dataset.visualLevel)'),.5,'Fixed reference at default final stock');
  await screenshot('visual-'+id+'-desktop');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await run('document.documentElement.scrollWidth<=window.innerWidth'),'Mobile '+id+' experiment fits');
  await screenshot('visual-'+id+'-mobile');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await run('document.querySelector("button[aria-label=\\"Play scene playback\\"]").click()');
  await until(()=>run('Number(document.querySelector(".simulation-viewer").dataset.frame)>0'),'playback advances');
  await run('document.querySelector("button[aria-label=\\"Pause scene playback\\"]").click()');
  const frame=await run('document.querySelector(".simulation-viewer").dataset.frame');
  await delay(650);
  assert.equal(await run('document.querySelector(".simulation-viewer").dataset.frame'),frame,'Paused scene remains still');
  await run('document.querySelector("button[aria-label=\\"Replay scene from the beginning\\"]").click()');
  assert.ok(Number(await run('document.querySelector(".simulation-viewer").dataset.frame'))<=1,'Replay returns to start');
  assert.equal(await run('document.querySelector("[data-parameter=inflowAfter]").disabled'),false);
  await fill('[data-parameter=inflowAfter]','0');
  await run('document.querySelector("[data-action=run]").click()');
  if(await run('!!document.querySelector("button[aria-label=\\"Pause scene playback\\"]")')) await run('document.querySelector("button[aria-label=\\"Pause scene playback\\"]").click()');
  await fill('[data-testid=scene-timeline]','12');
  assert.equal(await run('Number(document.querySelector(".scene-canvas .scenario-scene").dataset.stock)'),0,'Empty-stock scene is synchronized');
  assert.equal(await run('document.querySelectorAll(".scene-canvas [data-waste-item],.scene-canvas [data-water-overlay]").length'),0,'Empty stock has no pile or water overlay');
  assert.equal((await state()).runs.filter(r=>r.scenario===id).length,2);
  assert.ok((await state()).events.some(e=>e.type==='scene_time_selected'&&e.payload.scenarioId===id),'Scene interaction recorded');
  assert.equal(await run('document.querySelector("[data-action=next-experiment]").disabled'),false);
  await call('Emulation.setEmulatedMedia',{features:[]});
  await run('document.querySelector("[data-action=next-experiment]").click()');
}
const listen = socket => socket.addEventListener('message',event=>{
  const msg=JSON.parse(event.data);
  if(msg.id&&pending.has(msg.id)){const p=pending.get(msg.id);pending.delete(msg.id);if(msg.error)p.reject(new Error(msg.error.message));else p.resolve(msg.result);}
  if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description||msg.params.exceptionDetails.text);
  if(msg.method==='Page.javascriptDialogOpening'&&acceptDialogs)call('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});
});
async function connect(url) {
  const socket=new WebSocket(url);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  listen(socket);return socket;
}
async function ready(selector,label=selector){await until(()=>run('!!document.querySelector('+JSON.stringify(selector)+')'),label);}
async function teacherSignIn(){
  await call('Page.navigate',{url:BASE+'/teacher'});await ready('a[href="/dev/teacher-signin"]','teacher login');
  await run('document.querySelector("a[href=\\"/dev/teacher-signin\\"]").click()');
  await ready('.teacher-dashboard','teacher dashboard');
}
let studentSocket,teacherSocket,browserSocket;
try {
  const debugPort=await until(async()=>Number((await readFile(browserProfile+'/DevToolsActivePort','utf8')).split('\n')[0]),'Chrome debugging port');
  const debugOrigin='http://127.0.0.1:'+debugPort;
  const tabs=await until(async()=>{const response=await fetch(debugOrigin+'/json/list');const tabs=await response.json();return tabs.find(t=>t.type==='page')?tabs:null;},'Chrome');
  studentSocket=await connect(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);ws=studentSocket;
  await call('Runtime.enable');await call('Page.enable');
  await call('Storage.clearDataForOrigin',{origin:BASE,storageTypes:'local_storage'});
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:BASE});await ready('.landing-hero');
  assert.equal(await run('document.querySelectorAll("#participant-id").length'),1,'Students enter their assigned participant ID');
  assert.deepEqual(await run('Array.from(document.querySelectorAll("#class-id option")).map(o=>o.value)'),['','A','B'],'Students select their assigned class');
  assert.equal(await run('document.activeElement.id === "page-title"'),false,'Opening the page does not focus or highlight the heading');
  assert.equal(await run('document.querySelectorAll(".hero-art,.illustration-card,.mini-graph").length'),0,'Landing hero has no decorative waste or flooding graphs');
  assert.equal(await run('getComputedStyle(document.querySelector(".landing-hero")).backgroundImage'),'none','Landing hero has a plain background');
  assert.ok(await run('document.querySelector(".start-learning").getBoundingClientRect().height >= 56'),'Start learning is a large button');
  await run('document.querySelector(".setup-form").requestSubmit()');
  assert.equal(await state(),null,'An ID is required before a session starts');
  await fill('#participant-id','invalid id');
  assert.equal(await run('document.querySelector("#participant-id").checkValidity()'),false,'IDs with spaces are invalid');
  await run('document.querySelector(".setup-form").requestSubmit()');
  assert.equal(await state(),null,'An invalid ID cannot start a session');
  await fill('#participant-id','VALID-001');
  await run('document.querySelector(".setup-form").requestSubmit()');
  assert.equal(await state(),null,'A class is required before a session starts');
  await fill('#participant-id','');
  assert.equal(await run('document.querySelectorAll(".export-card").length'),0,'No student exports');
  assert.equal(await run('(async()=> (await fetch("/api/teacher/submissions")).status)()'),401);
  assert.equal(await run('(async()=> (await fetch("/api/teacher/submissions",{headers:{"oai-authenticated-user-id":"fake","oai-authenticated-user-email":"teacher@enviedu.local"}})).status)()'),401,'Local server strips spoofed identity headers');
  await screenshot('student-home');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),'Landing page fits mobile');
  assert.ok(await run('document.querySelector(".start-learning").getBoundingClientRect().bottom <= innerHeight'),'Start learning is visible on opening mobile');
  await screenshot('student-home-mobile');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  browserSocket=await connect((await (await fetch(debugOrigin+'/json/version')).json()).webSocketDebuggerUrl);ws=browserSocket;
  const {browserContextId}=await call('Target.createBrowserContext');
  await call('Browser.setDownloadBehavior',{behavior:'allow',browserContextId,downloadPath:downloads,eventsEnabled:true});
  const {targetId}=await call('Target.createTarget',{url:'about:blank',browserContextId});
  const target=await until(async()=>{const response=await fetch(debugOrigin+'/json/list');return (await response.json()).find(t=>t.id===targetId);},'teacher browser');
  teacherSocket=await connect(target.webSocketDebuggerUrl);ws=teacherSocket;
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
  await teacherSignIn();
  assert.equal(await run('document.querySelectorAll(".teacher-class-card").length'),2,'Teacher dashboard shows both classes');
  assert.equal(await run('document.querySelectorAll(".teacher-settings").length'),0,'Both classes can run at the same time without a global condition switch');
  const initialData=await run('(async()=> await (await fetch("/api/teacher/submissions")).json())()');
  const initial=initialData.summary.total;
  const participantCodes=[];
  for(const condition of process.env.ENVIEDU_DOWNLOAD_ONLY ? [] : ['guided','separate']){
    ws=studentSocket;
    await run('localStorage.removeItem('+JSON.stringify(KEY)+')');
    await call('Page.navigate',{url:BASE});await ready('.setup-form');
    const participantId='BROWSER-'+condition+'-'+Date.now();
    await fill('#participant-id',participantId);
    await fill('#class-id',condition==='guided'?'A':'B');
    await run('document.querySelector(".setup-form").requestSubmit()');await awaitStage('pretest');
    const registered=await state();assert.equal(registered.condition,condition);assert.equal(registered.participantId,participantId);participantCodes.push(registered.participantId);
    assert.ok(!(await run('document.cookie')).includes('enviedu_submission'),'Upload capability is HttpOnly');
    assert.equal(await run('document.querySelectorAll(".session-download,.export-card,.teacher-dashboard").length'),0);
    await answerForm();await awaitStage('waste-predict');
    await answerForm();await awaitStage('waste-experiment');
    await experiment('waste');await awaitStage('waste-revise');
    await answerForm();await awaitStage('flood-predict');
    await answerForm();await awaitStage('flood-experiment');
    await experiment('flood');await awaitStage('flood-revise');
    await answerForm();
    const activities=condition==='guided'?['comparison']:['waste-reflection','flood-reflection'];
    for(const [index,stage] of activities.entries()){
      await awaitStage(stage);
      assert.equal(await run('document.querySelector(".answer-form button[type=submit]").disabled'),true);
      assert.equal(await run('document.querySelectorAll(".recall-card .flow-diagram").length'),condition==='guided'?2:0);
      assert.equal(await run('document.querySelectorAll(".recall-card").length'),condition==='guided'?2:1);
      assert.equal(await run('document.querySelectorAll(".comparison-map").length'),condition==='guided'?1:0);
      assert.equal(await run('document.querySelectorAll(".answer-field").length'),condition==='guided'?4:2);
      const labels=await run('Array.from(document.querySelectorAll(".stage-step strong")).map(el=>el.textContent)');
      assert.equal(labels.includes('Compare & generalize'),condition==='guided');
      assert.equal(labels.includes('Waste · Reflect'),condition==='separate');
      assert.equal(await run('document.querySelector(".study-progress").getAttribute("aria-valuemax")'),condition==='guided'?'10':'11');
      if(condition==='separate'){
        assert.equal(await run('document.querySelector(".recall-card").dataset.scenario'),index===0?'waste':'flood');
        assert.equal(await run('document.querySelectorAll(".recall-card[data-scenario='+(index===0?'flood':'waste')+']").length'),0);
      }
      await screenshot('journey-'+stage+'-desktop');
      await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
      assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),'Activity fits mobile: '+stage);
      await screenshot('journey-'+stage+'-mobile');
      await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
      if(condition==='separate'&&index===1){
        await call('Page.reload');await ready('.reflection-timer');
        assert.equal((await state()).responses.filter(r=>r.stage==='waste-reflection').length,2,'First case reflection survives reload');
        assert.equal(await run('document.querySelectorAll(".recall-card").length'),1);
      }
      console.log('Waiting for the real timer: '+stage);
      await until(()=>run('!document.querySelector(".answer-form button[type=submit]").disabled'),'activity minimum '+stage,900);
      await answerForm();
    }
    await awaitStage('posttest');
    await answerForm();await awaitStage('transfer');
    assert.equal(await run('document.querySelectorAll(".simulation-viewer").length'),0);
    await answerForm();await awaitStage('complete');
    await until(()=>run('document.querySelector(".student-complete .eyebrow").textContent==="SUBMISSION COMPLETE"'),'final upload acknowledgement',100);
    assert.equal(await run('document.querySelectorAll(".export-card,.score-summary,.teacher-score-cards,.debrief").length'),0,'Student receives only a submission receipt');
    const complete=await state();assert.equal(complete.responses.length,26);
    assert.equal(await run('(async()=> (await fetch("/api/teacher/submissions/'+complete.sessionId+'")).status)()'),401);
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),'Student receipt fits mobile');
    await screenshot('student-complete');
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
    ws=teacherSocket;
    const received=await run('(async()=>await (await fetch("/api/teacher/submissions/'+complete.sessionId+'")).json())()');
    assert.equal(received.session.responses.length,26);assert.equal(received.submission.stage,'complete');
    await fill('.teacher-filters label:last-child select','all');
    await run('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Refresh results").click()');
    await until(()=>run('document.querySelector(".teacher-table")?.textContent.includes('+JSON.stringify(complete.participantId)+')'),'cross-browser result');
    const classLabel=condition==='guided'?'Class A':'Class B';
    await run('Array.from(document.querySelectorAll(".teacher-class-card button")).find(b=>b.textContent.includes('+JSON.stringify(classLabel)+')).click()');
    await until(()=>run('Array.from(document.querySelectorAll(".teacher-table .teacher-class-cell")).length>0 && Array.from(document.querySelectorAll(".teacher-table .teacher-class-cell")).every(c=>c.textContent.startsWith('+JSON.stringify(classLabel)+'))'),'class filter');
    assert.equal(await run('document.querySelector(".teacher-filters label:last-child select").value'),condition);
    await run('Array.from(document.querySelectorAll(".teacher-table .text-btn")).find(b=>b.textContent==='+JSON.stringify(complete.participantId)+').click()');
    await ready('.teacher-answer-stage');
    assert.equal(await run('document.querySelectorAll(".teacher-answer").length'),26);
    assert.ok(await run('document.querySelector(".teacher-detail").textContent.includes("The water already inside a tank")'),'Teacher sees question text with answers');
    await screenshot('teacher-dashboard');
    await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),'Teacher dashboard fits mobile');
    await screenshot('teacher-dashboard-mobile');
    await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1080,deviceScaleFactor:1,mobile:false});
    console.log('PASS '+condition+': student submission visible in separate teacher browser; student cannot read results.');
  }
  ws=teacherSocket;
  const finalData=await run('(async()=> await (await fetch("/api/teacher/submissions")).json())()');
  const summary=finalData.summary;
  assert.equal(summary.total,initial+participantCodes.length);
  if(participantCodes.length){
    for(const stats of finalData.classes){
      const before=initialData.classes.find(c=>c.id===stats.id);
      assert.equal(stats.total,before.total+1);assert.equal(stats.completed,before.completed+1);
    }
    await fill('.teacher-filters label:last-child select','all');
    await until(()=>run('document.querySelectorAll(".teacher-table tbody tr").length==='+Math.min(finalData.total,finalData.pageSize)),'both class results');
  }
  await run('Array.from(document.querySelectorAll("button")).find(b=>b.textContent==="Download all answers · CSV").click()');
  const responses=await until(()=>readFile(path.join(downloads,'enviedu-responses.csv'),'utf8'),'combined answers download',150);
  assert.ok(responses.includes('participant_id') && responses.includes('class_id') && responses.includes('explanation'));
  for(const code of participantCodes)assert.ok(responses.includes(code),'Combined export includes '+code);
  await run('document.querySelector("a[href=\\"/dev/teacher-signout\\"]").click()');
  await ready('a[href="/dev/teacher-signin"]','signed out');
  assert.equal(await run('(async()=> (await fetch("/api/teacher/submissions")).status)()'),401);
  assert.deepEqual(errors,[]);
  console.log(process.env.ENVIEDU_DOWNLOAD_ONLY ? 'PASS: teacher CSV download and logout.' : 'PASS: anonymous students, server-side teacher authorization, two isolated browser contexts, both learning conditions, real reflection timing, mobile layouts, central data, combined exports, logout.');
}catch(error){
  if(ws?.readyState===1){try{await screenshot('teacher-failure');console.error(await run('document.body.innerText.slice(0,2200)'));}catch{}}
  console.error('Browser exceptions:',errors);throw error;
}finally{
  if(ws?.readyState===1){try{await call('Browser.close');}catch{}ws.close();}
  studentSocket?.close();teacherSocket?.close();browserSocket?.close();if(!browser.killed)browser.kill();
}
