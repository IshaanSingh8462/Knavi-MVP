import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Clock, FastForward, X, Sparkles, Layers, ExternalLink, Youtube, Search, RotateCcw } from 'lucide-react';
import { Level } from '../types/index';
import { MAX_NODE_DEPTH } from '../lib/constants';

interface NodeDetailProps {
  level: Level | null;
  childCount: number;
  timeLeft: number | null;
  formatTimer: (secs: number) => string;
  onClose: () => void;
  onComplete: (levelId: string, skipped: boolean) => void;
  onBreakDownFurther: (level: Level) => Promise<{ stopped: boolean; message: string | null }>;
  onRevertCompletion: (level: Level) => Promise<void>;
}

function buildResourceLinks(level: Level) {
  const query = encodeURIComponent(level.title);
  return [
    {
      label: 'Search YouTube',
      icon: Youtube,
      url: `https://www.youtube.com/results?search_query=${query}`,
    },
    {
      label: 'Search Khan Academy',
      icon: Search,
      url: `https://www.google.com/search?q=${encodeURIComponent(`site:khanacademy.org ${level.title}`)}`,
    },
    {
      label: 'General web search',
      icon: ExternalLink,
      url: `https://www.google.com/search?q=${query}`,
    },
  ];
}

export default function NodeDetail({
  level,
  childCount,
  timeLeft,
  formatTimer,
  onClose,
  onComplete,
  onBreakDownFurther,
  onRevertCompletion,
}: NodeDetailProps) {
  const [isBreakingDown, setIsBreakingDown] = useState(false);
  const [stopMessage, setStopMessage] = useState<string | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [revertError, setRevertError] = useState<string | null>(null);

  if (!level) return null;

  const isActive = level.status === 'active';
  const isLocked = level.status === 'locked';
  const isCompleted = level.status === 'complete';
  const atDepthCap = level.depth >= MAX_NODE_DEPTH;
  const alreadyHasChildren = childCount > 0;

  const handleBreakDown = async () => {
    setIsBreakingDown(true);
    setStopMessage(null);
    try {
      const result = await onBreakDownFurther(level);
      if (result.stopped && result.message) {
        setStopMessage(result.message);
      }
    } catch (err: any) {
      setStopMessage(err.message || 'Could not break this step down right now.');
    } finally {
      setIsBreakingDown(false);
    }
  };

  const handleRevert = async () => {
    setIsReverting(true);
    setRevertError(null);
    try {
      await onRevertCompletion(level);
    } catch (err: any) {
      setRevertError(err.message || 'Could not undo this — it may not be the most recently completed step.');
    } finally {
      setIsReverting(false);
    }
  };

  return (
    <AnimatePresence>
      {level && (
        <>
          <motion.div
            className="fixed inset-0 bg-[#2d3748]/50 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-quest-border rounded-t-[24px] shadow-cozy px-6 pt-5 pb-8 max-w-xl mx-auto max-h-[85vh] overflow-y-auto"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          >
            <div className="w-10 h-1 bg-black/15 rounded-full mx-auto mb-4" />

            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-quest-accent-soft">
                  {isLocked ? 'Locked — preview' : isCompleted ? 'Completed' : 'Active step'}
                </span>
                <h4 className="font-serif font-black text-xl text-ink leading-tight mt-0.5">{level.title}</h4>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-quest-muted hover:text-ink transition-colors cursor-pointer p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-quest-muted leading-relaxed mt-3">{level.description}</p>

            <div className="mt-4 p-3 bg-black/5 border border-quest-border rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-quest-accent" />
                <span className="font-mono font-bold text-lg text-ink">
                  {isActive && timeLeft !== null ? formatTimer(timeLeft) : formatTimer(level.estimated_minutes * 60)}
                </span>
              </div>
              <span className="text-[10px] text-quest-muted italic">Time is a guide, not a gate</span>
            </div>

            {/* Resource links */}
            <div className="mt-5">
              <span className="text-[10px] font-mono uppercase tracking-widest text-quest-muted">Sources</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {buildResourceLinks(level).map((r) => (
                  <a
                    key={r.label}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-sans font-bold text-ink border border-quest-border bg-black/5 hover:bg-black/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <r.icon className="w-3.5 h-3.5 text-quest-accent-soft" /> {r.label}
                  </a>
                ))}
              </div>
            </div>

            {/* AI explanation — stubbed for MVP */}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                disabled
                title="Coming soon"
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg text-xs font-sans font-bold border border-dashed border-quest-border text-quest-muted cursor-not-allowed opacity-60"
              >
                <Sparkles className="w-3.5 h-3.5" /> AI Explanation (coming soon)
              </button>

              {isCompleted ? (
                <button
                  type="button"
                  disabled
                  title="A completed step can't be broken down further"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg text-xs font-sans font-bold border border-dashed border-quest-border text-quest-muted cursor-not-allowed opacity-60"
                >
                  <Layers className="w-3.5 h-3.5" /> Already completed
                </button>
              ) : atDepthCap ? (
                <button
                  type="button"
                  disabled
                  title="This step has reached the breakdown limit"
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg text-xs font-sans font-bold border border-dashed border-quest-border text-quest-muted cursor-not-allowed opacity-60"
                >
                  <Layers className="w-3.5 h-3.5" /> Break Down Further
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleBreakDown}
                  disabled={isBreakingDown || alreadyHasChildren}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg text-xs font-sans font-bold transition-colors ${
                    alreadyHasChildren
                      ? 'border border-quest-border text-quest-muted cursor-default'
                      : 'bg-quest-accent/15 border border-quest-accent/30 text-quest-accent-soft hover:bg-quest-accent/25 cursor-pointer'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  {isBreakingDown
                    ? 'Breaking it down...'
                    : alreadyHasChildren
                    ? 'Already broken down — see it further down the trail'
                    : 'Break Down Further'}
                </button>
              )}
            </div>

            {stopMessage && (
              <div className="mt-3 p-3 bg-quest-accent/10 border border-quest-accent/25 rounded-lg text-quest-accent-soft text-xs leading-relaxed">
                {stopMessage}
              </div>
            )}

            {isLocked && (
              <div className="mt-5 p-3 bg-black/5 border border-quest-border rounded-lg text-quest-muted text-xs">
                Complete the steps before this one to unlock it. You can still read ahead here.
              </div>
            )}

            {isCompleted && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={handleRevert}
                  disabled={isReverting}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-lg text-xs font-sans font-bold border border-quest-border text-quest-muted hover:text-ink hover:bg-black/5 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {isReverting ? 'Undoing...' : 'Undo Completion'}
                </button>
                {revertError && (
                  <p className="text-[11px] text-rose-700 mt-2 leading-relaxed">{revertError}</p>
                )}
              </div>
            )}

            {isActive && (
              <div className="flex items-center gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => onComplete(level.id, false)}
                  className="flex-1 py-3 font-sans font-bold text-sm bg-quest-accent text-white rounded-xl shadow-active hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Mark Complete
                </button>
                <button
                  type="button"
                  onClick={() => onComplete(level.id, true)}
                  title="Mark as already known"
                  className="px-4 py-3 font-sans font-bold text-sm border border-quest-border bg-black/5 hover:bg-black/10 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-ink"
                >
                  <FastForward className="w-4 h-4 text-quest-accent-soft" /> Skip
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
