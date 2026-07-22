'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface BoardMember {
  id: string;
  name: string;
  title: string;
  committeeRole: string | null;
  avatarEmoji: string | null;
  voiceId: string | null;
}

interface Take {
  id: string;
  boardMemberId: string;
  phase: string;
  content: string;
  createdAt: string;
}

interface SessionData {
  id: string;
  phase: string;
  status: string;
  synthesis: string | null;
  punchList: any[];
  focusPrompt: string | null;
  mode: string;
}

type MeetingPhase = 'setup' | 'interrogating' | 'advising' | 'synthesizing' | 'complete';

interface Props {
  companyId: string;
  companyName: string;
  boardMembers: BoardMember[];
  onClose: () => void;
}

export function MeetingRoom({ companyId, companyName, boardMembers, onClose }: Props) {
  const [phase, setPhase] = useState<MeetingPhase>('setup');
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [focusPrompt, setFocusPrompt] = useState('');
  const [mode, setMode] = useState('full_review');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [punchList, setPunchList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const toggleSeat = (id: string) => {
    setSelectedSeats((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 6 ? [...prev, id] : prev
    );
  };

  const startSession = async () => {
    if (selectedSeats.length === 0) return;
    setError(null);
    setPhase('interrogating');

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          seatIds: selectedSeats,
          mode,
          focusPrompt: focusPrompt || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start session');
      }

      const { session } = await res.json();
      setSessionId(session.id);
      startPolling(session.id);
    } catch (err: any) {
      setError(err.message);
      setPhase('setup');
    }
  };

  const startPolling = (sid: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => pollSession(sid), 2000);
  };

  const pollSession = useCallback(async (sid: string) => {
    try {
      const res = await fetch(`/api/sessions/${sid}`);
      if (!res.ok) return;
      const data = await res.json();
      const session: SessionData = data.session;
      const newTakes: Take[] = data.takes || [];

      setTakes(newTakes);

      if (session.phase === 'advise' && phase === 'interrogating') {
        setPhase('advising');
      }
      if (session.phase === 'synthesized' || session.status === 'complete') {
        setPhase('complete');
        setSynthesis(session.synthesis);
        setPunchList(session.punchList || []);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    } catch {}
  }, [phase]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [takes]);

  useEffect(() => {
    if (takes.length > 0 && phase !== 'complete') {
      const latest = takes[takes.length - 1];
      setActiveSpeaker(latest.boardMemberId);
      const timer = setTimeout(() => setActiveSpeaker(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [takes.length, phase]);

  const getSeatTakes = (seatId: string, phaseFilter: string) =>
    takes.filter((t) => t.boardMemberId === seatId && t.phase === phaseFilter);

  const phaseLabel = (p: MeetingPhase) => {
    switch (p) {
      case 'setup': return 'Session Setup';
      case 'interrogating': return 'Interrogation Phase';
      case 'advising': return 'Advisory Phase';
      case 'synthesizing': return 'Chair Synthesis';
      case 'complete': return 'Session Complete';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/95 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-white font-display font-semibold text-lg">{companyName}</h2>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {phaseLabel(phase)}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white transition-colors text-sm"
        >
          Leave Meeting
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Main area */}
        <div className="flex-1 flex flex-col">
          {phase === 'setup' && (
            <SetupPanel
              boardMembers={boardMembers}
              selectedSeats={selectedSeats}
              toggleSeat={toggleSeat}
              focusPrompt={focusPrompt}
              setFocusPrompt={setFocusPrompt}
              mode={mode}
              setMode={setMode}
              onStart={startSession}
              error={error}
            />
          )}

          {phase !== 'setup' && (
            <>
              {/* Seat grid */}
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3">
                {selectedSeats.map((seatId) => {
                  const member = boardMembers.find((m) => m.id === seatId);
                  if (!member) return null;
                  const seatTakes = takes.filter((t) => t.boardMemberId === seatId);
                  const latestTake = seatTakes[seatTakes.length - 1];
                  const isActive = activeSpeaker === seatId;

                  return (
                    <SeatTile
                      key={seatId}
                      member={member}
                      latestTake={latestTake}
                      isActive={isActive}
                      phase={phase}
                    />
                  );
                })}
              </div>

              {/* Synthesis panel */}
              {phase === 'complete' && synthesis && (
                <div className="px-4 pb-4">
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <h3 className="text-emerald-400 font-medium text-sm mb-2">Chair Synthesis</h3>
                    <div className="text-gray-300 text-sm whitespace-pre-wrap">{synthesis}</div>
                    {punchList.length > 0 && (
                      <div className="mt-3 border-t border-gray-700 pt-3">
                        <h4 className="text-amber-400 text-xs font-medium mb-1">Punch List</h4>
                        <ul className="text-gray-400 text-xs space-y-1">
                          {punchList.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Right rail: transcript */}
        {phase !== 'setup' && (
          <aside className="w-80 border-l border-gray-700 bg-gray-850 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700">
              <h3 className="text-gray-300 text-sm font-medium">Transcript</h3>
            </div>
            <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
              {takes.map((take) => {
                const member = boardMembers.find((m) => m.id === take.boardMemberId);
                return (
                  <div key={take.id} className="text-sm">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-lg">{member?.avatarEmoji || '👤'}</span>
                      <span className="text-gray-400 font-medium text-xs">{member?.name}</span>
                      <span className="text-gray-600 text-xs">
                        {take.phase === 'interrogate' ? '🔍' : '💡'}
                      </span>
                    </div>
                    <p className="text-gray-300 text-xs leading-relaxed pl-7">
                      {take.content.slice(0, 400)}
                      {take.content.length > 400 && '...'}
                    </p>
                  </div>
                );
              })}
              {takes.length === 0 && phase !== 'complete' && (
                <div className="flex items-center gap-2 text-gray-500 text-xs">
                  <span className="animate-pulse">●</span>
                  Waiting for board members...
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function SetupPanel({
  boardMembers,
  selectedSeats,
  toggleSeat,
  focusPrompt,
  setFocusPrompt,
  mode,
  setMode,
  onStart,
  error,
}: {
  boardMembers: BoardMember[];
  selectedSeats: string[];
  toggleSeat: (id: string) => void;
  focusPrompt: string;
  setFocusPrompt: (v: string) => void;
  mode: string;
  setMode: (v: string) => void;
  onStart: () => void;
  error: string | null;
}) {
  const modes = [
    { id: 'full_review', label: 'Full Board Review', desc: 'Complete interrogation + advisory cycle' },
    { id: 'deal_killer_hunt', label: 'Deal-Killer Hunt', desc: 'Focus on fatal flaws and showstoppers' },
    { id: 'pitch_rehearsal', label: 'Pitch Rehearsal', desc: 'Practice pitch delivery and response' },
    { id: 'quick_consult', label: 'Quick Consult', desc: 'Rapid single-question advisory' },
  ];

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-3xl space-y-6">
        <div>
          <h3 className="text-white text-lg font-medium mb-1">Select Board Seats</h3>
          <p className="text-gray-400 text-sm">Choose up to 6 advisors for this session.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {boardMembers.map((member) => {
            const selected = selectedSeats.includes(member.id);
            return (
              <button
                key={member.id}
                onClick={() => toggleSeat(member.id)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  selected
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl">{member.avatarEmoji || '👤'}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${selected ? 'text-emerald-300' : 'text-gray-200'}`}>
                      {member.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{member.committeeRole || member.title}</p>
                  </div>
                  {selected && (
                    <span className="ml-auto text-emerald-400 text-xs">✓</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div>
          <h3 className="text-white text-sm font-medium mb-2">Session Mode</h3>
          <div className="grid grid-cols-2 gap-2">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`p-3 rounded-lg border text-left text-sm transition-all ${
                  mode === m.id
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                }`}
              >
                <p className={`font-medium ${mode === m.id ? 'text-blue-300' : 'text-gray-300'}`}>{m.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-white text-sm font-medium block mb-1">Focus Question (optional)</label>
          <textarea
            value={focusPrompt}
            onChange={(e) => setFocusPrompt(e.target.value)}
            placeholder="What specific area should the board focus on?"
            rows={2}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          onClick={onStart}
          disabled={selectedSeats.length === 0}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium rounded-lg transition-colors"
        >
          Start Board Meeting ({selectedSeats.length} seat{selectedSeats.length !== 1 ? 's' : ''})
        </button>
      </div>
    </div>
  );
}

function SeatTile({
  member,
  latestTake,
  isActive,
  phase,
}: {
  member: BoardMember;
  latestTake?: Take;
  isActive: boolean;
  phase: MeetingPhase;
}) {
  return (
    <div
      className={`bg-gray-800 rounded-lg p-3 border transition-all ${
        isActive ? 'border-emerald-500 shadow-lg shadow-emerald-500/10' : 'border-gray-700'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-2xl">{member.avatarEmoji || '👤'}</span>
        <div className="min-w-0 flex-1">
          <p className="text-gray-200 text-sm font-medium truncate">{member.name}</p>
          <p className="text-gray-500 text-xs truncate">{member.committeeRole || member.title}</p>
        </div>
        {isActive && (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
            <span className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse delay-75" />
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse delay-150" />
          </span>
        )}
      </div>
      {latestTake && (
        <p className="text-gray-400 text-xs leading-relaxed line-clamp-3">
          {latestTake.content.slice(0, 150)}...
        </p>
      )}
      {!latestTake && phase !== 'complete' && (
        <p className="text-gray-600 text-xs italic">Preparing...</p>
      )}
    </div>
  );
}
