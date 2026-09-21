export const typeMap={mcq4:'multiple_choice',TN:'multiple_choice',true_false:'true_false','ĐS':'true_false',short:'short_answer',TLN:'short_answer',matching:'matching',GN:'matching',essay:'essay',TL:'essay'};
export const legacyTypes={multiple_choice:'mcq4',true_false:'true_false',short_answer:'short',matching:'matching',essay:'essay'};
export function levelNumber(value){const text=String(value??'').trim().toUpperCase();return ({NB:1,TH:2,VD:3,VDC:4})[text]||Number(text.match(/^M?([1-4])(?:\s*\((?:NB|TH|VD|VDC)\))?$/)?.[1])||null;}
export function normalizeQuestion(raw){
 const q=raw.content?{...raw.content,cognitive_level:raw.cognitive_level,topic_id:raw.topic_id,subject_id:raw.subject_id,grade:raw.grade}:structuredClone(raw);
 q.type=typeMap[q.type||q.q_type]||q.type||q.question_type;
 q.cognitive_level=levelNumber(q.cognitive_level);
 if(q.type==='true_false'&&q.subitem_levels){const levels=[...new Set(Object.values(q.subitem_levels).map(levelNumber).filter(Boolean))];q.cognitive_classification=levels.length>1?'HỖN_HỢP':levels[0]?'M'+levels[0]:null;if(levels.length===1&&!q.cognitive_level)q.cognitive_level=levels[0];}
 q.stem=q.stem??q.stem_text??'';q.display_code=q.display_code??q.question_code??'';
 q.auto_gradable=q.type!=='essay'&&q.auto_gradable!==false;
 q.explanation=q.explanation||'';
 const letters=['A','B','C','D'];
 q.options=q.options||letters.map(k=>({id:k,text:q['option_'+k.toLowerCase()]||''}));
 q.options=q.options.map((o,i)=>({...o,id:o.id||o.key||letters[i]}));
 q.statements=q.statements||letters.map(k=>({id:k.toLowerCase(),text:q['option_'+k.toLowerCase()]||''}));
 if(q.type==='true_false'&&q.statements.every(s=>!s.text?.trim())){const parts=[...q.stem.matchAll(/(?:^|\n)\s*([a-d])[.)]\s*([^]*?)(?=(?:\n\s*[a-d][.)])|$)/g)];if(parts.length===4){q.statements=parts.map(m=>({id:m[1],text:m[2].trim()}));q.stem=q.stem.slice(0,parts[0].index).trim();}}
 if(!q.answer){
  const text=String(q.answer_key??'');
  if(q.type==='multiple_choice')q.answer={correct:text.trim().toUpperCase()};
  if(q.type==='true_false'){q.answer={values:{}};for(const match of text.matchAll(/([a-d])\s*[-:.)]?\s*(Đ|S|true|false)/gi))q.answer.values[match[1].toLowerCase()]=/^(đ|true)$/i.test(match[2]);}
  if(q.type==='short_answer')q.answer={aliases:text?[text]:[],case_sensitive:false};
  if(q.type==='matching'){q.answer={pairs:{}};for(const m of text.matchAll(/([A-Za-z0-9]+)\s*[–—\-:]\s*([A-Za-z0-9]+)/g))q.answer.pairs[m[1]]=m[2];}
  if(q.type==='essay')q.answer={reference:text};
 }
 return q;
}
function normalized(value,rule={}){let text=String(value??'').normalize('NFKC').trim();if(rule.collapse_whitespace!==false)text=text.replace(/\s+/g,' ');return rule.case_sensitive?text:text.toLocaleLowerCase('vi');}
function numeric(value){const s=String(value??'').trim().replace(',','.');return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(s)?Number(s):NaN;}
export function gradeQuestion(raw,response){
 const q=normalizeQuestion(raw);if(!q.auto_gradable)return {score:null,isCorrect:null,details:[],normalizedResponse:response??null};
 const answer=q.answer||{};let score=0;let details=[];let nr=response;
 if(q.type==='multiple_choice'){nr=String(response??'').trim().toUpperCase();score=nr===answer.correct?1:0;}
 else if(q.type==='true_false'||q.type==='matching'){
  const values=q.type==='true_false'?answer.values:answer.pairs;
  details=Object.entries(values||{}).map(([id,expected])=>({id,expected,actual:response?.[id]??null,correct:q.type==='true_false'?typeof response?.[id]==='boolean'&&response[id]===expected:String(response?.[id]??'')===String(expected)}));
  score=details.length?details.filter(d=>d.correct).length/details.length:0;
 } else if(q.type==='short_answer'){
  const value=typeof response==='object'&&response?response.value:response;
  const unit=typeof response==='object'&&response?response.unit:undefined;
  nr=normalized(value,answer);
  const unitOk=!answer.unit||answer.unit_optional||normalized(unit)===normalized(answer.unit);
  if(answer.numeric!==undefined){const actual=numeric(value),expected=Number(answer.numeric);const tolerance=Number(answer.tolerance||0)*(answer.tolerance_mode==='relative'?Math.abs(expected):1);score=unitOk&&Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance+Number.EPSILON*Math.max(1,Math.abs(expected))*4?1:0;}
  else score=unitOk&&(answer.aliases||[]).some(a=>normalized(a,answer)===nr)?1:0;
 }
 return {score,isCorrect:score===1,details,normalizedResponse:nr??null};
}
export function validateQuestion(raw,profile={}){
 const q=normalizeQuestion(raw);const errors=[],warnings=[];
 for(const field of profile.activation_required_fields||profile.required_fields||['subject_id','grade','topic_id','cognitive_level'])if(!(field==='question_type'?q.type:q[field]))errors.push('Thiếu '+({topic_id:'chuyên đề',cognitive_level:'mức độ',subject_id:'môn',grade:'khối'}[field]||field));
 if(!q.stem?.trim())errors.push('Thiếu nội dung câu hỏi');
 if(!legacyTypes[q.type])errors.push('Dạng câu chưa được hỗ trợ');
 if(profile.allowed_types&&!profile.allowed_types.includes(q.type))errors.push('Môn không cho phép dạng câu này');
 if(q.type==='multiple_choice'&&(q.options.length!==4||q.options.some(o=>!o.text?.trim())||!q.options.some(o=>o.id===q.answer?.correct)))errors.push('TN cần bốn phương án và một đáp án hợp lệ');
 if(q.type==='true_false'&&(q.statements.length!==4||q.statements.some(s=>!s.text?.trim()||typeof q.answer?.values?.[s.id]!=='boolean')))errors.push('ĐS cần bốn nhận định và đáp án từng ý');
 if(q.type==='short_answer'&&!(q.answer?.aliases?.some(a=>String(a).trim())||Number.isFinite(q.answer?.numeric)))errors.push('TLN thiếu đáp án');
 if(q.type==='matching'&&(!q.left?.length||!q.right?.length||q.left.some(l=>!q.right.some(r=>String(r.id)===String(q.answer?.pairs?.[l.id])))))errors.push('GN thiếu cặp ghép hợp lệ');
 if(q.type==='multiple_choice'&&new Set(q.options.map(o=>o.id)).size!==4)errors.push('Mã phương án không được trùng');
 if(q.type==='true_false'&&new Set(q.statements.map(o=>o.id)).size!==4)errors.push('Mã nhận định không được trùng');
 if(q.type==='short_answer'&&q.answer?.tolerance!==undefined&&(!Number.isFinite(q.answer.tolerance)||q.answer.tolerance<0))errors.push('Sai số phải là số không âm');
 if(q.type==='matching'&&[q.left,q.right].some(list=>list&&new Set(list.map(x=>String(x.id))).size!==list.length))errors.push('Mã ý ghép nối không được trùng');
 if(!q.explanation)warnings.push('Chưa có lời giải (không bắt buộc)');
 return {errors,warnings,status:errors.length?'ERROR':warnings.length?'WARNING':'VALID'};
}
