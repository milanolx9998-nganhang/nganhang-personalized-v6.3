import test from 'node:test';import assert from 'node:assert/strict';import AdmZip from 'adm-zip';
import {safeZip,imageType} from '../../src/services/practice/importAdapters.js';
test('Không nhận SVG/HTML/ảnh giả và ZIP bomb',()=>{
 for(const bytes of ['<svg><script>alert(1)</script></svg>','<html>image.png</html>'])assert.throws(()=>imageType(Buffer.from(bytes)));
 const zip=new AdmZip();zip.addFile('bomb.txt',Buffer.alloc(2*1024*1024));assert.throws(()=>safeZip(zip.toBuffer()),/giới hạn/);
});
