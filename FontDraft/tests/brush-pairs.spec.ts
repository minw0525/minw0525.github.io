import { test, expect } from './fixtures';
test('audit short adjacent brush segments before and after integer rounding', async ({ page }, info) => {
 const result = await page.evaluate(async()=>{
  const {brush}=await import('/src/geometry.ts'),{roundNodes}=await import('/src/model.ts');
  const cases = [
   [{x:0,y:0},{x:250,y:140},{x:70,y:90},{x:280,y:180}],
   Array.from({length:200},(_,i)=>({x:i*2.5,y:Math.sin(i/27)*65+Math.sin(i*1.7)*1.4})),
   [{x:0,y:0},{x:180,y:0},{x:181,y:1},{x:280,y:220}],
  ];
  let seed=12345; const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let k=0;k<40;k++) { let x=0,y=0;const p=[];for(let i=0;i<50;i++){x+=random()*20-6;y+=random()*25-12;p.push({x,y});}cases.push(p); }
  return cases.map(points=>{
   const cs=brush(points,{size:36,ratio:.45,angle:35,simplify:3});
   const audit=()=>cs.flatMap(c=>c.nodes.map((n,i)=>{const next=c.nodes[(i+1)%c.nodes.length];return {distance:Math.hypot(n.x-next.x,n.y-next.y),x:n.x,y:n.y};})).filter(p=>p.distance<3);
   const raw=audit(); roundNodes(cs); return {raw,rounded:audit(),uniqueIds: new Set(cs.flatMap(c=>c.nodes.map(n=>n.id))).size === cs.reduce((n,c)=>n+c.nodes.length,0),nodes:cs.reduce((n,c)=>n+c.nodes.length,0)};
  });
 });
 await info.attach('short-segment-audit',{body:JSON.stringify(result,null,2),contentType:'application/json'});
 expect(result).toHaveLength(43); expect(result.every(r=>r.uniqueIds)).toBe(true);
 console.log('Brush audit',JSON.stringify({samples:result.length,short:result.filter(r=>r.raw.length).length,zeroAfterRounding:result.filter(r=>r.rounded.some(p=>p.distance===0)).length}));
});

test('collapsed anchors merge without refitting adjacent curves or removing a real loop', async ({page}) => {
 const result = await page.evaluate(async () => {
  const {cleanStrokeContours} = await import('/src/geometry.ts');
  const contour = {id:'collapsed',closed:true,nodes:[
   {id:'a',x:0,y:0,outgoing:{x:30,y:0}},
   {id:'b',x:100,y:0,incoming:{x:70,y:0}},
   {id:'c',x:100,y:0,outgoing:{x:130,y:30}},
   {id:'d',x:100,y:100,incoming:{x:130,y:70}},
   {id:'e',x:0,y:100}
  ]};
  const before=JSON.stringify(contour),out=cleanStrokeContours([contour],3)[0];
  const loop=structuredClone(contour);loop.nodes[1].outgoing={x:120,y:-20};loop.nodes[2].incoming={x:80,y:-20};
  return {unchanged:before===JSON.stringify(contour),nodes:out.nodes,loop:cleanStrokeContours([loop],3)[0].nodes.length};
 });
 expect(result.unchanged).toBe(true);expect(result.nodes).toHaveLength(4);
 expect(result.nodes[1]).toMatchObject({x:100,y:0,incoming:{x:70,y:0},outgoing:{x:130,y:30}});
 expect(result.loop).toBe(5);
});
