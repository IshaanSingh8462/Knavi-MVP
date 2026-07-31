import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Shield, X, ChevronLeft, ChevronRight, Flame, Globe2 } from 'lucide-react';
import { Level, Streak, User } from '../types/index';
import Mascot from './Mascot';
import Trail from './Trail';
import NodeDetail from './NodeDetail';
import { authFetch, breakDownNodeFurther, revertLevelCompletion, setTaskPublic } from '../lib/supabase/queries';

interface JourneyViewProps {
  levels: Level[];
  tasks?: any[];
  streak: Streak;
  activities: any[];
  user?: User;
  onLevelComplete: (levelId: string, options?: { skipped?: boolean }) => Promise<void>;
  onRefresh: () => void;
}

interface TrailGroup {
  key: string;
  label: string;
  emoji: string;
  levels: Level[];
  taskId?: string;
  isPublic?: boolean;
}

function getShortTrackName(title: string): string {
  if (!title) return 'Custom Track';
  let clean = title.trim();
  let prev = '';
  while (clean !== prev) {
    prev = clean;
    clean = clean.replace(/^(learn\s+how\s+to\s+speak|learn\s+how\s+to|learn\s+to|learn|how\s+to|practice\s+playing|practice\s+the|practice|study\s+for\s+the|study\s+for|study|prepare\s+for\s+the|prepare\s+for|prepare|prep\s+for\s+the|prep\s+for|prep|build\s+a\s+new|build\s+a|build\s+an|build|create\s+a\s+new|create\s+a|create\s+an|create|work\s+on\s+my|work\s+on\s+a|work\s+on|work|complete\s+my|complete\s+the|complete|develop\s+a|develop|write\s+an\s+essay\s+on|write\s+an|write\s+a|write|play\s+the|play|read\s+the|read\s+a|read|review\s+my|review|solve\s+the|solve|do\s+my|do|try\s+to|try|win\s+a|win\s+the|win|make\s+a|make|finish\s+the|finish|get\s+ready\s+for|get\s+a|get|improve\s+my|improve|master\s+the|master|run\s+a|run|go\s+to\s+the|go\s+to|go|attend\s+the|attend|watch\s+the|watch)\s+/i, '');
    clean = clean.replace(/^(a|an|the|my|our|your|for|on|to|with\s+the|with|about)\s+/i, '');
  }
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length === 0) return title;
  const formattedWords = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  if (formattedWords.length > 2) return formattedWords.slice(0, 2).join(' ');
  return formattedWords.join(' ');
}

export default function JourneyView({ levels, tasks = [], streak, activities, user, onLevelComplete, onRefresh }: JourneyViewProps) {
  const [expandedLevelId, setExpandedLevelId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerInterval, setTimerInterval] = useState<ReturnType<typeof setInterval> | null>(null);
  const [isCelebrationOpen, setIsCelebrationOpen] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [forgeMode, setForgeMode] = useState<'academic' | 'custom'>('academic');
  const [isTaskConfirmed, setIsTaskConfirmed] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('Math');
  const [newTaskBranch, setNewTaskBranch] = useState<'academic' | 'custom'>('academic');
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [togglingPublicKey, setTogglingPublicKey] = useState<string | null>(null);

  const handleTogglePublic = async (group: TrailGroup) => {
    if (!group.taskId) return;
    setTogglingPublicKey(group.key);
    try {
      const authorName = user?.name?.trim() || (user?.email ? user.email.split('@')[0] : 'A Knavi student');
      await setTaskPublic(group.taskId, !group.isPublic, authorName);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not update this trail\'s public status.');
    } finally {
      setTogglingPublicKey(null);
    }
  };

  const stripRef = useRef<HTMLDivElement>(null);

  // One trail per task — no more aggregated "Academic"/"Light" buckets or
  // a generic unlabeled "Custom" catch-all. Every task (whether it came
  // from Weekly Setup or Forge New Task) is its own named, independently
  // publishable trail, exactly like a custom track always was. This is
  // also what makes Academic tasks forkable/publishable now, not just
  // custom ones — there's a real one-to-one task per trail to attach that to.
  const trailGroups: TrailGroup[] = useMemo(() => {
    return tasks
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((task) => ({
        key: task.id,
        label: getShortTrackName(task.title),
        emoji: task.branch === 'academic' ? '📚' : '🧭',
        levels: levels.filter((l) => l.task_id === task.id).sort((a, b) => a.branch_order - b.branch_order),
        taskId: task.id,
        isPublic: !!task.is_public,
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, tasks]);

  const activeGroup = trailGroups[Math.min(activeIndex, trailGroups.length - 1)] || trailGroups[0];

  const selectedLevel = levels.find((l) => l.id === expandedLevelId) || null;
  const selectedLevelChildCount = selectedLevel ? levels.filter((l) => l.parent_level_id === selectedLevel.id).length : 0;

  const allComplete = levels.length > 0 && levels.every((l) => l.status === 'complete');

  useEffect(() => {
    if (levels.length > 0 && levels.every((l) => l.status === 'complete')) {
      setIsCelebrationOpen(true);
    }
  }, [levels]);

  const scrollToIndex = (index: number) => {
    const clamped = Math.max(0, Math.min(trailGroups.length - 1, index));
    setActiveIndex(clamped);
    const container = stripRef.current;
    if (container) {
      container.scrollTo({ left: clamped * container.clientWidth, behavior: 'smooth' });
    }
  };

  const handleStripScroll = () => {
    const container = stripRef.current;
    if (!container || container.clientWidth === 0) return;
    const idx = Math.round(container.scrollLeft / container.clientWidth);
    if (idx !== activeIndex) setActiveIndex(idx);
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

  const stopAndClearTimer = () => {
    if (timerInterval) clearInterval(timerInterval);
    setTimerInterval(null);
    setTimeLeft(null);
  };

  const formatTimer = (totSeconds: number) => {
    const mins = Math.floor(totSeconds / 60);
    const secs = totSeconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleSelectLevel = (lvl: Level) => {
    if (expandedLevelId === lvl.id) {
      stopAndClearTimer();
      setExpandedLevelId(null);
      return;
    }
    setExpandedLevelId(lvl.id);
    if (lvl.status === 'active') {
      startTimer(lvl.estimated_minutes * 60);
    } else {
      stopAndClearTimer();
    }
  };

  const handleComplete = async (lvlId: string, isSkipped: boolean = false) => {
    stopAndClearTimer();
    setExpandedLevelId(null);
    await onLevelComplete(lvlId, { skipped: isSkipped });
  };

  const handleBreakDownFurther = async (level: Level) => {
    const result = await breakDownNodeFurther(level.id);
    if (!result.stopped) {
      onRefresh();
    }
    return { stopped: result.stopped, message: result.message };
  };

  const handleRevertCompletion = async (level: Level) => {
    await revertLevelCompletion(level.id);
    stopAndClearTimer();
    setExpandedLevelId(null);
    onRefresh();
  };

  const campfireStats = useMemo(() => {
    const total = activeGroup ? activeGroup.levels.length : 0;
    const completed = activeGroup ? activeGroup.levels.filter((l) => l.status === 'complete').length : 0;
    return { total, completed };
  }, [activeGroup]);

  const pm = (() => {
    let total = 0;
    let primaryActivity = 'Extracurriculars';
    let maxHours = 0;
    activities.forEach((act) => {
      const occurrences = act.days_of_week.length;
      const hours = (act.duration_minutes / 60) * occurrences;
      total += hours;
      if (hours > maxHours) {
        maxHours = hours;
        primaryActivity = act.name;
      }
    });
    return { hoursTotal: total.toFixed(1), primaryActivity, hasMore: activities.length > 1, moreCount: activities.length - 1 };
  })();

  return (
    <div className="max-w-3xl mx-auto py-6 px-4">
      <AnimatePresence>
        {isCelebrationOpen && (
          <motion.div
            className="fixed inset-0 bg-[#2d3748]/85 backdrop-blur-md z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="bg-[#ffffff] p-8 rounded-3xl border border-quest-border max-w-md w-full text-center shadow-active"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', damping: 20, stiffness: 260 }}
            >
              <motion.span
                className="text-6xl block mb-4"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                🏔️
              </motion.span>
              <h2 className="font-serif font-black text-3xl text-ink">Summit Reached</h2>
              <p className="text-sm text-quest-muted mt-2 leading-relaxed">
                Every step on this trail is complete. You guarded your commitments while hitting your targets.
              </p>
              <div className="my-5 p-4 bg-quest-accent/10 border border-quest-accent/20 rounded-xl flex items-center justify-center gap-3">
                <Flame className="w-6 h-6 text-quest-accent fill-quest-accent" />
                <div className="text-left">
                  <span className="font-serif font-bold text-sm text-quest-accent-soft">
                    Current Streak: {streak.streak_count} Days
                  </span>
                  <p className="font-mono text-[10px] text-quest-accent-soft/70">RECORD: {streak.longest_streak} DAYS</p>
                </div>
              </div>
              <button
                onClick={() => setIsCelebrationOpen(false)}
                className="w-full py-3 bg-quest-accent text-white font-sans font-bold hover:opacity-90 shadow-active rounded-xl cursor-pointer transition-opacity"
              >
                Back to the Trail
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trail switcher */}
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={() => scrollToIndex(activeIndex - 1)}
          disabled={activeIndex === 0}
          className="p-1.5 text-quest-muted hover:text-ink disabled:opacity-30 cursor-pointer"
          aria-label="Previous trail"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar">
          {trailGroups.map((g, i) => (
            <button
              key={g.key}
              type="button"
              onClick={() => scrollToIndex(i)}
              className={`px-3.5 py-1.5 rounded-full font-sans font-bold text-xs whitespace-nowrap cursor-pointer transition-colors ${
                i === activeIndex ? 'bg-quest-accent text-white' : 'text-quest-muted border border-quest-border hover:text-ink'
              }`}
            >
              {g.emoji} {g.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => scrollToIndex(activeIndex + 1)}
          disabled={activeIndex >= trailGroups.length - 1}
          className="p-1.5 text-quest-muted hover:text-ink disabled:opacity-30 cursor-pointer"
          aria-label="Next trail"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Dual-axis paging: the outer strip scrolls horizontally (snap) to
          switch trails; each slide scrolls vertically on its own to move
          up/down that trail — the two never fight each other because the
          vertical scroll is contained inside each slide, not the strip. */}
      <div ref={stripRef} onScroll={handleStripScroll} className="mountain-strip rounded-2xl">
        {trailGroups.map((g) => (
          <div key={g.key} className="mountain-slide px-0.5">
            {g.taskId && (
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="flex items-center gap-1.5 text-xs font-sans font-bold text-quest-muted">
                  <Globe2 className="w-3.5 h-3.5" /> {g.isPublic ? 'Public journey' : 'Private'}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!g.isPublic}
                  disabled={togglingPublicKey === g.key}
                  onClick={() => handleTogglePublic(g)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer disabled:opacity-50 ${
                    g.isPublic ? 'bg-quest-accent' : 'bg-black/15'
                  }`}
                >
                  <span
                    className="absolute w-5 h-5 rounded-full bg-white shadow transition-[left] duration-200"
                    style={{ top: 2, left: g.isPublic ? 22 : 2 }}
                  />
                </button>
              </div>
            )}
            <div className="max-h-[65vh] overflow-y-auto rounded-2xl trail-scroll">
              <Trail levels={g.levels} selectedLevelId={expandedLevelId} onSelect={handleSelectLevel} />
            </div>
          </div>
        ))}
      </div>

      {/* Bottom panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
        <Mascot levels={activeGroup ? activeGroup.levels : []} streakCount={streak.streak_count} />

        <div className="bg-paper border border-quest-border rounded-2xl p-4 shadow-cozy flex flex-col justify-center">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono uppercase tracking-widest text-quest-muted">Campfires lit</span>
            <span className="font-serif font-black text-ink">{campfireStats.completed} / {campfireStats.total}</span>
          </div>
          <div className="w-full bg-black/10 h-2 rounded-full overflow-hidden border border-black/5 mt-2">
            <motion.div
              className="bg-quest-accent h-full"
              initial={{ width: 0 }}
              animate={{ width: `${campfireStats.total > 0 ? (campfireStats.completed / campfireStats.total) * 100 : 0}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>
          {activities.length > 0 && (
            <div className="flex items-center gap-2 mt-3 text-[11px] text-quest-moss">
              <Shield className="w-3.5 h-3.5 shrink-0" />
              <span>
                {pm.hoursTotal}h/week protected for {pm.primaryActivity}
                {pm.hasMore ? ` + ${pm.moreCount} more` : ''}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        {!showAddForm ? (
          <button
            onClick={() => {
              setShowAddForm(true);
              setIsTaskConfirmed(false);
            }}
            className={`w-full flex items-center justify-center gap-2 py-3 px-5 rounded-xl border font-sans font-bold text-sm cursor-pointer transition-all ${
              allComplete
                ? 'border-quest-moss/40 bg-quest-moss/10 hover:bg-quest-moss/15 text-quest-moss shadow-active'
                : 'border-quest-accent/30 bg-quest-accent/10 hover:bg-quest-accent/15 text-quest-accent-soft'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            {allComplete ? 'Add more tasks to stay ahead 🚀' : 'Forge New Task via AI Breakdown'}
          </button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-paper border border-quest-border p-5 rounded-2xl text-left shadow-cozy w-full backdrop-blur-md"
          >
            <div className="flex items-center justify-between border-b border-quest-border pb-3 mb-4">
              <h4 className="font-serif font-bold text-sm text-ink flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-quest-accent" />
                Forge New Task via AI Breakdown
              </h4>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setNewTaskTitle('');
                  setIsTaskConfirmed(false);
                  setErrorMessage(null);
                }}
                className="text-quest-muted hover:text-ink cursor-pointer"
                disabled={isDecomposing}
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="mb-4 bg-rose-500/10 border border-rose-500/20 text-rose-700 p-2.5 text-xs rounded-lg">
                {errorMessage}
              </div>
            )}

            {!isTaskConfirmed ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isDecomposing}
                    onClick={() => {
                      setForgeMode('academic');
                      setNewTaskBranch('academic');
                      setNewTaskSubject('Math');
                    }}
                    className={`py-3 px-4 rounded-xl border font-sans font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                      forgeMode === 'academic'
                        ? 'border-quest-accent/50 bg-quest-accent/10 text-ink shadow-active ring-1 ring-quest-accent/20'
                        : 'border-black/5 bg-[#f7fbf8]/40 text-quest-muted hover:text-ink'
                    }`}
                  >
                    <span className="text-xl">📚</span>
                    <div className="flex flex-col">
                      <span className="font-extrabold text-[12px]">School / Academic</span>
                      <span className="text-[10px] font-normal text-quest-muted mt-0.5">Study, exams & homework</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={isDecomposing}
                    onClick={() => {
                      setForgeMode('custom');
                      setNewTaskBranch('custom');
                      setNewTaskSubject('Other');
                    }}
                    className={`py-3 px-4 rounded-xl border font-sans font-bold text-xs flex flex-col items-center justify-center gap-1.5 transition-all text-center cursor-pointer ${
                      forgeMode === 'custom'
                        ? 'border-quest-moss/50 bg-quest-moss/10 text-ink shadow-active ring-1 ring-quest-moss/20'
                        : 'border-black/5 bg-[#f7fbf8]/40 text-quest-muted hover:text-ink'
                    }`}
                  >
                    <span className="text-xl">🧭</span>
                    <div className="flex flex-col">
                      <span className="font-extrabold text-[12px]">Custom Trail</span>
                      <span className="text-[10px] font-normal text-quest-muted mt-0.5">Hobbies, skills & side quests</span>
                    </div>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mt-4">
                  <div className="md:col-span-6 flex flex-col">
                    <label className="font-mono text-[10px] text-quest-muted tracking-widest mb-1 uppercase">
                      {forgeMode === 'academic' ? 'What academic goal or assignment?' : 'What custom skill or endeavor?'}
                    </label>
                    <input
                      type="text"
                      disabled={isDecomposing}
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder={forgeMode === 'academic' ? 'e.g. Study for physics quiz' : 'e.g. Learn to speak Spanish'}
                      className="p-2.5 border border-quest-border bg-[#f7fbf8] text-xs text-ink rounded-lg focus:outline-none focus:border-quest-accent"
                    />
                  </div>
                  <div className="md:col-span-3 flex flex-col">
                    <label className="font-mono text-[10px] text-quest-muted tracking-widest mb-1 uppercase">Subject</label>
                    <select
                      disabled={isDecomposing}
                      value={newTaskSubject}
                      onChange={(e) => setNewTaskSubject(e.target.value)}
                      className="p-2.5 border border-quest-border bg-[#f7fbf8] text-xs text-ink rounded-lg focus:outline-none focus:border-quest-accent h-[38px]"
                    >
                      <option value="Math">Math</option>
                      <option value="English">English</option>
                      <option value="Science">Science</option>
                      <option value="History">History</option>
                      <option value="Arts">Arts</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="md:col-span-3 flex flex-col">
                    <label className="font-mono text-[10px] text-quest-muted tracking-widest mb-1 uppercase">Target trail</label>
                    <select
                      disabled={isDecomposing}
                      value={newTaskBranch}
                      onChange={(e) => setNewTaskBranch(e.target.value as 'academic' | 'custom')}
                      className="p-2.5 border border-quest-border bg-[#f7fbf8] text-xs text-ink rounded-lg focus:outline-none focus:border-quest-accent h-[38px]"
                    >
                      <option value="academic">Academic Trail</option>
                      <option value="custom">Custom Trail</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    disabled={!newTaskTitle.trim()}
                    onClick={() => setIsTaskConfirmed(true)}
                    className={`py-2 px-4 rounded-lg text-xs font-sans font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ${
                      newTaskTitle.trim()
                        ? 'bg-quest-accent text-white hover:opacity-90'
                        : 'bg-black/5 border border-dashed border-quest-border text-quest-muted cursor-not-allowed opacity-50'
                    }`}
                  >
                    Confirm & Pre-plan →
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-[#f7fbf8]/60 p-4 rounded-xl border border-dashed border-quest-accent/30 flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono text-quest-accent-soft tracking-widest uppercase">Confirmed Goal</span>
                    <h5 className="font-serif font-black text-ink text-md mt-0.5">{newTaskTitle}</h5>
                    <div className="flex gap-2 items-center text-xs text-quest-muted mt-1 flex-wrap">
                      <span className="bg-black/5 px-2 py-0.5 rounded text-[11px] text-ink/80">Subject: {newTaskSubject}</span>
                      <span className="bg-black/5 px-2 py-0.5 rounded text-[11px] text-ink/80">
                        Track: {newTaskBranch === 'academic' ? 'Academic' : 'Custom'}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsTaskConfirmed(false)}
                    className="text-quest-accent-soft hover:text-ink transition-colors text-xs underline cursor-pointer whitespace-nowrap"
                    disabled={isDecomposing}
                  >
                    Edit
                  </button>
                </div>

                <div className="bg-quest-accent/10 border border-quest-accent/20 p-3 rounded-lg text-quest-accent-soft text-xs">
                  💡 Knavi breaks this into milestones and sequences them onto a new trail.
                </div>

                <button
                  type="button"
                  disabled={isDecomposing}
                  onClick={async () => {
                    setIsDecomposing(true);
                    setErrorMessage(null);
                    try {
                      const res = await authFetch('/api/tasks/decompose_and_add', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          title: newTaskTitle.trim(),
                          subject: newTaskSubject,
                          branch: newTaskBranch,
                        }),
                      });
                      if (!res.ok) {
                        const errData = await res.json().catch(() => ({}));
                        throw new Error(errData.error || 'Failed to decompose task via AI.');
                      }
                      setNewTaskTitle('');
                      setIsTaskConfirmed(false);
                      setShowAddForm(false);
                      onRefresh();
                    } catch (err: any) {
                      setErrorMessage(err.message || 'Something went wrong. Please try again.');
                    } finally {
                      setIsDecomposing(false);
                    }
                  }}
                  className={`w-full md:w-auto py-2.5 px-5 rounded-lg text-xs font-sans font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    isDecomposing ? 'bg-quest-accent/70 text-white cursor-not-allowed' : 'bg-quest-accent text-white hover:opacity-90 shadow-active'
                  }`}
                >
                  {isDecomposing ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Decomposing milestones...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Break Down Goal & Generate Trail
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </div>

      <NodeDetail
        level={selectedLevel}
        childCount={selectedLevelChildCount}
        timeLeft={timeLeft}
        formatTimer={formatTimer}
        onClose={() => {
          stopAndClearTimer();
          setExpandedLevelId(null);
        }}
        onComplete={handleComplete}
        onBreakDownFurther={handleBreakDownFurther}
        onRevertCompletion={handleRevertCompletion}
      />
    </div>
  );
}
