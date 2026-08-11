import test from "node:test";
import assert from "node:assert/strict";
import { createInitialAppState, SMART_LIST_DEFINITIONS_LOOKUP } from "../app-state.js";
test("App-State wird zentral und frisch erzeugt",()=>{
 const first=createInitialAppState(); const second=createInitialAppState();
 assert.notEqual(first,second);
 assert.notEqual(first.scannerQueueLookups,second.scannerQueueLookups);
 assert.equal(first.collectionScope,"main");
 assert.equal(first.scannerQueue.length,0);
 assert.equal(SMART_LIST_DEFINITIONS_LOOKUP.duplicates.title,"Mehrfach vorhanden");
});
