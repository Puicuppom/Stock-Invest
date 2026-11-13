const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const c1=await fetch("https://fc.yahoo.com",{headers:{"User-Agent":UA},redirect:"manual"});
const cookie=c1.headers.getSetCookie().map(s=>s.split(";")[0]).join("; ");
const crumb=await (await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb",{headers:{"User-Agent":UA,Cookie:cookie}})).text();
const H={"User-Agent":UA,Cookie:cookie};
const show=(n,arr)=>console.log(`\n== ${n} (${arr.length})\n`+arr.slice(0,15).map(q=>[q.symbol,(q.shortName||'').slice(0,20),q.regularMarketChangePercent?.toFixed?.(1),q.marketCap?(q.marketCap/1e9).toFixed(0)+'B':'',q.exchange,q.quoteType].join(' | ')).join('\n'));
for (const r of ["US","TH"]) { const j=await (await fetch(`https://query1.finance.yahoo.com/v1/finance/trending/${r}?count=25&crumb=${crumb}`,{headers:H})).json().catch(e=>({e:String(e)})); console.log(`\n== trending ${r}`, JSON.stringify(j).slice(0,600)); }
for (const id of ["day_gainers","day_losers","most_actives","undervalued_large_caps","growth_technology_stocks"]) {
  const j=await (await fetch(`https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?scrIds=${id}&count=25&crumb=${crumb}`,{headers:H})).json().catch(e=>({e:String(e)}));
  const q=j.finance?.result?.[0]?.quotes||[]; show(id,q); if(!q.length) console.log(JSON.stringify(j).slice(0,300));
}
const t=Date.now(); const s=await (await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=NVDA&quotesCount=0&newsCount=3&crumb=${crumb}`,{headers:H})).json();
console.log(`\n== news NVDA ${Date.now()-t}ms`, JSON.stringify((s.news||[]).map(n=>({t:n.title,p:n.publisher,time:n.providerPublishTime,link:n.link?.slice(0,80),rel:n.relatedTickers}))).slice(0,900));
const s2=await (await fetch(`https://query1.finance.yahoo.com/v1/finance/search?q=PTT.BK&quotesCount=0&newsCount=3`,{headers:H})).json();
console.log(`\n== news PTT.BK`, JSON.stringify((s2.news||[]).map(n=>({t:n.title,p:n.publisher}))).slice(0,500));
