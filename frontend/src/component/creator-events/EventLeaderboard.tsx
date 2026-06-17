"use client";

import { Medal, Trophy } from "lucide-react";

export interface LeaderboardEntry {
  rank: number;
  address: string;
  points: number;
  correctResults: number;
  exactScores: number;
  matchesPlayed: number;
  payout?: string | number;
}

interface EventLeaderboardProps {
  entries: LeaderboardEntry[];
  isFinalized: boolean;
}

export default function EventLeaderboard({ entries, isFinalized }: EventLeaderboardProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-white/15 bg-slate-900/70 p-8 text-center text-slate-400">
        <Trophy className="mx-auto mb-3 h-8 w-8 text-slate-500" />
        No predictions have been submitted for this event yet.
      </div>
    );
  }

  const gridClass = isFinalized
    ? "grid grid-cols-[0.6fr_1.8fr_1fr_1fr_1fr_1fr_1.2fr] gap-4"
    : "grid grid-cols-[0.6fr_1.8fr_1fr_1fr_1fr_1fr] gap-4";

  return (
    <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-xl shadow-black/20">
      <div className={`${gridClass} border-b border-white/10 px-5 py-4 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 items-center`}>
        <span>Rank</span>
        <span>User address</span>
        <span className="text-right">Points</span>
        <span className="text-right">Correct</span>
        <span className="text-right">Exact</span>
        <span className="text-right">Played</span>
        {isFinalized && <span className="text-right text-emerald-400">Payout</span>}
      </div>

      <div className="divide-y divide-white/10">
        {entries.map((entry) => (
          <div
            key={`${entry.rank}-${entry.address}`}
            className={`${gridClass} px-5 py-4 text-sm text-slate-300 items-center hover:bg-white/5 transition-colors`}
          >
            <span className="flex items-center gap-2 font-semibold">
              {entry.rank === 1 ? (
                <Trophy className="h-4 w-4 text-amber-400 animate-pulse" />
              ) : entry.rank === 2 ? (
                <Medal className="h-4 w-4 text-slate-300" />
              ) : entry.rank === 3 ? (
                <Medal className="h-4 w-4 text-amber-600" />
              ) : (
                <span className="w-4 text-center text-xs text-slate-500">#{entry.rank}</span>
              )}
              {entry.rank <= 3 ? (
                <span className={
                  entry.rank === 1 ? "text-amber-400 font-bold" :
                  entry.rank === 2 ? "text-slate-300 font-bold" :
                  "text-amber-600 font-bold"
                }>
                  #{entry.rank}
                </span>
              ) : (
                <span className="font-semibold text-slate-400">#{entry.rank}</span>
              )}
            </span>
            <span className="truncate font-mono font-medium text-white">{entry.address}</span>
            <span className="text-right font-semibold text-slate-100">{entry.points}</span>
            <span className="text-right text-slate-300">{entry.correctResults}</span>
            <span className="text-right text-slate-300">{entry.exactScores}</span>
            <span className="text-right text-slate-400">{entry.matchesPlayed}</span>
            {isFinalized && (
              <span className="text-right font-bold text-emerald-300">
                {entry.payout}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
