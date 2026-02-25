import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../lib/utils';
import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant' | 'system';
  content: string;
  image?: string;
}

export function ChatMessage({ role, content, image }: ChatMessageProps) {
  const isUser = role === 'user';

  const [imgError, setImgError] = React.useState(false);

  return (
    <div className={cn(
      "flex w-full mb-4 animate-in fade-in slide-in-from-bottom-2",
      isUser ? "justify-end" : "justify-start"
    )}>
      <div className={cn(
        "flex max-w-[85%] md:max-w-[75%] gap-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}>
        {/* Avatar */}
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-indigo-600 text-white" : "bg-emerald-600 text-white"
        )}>
          {isUser ? <User size={18} /> : <Bot size={18} />}
        </div>

        {/* Bubble */}
        <div className={cn(
          "p-4 rounded-2xl shadow-sm overflow-hidden",
          isUser 
            ? "bg-indigo-600 text-white rounded-tr-none" 
            : "bg-zinc-800 text-zinc-100 rounded-tl-none border border-zinc-700"
        )}>
          {image && !imgError && (
            <img 
              src={image} 
              alt="Uploaded or Generated" 
              className="mb-3 rounded-lg max-w-full h-auto max-h-64 object-cover border border-white/10" 
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
          )}
          {image && imgError && (
            <div className="mb-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
              <span>⚠️ عذراً، تعذر تحميل الصورة.</span>
            </div>
          )}
          <div className="prose prose-invert prose-sm max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
}
