import EnvironmentBadge from './EnvironmentBadge.jsx';
import {useEffect,useRef,useState} from 'react';
import {NavLink,Outlet,useLocation,useNavigate} from 'react-router-dom';
import {useAuth,ROLE_LABEL} from '../hooks/useAuth.js';
import {groupsFor,studentLinks,activeGroup} from '../config/navigation.js';
export default function Layout(){
 const {user,logout}=useAuth(),nav=useNavigate(),location=useLocation(),groups=groupsFor(user);
 const active=activeGroup(location.pathname,groups),[expanded,setExpanded]=useState(active),[open,setOpen]=useState(false),[mobile,setMobile]=useState(()=>innerWidth<=768),drawer=useRef(null),toggle=useRef(null);
 useEffect(()=>{setExpanded(active);setOpen(false);},[location.pathname]);
 useEffect(()=>{const mq=matchMedia('(max-width:768px)'),change=()=>setMobile(mq.matches);mq.addEventListener('change',change);return()=>mq.removeEventListener('change',change);},[]);
 useEffect(()=>{drawer.current.inert=mobile&&!open;},[mobile,open]);
 useEffect(()=>{if(!mobile||!open)return;const first=drawer.current.querySelector('a,button');first?.focus();const key=e=>{if(e.key==='Escape'){setOpen(false);toggle.current?.focus();}if(e.key==='Tab'){const list=[...drawer.current.querySelectorAll('a,button')].filter(n=>n.getClientRects().length);if(e.shiftKey&&document.activeElement===list[0]){e.preventDefault();list.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===list.at(-1)){e.preventDefault();list[0]?.focus();}}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key);},[open,mobile]);
 const link=c=><NavLink key={c.to} to={c.to} end={c.end} onClick={()=>setOpen(false)}>{c.label}</NavLink>;
 return <div className="app-layout app-nav-v4"><button ref={toggle} aria-label={open?'Đóng menu':'Mở menu'} aria-expanded={open} aria-controls="app-sidebar" className="hamburger-btn" onClick={()=>setOpen(!open)}>{open?'✕':'☰'}</button><div className={'sidebar-backdrop '+(open?'open':'')} onClick={()=>setOpen(false)}/>
 <aside id="app-sidebar" ref={drawer} className={'sidebar '+(open?'open':'')}><div className="logo"><strong>Ngân hàng câu hỏi</strong><small>Học tập & Tiến bộ</small></div><nav aria-label={user.role==='student'?'Điều hướng học sinh':'Mảng việc'}>
 {user.role==='student'?studentLinks.map(link):<>{link({to:'/',label:'Tổng quan',end:true})}{groups.map(g=><section className="app-nav-group" key={g.id}><button aria-expanded={expanded===g.id} aria-controls={'nav-'+g.id} onClick={()=>setExpanded(expanded===g.id?null:g.id)}>{g.label}<span aria-hidden="true">{expanded===g.id?'−':'+'}</span></button><div id={'nav-'+g.id} hidden={expanded!==g.id}>{g.children.map(link)}</div></section>)}</>}
 </nav><div className="user-box"><div className="name">{user.full_name}</div><div className="role">{ROLE_LABEL[user.role]}</div>{user.role!=='student'&&<NavLink to="/practice/password" onClick={()=>setOpen(false)}>Tài khoản · Đổi mật khẩu</NavLink>}<button className="btn ghost" onClick={async()=>{await logout();nav('/login');}}>Đăng xuất</button></div></aside><main className="main-content"><EnvironmentBadge/><Outlet/></main></div>;
}
