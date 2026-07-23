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

interface VoteCard {
  memberId: string;
  memberName: string;
  vote: 'YES' | 'YES_WITH_CONDITIONS' | 'NO';
  rationale: string;
  revealed: boolean;
}

type MeetingPhase = 'setup' | 'interrogating' | 'cross_examining' | 'advising' | 'voting' | 'synthesizing' | 'complete';

interface Props {
  companyId: string;
  companyName: string;
  boardMembers: BoardMember[];
  onClose: () => void;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MeetingRoom({ companyId, companyName, boardMembers, onClose }: Props) {
  const [phase, setPhase] = useState<MeetingPhase>('setup');
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [focusPrompt, setFocusPrompt] = useState('');
  const [founderStatement, setFounderStatement] = useState('');
  const [mode, setMode] = useState('full_review');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [punchList, setPunchList] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeSpeaker, setActiveSpeaker] = useState<string | null>(null);
  const [speakerLabel, setSpeakerLabel] = useState<string | null>(null);
  const [voteCards, setVoteCards] = useState<VoteCard[]>([]);
  const [votesRevealed, setVotesRevealed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [playingTakeId, setPlayingTakeId] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);

  useEffect(() => { mutedRef.current = muted; }, [muted]);

  const speakTake = useCallback(async (text: string, voiceId: string, takeId?: string) => {
    if (mutedRef.current || abortRef.current) return;
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (takeId) setPlayingTakeId(takeId);
      const trimmed = text.slice(0, 3000);
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, voiceId }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        setPlayingTakeId(null);
      };
      if (!mutedRef.current && !abortRef.current) {
        await audio.play();
      }
    } catch {
      setPlayingTakeId(null);
    }
  }, []);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingTakeId(null);
    }
  }, []);

  const toggleSeat = (id: string) => {
    setSelectedSeats((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : prev.length < 6 ? [...prev, id] : prev
    );
  };

  const startSession = async () => {
    if (selectedSeats.length === 0) return;
    setError(null);
    setPhase('interrogating');
    abortRef.current = false;

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          seatIds: selectedSeats,
          mode,
          focusPrompt: focusPrompt || undefined,
          founderStatement: founderStatement || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start session');
      }

      const { session } = await res.json();
      setSessionId(session.id);
      await driveSequential(session.id);
    } catch (err: any) {
      if (!abortRef.current) {
        setError(err.message);
        setPhase('setup');
      }
    }
  };

  const driveSequential = async (sid: string) => {
    const runOneSeat = async (phase: string): Promise<{ done: boolean; data: any }> => {
      const res = await fetch(`/api/sessions/${sid}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `Phase ${phase} failed`);
      }
      const data = await res.json();
      if (data.session?.status === 'complete') return { done: true, data };
      const phaseResult = data.phase || '';
      const isDone = phaseResult.endsWith('_done') || phaseResult === 'complete';
      return { done: isDone, data };
    };

    const fetchTakes = async () => {
      try {
        const res = await fetch(`/api/sessions/${sid}`);
        if (!res.ok) return;
        const data = await res.json();
        setTakes(data.takes || []);
        if (data.session?.synthesis) setSynthesis(data.session.synthesis);
        if (data.session?.punchList?.length) setPunchList(data.session.punchList);
      } catch {}
    };

    const revealSeat = (seatId: string, label: string) => {
      setActiveSpeaker(seatId);
      setSpeakerLabel(label);
    };

    const clearSpeaker = () => {
      setActiveSpeaker(null);
      setSpeakerLabel(null);
    };

    const drivePhase = async (
      phaseName: MeetingPhase,
      apiPhase: string,
      labelFn: (name: string) => string,
    ) => {
      setPhase(phaseName);
      for (let i = 0; i < selectedSeats.length; i++) {
        if (abortRef.current) return true;
        const seatId = selectedSeats[i];
        const member = boardMembers.find((m) => m.id === seatId);
        revealSeat(seatId, labelFn(member?.name || 'Advisor'));

        const { done, data } = await runOneSeat(apiPhase);
        await fetchTakes();

        if (data.content && member?.voiceId) {
          await speakTake(data.content, member.voiceId, data.takeId);
        }

        clearSpeaker();

        if (phaseName === 'voting' && data.vote) {
          setVoteCards((prev) => [
            ...prev,
            {
              memberId: seatId,
              memberName: member?.name || 'Advisor',
              vote: data.vote,
              rationale: data.rationale || data.content || '',
              revealed: false,
            },
          ]);
        }

        if (done || data.phase?.endsWith('_done')) break;
        if (data.session?.status === 'complete') { setPhase('complete'); return true; }
        if (i < selectedSeats.length - 1) await delay(2000);
      }
      return false;
    };

    if (await drivePhase('interrogating', 'interrogate', (n) => `${n} is speaking...`)) return;
    if (abortRef.current) return;
    await delay(1500);

    if (await drivePhase('cross_examining', 'cross_examine', (n) => `${n} is cross-examining...`)) return;
    if (abortRef.current) return;
    await delay(1500);

    if (await drivePhase('advising', 'advise', (n) => `${n} is advising...`)) return;
    if (abortRef.current) return;
    await delay(1500);

    if (await drivePhase('voting', 'vote', (n) => `${n} is voting...`)) return;
    if (abortRef.current) return;

    await revealVotesTheatrically();
    await delay(1500);

    setPhase('synthesizing');
    revealSeat('chair', 'Chair is synthesizing...');

    const { data: synthData } = await runOneSeat('synthesize');
    await fetchTakes();
    clearSpeaker();

    if (synthData.session?.synthesis) setSynthesis(synthData.session.synthesis);
    if (synthData.session?.punchList?.length) setPunchList(synthData.session.punchList);
    setPhase('complete');
  };

  const revealVotesTheatrically = async () => {
    setVoteCards((prev) => {
      const updated = [...prev];
      const revealSequence = async () => {
        for (let i = 0; i < updated.length; i++) {
          await delay(800);
          setVoteCards((cards) =>
            cards.map((c, idx) => (idx === i ? { ...c, revealed: true } : c))
          );
        }
        await delay(600);
        setVotesRevealed(true);
      };
      revealSequence();
      return updated;
    });
    await delay(800 * (selectedSeats.length) + 600);
  };

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [takes]);

  const phaseLabel = (p: MeetingPhase) => {
    switch (p) {
      case 'setup': return 'Session Setup';
      case 'interrogating': return 'Interrogation Phase';
      case 'cross_examining': return 'Cross-Examination';
      case 'advising': return 'Advisory Phase';
      case 'voting': return 'The Vote';
      case 'synthesizing': return 'Chair Synthesis';
      case 'complete': return 'Session Complete';
    }
  };

  const voteTally = voteCards.reduce(
    (acc, c) => {
      if (c.vote === 'YES') acc.yes++;
      else if (c.vote === 'YES_WITH_CONDITIONS') acc.conditional++;
      else acc.no++;
      return acc;
    },
    { yes: 0, conditional: 0, no: 0 }
  );

  return (
    <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
      <header className="flex items-center justify-between px-6 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-white font-display font-semibold text-lg">{companyName}</h2>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {phaseLabel(phase)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setMuted((m) => !m); if (!muted) stopAudio(); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              muted ? 'bg-red-500/20 text-red-300 border border-red-500/30' : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              {muted ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
              )}
            </svg>
            {muted ? 'Muted' : 'Audio On'}
          </button>
          <button
            onClick={() => { abortRef.current = true; stopAudio(); onClose(); }}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            Leave Meeting
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          {phase === 'setup' && (
            <SetupPanel
              boardMembers={boardMembers}
              selectedSeats={selectedSeats}
              toggleSeat={toggleSeat}
              focusPrompt={focusPrompt}
              setFocusPrompt={setFocusPrompt}
              founderStatement={founderStatement}
              setFounderStatement={setFounderStatement}
              mode={mode}
              setMode={setMode}
              onStart={startSession}
              error={error}
            />
          )}

          {phase !== 'setup' && (
            <>
              <div className={`p-4 grid grid-cols-2 md:grid-cols-3 gap-3 transition-opacity duration-500 ${
                phase === 'voting' ? 'opacity-40' : 'opacity-100'
              }`}>
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
                      isPlaying={playingTakeId === latestTake?.id}
                      onReplay={latestTake && member.voiceId && !muted ? () => speakTake(latestTake.content, member.voiceId!, latestTake.id) : undefined}
                    />
                  );
                })}
              </div>

              {phase === 'voting' && voteCards.length > 0 && (
                <div className="px-4 pb-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {voteCards.map((card, idx) => (
                      <div
                        key={card.memberId}
                        className={`rounded-lg border p-4 transition-all duration-300 ${
                          card.revealed
                            ? card.vote === 'YES'
                              ? 'bg-emerald-900/30 border-emerald-500/50'
                              : card.vote === 'YES_WITH_CONDITIONS'
                              ? 'bg-amber-900/30 border-amber-500/50'
                              : 'bg-red-900/30 border-red-500/50'
                            : 'bg-gray-800/60 border-gray-700'
                        }`}
                        style={{
                          perspective: '600px',
                        }}
                      >
                        <div
                          className={card.revealed ? 'animate-flipIn' : 'opacity-0'}
                          style={{ transformStyle: 'preserve-3d' }}
                        >
                          <p className="text-gray-300 text-xs font-medium mb-1">{card.memberName}</p>
                          <p className={`text-sm font-semibold mb-1 ${
                            card.vote === 'YES'
                              ? 'text-emerald-400'
                              : card.vote === 'YES_WITH_CONDITIONS'
                              ? 'text-amber-400'
                              : 'text-red-400'
                          }`}>
                            {card.vote === 'YES_WITH_CONDITIONS' ? 'YES (w/ conditions)' : card.vote}
                          </p>
                          <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">
                            {card.rationale.slice(0, 120)}{card.rationale.length > 120 ? '...' : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {votesRevealed && (
                    <div className="mt-3 flex items-center gap-4 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700">
                      <span className="text-gray-400 text-xs font-medium">Tally:</span>
                      <span className="text-emerald-400 text-xs font-semibold">YES {voteTally.yes}</span>
                      <span className="text-amber-400 text-xs font-semibold">CONDITIONAL {voteTally.conditional}</span>
                      <span className="text-red-400 text-xs font-semibold">NO {voteTally.no}</span>
                    </div>
                  )}
                </div>
              )}

              {speakerLabel && phase !== 'complete' && (
                <div className="px-6 pb-2">
                  <p className="text-emerald-400 text-sm font-medium animate-pulse">
                    {speakerLabel}
                  </p>
                </div>
              )}

              {phase !== 'complete' && !activeSpeaker && phase !== 'voting' && (
                <div className="px-6 pb-2">
                  <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent animate-shimmer" />
                  </div>
                </div>
              )}

              {phase === 'complete' && synthesis && (
                <div className="px-4 pb-4 flex-1 overflow-y-auto space-y-4">
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
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

                  {votesRevealed && voteCards.length > 0 && (
                    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                      <h3 className="text-emerald-400 font-medium text-sm mb-2">Final Vote</h3>
                      <div className="flex items-center gap-4">
                        <span className="text-emerald-400 text-sm font-semibold">YES {voteTally.yes}</span>
                        <span className="text-amber-400 text-sm font-semibold">CONDITIONAL {voteTally.conditional}</span>
                        <span className="text-red-400 text-sm font-semibold">NO {voteTally.no}</span>
                      </div>
                    </div>
                  )}

                  {sessionId && <DeliverablesPanel sessionId={sessionId} />}
                </div>
              )}

              {phase === 'complete' && !synthesis && sessionId && (
                <div className="px-4 pb-4 flex-1 overflow-y-auto">
                  {sessionId && <DeliverablesPanel sessionId={sessionId} />}
                </div>
              )}
            </>
          )}
        </div>

        {phase !== 'setup' && (
          <aside className="w-80 border-l border-gray-700 bg-gray-850 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-700">
              <h3 className="text-gray-300 text-sm font-medium">Transcript</h3>
            </div>
            <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
              {takes.map((take, idx) => {
                const member = boardMembers.find((m) => m.id === take.boardMemberId);
                return (
                  <div
                    key={take.id || idx}
                    className="text-sm animate-fadeIn"
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-900 flex items-center justify-center text-xs text-white font-medium">
                        {member?.name?.charAt(0) || '?'}
                      </span>
                      <span className="text-gray-400 font-medium text-xs">{member?.name}</span>
                      <span className="text-gray-600 text-xs ml-auto">
                        {take.phase === 'interrogate' ? 'interrogation' : take.phase === 'vote' ? 'vote' : 'advisory'}
                      </span>
                    </div>
                    <p className="text-gray-300 text-xs leading-relaxed pl-8">
                      {take.content.slice(0, 500)}
                      {take.content.length > 500 && '...'}
                    </p>
                  </div>
                );
              })}
              {takes.length === 0 && phase !== 'complete' && (
                <div className="flex items-center gap-2 text-gray-500 text-xs py-4">
                  <div className="h-1 w-12 rounded-full bg-gray-800 overflow-hidden">
                    <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-gray-600 to-transparent animate-shimmer" />
                  </div>
                  <span>Waiting for board members...</span>
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
  founderStatement,
  setFounderStatement,
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
  founderStatement: string;
  setFounderStatement: (v: string) => void;
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
    <div className="flex-1 overflow-y-auto p-8">
      <div className="w-full max-w-3xl mx-auto space-y-6">
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
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-900 flex items-center justify-center text-sm font-medium text-white">
                    {member.name.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${selected ? 'text-emerald-300' : 'text-gray-200'}`}>
                      {member.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{member.committeeRole || member.title}</p>
                  </div>
                  {selected && (
                    <span className="ml-auto text-emerald-400 text-xs">&#10003;</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {selectedSeats.length === 0 && (
          <p className="text-amber-400/80 text-sm">Select at least one advisor to begin</p>
        )}

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

        <div>
          <label className="text-white text-sm font-medium block mb-1">{"Founder's Pitch Statement (optional)"}</label>
          <textarea
            value={founderStatement}
            onChange={(e) => setFounderStatement(e.target.value)}
            placeholder="Summarize your pitch in your own words - the board will use this as context."
            rows={3}
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
          {selectedSeats.length === 0
            ? 'Select advisors to begin'
            : `Start Board Meeting (${selectedSeats.length} seat${selectedSeats.length !== 1 ? 's' : ''})`}
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
  isPlaying,
  onReplay,
}: {
  member: BoardMember;
  latestTake?: Take;
  isActive: boolean;
  phase: MeetingPhase;
  isPlaying?: boolean;
  onReplay?: () => void;
}) {
  return (
    <div
      className={`relative bg-gray-800 rounded-lg p-4 border-2 transition-all duration-300 ${
        isActive
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 scale-[1.02]'
          : latestTake
          ? 'border-gray-600'
          : 'border-gray-700'
      }`}
    >
      {isActive && (
        <div className="absolute inset-0 rounded-lg border-2 border-emerald-400 animate-ping opacity-30 pointer-events-none" />
      )}

      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
          isActive ? 'bg-emerald-600 text-white' : 'bg-gradient-to-br from-emerald-600 to-emerald-900 text-white'
        }`}>
          {member.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-gray-200 text-sm font-medium truncate">{member.name}</p>
          <p className="text-gray-500 text-xs truncate">{member.committeeRole || member.title}</p>
        </div>
        {isActive && (
          <span className="text-emerald-400 text-xs font-medium">Speaking</span>
        )}
        {!isActive && latestTake && (
          <span className="text-gray-500 text-xs">Done</span>
        )}
      </div>

      {latestTake && !isActive && (
        <div className="flex items-start gap-2">
          <p className="text-gray-400 text-xs leading-relaxed line-clamp-2 flex-1">
            {latestTake.content.slice(0, 120)}...
          </p>
          {onReplay && (
            <button
              onClick={(e) => { e.stopPropagation(); onReplay(); }}
              className={`shrink-0 p-1 rounded transition-colors ${isPlaying ? 'text-emerald-400 animate-pulse' : 'text-gray-500 hover:text-gray-300'}`}
              title="Replay audio"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
              </svg>
            </button>
          )}
        </div>
      )}

      {isActive && (
        <div className="flex gap-1 mt-1">
          <div className="h-1 flex-1 rounded-full bg-gray-700 overflow-hidden">
            <div className="h-full w-full bg-gradient-to-r from-emerald-600/0 via-emerald-500 to-emerald-600/0 animate-shimmer" />
          </div>
        </div>
      )}

      {!latestTake && !isActive && phase !== 'complete' && (
        <p className="text-gray-600 text-xs mt-1">Waiting...</p>
      )}
    </div>
  );
}

function DeliverablesPanel({ sessionId }: { sessionId: string }) {
  const [generating, setGenerating] = useState<string | null>(null);

  const deliverables = [
    { type: 'governance_simulation', label: 'Governance Simulation', icon: '\u{1F4CB}' },
    { type: 'business_case', label: 'Business Case', icon: '\u{1F4C8}' },
    { type: 'founder_deck', label: 'Founder Deck', icon: '\u{1F3AF}' },
  ];

  const handleDownload = async (type: string) => {
    setGenerating(type);
    try {
      const postRes = await fetch(`/api/sessions/${sessionId}/deliverables`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      if (!postRes.ok) throw new Error('Generation failed');

      const getRes = await fetch(`/api/sessions/${sessionId}/deliverables?type=${type}`);
      if (!getRes.ok) throw new Error('Download failed');
      const { url } = await getRes.json();
      window.open(url, '_blank');
    } catch {
    } finally {
      setGenerating(null);
    }
  };

  const handleUpload = async (type: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.pptx';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      await fetch(`/api/sessions/${sessionId}/deliverables/upload`, {
        method: 'POST',
        body: formData,
      });
    };
    input.click();
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <h3 className="text-emerald-400 font-medium text-sm mb-3">Deliverables</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {deliverables.map((d) => (
          <div key={d.type} className="bg-gray-900 border border-gray-700 rounded-lg p-3 flex flex-col items-center gap-2">
            <span className="text-2xl">{d.icon}</span>
            <p className="text-gray-200 text-xs font-medium text-center">{d.label}</p>
            <button
              onClick={() => handleDownload(d.type)}
              disabled={generating === d.type}
              className="w-full py-1.5 text-xs font-medium rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-white transition-colors"
            >
              {generating === d.type ? 'Generating...' : 'Download'}
            </button>
            <button
              onClick={() => handleUpload(d.type)}
              className="w-full py-1.5 text-xs font-medium rounded border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white transition-colors"
            >
              Upload Edited Final
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
