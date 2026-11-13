import fs from "node:fs/promises";
import crypto from "node:crypto";

const SKILLS = ["VICIdial","ViciBox","ViciPhone WebRTC","SSL/TLS","WSS","STUN/NAT","MariaDB","GoAutoDial","VOS3000","ASTPP","MagnusBilling","FreeSWITCH","Asterisk","FreePBX","SIP trunking","SIP/RTP troubleshooting","G.711/G.729","iptables","Fail2ban","IP whitelisting","AWS EC2/VPC","Oracle Cloud","Linux VPS","CRM webhooks","REST API","predictive/progressive pacing","CLI rotation","ACD/IVR","SLA","AHT","occupancy","QA","RPC","WBRs","CRTC compliance"];
const KEYS = ["vicidial","voip","telephony","softswitch","ccaas","asterisk","freeswitch","sip","dialer","contact center","contact centre","voice operations","voice platform","voice bot","cloud communications","cpaaS","customer communication","customer engagement","technical account","implementation","enterprise customer success","contact-center","contact centre technology","unified communications","ucaas","rtp","webrtc"];
const MUST = ["VICIdial","SIP","Asterisk","FreeSWITCH","CCaaS","softswitch","SBC"];
const clean = value => String(value || "").replace(/<[^>]*>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g," ").trim();
const hash = value => crypto.createHash("sha256").update(value).digest("hex").slice(0,20);
const ageDays = value => { const n = Date.parse(value || ""); return Number.isFinite(n) ? (Date.now()-n)/86400000 : 9999; };
const allowedLocation = job => {
  const location = (job.location || "").toLowerCase();
  const remote = !!job.remote || /remote/i.test((job.location || "") + " " + (job.workMode || ""));
  if (/bengaluru|bangalore/.test(location)) return true;
  return remote && /india|worldwide|anywhere|global/i.test(location);
};
const relevant = job => KEYS.some(word => ((job.title || "") + " " + (job.description || "") + " " + (job.tags || []).join(" ")).toLowerCase().includes(word));
const assess = job => {
  const text = ((job.title || "") + " " + (job.description || "") + " " + (job.tags || []).join(" ")).toLowerCase();
  const matched = SKILLS.filter(skill => text.includes(skill.toLowerCase()));
  const relevantWords = KEYS.filter(word => text.includes(word));
  const senior = /lead|manager|head|senior|specialist|architect|implementation/i.test(job.title || "");
  const leadership = /lead|manager|team|operations|mentor|supervis/i.test(text);
  const years = text.match(/(\d+)\s*\+?\s*years?/);
  const experience = years ? (Number(years[1]) <= 16 ? 20 : 8) : 14;
  const technical = Math.min(30, matched.length * 3);
  const seniority = senior ? 15 : 8;
  const domain = Math.min(15, relevantWords.length * 4);
  const location = 10;
  const leadershipScore = leadership ? 10 : 4;
  const required = MUST.filter(skill => text.includes(skill.toLowerCase()));
  const candidateSkills = (SKILLS.join(" ") + " CCaaS softswitch").toLowerCase();
  const missing = required.filter(skill => !candidateSkills.includes(skill.toLowerCase()));
  const mustHavePass = required.length ? ((required.length-missing.length)/required.length >= 0.7) : null;
  const score = technical + experience + seniority + domain + location + leadershipScore;
  return {fitScore:Math.min(100,Math.round(score)),scoreBreakdown:{technical,experience,seniority,domain,location,leadership:leadershipScore},matchedSkills:matched,missingSkills:missing,mustHavePass};
};
async function fetchJson(url) {
  const response = await fetch(url,{headers:{"user-agent":"GauravJobDesk/1.0"}});
  if (!response.ok) throw new Error(response.status + " " + url);
  return response.json();
}
const config = JSON.parse(await fs.readFile("job-sources.json","utf8"));
const jobs = [], errors = [], checked = [];
function add(job) {
  job.description = clean(job.description).slice(0,5000);
  if (!job.title || !job.company || !job.url || !String(job.url).startsWith("https://")) return;
  if (!/lead|manager|senior|specialist|architect|implementation|operations|consultant|head|principal|director|technical account|customer success|project manager|voice platform|product head/i.test(job.title)) return;
  if (job.jobType && !/full.?time|permanent/i.test(job.jobType)) return;
  if ((job.posted && ageDays(job.posted)>90) || !allowedLocation(job) || !relevant(job)) return;
  const score = assess(job);
  jobs.push({...job,...score,id:job.id || hash(job.company+"|"+job.title+"|"+job.url),verified:true,verification:"Returned as a published listing by the source API; confirm the vacancy on the employer page",checkedAt:new Date().toISOString()});
}
for (const entry of config.greenhouse || []) {
  const slug = typeof entry === "string" ? entry : entry.slug;
  const company = typeof entry === "string" ? entry : (entry.company || entry.slug);
  try {
    const data = await fetchJson("https://boards-api.greenhouse.io/v1/boards/"+encodeURIComponent(slug)+"/jobs?content=true");
    checked.push("Greenhouse:"+company);
    for (const item of data.jobs || []) add({title:item.title,company,location:item.location?.name || "",workMode:/remote/i.test(item.location?.name || "")?"Remote":"Unspecified",remote:/remote/i.test(item.location?.name || ""),posted:item.first_published || item.updated_at || "",url:item.absolute_url,description:item.content || "",source:"Greenhouse",jobType:item.employment_type || "",tags:[]});
  } catch(error) { errors.push("Greenhouse "+slug+": "+error.message); }
}
for (const entry of config.lever || []) {
  const slug = typeof entry === "string" ? entry : entry.slug;
  const company = typeof entry === "string" ? entry : (entry.company || entry.slug);
  try {
    const data = await fetchJson("https://api.lever.co/v0/postings/"+encodeURIComponent(slug)+"?mode=json");
    checked.push("Lever:"+company);
    for (const item of data || []) add({title:item.text,company,location:item.categories?.location || "",workMode:item.workplaceType || "Unspecified",remote:/remote/i.test(item.workplaceType || "") || /remote/i.test(item.categories?.location || ""),posted:item.createdAt?new Date(item.createdAt).toISOString():"",url:item.hostedUrl,description:item.descriptionPlain || item.description || "",source:"Lever",jobType:item.categories?.commitment || "",tags:[]});
  } catch(error) { errors.push("Lever "+slug+": "+error.message); }
}
// Exotel publishes its current vacancies on a public Trakstar careers page.
// Read the live listing page and each linked job description so roles are not missed
// simply because the employer does not expose a Greenhouse/Lever board API.
try {
  const html = await (await fetch("https://exotel.hire.trakstar.com/jobs", {headers:{"user-agent":"GauravJobDesk/1.0"}})).text();
  const links = [...html.matchAll(/<a\b[^>]*href=["'](\/jobs\/[a-z0-9]+\/?)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  const seen = new Set();
  for (const match of links) {
    const path = match[1];
    if (seen.has(path) || path === "/jobs/") continue;
    seen.add(path);
    const listingText = clean(match[2]);
    const title = listingText.replace(/\s+(?:Bengaluru|Bangalore|Gurugram|Gurgaon|Mumbai|Hyderabad|Delhi|Noida)\b.*$/i, "").trim();
    const loc = (listingText.match(/\b(?:Bengaluru|Bangalore|Gurugram|Gurgaon|Mumbai|Hyderabad|Delhi|Noida)(?:\s*\/\s*(?:Bengaluru|Bangalore|Gurugram|Gurgaon|Mumbai|Hyderabad|Delhi|Noida))?(?:,\s*[A-Za-z ]+)?/i)||[])[0] || "";
    if (!title) continue;
    if (!/head of customer success|senior customer success|principal engineer \(voice|technical account manager|technical project manager|contact center|contact centre|voice platform|implementation manager|implementation lead/i.test(title)) continue;
    try {
      const detailUrl = "https://exotel.hire.trakstar.com" + path;
      const detail = await (await fetch(detailUrl, {headers:{"user-agent":"GauravJobDesk/1.0"}})).text();
      const plain = clean(detail.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," "));
      add({title,company:"Exotel",location:loc || "",workMode:/remote/i.test(loc)?"Remote":"On-site/Hybrid",remote:/remote/i.test(loc),posted:"",url:detailUrl,description:plain,source:"Exotel Careers",jobType:"Full-time",tags:[]});
    } catch(error) { errors.push("Exotel detail "+title+": "+error.message); }
  }
  checked.push("Exotel official careers (Trakstar)");
} catch(error) { errors.push("Exotel careers: "+error.message); }
let metadata = {};
try { metadata = JSON.parse(await fs.readFile("jobs-meta.json","utf8")); } catch {}
if (!metadata.arbeitnowFetchedAt || Date.now()-Date.parse(metadata.arbeitnowFetchedAt)>3600000) {
  try {
    for (let page=1;page<=3;page++) {
      const data=await fetchJson("https://www.arbeitnow.com/api/job-board-api?page="+page);
      checked.push("Arbeitnow");
      for (const item of data.data || []) add({title:item.title,company:item.company_name,location:item.location || "",workMode:item.remote?"Remote":"On-site",remote:!!item.remote,posted:item.created_at || "",url:item.url,description:item.description || "",source:"Arbeitnow",jobType:item.job_type || "",tags:item.tags || []});
      if (!data.links?.next) break;
    }
    metadata.arbeitnowFetchedAt=new Date().toISOString();
  } catch(error) { errors.push("Arbeitnow: "+error.message); }
} else checked.push("Arbeitnow (hourly cache)");
if (!metadata.remotiveFetchedAt || Date.now()-Date.parse(metadata.remotiveFetchedAt)>6*60*60*1000) {
  try {
    const data=await fetchJson("https://remotive.com/api/remote-jobs?limit=500");
    checked.push("Remotive (6-hour cache)");
    for (const item of data.jobs || []) add({id:"remotive-"+item.id,title:item.title,company:item.company_name,location:item.candidate_required_location || "Worldwide",workMode:"Remote",remote:true,posted:item.publication_date || "",url:item.url,description:item.description || "",source:"Remotive",jobType:item.job_type || "",tags:[item.category || "",item.job_type || ""],salary:item.salary || ""});
    metadata.remotiveFetchedAt=new Date().toISOString();
  } catch(error) { errors.push("Remotive: "+error.message); }
} else checked.push("Remotive (6-hour cache)");
const unique=new Map();
for (const job of jobs) { const key=(job.company+"|"+job.title).toLowerCase(); if(!unique.has(key)) unique.set(key,job); }
const output=[...unique.values()].sort((a,b)=>(b.posted || "").localeCompare(a.posted || "")).slice(0,300);
// Keep an India-calendar-day history of unique vacancies seen across every scheduled refresh.
const indiaDate = new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
let history={schemaVersion:1,timezone:"Asia/Kolkata",days:{}};
try { history=JSON.parse(await fs.readFile("jobs-history.json","utf8")); } catch {}
history.days ||= {};
const day=history.days[indiaDate] ||= {date:indiaDate,jobs:[]};
const dayJobs=new Map((day.jobs||[]).map(job=>[String(job.id),job]));
for (const job of output) {
  const id=String(job.id || hash(job.company+"|"+job.title+"|"+job.url));
  if (!dayJobs.has(id)) dayJobs.set(id,{id,title:job.title,company:job.company,url:job.url,location:job.location,firstSeenAt:new Date().toISOString()});
}
day.jobs=[...dayJobs.values()];
day.uniqueAvailable=day.jobs.length;
day.lastUpdatedAt=new Date().toISOString();
// Keep a rolling two-year daily history to keep the public static data file bounded.
for (const key of Object.keys(history.days).sort().slice(0,-730)) delete history.days[key];
await fs.writeFile("jobs-history.json",JSON.stringify(history,null,2));
const feed={meta:{lastRefreshed:new Date().toISOString(),sourcesChecked:checked.join(", ") || "No ATS boards configured",sourceErrors:errors,listingCount:output.length,windowDays:90,locationRule:"Bengaluru office/hybrid/remote; outside Bengaluru fully remote India or worldwide only",note:"Published by source API at collection time. Always open the original employer or job-board listing to confirm it remains accepting applications."},jobs:output};
await fs.writeFile("jobs.json",JSON.stringify(feed,null,2));
metadata.lastRefreshed=feed.meta.lastRefreshed;
metadata.lastErrors=errors;
await fs.writeFile("jobs-meta.json",JSON.stringify(metadata,null,2));
console.log("Published "+output.length+" matching listings from "+checked.length+" source checks; "+errors.length+" errors.");
