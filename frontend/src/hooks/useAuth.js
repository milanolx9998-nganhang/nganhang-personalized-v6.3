import {create} from 'zustand';
import {api} from '../api/client.js';
let initializing;
export const useAuth=create(set=>({
 user:null,ready:false,
 async initialize(){
  if(!initializing)initializing=api.get('/api/auth/me').then(user=>set({user,ready:true})).catch(()=>set({user:null,ready:true}));
  return initializing;
 },
 async login(username,password){const data=await api.post('/api/auth/login',{username,password});set({user:data.user,ready:true});return data;},
 async refreshMe(){try{set({user:await api.get('/api/auth/me'),ready:true});}catch{set({user:null,ready:true});}},
 async logout(){try{await api.post('/api/auth/logout',{});}finally{set({user:null,ready:true});}}
}));
export function hasCapability(user,key){return user?.capabilities?.[key]===true;}
export function hasAnyCapability(user,keys){return keys.some(key=>hasCapability(user,key));}
// Compatibility wrappers; no longer derive permissions from role names.
export function can(user,capabilities){return hasAnyCapability(user,Array.isArray(capabilities)?capabilities:[capabilities]);}
export function isReadOnly(user){return !hasAnyCapability(user,['content.write','content.review','content.approve']);}
export function canManage(user){return hasCapability(user,'content.write');}
export function canReview(user){return hasCapability(user,'content.review');}
export const ROLE_LABEL = {
  admin: 'Quản trị',
  board: 'BGH (chỉ xem)',
  viewer:'Người xem được phân quyền',
  student:'Học sinh',
  dept_leader: 'Tổ trưởng',
  grade_leader: 'Nhóm trưởng',
  teacher: 'Giáo viên',
};
