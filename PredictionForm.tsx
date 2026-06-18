import React, { useState, useMemo } from 'react';
import { 
  Dialog, 
  DialogTitle, 
  Transition, 
  TransitionChild,
  DialogPanel
} from '@headlessui/react';
import { X, Trophy, AlertCircle, Loader2 } from 'lucide-react';

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  pointsMultiplier?: number;
}

interface PredictionFormProps {
  isOpen: boolean;
  onClose: () => void;
  match: Match | null;
  submitPrediction: (matchId: string, homeScore: number, awayScore: number) => Promise<any>;
}

export const PredictionForm: React.FC<PredictionFormProps> = ({
  isOpen,
  onClose,
  match,
  submitPrediction,
}) => {
  const [homeScore, setHomeScore] = useState<string>('');
  const [awayScore, setAwayScore] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Constants for points (as defined in creator-event-manager smart contract)
  const POINTS_RESULT = 1;
  const POINTS_TOTAL_EXACT = 4;

  const multiplier = match?.pointsMultiplier || 1;
  
  // Validation and Parsing
  const isValid = useMemo(() => {
    const hNum = Number(homeScore);
    const aNum = Number(awayScore);
    const isInt = (n: any, s: string) => s !== '' && Number.isInteger(Number(s)) && !isNaN(n);
    
    return isInt(hNum, homeScore) && hNum >= 0 && hNum <= 20 &&
           isInt(aNum, awayScore) && aNum >= 0 && aNum <= 20;
  }, [homeScore, awayScore]);

  // Live Implied Result calculation
  const impliedResult = useMemo(() => {
    if (!isValid || !match) return null;
    const h = parseInt(homeScore);
    const a = parseInt(awayScore);
    if (h > a) return `${match.teamA} Win`;
    if (a > h) return `${match.teamB} Win`;
    return 'Draw';
  }, [isValid, homeScore, awayScore, match]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !match) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await submitPrediction(match.id, parseInt(homeScore), parseInt(awayScore));
      setHomeScore('');
      setAwayScore('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit prediction. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!match) return null;

  return (
    <Transition show={isOpen} as={React.Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <TransitionChild
          as={React.Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <TransitionChild
              as={React.Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <DialogPanel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-2xl transition-all">
                <div className="flex items-center justify-between mb-6">
                  <DialogTitle as="h3" className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
                    <Trophy className="w-6 h-6 text-indigo-600" />
                    Your Prediction
                  </DialogTitle>
                  <button onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {multiplier > 1 && (
                  <div className="mb-6 bg-gradient-to-r from-amber-500 to-orange-600 rounded-xl p-3 text-center shadow-lg shadow-orange-200">
                    <span className="text-white font-black text-sm uppercase tracking-wider italic">
                      🚀 {multiplier}x Points Bonus Match!
                    </span>
                  </div>
                )}

                <form onSubmit={handleFormSubmit} className="space-y-6">
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex-1 space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-tight block text-center truncate">{match.teamA}</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="1"
                        value={homeScore}
                        onChange={(e) => setHomeScore(e.target.value)}
                        className="w-full text-center text-3xl font-black p-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 transition-all outline-none"
                        placeholder="-"
                        required
                      />
                    </div>
                    <div className="text-xl font-bold text-slate-300 pt-6">:</div>
                    <div className="flex-1 space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-tight block text-center truncate">{match.teamB}</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        step="1"
                        value={awayScore}
                        onChange={(e) => setAwayScore(e.target.value)}
                        className="w-full text-center text-3xl font-black p-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50/50 transition-all outline-none"
                        placeholder="-"
                        required
                      />
                    </div>
                  </div>

                  {isValid && (
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-semibold text-slate-500">Predicted Outcome</span>
                        <span className="px-3 py-1 bg-indigo-100 text-indigo-700 text-sm font-bold rounded-full">{impliedResult}</span>
                      </div>
                      <div className="space-y-2 pt-3 border-t border-slate-200/60">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Correct 1X2 Result</span>
                          <span className="font-bold text-slate-900">+{POINTS_RESULT * multiplier} pts</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600">Exact Score Bonus</span>
                          <span className="font-bold text-slate-900">+{POINTS_TOTAL_EXACT * multiplier} pts</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex items-center gap-2 text-sm font-medium text-red-600 bg-red-50 p-4 rounded-xl border border-red-100">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!isValid || isSubmitting}
                    className="w-full bg-slate-900 hover:bg-indigo-600 disabled:bg-slate-200 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 shadow-xl shadow-slate-200 active:scale-[0.98]"
                  >
                    {isSubmitting ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> Submitting...</>
                    ) : (
                      'Confirm Prediction'
                    )}
                  </button>
                </form>
              </DialogPanel>
            </div>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};