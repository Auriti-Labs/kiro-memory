import React, { useState, useRef, useEffect } from 'react';

/* Colori per tipo di osservazione */
const TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  'file-write': { color: 'bg-accent-green', label: 'File writes' },
  'file-read': { color: 'bg-accent-cyan', label: 'File reads' },
  'command': { color: 'bg-accent-amber', label: 'Commands' },
  'research': { color: 'bg-accent-blue', label: 'Research' },
  'delegation': { color: 'bg-accent-violet', label: 'Delegations' },
  'tool-use': { color: 'bg-zinc-400', label: 'Tool usage' },
};

/* Colori per progetto (hash deterministico) */
const PROJECT_COLORS = [
  { bg: 'bg-accent-violet/15', text: 'text-accent-violet', ring: 'ring-accent-violet/30' },
  { bg: 'bg-accent-blue/15', text: 'text-accent-blue', ring: 'ring-accent-blue/30' },
  { bg: 'bg-accent-green/15', text: 'text-accent-green', ring: 'ring-accent-green/30' },
  { bg: 'bg-accent-amber/15', text: 'text-accent-amber', ring: 'ring-accent-amber/30' },
  { bg: 'bg-accent-rose/15', text: 'text-accent-rose', ring: 'ring-accent-rose/30' },
  { bg: 'bg-accent-cyan/15', text: 'text-accent-cyan', ring: 'ring-accent-cyan/30' },
  { bg: 'bg-accent-orange/15', text: 'text-accent-orange', ring: 'ring-accent-orange/30' },
];

function getProjectColorByName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i) | 0;
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

interface SidebarProps {
  projects: string[];
  currentFilter: string;
  onFilterChange: (project: string) => void;
  activeTypes: Set<string>;
  onToggleType: (type: string) => void;
  stats: { observations: number; summaries: number; prompts: number };
  getDisplayName: (project: string) => string;
  onRenameProject: (project: string, displayName: string) => Promise<void>;
}

export function Sidebar({
  projects, currentFilter, onFilterChange, activeTypes, onToggleType,
  stats, getDisplayName, onRenameProject,
}: SidebarProps) {
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingProject && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingProject]);

  const startEditing = (project: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setEditValue(getDisplayName(project));
  };

  const confirmEdit = async () => {
    if (editingProject && editValue.trim()) {
      await onRenameProject(editingProject, editValue.trim());
    }
    setEditingProject(null);
  };

  const cancelEdit = () => { setEditingProject(null); setEditValue(''); };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  return (
    <aside className="h-full overflow-y-auto bg-surface-1 border-r border-border flex flex-col">
      {/* Sezione: Progetti */}
      <div className="p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">Projects</h3>

        {/* All Projects */}
        <button
          onClick={() => onFilterChange('')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left mb-0.5 ${
            currentFilter === ''
              ? 'bg-accent-violet/10 text-accent-violet font-semibold'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-2'
          }`}
        >
          <div className="w-7 h-7 rounded-md bg-accent-violet/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-accent-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </div>
          <span className="flex-1">All projects</span>
          <span className="text-xs text-zinc-600 font-mono tabular-nums">{projects.length}</span>
        </button>

        {/* Lista progetti */}
        <div className="flex flex-col gap-0.5 mt-1">
          {projects.map(project => {
            const pc = getProjectColorByName(project);
            const isEditing = editingProject === project;
            const isActive = currentFilter === project;
            const initials = getDisplayName(project).substring(0, 2).toUpperCase();

            return (
              <div key={project} className="group">
                {isEditing ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-3 border border-border">
                    <input
                      ref={editInputRef}
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={confirmEdit}
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-sm text-zinc-200"
                    />
                    <button onClick={confirmEdit} className="text-accent-green hover:text-accent-green/80 p-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                    </button>
                    <button onClick={cancelEdit} className="text-zinc-500 hover:text-zinc-300 p-0.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => onFilterChange(project)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all text-left ${
                      isActive
                        ? 'bg-surface-3 text-zinc-100 font-medium'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-surface-2'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${pc.bg} ${pc.text}`}>
                      {initials}
                    </div>
                    <span className="flex-1 truncate">{getDisplayName(project)}</span>
                    <span
                      onClick={e => startEditing(project, e)}
                      className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-zinc-300 transition-all p-0.5"
                      title="Rename"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                      </svg>
                    </span>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border" />

      {/* Sezione: Filtri tipo */}
      <div className="p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">Filters</h3>
        <div className="flex flex-col gap-0.5">
          {Object.entries(TYPE_CONFIG).map(([type, config]) => {
            const isActive = activeTypes.has(type);
            return (
              <label
                key={type}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all ${
                  isActive ? 'text-zinc-300 hover:text-zinc-100' : 'text-zinc-600 hover:text-zinc-400'
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                  isActive
                    ? 'bg-accent-violet border-accent-violet'
                    : 'bg-transparent border-zinc-600'
                }`}>
                  {isActive && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </div>
                <input type="checkbox" checked={isActive} onChange={() => onToggleType(type)} className="sr-only" />
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.color} ${isActive ? 'opacity-100' : 'opacity-30'}`} />
                <span className="flex-1">{config.label}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border" />

      {/* Sezione: Statistiche */}
      <div className="p-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-2">Statistics</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Observations', value: stats.observations, color: 'text-accent-violet' },
            { label: 'Summaries', value: stats.summaries, color: 'text-accent-cyan' },
            { label: 'Prompts', value: stats.prompts, color: 'text-accent-amber' },
            { label: 'Projects', value: projects.length, color: 'text-accent-green' },
          ].map(item => (
            <div key={item.label} className="rounded-lg bg-surface-2 border border-border px-3 py-3 text-center">
              <div className={`text-xl font-bold tabular-nums ${item.color}`}>{item.value}</div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 mt-1">{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto px-4 py-4">
        <div className="text-[10px] text-zinc-700 font-mono text-center">Kiro Memory v1.5.0</div>
      </div>
    </aside>
  );
}
