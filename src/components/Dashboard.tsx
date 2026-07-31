import { motion } from 'motion/react';
import { Flame, Sparkles, Calendar, ChevronRight, Shield } from 'lucide-react';
import { Streak, Level } from '../types/index';

interface DashboardProps {
  streak: Streak;
  levels: Level[];
  activities: any[];
  onNavigateToJourney: () => void;
  onNavigateToSetup: () => void;
  hasActivePlan: boolean;
}

const BRANCH_LABELS: Record<string, string> = {
  academic: 'Academic',
  light: 'Light',
  custom: 'Custom',
  activity: 'Activity',
};

export default function Dashboard({
  streak,
  levels,
  activities,
  onNavigateToJourney,
  onNavigateToSetup,
  hasActivePlan,
}: DashboardProps) {
  // Progress per trail (branch), not one number blended across every trail
  // combined — that was the bug where finishing a whole custom mountain
  // barely moved the dashboard because Academic had far more nodes.
  const mainLevels = levels.filter((l) => l.depth === 0);
  const branchNames = Array.from(new Set(mainLevels.map((l) => l.branch)));
  const branchStats = branchNames.map((branch) => {
    const branchLevels = mainLevels.filter((l) => l.branch === branch);
    const completed = branchLevels.filter((l) => l.status === 'complete').length;
    return {
      branch,
      completed,
      total: branchLevels.length,
      pct: branchLevels.length > 0 ? Math.round((completed / branchLevels.length) * 100) : 0,
    };
  });

  const protectedHours = activities.reduce((sum, act) => sum + (act.duration_minutes / 60) * act.days_of_week.length, 0);

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 text-left space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <span className="text-xs uppercase tracking-widest text-quest-accent-soft font-mono font-bold">
          Basecamp
        </span>
        <h1 className="font-serif font-black text-3xl sm:text-4xl text-ink mt-1">Your Weekly Standing</h1>
        <p className="text-sm text-quest-muted mt-1">Streaks, per-trail progress, and protected time at a glance.</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="bg-paper border border-quest-border p-6 rounded-2xl shadow-cozy flex items-start gap-4"
        >
          <div className="w-12 h-12 rounded-full bg-quest-accent/10 border border-quest-accent/20 flex items-center justify-center text-quest-accent shrink-0">
            <Flame className="w-6 h-6 fill-quest-accent" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-mono uppercase tracking-widest text-quest-muted block">Streak</span>
            <span className="text-3xl font-serif font-black text-ink">{streak.streak_count}d</span>
            <div className="mt-3 pt-3 border-t border-quest-border flex items-center justify-between text-[10px] font-mono text-quest-muted uppercase">
              <span>Record</span>
              <span className="font-bold text-ink">{streak.longest_streak}d</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="bg-paper border border-quest-border p-6 rounded-2xl shadow-cozy"
        >
          <span className="text-xs font-mono uppercase tracking-widest text-quest-muted block mb-3">Trail Progress</span>
          {hasActivePlan && branchStats.length > 0 ? (
            <div className="space-y-3">
              {branchStats.map((b) => (
                <div key={b.branch}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="font-sans font-bold text-ink">{BRANCH_LABELS[b.branch] || b.branch}</span>
                    <span className="font-mono text-quest-muted">{b.completed}/{b.total}</span>
                  </div>
                  <div className="w-full bg-black/10 h-1.5 rounded-full overflow-hidden border border-black/5">
                    <motion.div
                      className="bg-quest-accent h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${b.pct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-quest-muted italic">No active plan yet — design your week to get started.</p>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15 }}
          className="bg-paper border border-quest-border p-6 rounded-2xl shadow-cozy"
        >
          <span className="text-xs font-mono uppercase tracking-widest text-quest-muted block mb-2 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Protected Time
          </span>
          {activities.length > 0 ? (
            <>
              <span className="text-3xl font-serif font-black text-quest-moss">{protectedHours.toFixed(1)}h</span>
              <p className="text-xs text-quest-muted mt-2 leading-relaxed">
                Across {activities.length} weekly commitment{activities.length > 1 ? 's' : ''}, untouched by homework.
              </p>
            </>
          ) : (
            <p className="text-xs text-quest-muted mt-1 leading-relaxed">
              Optional — add sports, lessons, or standing plans in setup and Knavi will route around them.
            </p>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.25 }}
        className="flex flex-col md:flex-row gap-4 pt-2"
      >
        {hasActivePlan ? (
          <button
            onClick={onNavigateToJourney}
            className="flex-1 py-4 bg-quest-accent text-white font-sans font-bold hover:opacity-90 shadow-active rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-transform hover:-translate-y-0.5 text-sm"
          >
            Enter Today's Trail <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={onNavigateToSetup}
            className="flex-1 py-4 bg-quest-accent text-white font-sans font-bold hover:opacity-90 shadow-active rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-transform hover:-translate-y-0.5 text-sm"
          >
            Design Weekly Plan <Sparkles className="w-4 h-4" />
          </button>
        )}

        {hasActivePlan && (
          <button
            onClick={onNavigateToSetup}
            className="py-4 px-6 bg-black/5 text-ink font-sans font-bold border border-quest-border hover:bg-black/10 shadow-cozy rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all text-sm"
          >
            Rebuild Plan <Calendar className="w-4 h-4 text-quest-muted" />
          </button>
        )}
      </motion.div>
    </div>
  );
}
