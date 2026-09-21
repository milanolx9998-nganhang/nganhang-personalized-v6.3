import {buildWorksheet} from './practice/worksheetExport.js';
export async function buildExamDocx({examName,matrix,code,items}){return buildWorksheet({title:examName+' · Mã '+code,instructions:'Môn: '+(matrix.subject_name||'')+' · Lớp '+matrix.grade+' · Thời gian: '+matrix.duration_minutes+' phút',items});}
export async function buildAnswerKeyDocx({examName,code,items}){return buildWorksheet({title:'ĐÁP ÁN — '+examName+' · Mã '+code,items,answers:true});}
