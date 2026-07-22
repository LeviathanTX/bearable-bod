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
      setUploadStatus('Uploaded! Processing...');
      setTimeout(() => setUploadStatus(null), 3000);
    } else {
      setUploadStatus('Upload failed');
    }
  }

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'deal_killer': return 'bg-red-100 text-red-800 border-red-200';
      case 'major': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'minor': return 'bg-blue-100 text-blue-800 border-blue-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const stateIcon = (state: string) => {
    switch (state) {
      case 'open': return '🔴';
      case 'addressed': return '🟡';
      case 'still_weak': return '🟠';
      case 'resolved': return '🟢';
      default: return '⚪';
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
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-semibold text-gray-900">{company.name}</h1>
            {company.oneLiner && <p className="text-gray-600 mt-1">{company.oneLiner}</p>}
            <div className="flex items-center gap-3 mt-2">
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                {company.stage}
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

        {/* Readiness note */}
        {company.readinessNote && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-800 mb-1">Latest Readiness Assessment</h3>
            <p className="text-sm text-blue-700">{company.readinessNote}</p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Objections + Sessions */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-3">
                Objections
                {openObjections.length > 0 && (
                  <span className="ml-2 text-sm text-gray-500">({openObjections.length} open)</span>
                )}
              </h2>

              {openObjections.length === 0 && (
                <p className="text-gray-400 text-sm">No open objections. Run a board meeting to generate feedback.</p>
              )}

              <div className="space-y-2">
                {openObjections.map((obj) => (
                  <div key={obj.id} className={`border rounded-lg p-3 ${severityColor(obj.severity)}`}>
                    <div className="flex items-start gap-2">
                      <span className="text-sm">{stateIcon(obj.state)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium">{obj.title}</h4>
                          <span className="text-xs opacity-70">{obj.severity.replace('_', ' ')}</span>
                          {obj.lens && <span className="text-xs opacity-60">({obj.lens})</span>}
                        </div>
                        {obj.detail && (
                          <p className="text-xs mt-1 opacity-80 line-clamp-2">{obj.detail}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {resolvedObjections.length > 0 && (
                <details className="mt-3">
                  <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                    {resolvedObjections.length} resolved
                  </summary>
                  <div className="mt-2 space-y-1">
                    {resolvedObjections.map((obj) => (
                      <div key={obj.id} className="border border-green-200 bg-green-50 rounded-lg p-2 opacity-60">
                        <span className="text-xs text-green-800">🟢 {obj.title}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Session history */}
            <div>
              <h2 className="text-lg font-medium text-gray-900 mb-3">Session History</h2>
              {sessions.length === 0 && (
                <p className="text-gray-400 text-sm">No sessions yet.</p>
              )}
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${s.status === 'complete' ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'}`} />
                        <span className="text-sm font-medium text-gray-700 capitalize">
                          {s.mode.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : ''}
                        </span>
                      </div>
                      {s.status === 'complete' && (
                        <button
                          onClick={() => setViewSession(viewSession === s.id ? null : s.id)}
                          className="text-xs text-emerald-600 hover:underline"
                        >
                          {viewSession === s.id ? 'Hide' : 'View synthesis'}
                        </button>
                      )}
                    </div>
                    {viewSession === s.id && s.synthesis && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-md text-xs text-gray-700 whitespace-pre-wrap max-h-60 overflow-y-auto">
                        {s.synthesis}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sidebar: Documents */}
          <div className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900">Documents</h2>

            <label className="flex items-center justify-center px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/50 transition-colors">
              <div className="text-center">
                <span className="text-2xl block mb-1">📄</span>
                <span className="text-sm text-gray-500">Drop or click to upload</span>
                <span className="text-xs text-gray-400 block mt-0.5">PDF, Word, Excel, PPTX</span>
              </div>
              <input type="file" className="hidden" onChange={handleUpload} accept=".pdf,.docx,.xlsx,.pptx" />
            </label>

            {uploadStatus && (
              <p className="text-xs text-emerald-600">{uploadStatus}</p>
            )}

            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-md">
                  <span className="text-sm">
                    {doc.fileType.includes('pdf') ? '📕' : doc.fileType.includes('word') || doc.fileType.includes('docx') ? '📘' : doc.fileType.includes('sheet') || doc.fileType.includes('xlsx') ? '📗' : '📄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">{doc.filename}</p>
                    <p className="text-xs text-gray-400">
                      {doc.status === 'ready' ? '✓ Indexed' : doc.status === 'processing' ? '⏳ Processing' : doc.status}
                    </p>
                  </div>
                </div>
              ))}
              {documents.length === 0 && (
                <p className="text-xs text-gray-400">No documents uploaded yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
