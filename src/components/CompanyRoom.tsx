'use client';

import { useState } from 'react';
import { MeetingRoom } from './MeetingRoom';

interface Company {
  id: string;
  name: string;
  oneLiner: string | null;
  targetBuyer: string | null;
  stage: string;
  readinessNote: string | null;
}

interface Objection {
  id: string;
  title: string;
  detail: string | null;
  severity: string;
  state: string;
  stateHistory: any;
  lens: string | null;
  createdAt: Date | null;
}

interface Session {
  id: string;
  mode: string;
  phase: string;
  status: string;
  synthesis: string | null;
  punchList: any;
  createdAt: Date | null;
}

interface Document {
  id: string;
  filename: string;
  fileType: string;
  status: string;
  label: string | null;
  createdAt: Date | null;
}

interface BoardMember {
  id: string;
  name: string;
  title: string;
  committeeRole: string | null;
  avatarEmoji: string | null;
  voiceId: string | null;
}

interface Props {
  company: Company;
  objections: Objection[];
  sessions: Session[];
  documents: Document[];
  boardMembers: BoardMember[];
  isOperator: boolean;
}

export function CompanyRoom({ company, objections, sessions, documents, boardMembers, isOperator }: Props) {
  const [showMeeting, setShowMeeting] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [viewSession, setViewSession] = useState<string | null>(null);
  const [expandedObjection, setExpandedObjection] = useState<string | null>(null);

  const openObjections = objections.filter((o) => o.state !== 'resolved');
  const resolvedObjections = objections.filter((o) => o.state === 'resolved');

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadStatus('Uploading...');

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/companies/${company.id}/documents`, {
      method: 'POST',
      body: formData,
    });

    if (res.ok) {
      setUploadStatus('Uploaded & indexed');
      setTimeout(() => setUploadStatus(null), 3000);
    } else {
      setUploadStatus('Upload failed');
    }
  }

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'deal_killer': return 'border-l-red-500 bg-red-50';
      case 'major': return 'border-l-amber-500 bg-amber-50';
      case 'minor': return 'border-l-blue-500 bg-blue-50';
      default: return 'border-l-gray-400 bg-gray-50';
    }
  };

  const severityBadge = (severity: string) => {
    switch (severity) {
      case 'deal_killer': return 'bg-red-100 text-red-700';
      case 'major': return 'bg-amber-100 text-amber-700';
      case 'minor': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'ready': return 'bg-emerald-100 text-emerald-700';
      case 'processing': return 'bg-yellow-100 text-yellow-700';
      case 'partial_embeddings': return 'bg-orange-100 text-orange-700';
      case 'failed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <>
      {showMeeting && (
        <MeetingRoom
          companyId={company.id}
          companyName={company.name}
          boardMembers={boardMembers}
          onClose={() => setShowMeeting(false)}
        />
      )}

      <div className="space-y-6">
        {/* Header + pinned Start CTA */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-gray-900">{company.name}</h1>
            {company.oneLiner && <p className="text-gray-600 mt-1">{company.oneLiner}</p>}
            <div className="flex items-center gap-3 mt-2">
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                {company.stage.replace(/_/g, ' ')}
              </span>
              {company.targetBuyer && (
                <span className="text-xs text-gray-500">Target: {company.targetBuyer}</span>
              )}
            </div>
          </div>
          <button
            onClick={() => setShowMeeting(true)}
            disabled={boardMembers.length === 0}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-300 text-white font-medium rounded-lg text-sm transition-colors shadow-sm"
          >
            Start Board Meeting
          </button>
        </div>

        {company.readinessNote && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-800 mb-1">Latest Readiness Assessment</h3>
            <p className="text-sm text-blue-700">{company.readinessNote}</p>
          </div>
        )}

        {/* Three-column war room */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Column 1: Documents rail */}
          <div className="lg:col-span-3 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Documents</h2>

            <label className="flex items-center justify-center px-3 py-5 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors">
              <div className="text-center">
                <svg className="w-6 h-6 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
                <span className="text-xs text-gray-500 mt-1 block">Upload document</span>
              </div>
              <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.docx,.xlsx,.pptx" />
            </label>

            {uploadStatus && <p className="text-xs text-emerald-600">{uploadStatus}</p>}

            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 p-2.5 bg-white border border-gray-200 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{doc.filename}</p>
                    <span className={`inline-block mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded ${statusBadge(doc.status)}`}>
                      {doc.status === 'ready' ? 'Indexed' : doc.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              ))}
              {documents.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No documents yet</p>
              )}
            </div>
          </div>

          {/* Column 2: Objection tray */}
          <div className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Objections</h2>
              {openObjections.length > 0 && (
                <span className="text-xs text-gray-500">{openObjections.length} open</span>
              )}
            </div>

            {openObjections.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-sm">No open objections</p>
                <p className="text-xs mt-1">Run a board meeting to generate feedback</p>
              </div>
            )}

            <div className="space-y-2">
              {openObjections.map((obj) => (
                <div
                  key={obj.id}
                  className={`border-l-4 border border-gray-200 rounded-lg p-3 cursor-pointer transition-all ${severityColor(obj.severity)} ${expandedObjection === obj.id ? 'ring-1 ring-gray-300' : ''}`}
                  onClick={() => setExpandedObjection(expandedObjection === obj.id ? null : obj.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900">{obj.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${severityBadge(obj.severity)}`}>
                          {obj.severity.replace(/_/g, ' ')}
                        </span>
                        {obj.lens && <span className="text-[10px] text-gray-500">{obj.lens}</span>}
                        <span className="text-[10px] text-gray-400">{obj.state.replace(/_/g, ' ')}</span>
                      </div>
                    </div>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedObjection === obj.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>

                  {expandedObjection === obj.id && (
                    <div className="mt-3 space-y-2">
                      {obj.detail && (
                        <p className="text-xs text-gray-700">{obj.detail}</p>
                      )}
                      {obj.stateHistory && Array.isArray(obj.stateHistory) && obj.stateHistory.length > 0 && (
                        <div className="border-t border-gray-200 pt-2 mt-2">
                          <p className="text-[10px] font-medium text-gray-500 uppercase mb-1">State History</p>
                          {(obj.stateHistory as { state: string; at: string; note?: string }[]).map((h, i) => (
                            <div key={i} className="flex items-center gap-2 text-[10px] text-gray-500">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                              <span className="font-medium">{h.state}</span>
                              {h.note && <span className="text-gray-400">- {h.note}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {resolvedObjections.length > 0 && (
              <details className="mt-2">
                <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                  {resolvedObjections.length} resolved
                </summary>
                <div className="mt-2 space-y-1">
                  {resolvedObjections.map((obj) => (
                    <div key={obj.id} className="border border-green-200 bg-green-50 rounded-lg p-2">
                      <span className="text-xs text-green-700">{obj.title}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Column 3: Session timeline + deliverables */}
          <div className="lg:col-span-4 space-y-4">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Sessions</h2>

            {sessions.length === 0 && (
              <div className="text-center py-8">
                <p className="text-xs text-gray-400">No sessions yet</p>
                <button
                  onClick={() => setShowMeeting(true)}
                  disabled={boardMembers.length === 0}
                  className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-300 text-white text-xs font-medium rounded-lg"
                >
                  Start First Meeting
                </button>
              </div>
            )}

            <div className="space-y-3">
              {sessions.map((s) => (
                <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${s.status === 'complete' ? 'bg-emerald-400' : s.status === 'stalled' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'}`} />
                      <span className="text-sm font-medium text-gray-700 capitalize">
                        {s.mode.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-400">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] text-gray-500 capitalize">{s.phase.replace(/_/g, ' ')}</span>
                    {s.status === 'complete' && (
                      <button
                        onClick={() => setViewSession(viewSession === s.id ? null : s.id)}
                        className="text-[10px] text-emerald-600 hover:underline ml-auto"
                      >
                        {viewSession === s.id ? 'Hide' : 'View'}
                      </button>
                    )}
                  </div>
                  {viewSession === s.id && s.synthesis && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-[11px] text-gray-700 whitespace-pre-wrap max-h-48 overflow-y-auto">
                      {s.synthesis}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
