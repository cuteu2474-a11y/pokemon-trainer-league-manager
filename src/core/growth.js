import { STATS, MAX_GP, gpBudget, validateGP } from "./stats.js";
import { gpMarginalValues } from "./score.js";
export function mistakeProbability(skill) {
  if (!Number.isInteger(skill) || skill < 1 || skill > 20) throw new RangeError("Skill must be 1..20");
  return 0.02 + 0.42 * ((20-skill)/19)**1.5;
}
function pick(options, weights, rng) {
  const total=weights.reduce((a,b)=>a+b,0);
  let v=rng()*total;
  for(let i=0;i<options.length;i++) {v-=weights[i]; if(v<0) return options[i];}
  return options.at(-1);
}
export function allocateGrowth(gp, caBefore, caAfter, skill, context, rng=Math.random) {
  if(!Number.isInteger(caAfter) || caAfter<caBefore || caAfter>200) throw new RangeError("Invalid CA progression");
  validateGP(gp,caBefore);
  const result={...gp}, target=gpBudget(caAfter), error=mistakeProbability(skill);
  let count=gpBudget(caBefore);
  while(count<target) {
    const values=gpMarginalValues(result,context);
    const options=Object.keys(values);
    if(!options.length) throw new Error("No GP capacity");
    const numbers=options.map(s=>values[s]), lo=Math.min(...numbers), hi=Math.max(...numbers), span=Math.max(hi-lo,1e-9);
    const bad=rng()<error;
    const weights=options.map(s=>bad ? 0.05+(hi-values[s])/span : (0.05+(values[s]-lo)/span)**4);
    result[pick(options,weights,rng)]++;
    count++;
  }
  return result;
}
export function seededRandom(seed) {
  let x=seed>>>0;
  return () => {x=(x+0x6D2B79F5)>>>0;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
