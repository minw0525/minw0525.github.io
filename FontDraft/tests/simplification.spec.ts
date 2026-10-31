import {test,expect} from './fixtures';
test('brush and eraser simplification measurements',async({page},info)=>{
 const result=await page.evaluate(async()=>{
  const g=await import('/src/geometry.ts');
  const samples={
   wave:Array.from({length:80},(_,i)=>({x:i*6,y:Math.sin(i/12)*80})),
   jitter:Array.from({length:200},(_,i)=>({x:i*2.5,y:Math.sin(i/27)*65+Math.sin(i*1.7)*1.4})),
   loop:Array.from({length:121},(_,i)=>({x:Math.cos(i*Math.PI/60)*110,y:Math.sin(i*Math.PI/60)*130})),
  };
  const cases=Object.entries(samples).map(([name,points])=>({name,run:(simplify:number)=>g.brush(points,{size:36,ratio:.45,angle:35,simplify})}));
  const square=g.shape('rectangle',{x:0,y:0},{x:500,y:300});
  cases.push({name:'eraser',run:(simplify:number)=>g.erase(square,new Set(),samples.jitter.map(p=>({x:p.x,y:p.y+150})),{size:36,ratio:1,angle:0,simplify})});
  return cases.map(c=>({name:c.name,results:[0,1,3,6].map(t=>{const start=performance.now(),out=c.run(t);return {t,nodes:out.reduce((n,c)=>n+c.nodes.length,0),contours:out.length,ms:Math.round(performance.now()-start)};})}));
 });
 console.log(JSON.stringify(result));await info.attach('simplification-measurements',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 expect(result.length).toBe(4);
});
