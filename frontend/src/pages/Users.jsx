// Compatibility entry point; staff permissions have one editor.
import {Navigate} from 'react-router-dom';
export default function Users(){return <Navigate to="/admin/staff" replace/>;}
