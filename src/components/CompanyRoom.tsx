'use client';

import { useState } from 'react';

interface Props {
  company: any;
  objections: any[];
  sessions: any[];
  documents: any[];
  boardMembers: any[];
  isOperator: boolean;
}

export function CompanyRoom({ company, objections, sessions, documents, boardMembers, isOperator }: Props) {
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [focusPrompt, setFocusPrompt] = useState('');

  async function startReview() {
    if (selectedSeats.length === 0) return;
    setStarting(true);

    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: company.id,
        seatIds: selectedSeats,
        mode: focusPrompt ? 'focused' : 'full_review',
        focusPrompt: focusPrompt || null,
      }),
    });

    if (res.ok) {
      window.location.reload();
    }
    setStarting(false);
  }

  const dealKillers = objections.filter((o) => o.severity === 'deal_killer' && o.state !== 'resolved');
  const majorObjs = objections.filter((o) => o.severity === 'major' && o.state !== 'resolved');
  const minorObjs = objections.filter((o) => o.severity === 'minor' && o.state !== 'resolved');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-gray-900">{company.name}</h1>
          {company.oneLiner && <p className="text-gray-600 mt-1">{company.oneLiner}</p>}
          <div className="flex items-center gap-3 mt-2">
            <span className="inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
              {company.stage}
            </span>
            {company.targetBuyer && (
              <span className="text-sm text-gray-500">Target: {company.targetBuyer}</span>
            )}
          </div>
        </div>
      </div>

      {/* Readiness Note */}
      {company.readinessNote && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-medium text-blue-800 mb-1">Chair Readiness Assessment</p>
          <p className="text-sm text-blue-700">{company.readinessNote}</p>
        </div>
      )}

      {/* Objections Board */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Objections</h2>
        {objections.filter((o) => o.state !== 'resolved').length === 0 ? (
          <p className="text-gray-400 text-sm">No open objections.</p>
        ) : (
          <div className="space-y-3">
            {dealKillers.map((o) => (
              <ObjectionCard key={o.id} objection={o} />
            ))}
            {majorObjs.map((o) => (
              <ObjectionCard key={o.id} objection={o} />
            ))}
            {minorObjs.map((o) => (
              <ObjectionCard key={o.id} objection={o} />
            ))}
          </div>
        )}
      </div>

      {/* Start Review */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Start a Review</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select board seats</label>
            <div className="flex flex-wrap gap-2">
              {boardMembers.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedSeats((prev) =>
                    prev.includes(m.id) ? prev.filter((s) => s !== m.id) : [...prev, m.id]
                  )}
                  className={`px-3 py-1.5 rounded-md text-sm border transition-colors ${
                    selectedSeats.includes(m.id)
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {m.avatarEmoji || '👤'} {m.name}
                </button>
              ))}
            </div>
          </div>
          <input
            value={focusPrompt}
            onChange={(e) => setFocusPrompt(e.target.value)}
            placeholder="Optional: focus prompt (e.g., 'Review their security posture specifically')"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
          <button
            onClick={startReview}
            disabled={selectedSeats.length === 0 || starting}
            className="px-4 py-2 bg-[var(--color-accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {starting ? 'Starting...' : `Start Review (${selectedSeats.length} seats)`}
          </button>
        </div>
      </div>

      {/* Sessions */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Session History</h2>
        {sessions.length === 0 ? (
          <p className="text-gray-400 text-sm">No sessions yet.</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div key={s.id} className="border border-gray-100 rounded-md p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {s.mode === 'focused' ? 'Focused' : 'Full'} Review
                  </span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      s.status === 'complete' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {s.phase}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(s.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {s.synthesis && (
                  <p className="text-sm text-gray-600 mt-2 line-clamp-3">{s.synthesis.slice(0, 200)}...</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Documents</h2>
        <DocumentUpload companyId={company.id} />
        {documents.length > 0 && (
          <div className="mt-4 space-y-2">
            {documents.map((d) => (
              <div key={d.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <span className="text-sm font-medium text-gray-900">{d.filename}</span>
                  {d.label && <span className="text-xs text-gray-500 ml-2">({d.label})</span>}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  d.status === 'ready' ? 'bg-green-100 text-green-700' :
                  d.status === 'failed' ? 'bg-red-100 text-red-700' :
                  'bg-yellow-100 text-yellow-700'
                }`}>
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ObjectionCard({ objection }: { objection: any }) {
  const severityColors: Record<string, string> = {
    deal_killer: 'bg-red-100 text-red-800 border-red-200',
    major: 'bg-orange-100 text-orange-800 border-orange-200',
    minor: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  };

  const stateColors: Record<string, string> = {
    open: 'bg-red-50 text-red-600',
    addressed: 'bg-blue-50 text-blue-600',
    still_weak: 'bg-orange-50 text-orange-600',
  };

  return (
    <div className={`border rounded-md p-3 ${severityColors[objection.severity] || 'border-gray-200'}`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm font-medium">{objection.title}</span>
          <span className="text-xs ml-2 text-gray-500">({objection.lens || 'general'})</span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${stateColors[objection.state] || ''}`}>
          {objection.state}
        </span>
      </div>
      {objection.detail && <p className="text-xs mt-1 opacity-80">{objection.detail.slice(0, 200)}</p>}
    </div>
  );
}

function DocumentUpload({ companyId }: { companyId: string }) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    await fetch(`/api/companies/${companyId}/documents`, {
      method: 'POST',
      body: formData,
    });

    setUploading(false);
    window.location.reload();
  }

  return (
    <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
      {uploading ? 'Uploading...' : 'Upload document'}
      <input type="file" onChange={handleUpload} className="hidden" accept=".pdf,.docx,.xlsx,.pptx,.txt" />
    </label>
  );
}
