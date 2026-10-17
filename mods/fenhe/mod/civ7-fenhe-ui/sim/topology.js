// Multi-source land flood. Defection uses actual borders; war can cross unclaimed land.
export function landRoutes(data){
 const cells=data.map.tiles,byId=new Map(cells.map(t=>[t.i,t])),owner=new Map(),queue=[],pairs=new Set(data.edges.map(e=>[...e].sort().join('|')));
 for(const t of cells)if(t.settlement&&!t.water&&!t.impassable){owner.set(t.i,t.settlement);queue.push(t.i);}
 function neighbors(t){
  if(t.neighbors)return t.neighbors;
  // The fallback is for old fixture files only; production exports engine neighbors.
  const odd=t.y&1,offsets=[[-1,0],[1,0],[odd-1,-1],[odd,-1],[odd-1,1],[odd,1]];
  return offsets.map(([dx,dy])=>{const x=(t.x+dx+data.map.width)%data.map.width,y=t.y+dy;return y<0||y>=data.map.height?-1:y*data.map.width+x;});
 }
 for(let i=0;i<queue.length;i++){const tile=byId.get(queue[i]),from=owner.get(tile.i);for(const id of neighbors(tile)){const target=byId.get(id);if(!target||target.water||target.impassable)continue;const to=owner.get(id);if(!to){owner.set(id,from);queue.push(id);}else if(to!==from)pairs.add([from,to].sort().join('|'));}}
 return [...pairs].map(p=>p.split('|'));
}
