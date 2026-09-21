import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import 'katex/dist/katex.min.css';

export default function MathText({ text }) {
  if (!text) return null;

  return (
    <div className="math-text-container" style={{ fontSize: '15px', lineHeight: '1.6' }}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
           p: ({node, ...props}) => <p style={{ margin: '0 0 8px 0' }} {...props} />
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
