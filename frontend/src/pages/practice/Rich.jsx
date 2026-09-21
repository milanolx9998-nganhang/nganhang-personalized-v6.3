import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import 'katex/dist/katex.min.css';
export function Rich({text}){return <div className="rich-content"><ReactMarkdown remarkPlugins={[remarkMath,remarkGfm]} rehypePlugins={[rehypeKatex]} components={{img:({src,alt})=><img src={src} alt={alt||'Hình câu hỏi'} loading="lazy"/>}}>{String(text||'')}</ReactMarkdown></div>;}
