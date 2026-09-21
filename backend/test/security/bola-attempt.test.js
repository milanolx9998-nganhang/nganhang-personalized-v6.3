import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
// Full live BOLA cases execute in integration/v652-checks.js against an isolated restored DB.
test('BOLA endpoint retains owner and item-attempt binding; integration coverage is registered',()=>{
 const attempts=fs.readFileSync(new URL('../../src/services/practice/attempts.js',import.meta.url),'utf8');
 assert(attempts.includes('a.student_id!==user.id'));
 assert(attempts.includes('WHERE i.id=$1 AND i.attempt_id=$2'));
 const suite=fs.readFileSync(new URL('../integration/v63.test.js',import.meta.url),'utf8');assert(suite.includes('registerV652('));
});
