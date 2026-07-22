'use client';

import { useState } from 'react';
import { TemplateLibrary } from './TemplateLibrary';

interface BoardMember {
  id: string;
  name: string;
  title: string;
  committeeRole: string | null;
  expertise: any;
  personaPrompt: string | null;
  seatContext: string | null;
  interrogationStyle: string | null;
  avatarEmoji: string | null;
  avatarUrl: string | null;
  model: string | null;
  voiceId: string | null;
  mcpConnectorIds: any;
  active: boolean | null;
  version: number | null;
}

interface Template {
  id: string;
  templateSet: string;
  sortOrder: number;
  name: string;
  title: string;
  committeeRole: string | null;
  expertise: any;
  personaPrompt: string | null;
  seatContext: string | null;
  interrogationStyle: string | null;
  avatarEmoji: string | null;
}

interface Props {
  initialMembers: BoardMember[];
  templates: Template[];
}

const VOICES = [
  { id: 'Matthew', label: 'Matthew (US Male)' },
  { id: 'Joanna', label: 'Joanna (US Female)' },
  { id: 'Stephen', label: 'Stephen (US Male)' },
  { id: 'Ruth', label: 'Ruth (US Female)' },
  { id: 'Gregory', label: 'Gregory (US Male)' },
  { id: 'Danielle', label: 'Danielle (US Female)' },
  { id: 'Arthur', label: 'Arthur (UK Male)' },
  { id: 'Amy', label: 'Amy (UK Female)' },
];

export function BoardStudio({ initialMembers, templates }: Props) {
  const [members, setMembers] = useState(initialMembers);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<'board' | 'library'>('board');
  const [previewVoice, setPreviewVoice] = useState<string | null>(null);

  const activeMembers = members.filter((m) => m.active !== false);

  async function handleCreate(data: Partial<BoardMember>) {
    const res = await fetch('/api/board-members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { boardMember } = await res.json();
      setMembers([...members, boardMember]);
      setCreating(false);
    }
  }

  async function handleUpdate(id: string, data: Partial<BoardMember>) {
    const res = await fetch(`/api/board-members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const { boardMember } = await res.json();
      setMembers(members.map((m) => (m.id === id ? boardMember : m)));
      setEditing(null);
    }
  }

  async function handleAddTemplate(templateId: string) {
    const res = await fetch('/api/templates/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateId }),
    });
    if (res.ok) {
      const { boardMember } = await res.json();
      setMembers([...members, boardMember]);
    }
  }

  async function playVoicePreview(voiceId: string) {
    setPreviewVoice(voiceId);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId, text: 'This is how I will sound during board meetings.' }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => { URL.revokeObjectURL(url); setPreviewVoice(null); };
        audio.play();
      } else {
        setPreviewVoice(null);
      }
    } catch {
      setPreviewVoice(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 pb-0">
        <button
          onClick={() => setTab('board')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'board'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          My Board ({activeMembers.length})
        </button>
        <button
          onClick={() => setTab('library')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'library'
              ? 'border-emerald-600 text-emerald-700'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Template Library
        </button>
      </div>

      {tab === 'library' && (
        <TemplateLibrary
          templates={templates}
          onAdd={handleAddTemplate}
          existingNames={members.map((m) => m.name)}
        />
      )}

      {tab === 'board' && (
        <>
          {activeMembers.length === 0 && (
            <div className="text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
              <span className="text-4xl mb-3 block">👥</span>
              <h3 className="text-gray-900 font-medium mb-1">No board members yet</h3>
              <p className="text-gray-500 text-sm mb-4">Add advisors from the template library or create your own.</p>
              <button
                onClick={() => setTab('library')}
                className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-500"
              >
                Browse Template Library
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeMembers.map((member) => (
              <div
                key={member.id}
                className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{member.avatarEmoji || '👤'}</span>
                    <div>
                      <h3 className="font-medium text-gray-900">{member.name}</h3>
                      <p className="text-sm text-gray-500">{member.title}</p>
                      {member.committeeRole && (
                        <p className="text-xs text-emerald-600 mt-0.5">{member.committeeRole}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-gray-400">v{member.version}</span>
                    {member.voiceId && (
                      <span className="text-xs text-blue-500">🔊 {member.voiceId}</span>
                    )}
                  </div>
                </div>

                {member.expertise && (member.expertise as string[]).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {(member.expertise as string[]).slice(0, 3).map((e: string) => (
                      <span key={e} className="px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                        {e}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                  <button
                    onClick={() => setEditing(editing === member.id ? null : member.id)}
                    className="text-xs text-[var(--color-accent)] hover:underline"
                  >
                    {editing === member.id ? 'Close' : 'Edit'}
                  </button>
                  {member.voiceId && (
                    <button
                      onClick={() => playVoicePreview(member.voiceId!)}
                      disabled={previewVoice === member.voiceId}
                      className="text-xs text-blue-500 hover:underline disabled:opacity-50"
                    >
                      {previewVoice === member.voiceId ? '▶ Playing...' : '▶ Preview'}
                    </button>
                  )}
                </div>

                {editing === member.id && (
                  <BoardMemberEditForm
                    initial={member}
                    onSubmit={(data) => handleUpdate(member.id, data)}
                    onCancel={() => setEditing(null)}
                    onVoicePreview={playVoicePreview}
                    previewVoice={previewVoice}
                  />
                )}
              </div>
            ))}
          </div>

          {creating ? (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">New Board Member</h3>
              <BoardMemberEditForm
                onSubmit={handleCreate}
                onCancel={() => setCreating(false)}
                onVoicePreview={playVoicePreview}
                previewVoice={previewVoice}
              />
            </div>
          ) : (
            activeMembers.length > 0 && (
              <button
                onClick={() => setCreating(true)}
                className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90"
              >
                Create Custom Advisor
              </button>
            )
          )}
        </>
      )}
    </div>
  );
}

function BoardMemberEditForm({
  initial,
  onSubmit,
  onCancel,
  onVoicePreview,
  previewVoice,
}: {
  initial?: Partial<BoardMember>;
  onSubmit: (data: Partial<BoardMember>) => void;
  onCancel: () => void;
  onVoicePreview: (voiceId: string) => void;
  previewVoice: string | null;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [committeeRole, setCommitteeRole] = useState(initial?.committeeRole || '');
  const [personaPrompt, setPersonaPrompt] = useState(initial?.personaPrompt || '');
  const [seatContext, setSeatContext] = useState(initial?.seatContext || '');
  const [interrogationStyle, setInterrogationStyle] = useState(initial?.interrogationStyle || '');
  const [voiceId, setVoiceId] = useState(initial?.voiceId || '');
  const [activeTab, setActiveTab] = useState<'persona' | 'voice' | 'tools'>('persona');

  return (
    <div className="mt-4 space-y-3">
      {/* Sub-tabs */}
      <div className="flex gap-1 text-xs">
        {(['persona', 'voice', 'tools'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-2 py-1 rounded ${
              activeTab === t ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {t === 'persona' ? 'Persona' : t === 'voice' ? 'Voice' : 'Tools'}
          </button>
        ))}
      </div>

      {activeTab === 'persona' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name"
              className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
              className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          </div>
          <input value={committeeRole} onChange={(e) => setCommitteeRole(e.target.value)}
            placeholder="Committee Role (e.g., CMIO / Clinical)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <textarea value={personaPrompt} onChange={(e) => setPersonaPrompt(e.target.value)}
            placeholder="Persona Prompt (the 20-years brain)" rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" />
          <textarea value={seatContext} onChange={(e) => setSeatContext(e.target.value)}
            placeholder="Seat Context (org/vertical context)" rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <input value={interrogationStyle} onChange={(e) => setInterrogationStyle(e.target.value)}
            placeholder="Interrogation Style"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
        </>
      )}

      {activeTab === 'voice' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">Select a neural voice for this advisor during meetings.</p>
          <div className="grid grid-cols-2 gap-2">
            {VOICES.map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <button
                  onClick={() => setVoiceId(v.id)}
                  className={`flex-1 px-3 py-2 rounded-md text-sm text-left border transition-colors ${
                    voiceId === v.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {v.label}
                </button>
                <button
                  onClick={() => onVoicePreview(v.id)}
                  disabled={previewVoice === v.id}
                  className="text-xs text-blue-500 hover:underline disabled:opacity-50"
                >
                  {previewVoice === v.id ? '...' : '▶'}
                </button>
              </div>
            ))}
          </div>
          {voiceId && (
            <button onClick={() => setVoiceId('')} className="text-xs text-gray-400 hover:text-gray-600">
              Remove voice
            </button>
          )}
        </div>
      )}

      {activeTab === 'tools' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Attach MCP connectors to this seat. Configure connectors in Settings first.
          </p>
          <p className="text-xs text-gray-400 italic">
            MCP connector management available in the Connectors page.
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSubmit({ name, title, committeeRole, personaPrompt, seatContext, interrogationStyle, voiceId: voiceId || null })}
          className="px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Save
        </button>
        <button onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}
