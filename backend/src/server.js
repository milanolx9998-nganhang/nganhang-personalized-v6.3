import 'dotenv/config';
import {profile,publicProfile} from './config/profile.js';
import {storage} from './services/storage/index.js';
import {recordHttp} from './services/practice/operations.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'node:crypto';
import {pool} from './db/pool.js';
import {auth} from './middleware/auth.js';
import {csrfGuard} from './middleware/session.js';
import {staffMedia} from './services/practice/privateMedia.js';
import {audit} from './utils/audit.js';
import practiceRoutes from './routes/practice.js';
import curriculumMasterRoutes from './routes/curriculumMaster.js';
import competencyRoutes,{studentCompetencyRoutes} from './routes/competency.js';

import { testConnection } from './db/pool.js';
import { errorHandler } from './middleware/errorHandler.js';
import { loginLimiter, apiLimiter, apiIpLimiter, sensitiveLimiter, uploadLimiter } from './middleware/rateLimiter.js';

import authRoutes from './routes/auth.js';
import staffRoutes,{accessRoutes} from './routes/staff.js';
import usersRoutes from './routes/users.js';
import taxonomyRoutes from './routes/taxonomy.js';
import questionsRoutes from './routes/questions.js';
import matrixRoutes from './routes/matrix.js';
import matrixBalanceRoutes from './routes/matrix-balance.js';
import examsRoutes from './routes/exams.js';
import reportsRoutes from './routes/reports.js';
import uploadsRoutes from './routes/uploads.js';
import tagsRoutes from './routes/tags.js';
import analysisRoutes from './routes/analysis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
if(process.env.TRUST_PROXY)app.set('trust proxy',Number(process.env.TRUST_PROXY));
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.use((req,res,next)=>{res.on('finish',()=>{recordHttp(res.statusCode);if(res.statusCode===403)void audit(req.user?.id||null,'AUTHZ_DENIED','security',null,{path:req.path},req.ip);if(res.statusCode===200&&/export|download/.test(req.path)){const action=/source/.test(req.path)?'SOURCE_DOWNLOAD':/qti/.test(req.path)||req.query.answers==='true'||req.query.kind==='answer'?'ANSWER_EXPORT':'CONTENT_EXPORT';void audit(req.user?.id||null,action,'security',null,{path:req.path},req.ip);}});req.requestId=crypto.randomUUID();res.setHeader('X-Request-ID',req.requestId);next();});
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:'],objectSrc:["'none'"],baseUri:["'self'"],formAction:["'self'"],connectSrc:["'self'"],fontSrc:["'self'"],frameAncestors:["'self'",...(process.env.CANVAS_ORIGINS||'').split(',').filter(Boolean)]}},frameguard:process.env.CANVAS_ORIGINS?false:{action:'sameorigin'}}));
const origins=(process.env.CORS_ORIGIN||'').split(',').filter(Boolean);
app.use(cors({origin:(origin,cb)=>cb(null,!origin||origins.includes(origin))}));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(morgan((tokens,req,res)=>JSON.stringify({request_id:req.requestId,method:req.method,path:req.path,status:Number(tokens.status(req,res)),duration_ms:Number(tokens['response-time'](req,res))})));
// Preserve passwords and scientific text verbatim. React/Markdown escape HTML at rendering boundaries.

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
for(const folder of ['images','media'])app.use('/uploads/'+folder,auth,(req,res,next)=>{if(req.user.must_change_password)return res.sendStatus(403);staffMedia(req,res).catch(next);});

app.get('/api/health', async (_req, res) => {
  try{await pool.query('SELECT 1');await storage.health();res.json({ status: 'ok', database:'ok', storage:'ok',...publicProfile(), timestamp: new Date().toISOString(), version: '6.6.6' });}catch{res.status(503).json({status:'unavailable'});}
});

app.use('/api',csrfGuard);
app.use('/api/auth/login', loginLimiter);
app.use('/api/auth', authRoutes);
app.use('/api',auth,apiIpLimiter,sensitiveLimiter,(req,res,next)=>{
 if(req.user.must_change_password)return res.status(403).json({error:'Cần đổi mật khẩu trước khi tiếp tục'});
 if(req.user.role==='student'&&!req.path.startsWith('/practice/'))return res.status(403).json({error:'Học sinh chỉ được truy cập khu tự luyện'});

 next();
});
app.use('/api/practice',apiLimiter,practiceRoutes,studentCompetencyRoutes);
app.use('/api/competency',apiLimiter,competencyRoutes);
app.use('/api/curriculum',apiLimiter,curriculumMasterRoutes);
app.use('/api/staff',apiLimiter,staffRoutes);
app.use('/api/access',apiLimiter,accessRoutes);
app.use('/api/users', apiLimiter, usersRoutes);
app.use('/api/taxonomy', apiLimiter, taxonomyRoutes);
app.use('/api/questions', apiLimiter, questionsRoutes);
app.use('/api/matrix', apiLimiter, matrixRoutes);
app.use('/api/matrix-balance', apiLimiter, matrixBalanceRoutes);
app.use('/api/exams', apiLimiter, examsRoutes);
app.use('/api/reports', apiLimiter, reportsRoutes);
app.use('/api/uploads', uploadLimiter, uploadsRoutes);
app.use('/api/tags', apiLimiter, tagsRoutes);
app.use('/api/analysis', apiLimiter, analysisRoutes);

// Serve frontend production build
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use(errorHandler);

(async () => {
  try {
    await testConnection();
    console.log('✓ Kết nối PostgreSQL thành công');
    app.listen(PORT, HOST, () => {
      console.log(`
Ngân hàng V6.6.5 (${profile.name}) đang chạy tại:
  http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}

HTTP trực tiếp chỉ phục vụ kiểm tra local hoặc mạng nội bộ container.
Triển khai LAN: truy cập domain HTTPS qua Caddy; không mở cổng Node/DB.
`);
    });
  } catch (err) {
    console.error('❌ Lỗi kết nối DB:', err.message);
    console.error('Kiểm tra .env + PostgreSQL đã chạy chưa.');
    process.exit(1);
  }
})();
