'use client';

import { useState } from 'react';

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
  model: string | null;
  active: boolean | null;
  version: number | null;
}

export function BoardMemberStudio({ initialMembers }: { initialMembers: BoardMember[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {members.filter((m) => m.active !== false).map((member) => (
          <div key={member.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{member.avatarEmoji || '👤'}</span>
                <div>
                  <h3 className="font-medium text-gray-900">{member.name}</h3>
                  <p className="text-sm text-gray-500">{member.title}</p>
                  {member.committeeRole && (
                    <p className="text-xs text-gray-400 mt-0.5">{member.committeeRole}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">v{member.version}</span>
                <button
                  onClick={() => setEditing(member.id)}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  Edit
                </button>
              </div>
            </div>
            {editing === member.id && (
              <BoardMemberForm
                initial={member}
                onSubmit={(data) => handleUpdate(member.id, data)}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>
        ))}
      </div>

      {creating ? (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-3">New Board Member</h3>
          <BoardMemberForm
            onSubmit={handleCreate}
            onCancel={() => setCreating(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          Add Board Member
        </button>
      )}
    </div>
  );
}

function BoardMemberForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<BoardMember>;
  onSubmit: (data: Partial<BoardMember>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [title, setTitle] = useState(initial?.title || '');
  const [committeeRole, setCommitteeRole] = useState(initial?.committeeRole || '');
  const [personaPrompt, setPersonaPrompt] = useState(initial?.personaPrompt || '');
  const [seatContext, setSeatContext] = useState(initial?.seatContext || '');
  const [interrogationStyle, setInterrogationStyle] = useState(initial?.interrogationStyle || '');

  return (
    <div className="mt-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>
      <input
        value={committeeRole}
        onChange={(e) => setCommitteeRole(e.target.value)}
        placeholder="Committee Role (e.g., CMIO / Clinical)"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
      <textarea
        value={personaPrompt}
        onChange={(e) => setPersonaPrompt(e.target.value)}
        placeholder="Persona Prompt (the 20-years brain)"
        rows={6}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
      />
      <textarea
        value={seatContext}
        onChange={(e) => setSeatContext(e.target.value)}
        placeholder="Seat Context (org/vertical context)"
        rows={3}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
      <input
        value={interrogationStyle}
        onChange={(e) => setInterrogationStyle(e.target.value)}
        placeholder="Interrogation Style"
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onSubmit({ name, title, committeeRole, personaPrompt, seatContext, interrogationStyle })}
          className="px-3 py-1.5 bg-[var(--color-accent)] text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Save
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
