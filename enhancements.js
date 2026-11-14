(function(){
const $=s=>document.querySelector(s), get=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(d))}catch{return d}}, cfg=window.APP_CONFIG||{};
let sb=null,user=null;try{if(window.supabase&&cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&!cfg.SUPABASE_URL.includes("YOUR_"))sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY)}catch(e){console.error(e)}
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function nav(label,key){let b=document.createElement("button");b.textContent=label;b.dataset.extra=key;$("#nav").appendChild(b)}
nav("Live discovery","discover");nav("Approvals","approvals");nav("Daily analytics","analytics");nav("Cloud sync","cloud");
$("#nav").addEventListener("click",e=>{let b=e.target.closest("[data-extra]");if(!b)return;e.preventDefault();e.stopImmediatePropagation();document.querySelectorAll("#nav button").forEach(x=>x.classList.remove("active"));b.classList.add("active");b.dataset.extra==="discover"?discover():b.dataset.extra==="approvals"?approvalsPanel():b.dataset.extra==="analytics"?analyticsPanel():cloudPanel()});
async function discover(){
 const m=$("#main");let feedJobs=[];
 m.innerHTML='<div class="heading"><div><h2>Live job discovery</h2><p>Active openings from connected public employer feeds.</p></div><button class="btn secondary" id="reloadFeed" type="button">Reload</button></div><div id="feedMeta" class="notice" role="status">Loading vacancies…</div><div id="feedList"></div>';
 const meta=$("#feedMeta"),list=$("#feedList");
 async function load(){
  meta.textContent="Loading vacancies…";list.innerHTML="";
  try{
   const r=await fetch("./jobs.json?refresh="+Date.now(),{cache:"no-store"});
   if(!r.ok)throw new Error("Job feed returned HTTP "+r.status);
   const d=await r.json();
   if(!d||!Array.isArray(d.jobs))throw new Error("The published job feed has an unexpected format.");
   feedJobs=d.jobs;
   meta.textContent="Last refreshed: "+(d.meta?.lastRefreshed||"unknown")+" · Sources: "+(d.meta?.sourcesChecked||"none")+" · "+feedJobs.length+" matching listings";
   list.innerHTML=feedJobs.map((j,i)=>'<article class="job"><div class="row"><div><h3>'+esc(j.title)+'</h3><div class="muted">'+esc(j.company)+' · '+esc(j.location)+'</div></div><b class="score">'+esc(j.fitScore)+'/100</b></div><div class="tags"><span class="tag">'+esc(j.workMode)+'</span><span class="tag">'+esc(j.source)+'</span><span class="tag">'+esc(j.posted)+'</span><span class="tag">'+(j.mustHavePass===null?'Must-have gate not assessed':(j.mustHavePass?'Must-have gate passed':'Must-have gate failed'))+'</span></div><p class="small">'+esc(j.description||"").slice(0,320)+'</p><p class="small muted">Matched: '+esc((j.matchedSkills||[]).join(", ")||"None")+' · Missing: '+esc((j.missingSkills||[]).join(", ")||"Not assessed")+'</p><div class="actions"><a class="btn secondary" target="_blank" rel="noopener" href="'+esc(j.url||"#")+'">Original listing ↗</a><button class="btn secondary" type="button" data-save-index="'+i+'">Save</button><button class="btn" type="button" data-review-index="'+i+'">Review for approval</button></div><p class="small muted">Source: '+esc(j.source)+' · Verify vacancy on employer site before applying.</p></article>').join("")||'<div class="card empty">No matching vacancies found in the published feed.</div>';
  }catch(err){feedJobs=[];meta.textContent="Could not load vacancies: "+(err?.message||String(err))+". Tap Reload to retry. If this continues, the published feed needs attention.";list.innerHTML='<div class="card empty">The job feed is unavailable. Your saved tracker and approval queue have not been deleted.</div>';console.error("Live discovery feed load failed",err)}
 }
 $("#reloadFeed").onclick=load;
 list.onclick=async e=>{
  const review=e.target.closest("button[data-review-index]");
  if(review){
   review.disabled=true;const old=review.textContent;review.textContent="Adding…";
   try{const j=feedJobs[Number(review.dataset.reviewIndex)];if(!j)throw new Error("This vacancy is no longer in the loaded feed. Tap Reload and try again.");await addForReview(j)}
   catch(err){console.error("Review for approval failed",err);alert("Could not add this vacancy for approval: "+(err?.message||String(err))+". Your existing queue is unchanged. Please retry.");}
   finally{review.disabled=false;review.textContent=old}
   return;
  }
  const save=e.target.closest("button[data-save-index]");if(!save)return;
  const j=feedJobs[Number(save.dataset.saveIndex)];if(!j){alert("Vacancy no longer available. Tap Reload.");return}
  const a=get("gj_jobs",[]);if(!a.some(x=>(x.id&&x.id===j.id)||(x.url&&j.url&&x.url===j.url))){a.push(j);localStorage.setItem("gj_jobs",JSON.stringify(a))}
  save.textContent="Saved";save.disabled=true;
 };
 await load();
}
async function addForReview(j){
 if(!j||!j.title)throw new Error("Vacancy details are missing. Reload the job feed.");
 let a=get("gj_tracker",[]);
 const key=x=>String(x.jobId||x.id||x.url||((x.company||"")+"|"+(x.title||"")));
 const incoming=String(j.id||j.url||((j.company||"")+"|"+j.title));
 const exists=a.some(x=>key(x)===incoming||(j.url&&x.url===j.url));
 if(exists){
  document.querySelectorAll("#nav button").forEach(x=>x.classList.toggle("active",x.dataset.extra==="approvals"));
  approvalsPanel();
  alert("This vacancy is already in your approval queue.");
  return;
 }
 const item={jobId:j.id||j.url||((j.company||"")+"|"+j.title),title:j.title,company:j.company||"",status:"Pending approval",date:new Date().toLocaleDateString("en-IN"),note:"",url:j.url||"",description:j.description||"",fitScore:j.fitScore||0,matchedSkills:j.matchedSkills||[],missingSkills:j.missingSkills||[],createdAt:new Date().toISOString()};
 a.push(item);
 // Persist and render first: cloud availability must never block the review workflow.
 localStorage.setItem("gj_tracker",JSON.stringify(a));
 document.querySelectorAll("#nav button").forEach(x=>x.classList.toggle("active",x.dataset.extra==="approvals"));
 approvalsPanel();
 const status=$("#approvalMessage");
 if(sb&&user){
  try{
   const payload={user_id:user.id,jobs:get("gj_jobs",[]),tracker:a,updated_at:new Date().toISOString()};
   const {error}=await sb.from("user_workspace").upsert(payload,{onConflict:"user_id"});
   if(error)throw error;
  }catch(err){
   console.error("Approval saved locally but cloud sync failed",err);
   const box=$("#approvalList");if(box){const n=document.createElement("p");n.className="small muted";n.textContent="Saved on this device. Cloud sync is temporarily unavailable; use Cloud sync → Sync now when connectivity returns.";box.prepend(n)}
  }
 }
}
function roleCV(j){
 const skills=[
 "VICIdial multi-server clusters (separate MariaDB, web and Asterisk nodes)","ViciBox installs","ViciPhone WebRTC","SSL/TLS","WSS","STUN/NAT","Database tuning","GoAutoDial",
 "VOS3000","ASTPP","MagnusBilling","FreeSWITCH","Client gateway provisioning","Rate decks and tariffs","LCR and prefix routing","Credit and CPS limits",
 "Asterisk","FreePBX","SIP trunking","SIP/RTP troubleshooting","G.711/G.729 codecs","iptables","Fail2ban","IP whitelisting",
 "AWS EC2/VPC","Oracle Cloud (OCI)","Linux VPS","CRM-to-dialer webhooks","REST API call triggers",
 "Predictive and progressive pacing","CLI rotation","ACD and IVR routing","SLA","AHT","Occupancy","QA","Right-party contact (RPC)","Weekly business reviews (WBRs)","CRTC compliance"
 ];
 const desc=String(j.description||"").toLowerCase(),title=String(j.title||"").toLowerCase(),target=title+" "+desc;
 const ranked=skills.map((skill,i)=>({skill,i,score:(target.split(skill.toLowerCase()).length-1)+(title.includes(skill.toLowerCase())?3:0)})).sort((a,b)=>b.score-a.score||a.i-b.i);
 const ordered=[...ranked.filter(x=>x.score>0).map(x=>x.skill),...skills.filter(x=>!ranked.some(y=>y.score>0&&y.skill===x))];
 const groups={
 technical:["VICIdial multi-server clusters (separate MariaDB, web and Asterisk nodes)","ViciBox installs","ViciPhone WebRTC","SSL/TLS","WSS","STUN/NAT","Database tuning","GoAutoDial","VOS3000","ASTPP","MagnusBilling","FreeSWITCH","Client gateway provisioning","Rate decks and tariffs","LCR and prefix routing","Credit and CPS limits","Asterisk","FreePBX","SIP trunking","SIP/RTP troubleshooting","G.711/G.729 codecs","iptables","Fail2ban","IP whitelisting","AWS EC2/VPC","Oracle Cloud (OCI)","Linux VPS","CRM-to-dialer webhooks","REST API call triggers"],
 operations:["Predictive and progressive pacing","CLI rotation","ACD and IVR routing","SLA","AHT","Occupancy","QA","Right-party contact (RPC)","Weekly business reviews (WBRs)","CRTC compliance"]
 };
 const leadership=/operations|contact.?center|contact centre|customer success|service delivery|team lead|manager|head of|director|bpo|workforce|campaign|client operations/.test(target);
 const infra=/voip|telephony|voice|sip|asterisk|vicidial|softswitch|ccaas|cloud|network|infrastructure|platform|implementation|ucaas/.test(target);
 const summary=leadership&&infra
  ?"Cloud telephony and contact-centre specialist with 16+ years in international voice operations, softswitch administration and multi-server VICIdial deployment. Brings 10 years of operations leadership, including five years managing Canadian outbound telecom campaign infrastructure and floor operations. Combines hands-on VoIP engineering, CCaaS onboarding and carrier troubleshooting with operational delivery, service levels and client reviews."
  :leadership
  ?"International voice and contact-centre operations leader with 16+ years of experience and 10 years in operations leadership. Led multi-shift North American voice programmes with 50+ agents and Team Leaders, owning SLA, AHT, occupancy, shrinkage, QA, ACD/IVR routing and dialer uptime. Also brings five years managing Canadian outbound telecom campaign operations."
  :infra
  ?"VoIP, VICIdial and softswitch specialist with 16+ years in international voice operations. Designs and deploys single- and multi-server VICIdial environments across AWS, Oracle Cloud and Linux VPS; administers VOS3000, ASTPP, MagnusBilling and FreeSWITCH; enables WebRTC calling; and leads CCaaS onboarding, carrier route testing and tier-2/3 SIP/RTP troubleshooting."
  :"Cloud telephony and contact-centre specialist with 16+ years in international voice operations, softswitch administration and multi-server VICIdial deployment, including 10 years of operations leadership. Combines hands-on dialer and VoIP infrastructure experience with CCaaS onboarding, carrier testing and international voice operations.";
 const exp=[
 {name:"Independent VoIP Infrastructure & Dialer Consultant",org:"Freelance",date:"2018 – Present",bullets:[
 "Design and deploy single- and multi-server VICIdial clusters on AWS, Oracle Cloud (OCI) and Linux VPS, with separate MariaDB, web and multiple Asterisk nodes.",
 "Configure SSL/TLS and WSS to enable WebRTC browser dialing (ViciPhone) for client agents.",
 "Install and administer VOS3000, ASTPP, MagnusBilling and FreeSWITCH: client accounts, SIP trunk mapping, rate deck uploads, LCR/prefix routing, and credit and CPS limits.",
 "Harden VoIP servers with iptables, Fail2ban and IP whitelisting.",
 "Lead CCaaS client onboarding, carrier route testing, and tier-2/3 SIP/RTP audio troubleshooting.",
 "Build CRM webhook integrations that inject leads into the dialer automatically."
 ]},
 {name:"Operations & Telephony Manager",org:"Canadian Outbound Telecom Campaign",date:"5 years",bullets:[
 "Ran dialer infrastructure and floor operations for a high-volume campaign selling contract mobile phones in Canada.",
 "Tuned predictive pacing, CLI rotation, list recycling and carrier route redundancy to raise right-party contact (RPC) rates within Canadian CRTC telemarketing rules.",
 "Ran weekly business reviews with client stakeholders covering disposition analytics, conversion funnels and SLA commitments."
 ]},
 {name:"Operations Manager, International Voice Processes",org:"Oasis BPO Services",date:"2013 – 2018",bullets:[
 "Led multi-shift floor operations for 50+ agents and Team Leaders across North American voice programmes.",
 "Owned SLA compliance, AHT, occupancy, shrinkage and QA scores.",
 "Coordinated ACD call routing, IVR call trees and dialer uptime.",
 "Grew from frontline international voice executive to Operations Manager."
 ]},
 {name:"International Voice Executive",org:"International Voice BPO",date:"2010 – 2013",bullets:[
 "Handled international voice operations before moving into team and operations leadership."
 ]}
 ];
 const relevance=x=>{const t=x.toLowerCase();return (target.match(/voip|voice|sip|asterisk|vicidial|softswitch|ccaas|cloud|telephony|dialer|carrier|web.?rtc|infrastructure|implementation|linux|aws|network/g)||[]).reduce((n,k)=>n+(t.includes(k)?1:0),0)+(leadership&&/operations|team|client|sla|floor|campaign|lead|manager|review|agent|qa|occupancy/i.test(t)?1:0)};
 const experience=exp.map(x=>({...x,bullets:[...x.bullets].sort((a,b)=>relevance(b)-relevance(a))}));
 const roleHeadline=infra?"VoIP, VICIdial & Softswitch Specialist | CCaaS Implementation Lead":"International Voice & Contact-Centre Operations Leader";
 return {headline:roleHeadline,summary,skills:ordered,experience,education:"Bachelor of Computer Applications (BCA) | CBS Education Group, Agra | 2008",targetRole:j.title,targetCompany:j.company,matched:ranked.filter(x=>x.score>0).map(x=>x.skill),note:"Role relevance is inferred from the vacancy description. All experience and achievements remain grounded in the candidate CV."};
}
function cvHtml(j){
 const c=roleCV(j),li=a=>a.map(x=>"<li>"+esc(x)+"</li>").join("");
 return "<!doctype html><html><head><meta charset='utf-8'><title>Gaurav Rathore - "+esc(c.targetRole)+"</title><style>@page{size:A4;margin:15mm}body{font:10pt Arial,sans-serif;line-height:1.35;color:#18251f;max-width:780px;margin:25px auto;padding:0 24px}h1{font-size:22pt;margin:0}.sub{color:#52665b;margin:4px 0 12px}.headline{font-weight:bold;font-size:11pt;margin:10px 0}h2{font-size:11pt;border-bottom:1px solid #789084;padding-bottom:3px;margin:15px 0 6px;text-transform:uppercase;letter-spacing:.5px}.job{font-weight:bold;margin-top:9px}.meta{color:#5d6c63;font-size:9pt}ul{margin:4px 0 8px;padding-left:18px}.skills{columns:1}li{break-inside:avoid}p{margin:4px 0}@media print{body{margin:0;padding:0}}</style></head><body><h1>GAURAV RATHORE</h1><div class='sub'>Bengaluru, Karnataka | Immediate joiner</div><div class='headline'>"+esc(c.headline)+"</div><h2>Professional Summary</h2><p>"+esc(c.summary)+"</p><h2>Core Skills</h2><ul class='skills'>"+li(c.skills)+"</ul><h2>Professional Experience</h2>"+c.experience.map(x=>"<div class='job'>"+esc(x.name)+"</div><div class='meta'>"+esc(x.org)+" | "+esc(x.date)+"</div><ul>"+li(x.bullets)+"</ul>").join("")+"<h2>Education</h2><p>"+esc(c.education)+"</p><p class='meta'>Tailored for "+esc(c.targetRole)+" at "+esc(c.targetCompany)+". Review this draft against the original CV before submitting.</p></body></html>";
}
window.downloadRoleCV=function(idx){
 const a=get("gj_tracker",[]),j=a[Number(idx)];if(!j)return;
 const blob=new Blob([cvHtml(j)],{type:"text/html;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download=("Gaurav_Rathore_"+String(j.company||"Role").replace(/[^a-z0-9]+/gi,"_")+"_"+String(j.title||"CV").replace(/[^a-z0-9]+/gi,"_")+"_CV.html").replace(/_+/g,"_");document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
 alert("Role-specific CV downloaded. Open it in a browser and use Print → Save as PDF. Review the role-specific draft carefully against the source CV before use.");
};
function approvalsPanel(){
 const m=$("#main");
 if(!m){console.error("Approval panel: main container missing");return}
 const a=get("gj_tracker",[]);
 m.innerHTML='<div class="heading"><div><h2>Application approvals</h2><p>Review the role-specific CV and decide whether to proceed. Employer-portal submission is not automated in this version.</p></div><button class="btn secondary" id="refreshApprovals">Refresh queue</button></div><div id="approvalMessage" class="notice hidden" role="status"></div><div class="notice">Review the vacancy and CV carefully. Approving opens the employer application page; it does not submit an application or bypass CAPTCHA/OTP.</div><div id="approvalList"></div>';
 const visible=a.map((x,i)=>({...x,_index:i})).filter(x=>["Pending approval","Application opened – verification may be required","Submitted (user confirmed)","Declined"].includes(x.status));
 const list=$("#approvalList");
 list.innerHTML=visible.map(j=>{
  const c=roleCV(j);
  const actions=j.status==="Pending approval"?'<button class="btn secondary" data-cv="'+j._index+'">Download tailored CV</button><button class="btn" data-apply="'+j._index+'">Approve & open application</button><button class="btn secondary" data-decline="'+j._index+'">Decline</button>':j.status==="Application opened – verification may be required"?'<button class="btn secondary" data-cv="'+j._index+'">Download tailored CV</button><button class="btn" data-reopen="'+j._index+'">Reopen application page</button><button class="btn secondary" data-confirm="'+j._index+'">Confirm submitted</button>':"";
  return '<article class="job"><h3>'+esc(j.title||"Untitled role")+'</h3><div class="muted">'+esc(j.company||"Company not specified")+'</div><p class="small">Status: <b>'+esc(j.status)+'</b> · Fit estimate: '+esc(j.fitScore??"—")+'/100</p><p class="small">'+esc((j.description||"").slice(0,350))+'</p><p class="small muted">Matched skills: '+esc((j.matchedSkills||[]).join(", ")||"Not assessed")+' · Missing skills: '+esc((j.missingSkills||[]).join(", ")||"Not assessed")+'</p><details><summary>Preview tailored CV summary and skills</summary><p>'+esc(c.summary)+'</p><p><b>Prioritised skills:</b> '+esc(c.skills.slice(0,14).join(", "))+'</p><p><b>Experience:</b> '+esc(c.experience.map(x=>x.name).join(" · "))+'</p></details><div class="actions">'+(j.url?'<a class="btn secondary" target="_blank" rel="noopener" href="'+esc(j.url)+'">Original listing ↗</a>':"")+actions+'</div>'+(j.status==="Application opened – verification may be required"?'<p class="small muted">Complete the employer form yourself. CAPTCHA, OTP and MFA must be completed on the employer site. Confirm only after the employer confirms receipt.</p>':"")+(j.status==="Submitted (user confirmed)"?'<p class="small muted">Marked submitted based on user confirmation: '+esc(j.submittedAt||"date not recorded")+'.</p>':"")+'</article>';
 }).join("")||'<div class="card empty">No roles are currently awaiting review. Go to Live discovery and tap “Review for approval” on a vacancy.</div>';
 $("#refreshApprovals").onclick=()=>approvalsPanel();
 list.onclick=async e=>{
  const b=e.target.closest("button[data-apply],button[data-decline],button[data-reopen],button[data-confirm],button[data-cv]");
  if(!b)return;
  const raw=b.dataset.apply??b.dataset.decline??b.dataset.reopen??b.dataset.confirm??b.dataset.cv;
  const idx=Number(raw),item=a[idx];
  if(!Number.isInteger(idx)||!item)return;
  if(b.hasAttribute("data-cv")){window.downloadRoleCV(idx);return}
  if(b.hasAttribute("data-apply")||b.hasAttribute("data-reopen")){
   if(!item.url){alert("No employer application URL is available for this role.");return}
   const win=window.open(item.url,"_blank","noopener");
   if(!win){alert("The browser blocked the employer page. Allow pop-ups for this site and try again.");return}
   if(b.hasAttribute("data-apply"))item.status="Application opened – verification may be required";
   localStorage.setItem("gj_tracker",JSON.stringify(a));
   const msg=$("#approvalMessage");msg.classList.remove("hidden");msg.textContent="Employer application page opened. This app does not fill or submit the form. Complete any CAPTCHA/OTP on the employer site, then use Confirm submitted only after successful submission.";
   if(sb&&user){try{await sync()}catch(err){console.error("Cloud sync after opening application failed",err)}}
   if(b.hasAttribute("data-apply"))approvalsPanel();
   return;
  }
  if(b.hasAttribute("data-confirm")){
   if(!confirm("Has the employer portal confirmed successful submission? Only confirm if you received an on-screen or email confirmation."))return;
   item.status="Submitted (user confirmed)";item.submittedAtISO=new Date().toISOString();item.submittedAt=new Date().toLocaleString();
  }else item.status="Declined";
  localStorage.setItem("gj_tracker",JSON.stringify(a));
  approvalsPanel();
  if(sb&&user){try{await sync()}catch(err){console.error("Cloud sync after approval update failed",err)}}
 };
}
async function analyticsPanel(selectedDate){const m=$("#main");const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());const date=selectedDate||today;m.innerHTML='<div class="heading"><div><h2>Daily job analytics</h2><p>Unique vacancies seen during the selected India calendar day, counted once even when the feed refreshes repeatedly.</p></div></div><div class="card"><label for="analyticsDate">Select date</label><input id="analyticsDate" type="date" value="'+esc(date)+'" max="'+today+'"><p class="small muted">Availability is recorded by the scheduled job-feed history. Applied means a job from that day’s available list is marked Applied or confirmed submitted in your tracker.</p></div><div id="dailyMetrics" class="grid"><div class="card">Loading daily history…</div></div><div class="card"><div class="row"><b>Jobs available on this date</b><span id="dailyCount" class="tag"></span></div><div id="dailyJobs"></div></div>';$("#analyticsDate").addEventListener("change",e=>analyticsPanel(e.target.value));let history={days:{}};try{const r=await fetch("./jobs-history.json?ts="+Date.now());if(r.ok)history=await r.json()}catch(e){console.warn("Daily history unavailable",e)}const day=history.days?.[date];const dayJobs=day?.jobs||[];const tracker=get("gj_tracker",[]);const appliedStatuses=["Applied","Submitted (user confirmed)","Submitted","Application submitted"];const isApplied=j=>tracker.some(t=>{const same=(t.jobId||t.id)===j.id||(t.url&&j.url&&t.url===j.url)||((t.title||"").trim().toLowerCase()===(j.title||"").trim().toLowerCase()&&(t.company||"").trim().toLowerCase()===(j.company||"").trim().toLowerCase());return same&&appliedStatuses.includes(t.status)});const applied=dayJobs.filter(isApplied).length;const pending=dayJobs.length-applied;const dayKey=v=>{const dt=v?new Date(v):null;return dt&&!Number.isNaN(dt.getTime())?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(dt):""};const appliedOnDate=new Set(tracker.filter(t=>appliedStatuses.includes(t.status)&&dayKey(t.appliedAt||t.submittedAtISO||t.submittedAt)===date).map(t=>t.jobId||t.id||t.url||((t.company||"")+"|"+(t.title||"")))).size;$("#dailyMetrics").innerHTML='<div class="card"><div class="muted small">Unique jobs available</div><div class="stat">'+dayJobs.length+'</div></div><div class="card"><div class="muted small">Applied from this day’s list</div><div class="stat">'+applied+'</div></div><div class="card"><div class="muted small">Yet to be applied</div><div class="stat">'+pending+'</div></div><div class="card"><div class="muted small">Applications submitted on this date</div><div class="stat">'+appliedOnDate+'</div></div>';$("#dailyCount").textContent=dayJobs.length+" unique";$("#dailyJobs").innerHTML=dayJobs.map(j=>'<div class="job"><div class="row"><div><b>'+esc(j.title)+'</b><div class="muted small">'+esc(j.company)+' · '+esc(j.location||"Location not listed")+'</div></div><span class="tag">'+(isApplied(j)?"Applied":"Pending")+'</span></div>'+(j.url?'<p class="small"><a href="'+esc(j.url)+'" target="_blank" rel="noopener">Open original vacancy ↗</a></p>':"")+'</div>').join("")||'<div class="empty">'+(day?"No unique jobs were recorded for this date.":"No historical snapshot exists for this date. Daily tracking starts when the new history feed is first published; older dates cannot be reconstructed reliably.")+'</div>';}
function cloudPanel(){let m=$("#main");m.innerHTML='<div class="heading"><div><h2>Secure cloud sync</h2><p>Private account-scoped jobs and tracker.</p></div></div><div class="card"><b>Status: </b><span id="cloudStatus">'+(sb?"Checking…":"Not configured")+'</span><label>Email</label><input id="cloudEmail" type="email" autocomplete="email"><label>Password</label><input id="cloudPassword" type="password" autocomplete="current-password"><div class="actions"><button class="btn" id="signIn">Sign in</button><button class="btn secondary" id="signUp">Create account</button><button class="btn secondary" id="signOut">Sign out</button><button class="btn secondary" id="syncNow">Sync now</button></div><p class="small muted">Only the Supabase anon/publishable key belongs in the browser. Never expose the service-role key.</p></div><div class="card"><b>Setup required</b><ol><li>Create a Supabase project.</li><li>Set URL and anon key in supabase-config.js.</li><li>Run supabase/schema.sql in Supabase SQL Editor.</li><li>Enable email auth and set the allowed redirect URL.</li></ol></div>';if(!sb)return;const status=$("#cloudStatus");const refresh=()=>status.textContent=user?"Connected: "+user.email:"Not signed in";$("#signIn").onclick=async()=>{const b=$("#signIn"),email=$("#cloudEmail").value.trim(),password=$("#cloudPassword").value;if(!email||!password){alert("Enter your email and password. If you are already signed in, you do not need to sign in again.");return}b.disabled=true;b.textContent="Signing in…";status.textContent="Signing in…";try{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error){status.textContent="Sign-in failed: "+error.message;alert("Sign-in failed: "+error.message)}else{user=data.user||data.session?.user||null;refresh();alert("Signed in successfully as "+(user?.email||email)+".")}}catch(e){status.textContent="Sign-in failed: "+e.message;alert("Sign-in failed: "+e.message)}finally{b.disabled=false;b.textContent="Sign in"}};$("#signUp").onclick=async()=>{const email=$("#cloudEmail").value.trim(),password=$("#cloudPassword").value;if(!email||!/^\S+@\S+\.\S+$/.test(email)){alert("Please enter a valid email address first.");$("#cloudEmail").focus();return}if(!password||password.length<6){alert("Please enter a password with at least 6 characters.");$("#cloudPassword").focus();return}const b=$("#signUp");b.disabled=true;b.textContent="Creating…";status.textContent="Creating your email account…";try{const {data,error}=await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error){status.textContent="Account creation failed: "+error.message;alert("Account creation failed: "+error.message)}else{status.textContent=data.user?.identities?.length===0?"An account may already exist for this email. Try Sign in or reset your password.":"Registration submitted. Check your inbox for the confirmation email.";alert(status.textContent)}}catch(e){status.textContent="Account creation failed: "+e.message;alert(status.textContent)}finally{b.disabled=false;b.textContent="Create account"}};$("#signOut").onclick=async()=>{await sb.auth.signOut();user=null;refresh()};$("#syncNow").onclick=sync;sb.auth.getSession().then(({data})=>{user=data.session?.user||null;refresh();if(user)sync()})}
async function sync(){if(!sb||!user){alert("Configure Supabase and sign in first.");return}let payload={user_id:user.id,jobs:get("gj_jobs",[]),tracker:get("gj_tracker",[]),updated_at:new Date().toISOString()};let {error}=await sb.from("user_workspace").upsert(payload,{onConflict:"user_id"});if(error)alert("Sync failed: "+error.message);else alert("Private workspace synced.")}
if(sb){sb.auth.getSession().then(async({data})=>{user=data.session?.user||null;if(user){let {data:row,error}=await sb.from("user_workspace").select("jobs,tracker").eq("user_id",user.id).maybeSingle();if(!error&&row){if(window.__gjSetCloudData)window.__gjSetCloudData(row);else{localStorage.setItem("gj_jobs",JSON.stringify(row.jobs||[]));localStorage.setItem("gj_tracker",JSON.stringify(row.tracker||[]))}}}});sb.auth.onAuthStateChange(async(_e,s)=>{user=s?.user||null;if(user){let {data:row,error}=await sb.from("user_workspace").select("jobs,tracker").eq("user_id",user.id).maybeSingle();if(!error&&row&&window.__gjSetCloudData)window.__gjSetCloudData(row)}});const original=Storage.prototype.setItem;let timer;Storage.prototype.setItem=function(k,v){let x=original.apply(this,arguments);if((k==="gj_jobs"||k==="gj_tracker")&&user){clearTimeout(timer);timer=setTimeout(sync,1000)}return x}}
document.addEventListener("click",e=>{if(!e.target.closest('#nav button[data-page="cv"]'))return;setTimeout(()=>{if($("#roleTailor"))return;let a=get("gj_jobs",[]),card=document.createElement("div");card.id="roleTailor";card.className="card";card.innerHTML='<b>Role-specific CV draft</b><p class="small muted">Reorders supplied skills and emphasis only; does not invent achievements or credentials.</p><label>Target role</label><select id="tailorRole">'+a.map((j,i)=>'<option value="'+i+'">'+esc(j.title+" — "+j.company)+'</option>').join("")+'</select><div class="actions"><button class="btn" id="makeTailored">Generate tailored draft</button></div><p id="tailorNote" class="small muted"></p>';let target=$("#cvhead")?.closest(".card");if(target)target.parentNode.insertBefore(card,target);$("#makeTailored")?.addEventListener("click",()=>{let j=a[Number($("#tailorRole").value)];if(!j)return alert("Save a job first.");let t=(j.title+" "+(j.description||"")+" "+(j.skills||"")).toLowerCase(),all=["VICIdial multi-server clusters","ViciBox","ViciPhone WebRTC","SSL/TLS","WSS","STUN/NAT","MariaDB","GoAutoDial","VOS3000","ASTPP","MagnusBilling","FreeSWITCH","Asterisk","FreePBX","SIP trunking","SIP/RTP troubleshooting","G.711/G.729","iptables","Fail2ban","IP whitelisting","AWS EC2/VPC","Oracle Cloud","Linux VPS","CRM webhooks","REST API","predictive/progressive pacing","CLI rotation","ACD/IVR","SLA","AHT","occupancy","QA","RPC","WBRs","CRTC compliance"],matched=all.filter(s=>t.includes(s.toLowerCase())),rest=all.filter(s=>!matched.includes(s));if($("#cvhead"))$("#cvhead").value=j.title+" | VoIP, VICIdial & Softswitch Specialist";if($("#cvskills"))$("#cvskills").value=[...matched,...rest].join(", ");if($("#cvsummary"))$("#cvsummary").value="16+ years in international voice operations, VoIP infrastructure and dialer administration. Role-relevant skills: "+(matched.join(", ")||"voice operations and technical operations")+". Experience includes multi-server VICIdial deployments, softswitch administration, SIP/RTP troubleshooting, cloud-hosted telephony and operations leadership.";$("#tailorNote").textContent="Matched skills: "+matched.join(", ")+". Review the job requirements; this draft uses only supplied profile facts."})},120)});
})();