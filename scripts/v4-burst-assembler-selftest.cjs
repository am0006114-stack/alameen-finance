const fs=require('fs'),path=require('path'),vm=require('vm');
let ts;try{ts=require('typescript')}catch{ts=require(path.join(process.cwd(),'node_modules','typescript'))}
const root=process.argv[2]||process.cwd();let passed=0,failed=0;
const ok=(c,m)=>{if(c){passed++;console.log(`PASS ${passed}: ${m}`)}else{failed++;console.error(`FAIL: ${m}`)}};
function load(abs){const src=fs.readFileSync(abs,'utf8');const tr=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},reportDiagnostics:true,fileName:abs});const errs=(tr.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);if(errs.length)throw new Error(errs.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));const mod={exports:{}};vm.runInNewContext(tr.outputText,{module:mod,exports:mod.exports,require,console,Date,Math},{filename:abs});return mod.exports}
const {assembleV4ConversationBurst}=load(path.join(root,'app/api/whatsapp/webhook/_lib/v4-os/burstAssembler.ts'));
const m=(id,text,sec,kind='text')=>({id,text,kind,receivedAt:`2026-10-09T10:00:${String(sec).padStart(2,'0')}Z`});
let b=assembleV4ConversationBurst({current:m('3','اروح اشوف محل ثاني',4),recentContiguousInbound:[m('1','بدكم تقبلو طلبي ولا',0),m('2','عشان اعرف',2)]});
ok(b.messageIds.length===3,'short contiguous WhatsApp messages become one human burst');
ok(b.burstText.includes('بدكم تقبلو')&&b.burstText.includes('عشان اعرف')&&b.burstText.includes('اروح اشوف'),'burst preserves the complete human thought in order');
b=assembleV4ConversationBurst({current:m('3','قدمت من يومين بدي اشوف الموافقة طلعت',4),recentContiguousInbound:[m('1',null,1,'voice')]});
ok(b.burstText==='قدمت من يومين بدي اشوف الموافقة طلعت','fresh text owns the burst after a voice message');
ok(b.mediaContext.length===1&&b.mediaContext[0].kind==='voice','voice remains context metadata without hijacking fresh text');
b=assembleV4ConversationBurst({current:m('v',null,5,'voice')});
ok(/صوتية/.test(b.burstText),'media-only current burst emits one useful current-media marker');
b=assembleV4ConversationBurst({current:m('new','وين موقعكم',20),recentContiguousInbound:[m('old','كم بدو وقت',1)]});
ok(b.messageIds.length===1&&b.burstText==='وين موقعكم','large message gap prevents stale topic from entering current burst');
console.log(`\nV4 BURST ASSEMBLER SELFTEST: assertions=${passed+failed}; passed=${passed}; failed=${failed}`);if(failed)process.exit(1);
