import ContentScopePicker,{scopeFromConfig} from '../../components/ContentScopePicker.jsx';
export default function ContentPicker({value,onChange}){
 return <fieldset className="wide content-picker"><legend>Nội dung muốn luyện</legend><ContentScopePicker student value={scopeFromConfig(value)} types={value.types} onChange={scope=>onChange({...value,content_scope_v2:scope,topic_ids:scope.clauses.map(c=>c.topic_id).filter(Boolean),yccd_keys:[],selection_mode:'topic'})}/></fieldset>;
}
