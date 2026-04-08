import React, { useState, useEffect } from 'react';
import type { Session, SessionMessage } from '../types';
import { timeAgo, formatDuration } from '../utils/format';

const MESSAGE_STYLES: Record<SessionMessage['role'], { badge: string; box: string; label: string }> = {
  user: {
    badge: 'bg-rose-500/10 text-rose-400',
    box: 'bg-surface-0 border-border',
    label: 'User',
  },
  assistant: {
    badge: 'bg-blue-500/10 text-blue-400',
    box: 'bg-blue-500/5 border-blue-500/20',
    label: 'Assistant',
  },
  system: {
    badge: 'bg-zinc-500/10 text-zinc-400',
    box: 'bg-zinc-500/5 border-zinc-500/20',
    label: 'System',
  },
};

function SessionConversation({ messages }: { messages: SessionMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-zinc-500">
        Nessun messaggio conversazionale disponibile per questa sessione.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {messages.map(message => {
        const style = MESSAGE_STYLES[message.role] || MESSAGE_STYLES.system;
        return (
          <div key={message.id || `${message.content_session_id}-${message.message_index}`} className={`rounded-md border px-3 py-3 ${style.box}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${style.badge}`}>
                {style.label}
              </span>
              <span className="text-[10px] text-zinc-600 font-mono ml-auto">#{message.message_index}</span>
            </div>
            <pre className="text-xs text-zinc-300 whitespace-pre-wrap break-words font-sans leading-relaxed">{message.content}</pre>
          </div>
        );
      })}
    </div>
  );
}

interface SessionMessagesState {
  [sessionId: number]: {
    isLoading: boolean;
    messages: SessionMessage[];
    error: boolean;
  };
}

function buildEmptyMessagesState(): SessionMessagesState {
  return {};
}

function shouldFetchMessages(sessionId: number, store: SessionMessagesState): boolean {
  return !store[sessionId] || (!store[sessionId].isLoading && store[sessionId].messages.length === 0 && !store[sessionId].error);
}

function renderSessionConversation(sessionId: number, state: SessionMessagesState) {
  const current = state[sessionId];
  if (!current) return null;
  if (current.isLoading) {
    return <p className="text-xs text-zinc-500">Caricamento conversazione…</p>;
  }
  if (current.error) {
    return <p className="text-xs text-rose-400">Impossibile caricare i messaggi della sessione.</p>;
  }
  return <SessionConversation messages={current.messages} />;
}

const STATUS_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  active: { dot: 'bg-accent-green animate-pulse-dot', text: 'text-accent-green', label: 'Active' },
  completed: { dot: 'bg-accent-blue', text: 'text-accent-blue', label: 'Completed' },
  failed: { dot: 'bg-accent-rose', text: 'text-accent-rose', label: 'Failed' },
};

interface SessionsProps {
  currentFilter: string;
  getDisplayName: (project: string) => string;
}

export function Sessions({ currentFilter, getDisplayName }: SessionsProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<SessionMessagesState>(buildEmptyMessagesState);

  useEffect(() => {
    setMessagesBySession(buildEmptyMessagesState());
    setExpandedId(null);
    setIsLoading(true);
    const params = currentFilter ? `?project=${encodeURIComponent(currentFilter)}` : '';
    fetch(`/api/sessions${params}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]))
      .finally(() => setIsLoading(false));
  }, [currentFilter]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-accent-violet/30 border-t-accent-violet rounded-full animate-spin mb-4" />
        <p className="text-sm text-zinc-500">Loading sessions...</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-border flex items-center justify-center mb-5">
          <svg className="w-7 h-7 text-zinc-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <p className="text-base font-semibold text-zinc-300 mb-2">No sessions found</p>
        <p className="text-sm text-zinc-500 max-w-xs leading-relaxed">
          Start a coding session to see it tracked here.
        </p>
      </div>
    );
  }

  /* Statistiche in cima */
  const total = sessions.length;
  const completed = sessions.filter(s => s.status === 'completed').length;
  const active = sessions.filter(s => s.status === 'active').length;
  const avgDuration = (() => {
    const completedSessions = sessions.filter(s => s.completed_at_epoch && s.started_at_epoch);
    if (completedSessions.length === 0) return 0;
    const totalMs = completedSessions.reduce((sum, s) => sum + ((s.completed_at_epoch || 0) - s.started_at_epoch), 0);
    return totalMs / completedSessions.length / 60_000; // minuti
  })();

  const loadSessionMessages = async (sessionId: number) => {
    setMessagesBySession(prev => ({
      ...prev,
      [sessionId]: { isLoading: true, messages: prev[sessionId]?.messages || [], error: false },
    }));

    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`);
      const data = res.ok ? await res.json() : null;
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      setMessagesBySession(prev => ({
        ...prev,
        [sessionId]: { isLoading: false, messages, error: false },
      }));
    } catch {
      setMessagesBySession(prev => ({
        ...prev,
        [sessionId]: { isLoading: false, messages: prev[sessionId]?.messages || [], error: true },
      }));
    }
  };

  const handleToggleExpand = (sessionId: number) => {
    const nextExpanded = expandedId === sessionId ? null : sessionId;
    setExpandedId(nextExpanded);
    if (nextExpanded !== null && shouldFetchMessages(sessionId, messagesBySession)) {
      void loadSessionMessages(sessionId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg bg-surface-1 border border-border px-4 py-4">
          <div className="text-2xl font-bold tabular-nums text-accent-violet">{total}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mt-1">Total</div>
        </div>
        <div className="rounded-lg bg-surface-1 border border-border px-4 py-4">
          <div className="text-2xl font-bold tabular-nums text-accent-green">{active}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mt-1">Active</div>
        </div>
        <div className="rounded-lg bg-surface-1 border border-border px-4 py-4">
          <div className="text-2xl font-bold tabular-nums text-accent-blue">{completed}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mt-1">Completed</div>
        </div>
        <div className="rounded-lg bg-surface-1 border border-border px-4 py-4">
          <div className="text-2xl font-bold tabular-nums text-accent-cyan">{formatDuration(avgDuration)}</div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mt-1">Avg Duration</div>
        </div>
      </div>

      {/* Lista sessioni */}
      <div className="space-y-2">
        {sessions.map(session => {
          const style = STATUS_STYLES[session.status] || STATUS_STYLES.active;
          const isExpanded = expandedId === session.id;
          const duration = session.completed_at_epoch
            ? (session.completed_at_epoch - session.started_at_epoch) / 60_000
            : (Date.now() - session.started_at_epoch) / 60_000;
          const conversationState = messagesBySession[session.id];
          const firstUserMessage = conversationState?.messages.find(message => message.role === 'user');
          const displayPrompt = session.user_prompt || firstUserMessage?.content || 'Session';

          return (
            <div
              key={session.id}
              className="bg-surface-1 border border-border rounded-lg overflow-hidden transition-all hover:border-border-hover"
            >
              {/* Riga principale */}
              <button
                onClick={() => handleToggleExpand(session.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                aria-expanded={isExpanded}
              >
                {/* Status dot */}
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />

                {/* Contenuto */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-200 truncate">
                      {displayPrompt}
                    </span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${style.text} bg-surface-3`}>
                      {style.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-zinc-500">{getDisplayName(session.project)}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">{timeAgo(session.started_at_epoch)}</span>
                    <span className="text-[10px] text-zinc-600 font-mono">{formatDuration(duration)}</span>
                  </div>
                </div>

                {/* Freccia expand */}
                <svg
                  className={`w-4 h-4 text-zinc-600 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {/* Dettagli espansi */}
              {isExpanded && (
                <div className="px-4 pb-3 pt-0 border-t border-border space-y-2 animate-fade-in">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-zinc-600">Session ID</span>
                      <div className="text-zinc-400 font-mono text-[11px] truncate">{session.content_session_id}</div>
                    </div>
                    <div>
                      <span className="text-zinc-600">Duration</span>
                      <div className="text-zinc-400 font-mono text-[11px]">{formatDuration(duration)}</div>
                    </div>
                    <div>
                      <span className="text-zinc-600">Started</span>
                      <div className="text-zinc-400 font-mono text-[11px]">{new Date(session.started_at_epoch).toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="text-zinc-600">Completed</span>
                      <div className="text-zinc-400 font-mono text-[11px]">
                        {session.completed_at_epoch ? new Date(session.completed_at_epoch).toLocaleString() : session.status === 'completed' ? 'Before tracking' : '—'}
                      </div>
                    </div>
                  </div>
                  {displayPrompt && displayPrompt !== 'Session' && (
                    <div>
                      <span className="text-[11px] text-zinc-600">Prompt</span>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed break-words">{displayPrompt}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-[11px] text-zinc-600">Conversation</span>
                    <div className="mt-2">
                      {renderSessionConversation(session.id, messagesBySession)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

      </div>
    </div>
  );
}
