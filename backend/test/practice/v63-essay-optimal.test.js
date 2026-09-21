import test from 'node:test';
import assert from 'node:assert/strict';
import {autoDistribute,totalScoreOf} from '../../src/services/matrixBalancer.js';
test('V63 tự luận: đối chiếu nghiệm gần nhất với vét cạn độc lập cấu hình nhỏ',()=>{
 for(const {total,tn,tl} of [{total:2,tn:2,tl:2},{total:2.5,tn:2,tl:3},{total:3,tn:3,tl:3},{total:2,tn:0,tl:4}]){
  const ratios=[30,30,20,20],target=ratios.map(r=>total*r/100),cells=autoDistribute({totalScore:total,ratios,branchConfigs:[{branch_code:'T',score:total,tn,tl}]}),actual=[1,2,3,4].map(n=>cells.filter(c=>c.cognitive_level==='M'+n).reduce((s,c)=>s+c.question_count*c.score_per_question,0));
  let best=Infinity;
  const loss=a=>a.reduce((s,v,i)=>s+Math.abs(v-target[i]),0);
  function levels(points,i=0,a=[0,0,0,0]){if(i===points.length){best=Math.min(best,loss(a));return;}for(let l=0;l<4;l++){a[l]+=points[i]/4;levels(points,i+1,a);a[l]-=points[i]/4;}}
  function partition(left,count,points=[]){if(count===1){if(left>0)levels([...Array(tn).fill(1),...points,left]);return;}for(let x=1;x<=left-count+1;x++)partition(left-x,count-1,[...points,x]);}
  partition(total*4-tn,tl);assert(Math.abs(loss(actual)-best)<1e-7,JSON.stringify({total,tn,tl,actual,best}));assert.equal(totalScoreOf(cells),total);assert.equal(cells.filter(c=>c.q_type==='essay').reduce((s,c)=>s+c.question_count,0),tl);
 }
});
