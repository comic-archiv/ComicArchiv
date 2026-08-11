import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortCollectionEntries, getScopedCollectionEntries } from "../collection-query.js";
const entry=(id,series,band,extra={})=>({id,series,seriesId:series,volumeNumber:String(band),numericBandNumber:band,title:extra.title||"",publicationYear:extra.year||2026,copies:extra.copies||[{condition:"2",isRead:false,isSealed:false,notes:""}],createdAt:"2026-01-01",updatedAt:extra.updatedAt||"2026-01-01"});
test("Collection Query kapselt Scope, Filter und Sortierung",()=>{
 const rows=[entry("a","Lustiges Taschenbuch",10),entry("b","LTB Spezial",2,{title:"Test"}),entry("c","Lustiges Taschenbuch",2,{copies:[{condition:"1",isRead:true,isSealed:true,notes:"x"}]})];
 assert.equal(getScopedCollectionEntries(rows,"main").length,2);
 const result=filterAndSortCollectionEntries(rows,{scope:"main",filters:{read:"read",series:"all",condition:"all"},sortBy:"volume"});
 assert.deepEqual(result.map(x=>x.id),["c"]);
});
