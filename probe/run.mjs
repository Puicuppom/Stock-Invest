const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const c1=await fetch("https://fc.yahoo.com",{headers:{"User-Agent":UA},redirect:"manual"});
const cookie=c1.headers.getSetCookie().map(s=>s.split(";")[0]).join("; ");
const crumb=await (await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb",{headers:{"User-Agent":UA,Cookie:cookie}})).text();
async function screen(name, operands, sortField, sortType, size=25){
  const t=Date.now();
  const r=await fetch(`https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(crumb)}`,{method:"POST",headers:{"Content-Type":"application/json","User-Agent":UA,Cookie:cookie},
    body:JSON.stringify({offset:0,size,sortField,sortType,quoteType:"EQUITY",query:{operator:"and",operands},userId:"",userIdType:"guid"})});
  const txt=await r.text(); let j; try{j=JSON.parse(txt)}catch{console.log(name,r.status,txt.slice(0,300));return;}
  const res=j.finance?.result?.[0];
  if(!res){console.log(name,r.status,JSON.stringify(j.finance?.error||j).slice(0,300));return;}
  console.log(`\n== ${name} status ${r.status} total ${res.total} ms ${Date.now()-t}`);
  for(const q of res.quotes.slice(0,size)) console.log([q.symbol,(q.shortName||'').slice(0,22),q.regularMarketPrice,q.fiftyTwoWeekHigh, q.fiftyTwoWeekHigh?((q.regularMarketPrice/q.fiftyTwoWeekHigh-1)*100).toFixed(0)+'%':'', (q.marketCap/1e9).toFixed(0)+'B', q.fiftyTwoWeekChangePercent?.toFixed?.(0)].join(' | '));
  if(name==='keys') console.log(Object.keys(res.quotes[0]).join(','));
}
const base=[{operator:"eq",operands:["region","us"]},{operator:"gte",operands:["intradaymarketcap",2e9]}];
await screen("keys",base,"intradaymarketcap","DESC",1);
await screen("dip-quality",[...base,{operator:"gte",operands:["returnonequity.lasttwelvemonths",10]},{operator:"gte",operands:["totalrevenues1yrgrowth.lasttwelvemonths",0]},{operator:"gt",operands:["peratio.lasttwelvemonths",0]}],"fiftytwowkpercentchange","ASC");
await screen("dip-q-alt",[...base,{operator:"gte",operands:["returnonequity.lasttwelvemonths",10]},{operator:"gt",operands:["quarterlyrevenuegrowth.quarterly",0]},{operator:"gt",operands:["epsgrowth.lasttwelvemonths",-100]}],"percentchange","ASC",5);
await screen("momentum",[...base,{operator:"gte",operands:["returnonequity.lasttwelvemonths",15]},{operator:"gte",operands:["totalrevenues1yrgrowth.lasttwelvemonths",10]},{operator:"gt",operands:["epsgrowth.lasttwelvemonths",0]}],"fiftytwowkpercentchange","DESC");
await screen("dip-th",[{operator:"eq",operands:["region","th"]},{operator:"gte",operands:["intradaymarketcap",10e9]},{operator:"gte",operands:["returnonequity.lasttwelvemonths",10]}],"fiftytwowkpercentchange","ASC",10);
