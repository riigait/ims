import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Bot, X, Send } from 'lucide-react';
import { assistantApi } from '../services/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const WELCOME: Message = {
  role: 'assistant',
  content: 'Hi! Ask me anything about your inventory — stock levels, categories, out-of-stock items, and more.',
};

export default function AssistantPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: question }]);
    setLoading(true);
    try {
      const res = await assistantApi.query(question);
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.answer }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I could not get a response. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) send();
  };

  return (
    <>
      {/* Slide-in panel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={17} className="text-[var(--primary)]" />
            <span className="font-semibold text-sm text-[var(--text)]">Inventory Assistant</span>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded-md hover:bg-[var(--surface-2)] text-[var(--text-muted)]"
            aria-label="Close assistant"
          >
            <X size={16} />
          </button>
        </div>

        {/* Message list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === 'user'
                    ? 'bg-[var(--primary)] text-white rounded-br-sm'
                    : 'bg-[var(--surface-2)] text-[var(--text)] rounded-bl-sm'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-[var(--surface-2)] px-3 py-2 rounded-xl rounded-bl-sm text-sm text-[var(--text-muted)] flex gap-1 items-center">
                <span className="animate-pulse">●</span>
                <span className="animate-pulse delay-75">●</span>
                <span className="animate-pulse delay-150">●</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-3 border-t border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about your inventory…"
              disabled={loading}
              className="flex-1 px-3 py-2 text-sm border border-[var(--border)] rounded-lg bg-[var(--bg)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)] disabled:opacity-50"
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="p-2 rounded-lg bg-[var(--primary)] text-white hover:opacity-90 disabled:opacity-50 shrink-0"
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Floating toggle button — visible only when panel is closed */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-[var(--primary)] text-white py-4 px-1.5 rounded-l-xl shadow-lg hover:opacity-90 transition-opacity"
          aria-label="Open inventory assistant"
        >
          <Bot size={18} />
        </button>
      )}
    </>
  );
}
