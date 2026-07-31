import { motion, AnimatePresence } from 'motion/react';

export type MascotState = 'idle' | 'active' | 'thriving' | 'struggling' | 'celebrating';

interface MascotProps {
  levels: any[];
  streakCount: number;
}

export default function Mascot({ levels, streakCount }: MascotProps) {
  const getMascotState = (): { state: MascotState; emoji: string; text: string; tint: string; ring: string } => {
    const totalToday = levels.length;
    const completedToday = levels.filter((l) => l.status === 'complete').length;
    const completionPercent = totalToday > 0 ? (completedToday / totalToday) * 100 : 0;

    const currentHour = new Date().getHours();
    const isLate = currentHour >= 18;

    if (totalToday > 0 && completedToday === totalToday) {
      return {
        state: 'celebrating',
        emoji: '🏔️',
        text: "Summit reached — every step on this trail is complete.",
        tint: 'from-emerald-500/15 to-emerald-500/5 text-emerald-800',
        ring: 'ring-emerald-400/30',
      };
    }

    if (streakCount >= 3 && completionPercent >= 50) {
      return {
        state: 'thriving',
        emoji: '✨',
        text: `${streakCount}-day streak and already past the halfway point today. Strong pace.`,
        tint: 'from-amber-500/15 to-amber-500/5 text-amber-800',
        ring: 'ring-amber-400/30',
      };
    }

    if (completedToday > 0) {
      return {
        state: 'active',
        emoji: '🧭',
        text: 'On the move. Ready for the next waypoint whenever you are.',
        tint: 'from-orange-500/15 to-orange-500/5 text-orange-800',
        ring: 'ring-orange-400/30',
      };
    }

    if (streakCount === 0 && isLate) {
      return {
        state: 'struggling',
        emoji: '⏳',
        text: "It's after 6pm and the trail hasn't started. One step keeps the rhythm alive.",
        tint: 'from-rose-500/15 to-rose-500/5 text-rose-800',
        ring: 'ring-rose-400/30',
      };
    }

    return {
      state: 'idle',
      emoji: '🕯️',
      text: 'Basecamp is quiet. Complete a step to set today in motion.',
      tint: 'from-black/5 to-black/0 text-quest-muted',
      ring: 'ring-black/10',
    };
  };

  const current = getMascotState();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.state}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className={`flex items-start gap-4 p-4 rounded-2xl bg-gradient-to-br ${current.tint} ring-1 ${current.ring} bg-paper backdrop-blur-md shadow-cozy`}
      >
        <motion.div
          className="text-3xl select-none"
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          {current.emoji}
        </motion.div>
        <div className="min-w-0">
          <h4 className="font-serif font-semibold text-base text-ink flex items-center gap-2">
            Trail Report
            <span className="text-[10px] font-mono uppercase tracking-widest text-quest-muted">
              {current.state}
            </span>
          </h4>
          <p className="text-sm mt-1 leading-relaxed text-ink/80">{current.text}</p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
