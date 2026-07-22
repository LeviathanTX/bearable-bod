'use client';

import { useState } from 'react';

interface Props {
  proposals: any[];
  boardMembers: any[];
}

export function ProposalInbox({ proposals: initial, boardMembers }: Props) {
  const [proposals, setProposals] = useState(initial);

  async function handleDecision(id: string, status: 'approved' | 'rejected') {
    const res = await fetch(`/api/proposals/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    if (res.ok) {
      setProposals(proposals.map((p) => (p.id === id ? { ...p, status } : p)));
    }
  }

  const pending = proposals.filter((p) => p.status === 'pending');
  const decided = proposals.filter((p) => p.status !== 'pending');

  return (
    <div className="space-y-6">
      {pending.length === 0 && (
        <p className="text-gray-400 text-sm">No pending proposals.</p>
      )}

      {pending.map((p) => {
        const member = boardMembers.find((m: any) => m.id === p.boardMemberId);
        return (
          <div key={p.id} className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium text-gray-900">
                  {member?.avatarEmoji || '👤'} {member?.name || 'Unknown'} - {member?.title || ''}
                </p>
                <p className="text-sm text-gray-700 mt-2">{p.proposal}</p>
                {p.rationale && <p className="text-xs text-gray-500 mt-1">Rationale: {p.rationale}</p>}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => handleDecision(p.id, 'approved')}
                className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
              >
                Approve
              </button>
              <button
                onClick={() => handleDecision(p.id, 'rejected')}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-md text-sm hover:bg-gray-50"
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}

      {decided.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm font-medium text-gray-500 mb-3">Decided</h3>
          <div className="space-y-2">
            {decided.map((p) => {
              const member = boardMembers.find((m: any) => m.id === p.boardMemberId);
              return (
                <div key={p.id} className="border border-gray-100 rounded-md p-3 opacity-60">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{member?.name}: {p.proposal.slice(0, 80)}...</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      p.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
