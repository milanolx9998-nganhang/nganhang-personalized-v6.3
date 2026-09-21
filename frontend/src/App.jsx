const ReviewQueue=lazy(()=>import('./pages/practice/ReviewQueue.jsx'));
const FlaggedReview=lazy(()=>import('./pages/practice/FlaggedReview.jsx'));
const CurriculumAdmin=lazy(()=>import('./pages/practice/CurriculumAdmin.jsx'));
import {lazy,Suspense,useEffect} from 'react';
import { BrowserRouter, Routes, Route, Navigate,useLocation } from 'react-router-dom';
const PracticeBuilder=lazy(()=>import('./pages/practice/Student.jsx').then(m=>({default:m.PracticeBuilder})));
const StudentHome=lazy(()=>import('./pages/practice/StudentHome.jsx'));
const WorkspaceHome=lazy(()=>import('./pages/practice/WorkspaceHome.jsx'));
const StudentPortfolio=lazy(()=>import('./pages/practice/portfolio/StudentPortfolio.jsx'));
const AttemptReview=lazy(()=>import('./pages/practice/portfolio/AttemptReview.jsx'));
const Students=lazy(()=>import('./pages/practice/Students.jsx'));
const Player=lazy(()=>import('./pages/practice/Player.jsx'));
const Assignments=lazy(()=>import('./pages/practice/Assignments.jsx'));
const SharedAssignment=lazy(()=>import('./pages/practice/Assignments.jsx').then(m=>({default:m.SharedAssignment})));
const TeacherDashboard=lazy(()=>import('./pages/practice/Teacher.jsx').then(m=>({default:m.TeacherDashboard})));
const ImportCenter=lazy(()=>import('./pages/practice/Teacher.jsx').then(m=>({default:m.ImportCenter})));
const Banks=lazy(()=>import('./pages/practice/Teacher.jsx').then(m=>({default:m.Banks})));
const AdminHub=lazy(()=>import('./pages/AdminHub.jsx'));
const Password=lazy(()=>import('./pages/practice/Password.jsx'));
import './styles/practice.css';
import './styles/learning.css';
import './styles/content-picker.css';
import './styles/portfolio.css';
import './styles/v5-polish.css';
import { useAuth } from './hooks/useAuth.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
const Dashboard=lazy(()=>import('./pages/Dashboard.jsx'));
const Questions=lazy(()=>import('./pages/Questions.jsx'));
const Matrix=lazy(()=>import('./pages/Matrix.jsx'));
const Exams=lazy(()=>import('./pages/Exams.jsx'));
const Staff=lazy(()=>import('./pages/Staff.jsx'));
const StaffDetail=lazy(()=>import('./pages/Staff.jsx').then(m=>({default:m.StaffDetail})));
const Taxonomy=lazy(()=>import('./pages/Taxonomy.jsx'));
const Reports=lazy(()=>import('./pages/Reports.jsx'));
const Tags=lazy(()=>import('./pages/Tags.jsx'));
const Analysis=lazy(()=>import('./pages/Analysis.jsx'));

function PrivateRoute({ children }) {
  const { user } = useAuth();
  const location=useLocation();
  if(user?.must_change_password&&location.pathname!=='/practice/password')return <Navigate to="/practice/password" replace/>;
  if(user?.role==='student'&&!location.pathname.startsWith('/practice'))return <Navigate to="/practice" replace/>;
  return user ? children : <Navigate to="/login" state={{from:location.pathname+location.search}} replace />;
}
function PracticeHome(){const {user}=useAuth();return user?.role==='student'?<StudentHome/>:<TeacherDashboard/>;}

export default function App() {
  const {ready,initialize}=useAuth();
  useEffect(()=>{initialize();},[initialize]);
  if(!ready)return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Suspense fallback={<p className="route-loading" role="status">Đang mở trang…</p>}><Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route path="practice" element={<PracticeHome/>}/>
          <Route path="practice/flagged" element={<FlaggedReview/>}/>
          <Route path="practice/new" element={<PracticeBuilder/>}/>
          <Route path="practice/attempts/:id" element={<Player/>}/>
          <Route path="practice/assignments" element={<Assignments/>}/>
          <Route path="practice/shared/:token" element={<SharedAssignment/>}/>
          <Route path="practice/banks" element={<Banks/>}/>
          <Route path="practice/import" element={<ImportCenter/>}/>
          <Route path="practice/students" element={<Students/>}/>
          <Route path="practice/portfolio" element={<StudentPortfolio/>}/>
          <Route path="practice/students/:studentId/portfolio" element={<StudentPortfolio/>}/>
          <Route path="practice/students/:studentId/attempts/:attemptId" element={<AttemptReview/>}/>
          <Route path="practice/review/:attemptId" element={<AttemptReview/>}/>
          <Route path="practice/reviews" element={<ReviewQueue/>}/>
          <Route path="practice/curriculum" element={<CurriculumAdmin/>}/>
          <Route path="practice/admin" element={<Navigate to="/admin/school" replace/>}/>
          <Route path="admin/:section" element={<AdminHub/>}/>
          <Route path="practice/password" element={<Password/>}/>
          <Route index element={<WorkspaceHome />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="questions" element={<Questions />} />
          <Route path="matrix" element={<Matrix />} />
          <Route path="exams" element={<Exams />} />
          <Route path="taxonomy" element={<Taxonomy />} />
          <Route path="users" element={<Navigate to="/admin/staff" replace/>} />
          <Route path="admin/staff" element={<Staff/>}/>
          <Route path="admin/staff/:id" element={<StaffDetail/>}/>
          <Route path="reports" element={<Reports />} />
          <Route path="tags" element={<Tags />} />
          <Route path="analysis" element={<Analysis />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></Suspense>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
