import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Compass, ArrowLeft, UserRound, Sparkles, GitFork, Info } from 'lucide-react';
import { Task, Level, PublicJourneyCard } from '../types/index';
import {
  getPublicTasks,
  getPublicLevelCounts,
  getPublicLevelsForTask,
  forkPublicJourney,
  previewDecomposeFurther,
} from '../lib/supabase/queries';
import Trail from './Trail';
import NodeDetail from './NodeDetail';

interface PublicJourneysProps {
  isGuestMode?: boolean;
  onBack?: () => void;
  onRequestSignup?: () => void;
  onForked?: () => void;
}

const BRANCH_EMOJI: Record<string, string> = { academic: '📚', light: '✨', custom: '🧭', activity: '🏕️' };

export default function PublicJourneys({ isGuestMode = false, onBack, onRequestSignup, onForked }: PublicJourneysProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<PublicJourneyCard[]>([]);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<Level[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [previewLevel, setPreviewLevel] = useState<Level | null>(null);

  const [isForking, setIsForking] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  // Guest sandbox — a purely local, in-memory copy of the fetched levels.
  // Every "action" below mutates this array with setSandboxLevels and
  // NEVER calls Supabase for a write. Nothing here survives a refresh.
  const [sandboxLevels, setSandboxLevels] = useState<Level[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerInterval, setTimerInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const tasks = await getPublicTasks();
        const counts = await getPublicLevelCounts(tasks.map((t) => t.id));
        if (!cancelled) {
          setCards(tasks.map((task) => ({ task, levelCount: counts[task.id] || 0 })));
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load public journeys.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openJourney = async (task: Task) => {
    setSelectedTask(task);
    setIsLoadingDetail(true);
    setError(null);
    setForkError(null);
    try {
      const levels = await getPublicLevelsForTask(task.id);
      setSelectedLevels(levels);
      if (isGuestMode) {
        // Seed the sandbox from real content, but from this point on it's
        // an independent copy — completing/breaking-down nodes here never
        // touches the original owner's actual trail.
        setSandboxLevels(levels.map((l) => ({ ...l })));
      }
    } catch (err: any) {
      setError(err.message || 'Could not load this journey.');
      setSelectedTask(null);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const stopAndClearTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
    setTimerInterval(null);
    setTimeLeft(null);
  };

  const closeJourney = () => {
    stopAndClearTimer();
    setSelectedTask(null);
    setSelectedLevels([]);
    setSandboxLevels([]);
    setPreviewLevel(null);
  };

  const formatTimer = (totSeconds: number) => {
    const mins = Math.floor(totSeconds / 60);
    const secs = totSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const startTimer = (secs: number) => {
    if (timerInterval) clearInterval(timerInterval);
    setTimeLeft(secs);
    const intVal = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(intVal);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setTimerInterval(intVal);
  };

  const handleSandboxSelect = (lvl: Level) => {
    if (previewLevel?.id === lvl.id) {
      stopAndClearTimer();
      setPreviewLevel(null);
      return;
    }
    setPreviewLevel(lvl);
    if (lvl.status === 'active') startTimer(lvl.estimated_minutes * 60);
    else stopAndClearTimer();
  };

  const handleSandboxComplete = async (levelId: string, skipped: boolean) => {
    const target = sandboxLevels.find((l) => l.id === levelId);
    if (!target) return;
    setSandboxLevels(
      sandboxLevels.map((l) => {
        if (l.id === levelId) return { ...l, status: 'complete', skipped };
        if (l.branch_order === target.branch_order + 1 && l.status === 'locked') return { ...l, status: 'active' };
        return l;
      })
    );
    stopAndClearTimer();
    setPreviewLevel(null);
  };

  const handleSandboxRevert = async (level: Level) => {
    const next = sandboxLevels.find((l) => l.branch_order === level.branch_order + 1);
    if (next && next.status !== 'active') {
      throw new Error('Can only undo the most recently completed step on this trail.');
    }
    setSandboxLevels(
      sandboxLevels.map((l) => {
        if (l.id === level.id) return { ...l, status: 'active', skipped: false, completed_at: null };
        if (next && l.id === next.id) return { ...l, status: 'locked' };
        return l;
      })
    );
    stopAndClearTimer();
    setPreviewLevel(null);
  };

  const handleSandboxBreakDown = async (level: Level) => {
    const alreadyHasChildren = sandboxLevels.some((l) => l.parent_level_id === level.id);
    if (alreadyHasChildren) return { stopped: false, message: null };

    const result = await previewDecomposeFurther(level.title, level.description, level.branch, level.depth);
    if (result.stopped || result.levels.length === 0) {
      return { stopped: true, message: result.message };
    }

    const newCount = result.levels.length;
    const shifted = sandboxLevels.map((l) =>
      l.branch_order > level.branch_order ? { ...l, branch_order: l.branch_order + newCount } : l
    );
    const newNodes: Level[] = result.levels.map((lvl, idx) => ({
      id: `sandbox-${level.id}-${Date.now()}-${idx}`,
      task_id: level.task_id,
      user_id: level.user_id,
      title: lvl.title,
      description: lvl.description,
      estimated_minutes: lvl.estimated_minutes,
      branch: level.branch,
      branch_order: level.branch_order + idx + 1,
      status: 'locked',
      skipped: false,
      completed_at: null,
      depth: level.depth + 1,
      parent_level_id: level.id,
    }));
    setSandboxLevels([...shifted, ...newNodes]);
    return { stopped: false, message: null };
  };

  const handleFork = async () => {
    if (!selectedTask) return;
    setIsForking(true);
    setForkError(null);
    try {
      await forkPublicJourney(selectedTask, selectedLevels);
      onForked?.();
    } catch (err: any) {
      setForkError(err.message || 'Could not fork this journey.');
    } finally {
      setIsForking(false);
    }
  };

  if (selectedTask) {
    const sandboxSelected = sandboxLevels.find((l) => l.id === previewLevel?.id) || null;
    const sandboxChildCount = sandboxSelected
      ? sandboxLevels.filter((l) => l.parent_level_id === sandboxSelected.id).length
      : 0;

    return (
      <div className="max-w-3xl mx-auto py-6 px-4">
        <button
          type="button"
          onClick={closeJourney}
          className="flex items-center gap-1.5 text-xs font-sans font-bold text-quest-muted hover:text-ink mb-4 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to gallery
        </button>

        <div className="mb-4 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <span className="text-xs font-mono uppercase tracking-widest text-quest-accent-soft">
              {BRANCH_EMOJI[selectedTask.branch] || '🧭'} Public Journey
            </span>
            <h1 className="font-serif font-black text-2xl text-ink mt-1">{selectedTask.title}</h1>
            <p className="text-xs text-quest-muted mt-1 flex items-center gap-1.5">
              <UserRound className="w-3.5 h-3.5" /> Shared by {selectedTask.author_name || 'a Knavi student'}
            </p>
          </div>

          {!isGuestMode && (
            <button
              type="button"
              onClick={handleFork}
              disabled={isForking}
              className="shrink-0 w-full sm:w-auto flex items-center justify-center gap-1.5 py-2.5 px-5 bg-quest-accent text-white font-sans font-bold rounded-xl shadow-active hover:opacity-90 transition-opacity cursor-pointer text-sm disabled:opacity-60"
            >
              <GitFork className="w-4 h-4" /> {isForking ? 'Forking...' : 'Fork this Journey'}
            </button>
          )}
        </div>

        {forkError && <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-700 p-3 rounded-lg text-xs">{forkError}</div>}

        {isGuestMode && (
          <div className="mb-4 flex items-start gap-2 bg-quest-accent/10 border border-quest-accent/25 rounded-xl p-3 text-xs text-quest-accent-soft">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              You can complete steps and try "Break Down Further" here to see how it feels — it's a local sandbox,
              nothing saves. Create a free account to keep progress for real.
            </span>
          </div>
        )}

        {isLoadingDetail ? (
          <div className="py-20 text-center text-quest-muted text-sm">Loading trail...</div>
        ) : isGuestMode ? (
          <Trail levels={sandboxLevels} selectedLevelId={previewLevel?.id || null} onSelect={handleSandboxSelect} />
        ) : (
          <Trail levels={selectedLevels} selectedLevelId={previewLevel?.id || null} onSelect={(lvl) => setPreviewLevel(lvl)} />
        )}

        {isGuestMode ? (
          <NodeDetail
            level={sandboxSelected}
            childCount={sandboxChildCount}
            timeLeft={timeLeft}
            formatTimer={formatTimer}
            onClose={() => {
              stopAndClearTimer();
              setPreviewLevel(null);
            }}
            onComplete={handleSandboxComplete}
            onBreakDownFurther={handleSandboxBreakDown}
            onRevertCompletion={handleSandboxRevert}
          />
        ) : (
          previewLevel && (
            <motion.div
              className="fixed inset-0 bg-[#2d3748]/70 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => setPreviewLevel(null)}
            >
              <motion.div
                className="fixed bottom-0 left-0 right-0 bg-[#ffffff] border-t border-quest-border rounded-t-3xl shadow-cozy px-6 pt-5 pb-8 max-w-xl mx-auto"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 bg-black/15 rounded-full mx-auto mb-4" />
                <h4 className="font-serif font-black text-xl text-ink leading-tight">{previewLevel.title}</h4>
                <p className="text-sm text-quest-muted leading-relaxed mt-3">{previewLevel.description}</p>
                <p className="text-xs text-quest-muted mt-4">~{previewLevel.estimated_minutes} min</p>
              </motion.div>
            </motion.div>
          )
        )}
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 sm:py-10 px-4">
      <div className="text-center mb-8">
        <div className="inline-flex w-14 h-14 bg-quest-accent/10 items-center justify-center rounded-full text-quest-accent mb-3">
          <Compass className="w-7 h-7" />
        </div>
        <h1 className="font-serif font-black text-2xl sm:text-3xl text-ink">Public Journeys</h1>
        <p className="text-sm text-quest-muted mt-2 max-w-md mx-auto">
          Trails other students have already climbed — real breakdowns for real goals, shared by the people who built them.
        </p>
      </div>

      {isGuestMode && (
        <div className="mb-6 p-4 bg-quest-accent/10 border border-quest-accent/25 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <span className="text-sm text-quest-accent-soft">
            You're browsing as a guest — sign up to build your own trail and publish it here.
          </span>
          <button
            onClick={onRequestSignup}
            className="shrink-0 py-2 px-4 bg-quest-accent text-white font-sans font-bold rounded-lg text-xs cursor-pointer hover:opacity-90 flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" /> Create free account
          </button>
        </div>
      )}

      {error && <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-700 p-3 rounded-lg text-xs">{error}</div>}

      {isLoading ? (
        <div className="py-16 text-center text-quest-muted text-sm">Loading public journeys...</div>
      ) : cards.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-3xl mb-2">🌄</p>
          <p className="text-sm font-bold text-ink">No public journeys yet</p>
          <p className="text-xs text-quest-muted mt-1 max-w-xs mx-auto">
            Be the first — open one of your custom trails and flip it public.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {cards.map(({ task, levelCount }) => (
            <button
              key={task.id}
              onClick={() => openJourney(task)}
              className="text-left bg-paper border border-quest-border rounded-2xl p-5 shadow-cozy hover:border-quest-accent/40 transition-colors cursor-pointer"
            >
              <span className="text-2xl">{BRANCH_EMOJI[task.branch] || '🧭'}</span>
              <h3 className="font-serif font-black text-lg text-ink mt-2 leading-snug">{task.title}</h3>
              <p className="text-xs text-quest-muted mt-1">{levelCount} step{levelCount === 1 ? '' : 's'} · {task.subject}</p>
              <p className="text-[11px] text-quest-muted/80 mt-2 flex items-center gap-1.5">
                <UserRound className="w-3 h-3" /> {task.author_name || 'A Knavi student'}
              </p>
            </button>
          ))}
        </div>
      )}

      {!isGuestMode && onBack && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={onBack}
            className="py-3 px-6 bg-quest-accent text-white font-sans font-bold rounded-xl shadow-active hover:opacity-90 transition-opacity cursor-pointer text-sm"
          >
            Back to your trail
          </button>
        </div>
      )}
    </div>
  );
}
