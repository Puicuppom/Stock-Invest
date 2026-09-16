// Regression tests for valuation mechanics, not a predictive backtest.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
function load(file, require = () => ({})) {
  const exports = {};
  new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,require);
  return exports;
}
const engine=load('src/lib/valuation-engine.ts');
const {calculateFairValue}=load('src/lib/fair-value.ts',name=>name==='./valuation-engine'?engine:{});
const base={sector:'Technology',financialCurrency:'USD',quoteCurrency:'USD',trailingEps:4,forwardEps:6,totalDebt:100,totalCash:50,sharesOutstanding:10,ebitda:100,dividendRate:1};
const result=engine.evaluateValuation('US',base);
assert.equal(result.models.find(m=>m.name.startsWith('P/E')).base,88);
assert.equal(result.models.find(m=>m.name.startsWith('EV/')).base,155);
assert(result.fairValueLow <= result.fairValue && result.fairValue <= result.fairValueHigh);
assert.equal(calculateFairValue('US',10,base).fairValue,calculateFairValue('US',1000,base).fairValue,'fair value independent of quote price');
assert.equal(engine.evaluateValuation('TH',base).fairValue,null,'currency mismatch blocked');
assert.equal(engine.evaluateValuation('US',{}).fairValue,null,'no made-up fallback');
assert.equal(engine.evaluateValuation('US',{...base,sector:'Financial Services'}).models.some(m=>m.name.startsWith('EV/')),false);
assert.equal(engine.evaluateValuation('US',{...base,sector:'Real Estate'}).fairValue,null);
assert.equal(engine.evaluateValuation('US',{...base,totalDebt:null}).models.some(m=>m.name.startsWith('EV/')),false,'missing debt is not zero');
assert.equal(engine.evaluateValuation('US',{...base,forwardEps:-1}).models.some(m=>m.name.startsWith('P/E')),true);
assert.equal(engine.evaluateValuation('US',{...base,dividendRate:10}).models.some(m=>m.name.startsWith('ปันผล')),false,'unsustainable payout skipped');
assert.equal(engine.evaluateValuation('US',{...base,forwardEps:40}).models.find(m=>m.name.startsWith('P/E')).base,88,'EPS spike not extrapolated');
assert.equal(calculateFairValue('US',NaN,base).fairValue,null);
assert.equal(engine.evaluateValuation('US',{...base,dividendRate:2,revenueGrowth:0.03,earningsGrowth:0.04}).models.some(m=>m.name.startsWith('ปันผล')),true);
assert.equal(engine.evaluateValuation('US',{...base,dividendRate:0.1,revenueGrowth:0.03,earningsGrowth:0.04}).models.some(m=>m.name.startsWith('ปันผล')),false,'token dividend is not a mature dividend payer');
console.log('13 valuation regression checks passed (not a backtest)');

const {convertPrimaryFundamentals}=load('src/lib/valuation-currency.ts');
const now=Date.UTC(2026,8,16);
const fx={rate:1.2,timestamp:now/1000};
const primary={...base,financialCurrency:'EUR',quoteCurrency:'EUR',marketCap:1000,dividendRate:2};
const listed={...base,financialCurrency:'EUR',trailingEps:4.8,analyst:200,marketCap:1500};
const converted=convertPrimaryFundamentals(primary,listed,fx,now);
assert.equal(converted.trailingEps,4.8,'convert primary EPS once, not listed USD EPS twice');
assert.equal(converted.ebitda,120);
assert.equal(converted.totalDebt,120);
assert.equal(converted.dividendRate,2.4);
assert.equal(converted.analyst,200,'US analyst target stays USD');
assert.equal(converted.marketCap,1500);
assert.equal(primary.trailingEps,4,'input not mutated');
assert(engine.evaluateValuation('US',converted).fairValue>0);
assert.equal(convertPrimaryFundamentals(primary,listed,{...fx,rate:NaN},now),null);
assert.equal(convertPrimaryFundamentals(primary,listed,{...fx,timestamp:fx.timestamp-8*86400},now),null);
assert.equal(convertPrimaryFundamentals(primary,listed,{...fx,timestamp:fx.timestamp+86400},now),null);
assert.equal(convertPrimaryFundamentals(primary,{...listed,sharesOutstanding:20},fx,now),null);
assert.equal(convertPrimaryFundamentals({...primary,financialCurrency:'JPY'},listed,fx,now),null);
assert.equal(convertPrimaryFundamentals({...primary,sharesOutstanding:null},listed,fx,now),null);
console.log('Currency conversion regression checks passed');

const {historicalPE}=load('src/lib/historical-valuation.ts');
const earnings=[2020,2021,2022,2023,2024].map(y=>({date:y+'-12-31',eps:2,currency:'USD'}));
const candles=[];for(let y=2021;y<=2025;y++)for(let m=1;m<=12;m++)candles.push({date:y+'-'+String(m).padStart(2,'0')+'-15',close:40});
const history=historicalPE(candles,earnings,'USD');
assert.equal(history.median,20);
assert.equal(history.low,20);
assert.equal(history.high,20);
assert.equal(historicalPE(candles,earnings,'EUR'),null);
assert.equal(historicalPE(candles.slice(-10),earnings,'USD'),null);
assert.equal(historicalPE(candles,earnings.map(e=>({...e,eps:-2})),'USD'),null);
assert.deepEqual(historicalPE(candles,[...earnings,{date:'2030-12-31',eps:100,currency:'USD'}],'USD'),history,'future statements excluded');
const historicalModel=engine.evaluateValuation('US',{...base,historicalPE:history}).models.find(m=>m.name.startsWith('P/E'));
assert.equal(historicalModel.base,86,'historical PE times trailing EPS, not adjusted forward EPS');
assert.equal(engine.evaluateValuation('US',{...base,forwardEps:200,historicalPE:history}).models.find(m=>m.name.startsWith('P/E')).base,86);
console.log('Historical valuation regression checks passed');

const historicalResult=engine.evaluateValuation('US',{...base,historicalPE:history});
assert.equal(historicalResult.fairValue,86,'generic EV multiple does not dilute company historical model');
assert.equal(historicalResult.modelCount,1);
assert.equal(historicalResult.models.find(m=>m.name.startsWith('EV/')).referenceOnly,true);
const nvo=convertPrimaryFundamentals({...primary,financialCurrency:'DKK',quoteCurrency:'DKK'},listed,{rate:0.15,timestamp:now/1000},now,{symbol:'NOVO-B.CO',currency:'DKK',quote:'USD'});
assert.equal(nvo.trailingEps,0.6);
assert.equal(nvo.sharesOutstanding,null,'unverified A+B capital cannot enter enterprise valuation');
assert.equal(nvo.financialCurrency,'USD');
console.log('NVO and model eligibility checks passed');

const tsm=convertPrimaryFundamentals({...primary,financialCurrency:'TWD',quoteCurrency:'TWD',sharesOutstanding:50}, {...listed,sharesOutstanding:10}, {rate:.03,timestamp:now/1000}, now, {symbol:'2330.TW',currency:'TWD',quote:'USD',ordinaryPerListed:5});
assert.equal(tsm.trailingEps,0.6);
assert.equal(tsm.totalDebt,3,'total debt converted by FX only, never ADR ratio');
assert.equal(tsm.sharesOutstanding,10);
assert.equal(tsm.analyst,200);
assert.equal(convertPrimaryFundamentals(tsm,listed,fx,now),null,'normalized data cannot be converted a second time');
console.log('ADR 5:1 regression checks passed');

const extreme={...history,low:80,median:100.31,high:200};
const nvda=engine.evaluateValuation('US',{...base,trailingEps:7.96,forwardEps:15.6,historicalPE:extreme});
assert(Math.abs(nvda.fairValue-218.9)<1e-8);
assert(nvda.models.find(m=>m.name==='P/E เทียบประวัติของหุ้น').referenceOnly);
assert.equal(nvda.fairValue,engine.evaluateValuation('US',{...base,trailingEps:7.96,forwardEps:500,analyst:1000,historicalPE:extreme}).fairValue,'targets and adjusted forward EPS cannot inflate value');
for(const roe of [.01,.1,.2]){const result=engine.evaluateValuation('US',{...base,sector:'Financial Services',bookValue:50,returnOnEquity:roe});const pb=result.models.find(m=>m.name.startsWith('P/BV'));assert(pb.low<=pb.base && pb.base<=pb.high);assert(Number.isFinite(pb.base));}
assert.equal(engine.evaluateValuation('US',{...base,sector:'Financial Services',bookValue:-1,returnOnEquity:.1}).models.some(m=>m.name.startsWith('P/BV')),false);
console.log('Extreme historical multiples and P/BV checks passed');

const forecast=engine.evaluateValuation('US',{...base,forwardEps:10}).models.find(m=>m.name==='Forward P/E กรณีคาดการณ์');
assert.equal(forecast.base,220);
assert(Math.abs(forecast.low-140.8)<1e-8);
assert(Math.abs(forecast.high-316.8)<1e-8);
assert(forecast.referenceOnly);
assert(!engine.evaluateValuation('US',{...base,forwardEps:-1}).models.some(m=>m.name==='Forward P/E กรณีคาดการณ์'));
assert(!engine.evaluateValuation('US',{...base,sector:'Financial Services'}).models.some(m=>m.name==='Forward P/E กรณีคาดการณ์'));
console.log('Forward forecast sensitivity checks passed');

const {comparePeers}=load('src/lib/peer-valuation.ts');
const target={...base,industry:'Semiconductors',revenueGrowth:.2,operatingMargins:.3};
const peerRows=[10,20,30].map((pe,i)=>({symbol:'P'+i,data:{...target,forwardPE:pe}}));
const peer=comparePeers('NVDA',target,peerRows);
assert.equal(peer.median,20);assert.equal(peer.low,15);assert.equal(peer.high,25);
assert.equal(comparePeers('P0',target,peerRows),null);
assert.equal(comparePeers('NVDA',target,[peerRows[0],peerRows[0],peerRows[1]]),null);
assert.equal(comparePeers('NVDA',target,peerRows.map(p=>({...p,data:{...p.data,industry:'Other'}}))),null);
assert.equal(comparePeers('NVDA',target,peerRows.map(p=>({...p,data:{...p.data,revenueGrowth:1}}))),null);
assert.equal(comparePeers('NVDA',target,peerRows.map(p=>({...p,data:{...p.data,forwardPE:NaN}}))),null);
const peerModel=engine.evaluateValuation('US',{...target,peerForward:peer}).models.find(m=>m.name==='Forward P/E คู่เทียบ');
assert.equal(peerModel.base,120);assert(peerModel.referenceOnly);
console.log('Peer selection checks passed');

const weighted=calculateFairValue('US',100,{...base,analyst:200});
assert.equal(weighted.fairValue,(weighted.modelFairValue+200)/2);
assert.equal(weighted.analystWeight,.5);
assert(Math.abs(weighted.upsidePercent-(weighted.fairValue/100-1)*100)<1e-9);
assert.equal(calculateFairValue('US',100,{...base,analyst:null}).analystWeight,0);
assert.equal(calculateFairValue('US',100,{...base,analyst:NaN}).analystWeight,0);
assert.equal(calculateFairValue('US',100,{...base,financialCurrency:'EUR',analyst:200}).fairValue,null);
assert(weighted.fairValueLow<=weighted.fairValue && weighted.fairValue<=weighted.fairValueHigh);
console.log('Analyst blend checks passed');
