const B="https://stock-invest-eight.vercel.app";
for (const [style,market] of [["dip","US"],["momentum","US"],["dip","TH"],["momentum","TH"]]) {
  let t=Date.now(); const r=await fetch(`${B}/api/discover?market=${market}&sector=&cap=all&offset=0&style=${style}&size=100`); const j=await r.json();
  console.log(`\n== ${style} ${market} discover ${r.status} ${Date.now()-t}ms symbols ${j.symbols?.length} total ${j.total} next ${j.nextOffset}`);
  console.log((j.symbols||[]).slice(0,30).join(" "));
  const syms=(j.symbols||[]).slice(0,10); t=Date.now();
  const res=await Promise.all(syms.map(async s=>{const t0=Date.now();const r=await fetch(`${B}/api/stock/${encodeURIComponent(s)}?market=${market}&mode=screen`);const d=await r.json().catch(()=>null);return `${s}:${r.status}:${Date.now()-t0}ms`;}));
  console.log(`load 10 in ${Date.now()-t}ms ->`, res.join(" "));
}
