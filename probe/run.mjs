for (const m of ["US","TH"]) { const t=Date.now(); const r=await fetch(`https://stock-invest-eight.vercel.app/api/hot?market=${m}&x=${Date.now()}`); const j=await r.json(); console.log(`\n== ${m} ${r.status} ${Date.now()-t}ms`, j.error||'');
 for (const s of j.sections||[]) { console.log(`-- ${s.title} (${s.items.length})`); for (const i of s.items.slice(0,4)) console.log(`${i.symbol} ${i.changePercent.toFixed(1)}% | ${i.news?.titleTh||i.news?.title||''}`); } }
// rerun 1794559594
