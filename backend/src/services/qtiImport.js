import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { XMLParser } from 'fast-xml-parser';
import he from 'he';

/**
 * Phân tích file .zip QTI 1.2
 * Trả về mảng câu hỏi và lấy ảnh vứt ra ngoài uploads thư mục
 */
export async function parseQtiZip(zipFilePath, destImageDir) {
  const result = { items: [], errors: [] };
  const zip = new AdmZip(zipFilePath);
  const zipEntries = zip.getEntries();

  // Tạo thư mục đích nếu chưa có
  if (!fs.existsSync(destImageDir)) {
    fs.mkdirSync(destImageDir, { recursive: true });
  }

  // 1. Quét tìm tất cả các File Ảnh trong ZIP, copy rớt ra folder '/uploads/images/' ngoài đời
  //    Đồng thời build cái Map để thay thế href/src của XML thành URL nội bộ chúng ta
  const imageMap = {}; // { 'old/path/in/zip.png': '/uploads/images/qti_uuid_zip.png' }
  const fileIdMap = {}; // { 'image.png': '/uploads/images/qti_uuid_image.png' } (cho chắc ăn lỡ nó ghi src="image.png")

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.entryName).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
      const fileName = path.basename(entry.entryName);
      const uniqueName = `qti_${crypto.randomBytes(4).toString('hex')}_${fileName.replace(/\s+/g, '_')}`;
      const destPath = path.join(destImageDir, uniqueName);
      
      // Bung file tĩnh này ra ổ cứng vật lý
      const data = entry.getData();
      fs.writeFileSync(destPath, data);

      const internalUrl = `/uploads/images/${uniqueName}`;
      imageMap[entry.entryName] = internalUrl;
      fileIdMap[fileName] = internalUrl;
    }
  }

  // 2. Định vị file Assessment XML chính từ imsmanifest.xml
  let assessmentFileName = null;
  const manifestEntry = zipEntries.find(e => e.name.toLowerCase() === 'imsmanifest.xml');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', parseAttributeValue: false });

  if (manifestEntry) {
     try {
       const manifestXml = manifestEntry.getData().toString('utf8');
       const manifestObj = parser.parse(manifestXml);
       const resources = manifestObj.manifest?.resources?.resource || [];
       const resourceList = Array.isArray(resources) ? resources : [resources];
       const qtiResource = resourceList.find(r => r['@_type']?.includes('imsqti_xml'));
       
       if (qtiResource && qtiResource['@_href']) {
          assessmentFileName = qtiResource['@_href'];
       }
     } catch (e) {
       console.error("Lỗi parse imsmanifest", e);
     }
  }

  // Nếu trong manifest không có khai báo, thử tìm đại file báo tên kết thúc bằng .xml (không phải manifest/meta)
  if (!assessmentFileName) {
    const xmlEntries = zipEntries.filter(e => e.entryName.toLowerCase().endsWith('.xml') 
          && !e.entryName.toLowerCase().includes('meta')
          && e.entryName.toLowerCase() !== 'imsmanifest.xml');
    if (xmlEntries.length > 0) assessmentFileName = xmlEntries[0].entryName;
  }

  if (!assessmentFileName) {
    throw new Error('Không tìm thấy file chứa câu hỏi (Assessment XML) trong gói QTI.');
  }

  // 3. Đọc Assessment XML và lấy câu hỏi
  const assessmentEntry = zipEntries.find(e => e.entryName === assessmentFileName);
  if (!assessmentEntry) throw new Error(`Tệp XML '${assessmentFileName}' bị thiếu trong lõi.`);

  const xmlContent = assessmentEntry.getData().toString('utf8');
  const asObj = parser.parse(xmlContent);

  // Traverse down to <item> list: questestinterop > assessment > section > item
  const section = asObj.questestinterop?.assessment?.section;
  let items = [];
  if (section && section.item) {
    items = Array.isArray(section.item) ? section.item : [section.item];
  }

  for (const xmlItem of items) {
     try {
        const parsedContext = parseQTIItem(xmlItem, parser);
        if (!parsedContext) continue; // Skip lỗi

        // Hàm replace ảnh cho stem_text
        let cleanStem = parsedContext.stem || '';
        // Decode HTML entities
        cleanStem = he.decode(cleanStem);

        // Thay $IMS-CC-FILEBASE$/media/anh.jpg thành /uploads/images/qti_..
        const IMS_VAR = '$IMS-CC-FILEBASE$';
        cleanStem = cleanStem.replace(/\$IMS-CC-FILEBASE\$(\/|\\)?/gi, ''); 
        cleanStem = cleanStem.replace(/\%24IMS-CC-FILEBASE\%24(\/|\\)?/gi, ''); 

        // Rà lại bằng URL map lấy từ ZIP
        for (const [origPath, newUrl] of Object.entries(imageMap)) {
           // Replace literal path (dạng media/anh.png ...)
           cleanStem = cleanStem.split(origPath).join(newUrl);
        }
        // Thử rà bằng fileName map (chỉ tên ảnh, vd: anh.png, phòng khi nó viết %20)
        for (const [fileName, newUrl] of Object.entries(fileIdMap)) {
           // Bắt các <img src="...../fileName"> cực đoan
           const encodedName = encodeURIComponent(fileName);
           if (cleanStem.includes(fileName)) cleanStem = cleanStem.split(fileName).join(newUrl);
           if (cleanStem.includes(encodedName)) cleanStem = cleanStem.split(encodedName).join(newUrl);
        }

        // Lọc xem cái stem text có đít ảnh không -> lấy móc ra làm link image_url cho câu hỏi của chúng ta
        let image_url = null;
        const imgRegex = /<img.*?src=["'](.*?)["'].*?>/i;
        const match = cleanStem.match(imgRegex);
        if (match && match[1]) {
           image_url = match[1];
           // Tuỳ nhu cầu: xóa cái `<img...>` ra khỏi nội dung câu hỏi nếu không muốn nó đúp
           // cleanStem = cleanStem.replace(imgRegex, '');
        }

        // Convert html tags out of stem ? We just keep tags if it's p, b, i, sub, sup. 
        // Thay thế các đoạn xống dòng <br> <p> thành \n vì hệ thống offline đang dùng \n Text Area
        cleanStem = cleanStem.replace(/<br\s*\/?>/gi, '\n');
        cleanStem = cleanStem.replace(/<\/p>/gi, '\n').replace(/<p.*?>/gi, '');
        // Gỡ bỏ tag div, span rác
        cleanStem = cleanStem.replace(/<\/?div.*?>/gi, '').replace(/<\/?span.*?>/gi, '');
        
        // Remove trailing white space
        cleanStem = cleanStem.trim();

        // Canvas option decode
        const decodedOpts = parsedContext.options.map(opt => {
           let txt = he.decode(opt.text || '');
           txt = txt.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<p.*?>/gi, '');
           txt = txt.replace(/<\/?div.*?>/gi, '').replace(/<\/?span.*?>/gi, '');
           
           // Cũng thay ảnh trong đáp án (Hiếm nhưng có). Nếu có, nhét nguyên url vào text luôn cho nó thấy
           for (const [fileName, newUrl] of Object.entries(fileIdMap)) {
             if (txt.includes(fileName) || txt.includes(encodeURIComponent(fileName))) {
               txt = txt.split(fileName).join(`[Ảnh: ${newUrl}]`).split(encodeURIComponent(fileName)).join(`[Ảnh: ${newUrl}]`);
             }
           }
           // gỡ ảnh html tag ra khỏi option vì option text area ko chứa đc html
           txt = txt.replace(/<img.*?>/gi, '');

           return { ...opt, text: txt.trim() };
        });

        // Xếp Option A B C D dập theo thứ tự mảng index (tối đa lấy 4 thằng)
        const d_optA = decodedOpts[0]?.text || null;
        const d_optB = decodedOpts[1]?.text || null;
        const d_optC = decodedOpts[2]?.text || null;
        const d_optD = decodedOpts[3]?.text || null;
        
        let q_type = 'mcq4';
        if (parsedContext.qtype_raw === 'true_false_question') q_type = 'true_false';
        if (parsedContext.qtype_raw === 'short_answer_question') q_type = 'short';
        if (parsedContext.qtype_raw === 'essay_question') q_type = 'essay';

        // Lấy đúng ID đáp án (A, B, C, hay D)
        let answerKey = null;
        if (q_type === 'mcq4') {
           const mapL = ['A', 'B', 'C', 'D'];
           const idx = decodedOpts.findIndex(o => o.ident === parsedContext.answer_ident);
           if (idx >= 0 && idx <= 3) answerKey = mapL[idx];
        } 
        else if (q_type === 'true_false') {
           // Giả định nó là môn TF chuẩn thì key form kiểu a-Đ; b-S
           // Trong Canvas TF Question chỉ có 1 True False tổng gộp.
           // Thường mảng chỉ có "True" và "False", ta convert tạm
           const isTrue = decodedOpts.find(o => o.ident === parsedContext.answer_ident)?.text?.toLowerCase() === 'true';
           answerKey = isTrue ? 'Đúng' : 'Sai'; 
        }
        else if (q_type === 'short') {
           const correctOpt = decodedOpts.find(o => o.ident === parsedContext.answer_ident);
           answerKey = correctOpt ? correctOpt.text : null;
        }

        result.items.push({
           q_type,
           stem_text: cleanStem,
           image_url,
           option_a: d_optA,
           option_b: d_optB,
           option_c: d_optC,
           option_d: d_optD,
           answer_key: answerKey,
           score: parsedContext.score || 0.25
        });

     } catch(ex) {
        result.errors.push(`Không thể bóc tách item: ${ex.message}`);
     }
  }

  return result;
}

/** Bóc một cục <item> XML của QTI -> Object JS JSON Data */
function parseQTIItem(itemObj) {
   // 1. Phân loại
   let qtype_raw = 'multiple_choice_question';
   const metadataFields = itemObj.itemmetadata?.qtimetadata?.qtimetadatafield || [];
   const metasArr = Array.isArray(metadataFields) ? metadataFields : [metadataFields];
   const p_type = metasArr.find(m => m.fieldlabel === 'question_type');
   if (p_type) qtype_raw = p_type.fieldentry;

   // Lấy số điểm raw cài đặt trong meta nếu có
   const p_points = metasArr.find(m => m.fieldlabel === 'points_possible');
   let score = 0.25;
   if (p_points) score = parseFloat(p_points.fieldentry) || 0.25;

   // 2. Nội dung phần dẫn (Stem text)
   let stem = '';
   const mat = itemObj.presentation?.material;
   if (mat) {
      if (typeof mat.mattext === 'object') {
         stem = mat.mattext['#text'];
      } else {
         stem = mat.mattext;
      }
   }

   // 3. Kháo sát Đáp án (Options)
   let options = [];
   const renderChoice = itemObj.presentation?.response_lid?.render_choice;
   if (renderChoice && renderChoice.response_label) {
      const respLabels = Array.isArray(renderChoice.response_label) ? renderChoice.response_label : [renderChoice.response_label];
      for (const rl of respLabels) {
         let txt = '';
         if (rl.material && rl.material.mattext) {
             txt = typeof rl.material.mattext === 'object' ? rl.material.mattext['#text'] : rl.material.mattext;
         }
         options.push({ ident: rl['@_ident'], text: txt });
      }
   }

   // 4. Khảo sát Chìa khoá Đáp án Đúng
   let answer_ident = null;
   const resproc = itemObj.resprocessing;
   if (resproc && resproc.respcondition) {
       const clist = Array.isArray(resproc.respcondition) ? resproc.respcondition : [resproc.respcondition];
       // Tìm cái node có var SCORE = 100
       for (const cond of clist) {
           const setvar = cond.setvar;
           let isCorrect = false;
           if (typeof setvar === 'object' && setvar['#text'] == '100') isCorrect = true;
           if (setvar == '100') isCorrect = true;

           if (isCorrect && cond.conditionvar) {
               // Có dùng bare <varequal> hoặc dùng <and><varequal>...
               const veq = cond.conditionvar.varequal;
               if (veq) {
                  // Chỉ lấy trường hợp đơn, hoặc chui vô sâu
                  if (typeof veq === 'object') answer_ident = veq['#text'];
                  else answer_ident = veq;
               }
           }
       }
   }

   return {
      qtype_raw,
      stem,
      options,
      answer_ident,
      score
   };
}
