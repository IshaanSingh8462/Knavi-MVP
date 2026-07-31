import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trash2, Plus, Sparkles, AlertCircle, BookOpen } from 'lucide-react';
import { User } from '../types/index';
import { authFetch } from '../lib/supabase/queries';

interface TaskInput {
  title: string;
  subject: string;
  due_date: string;
  branch: 'academic';
}

interface WeeklySetupProps {
  user?: User;
  onPlanGenerated: () => void;
}

export default function WeeklySetup({ user, onPlanGenerated }: WeeklySetupProps) {
  const [tasks, setTasks] = useState<TaskInput[]>([
    { title: 'Study for AP Calculus exam', subject: 'Math', due_date: '', branch: 'academic' },
  ]);
  const [customActivities, setCustomActivities] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(false);
  const [loadMessage, setLoadMessage] = useState('Setting up core constraints...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const today = new Date();
    const formatted = today.toISOString().split('T')[0];
    setTasks(prev => prev.map(t => t.due_date === '' ? { ...t, due_date: formatted } : t));
  }, []);

  const handleAddTask = () => {
    const today = new Date().toISOString().split('T')[0];
    setTasks([
      ...tasks,
      { title: '', subject: 'Math', due_date: today, branch: 'academic' }
    ]);
  };

  const handleDeleteTask = (index: number) => {
    if (tasks.length === 1) return;
    setTasks(tasks.filter((_, i) => i !== index));
  };

  const handleUpdateTask = (index: number, field: keyof TaskInput, value: string) => {
    const updated = [...tasks];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setTasks(updated);
  };

  const handleAddCustomActivity = () => {
    setCustomActivities([...customActivities, '']);
  };

  const handleUpdateCustomActivity = (index: number, val: string) => {
    const updated = [...customActivities];
    updated[index] = val;
    setCustomActivities(updated);
  };

  const handleDeleteCustomActivity = (index: number) => {
    setCustomActivities(customActivities.filter((_, i) => i !== index));
  };

  const runLoadingMessages = () => {
    const messages = [
      "Establishing locked extracurricular protections...",
      "Slicing academic tasks into focused 25-minute study nodes...",
      "Routing light review sessions around your commitments...",
      "Assembling your mountain trail...",
      "Polishing progress nodes... almost ready!"
    ];
    let index = 0;
    const interval = setInterval(() => {
      if (index < messages.length) {
        setLoadMessage(messages[index]);
        index++;
      } else {
        clearInterval(interval);
      }
    }, 2500);
    return interval;
  };

  const handleBuildMyWeek = async () => {
    const invalid = tasks.some(t => !t.title.trim());
    if (invalid) {
      setErrorMsg("Please fill in a description/title for all active tasks.");
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    const intervalToken = runLoadingMessages();

    try {
      const today = new Date().toISOString().split('T')[0];

      const response = await authFetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: 'Productive balanced week with custom tracks',
          tasks,
          customActivities: customActivities.filter(a => a.trim() !== ''),
          weekStartDate: today
        })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate weekly plan.');
      }

      onPlanGenerated();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Something went wrong. Let\'s try building again!');
    } finally {
      clearInterval(intervalToken);
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-md mx-auto py-20 px-4 text-center"
      >
        <div className="relative inline-block mb-8">
          <div className="w-24 h-24 rounded-full bg-quest-accent/10 flex items-center justify-center animate-pulse duration-1000">
            <span className="text-5xl select-none animate-spin" style={{ animationDuration: '8s' }}>🧭</span>
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-quest-accent text-white font-bold text-xs flex items-center justify-center animate-bounce">
            ✨
          </div>
        </div>

        <h2 className="font-serif font-black text-2xl text-ink">Knavi is building your trail...</h2>

        <div className="mt-4 p-4 bg-black/5 border border-quest-border rounded-xl shadow-cozy min-h-[70px] flex items-center justify-center">
          <p className="text-sm text-ink italic animate-pulse">"{loadMessage}"</p>
        </div>

        <p className="text-xs text-quest-muted mt-4">
          Please don't close this window — we're generating your validated trail.
        </p>
      </motion.div>
    );
  }

  const displayName = user?.name ? user.name.trim() : (user?.email ? user.email.split('@')[0] : '');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 max-w-3xl mx-auto py-8 px-4 text-left"
    >
      <div>
        <span className="text-xs font-sans font-semibold text-quest-accent bg-quest-accent/10 px-2.5 py-0.5 rounded-full select-none">
          {displayName ? `${displayName}'s Sunday Weekly Setup` : 'Sunday Weekly Setup'}
        </span>
        <h1 className="font-serif font-black text-3xl sm:text-4xl text-ink mt-2">
          {displayName ? `Hey ${displayName}, let's map this week's goals` : "Map this week's goals"}
        </h1>
        <p className="font-sans text-sm text-quest-muted mt-1">
          Input your homework, prep work, and personal targets. Knavi will weave them into a trail.
        </p>
      </div>

      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 p-4 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-quest-accent flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-serif font-bold text-sm">Failed to generate Weekly Path</h4>
            <p className="font-sans text-xs text-rose-700 mt-1">{errorMsg}</p>
          </div>
        </div>
      )}

      <div className="bg-paper p-6 rounded-xl border border-quest-border shadow-cozy">
        <div className="flex items-center justify-between border-b border-quest-border pb-4 mb-4">
          <h3 className="font-serif font-bold text-xl text-ink flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-quest-accent" /> Section 1: Major Academic Tasks
          </h3>
          <span className="text-xs font-sans text-quest-muted">Min 1 task required</span>
        </div>

        <div className="space-y-4">
          {tasks.map((task, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center border-b border-quest-border pb-4 md:pb-0 md:border-b-0">
              <div className="md:col-span-8 flex flex-col">
                <input
                  type="text"
                  required
                  placeholder="e.g. Study for AP Calculus exam, Write thesis draft"
                  value={task.title}
                  onChange={(e) => handleUpdateTask(index, 'title', e.target.value)}
                  className="p-2.5 border border-quest-border rounded-lg font-sans text-ink bg-[#f7fbf8]/50 focus:outline-none focus:border-quest-accent text-sm"
                />
              </div>

              <div className="md:col-span-3">
                <select
                  value={task.subject}
                  onChange={(e) => handleUpdateTask(index, 'subject', e.target.value)}
                  className="w-full p-2.5 border border-quest-border rounded-lg font-sans text-sm text-ink bg-[#f7fbf8]/50 focus:outline-none focus:border-quest-accent"
                >
                  <option value="Math">Math</option>
                  <option value="English">English</option>
                  <option value="Science">Science</option>
                  <option value="History">History</option>
                  <option value="Arts">Arts</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="md:col-span-1 flex justify-center md:justify-end">
                <button
                  type="button"
                  disabled={tasks.length === 1}
                  onClick={() => handleDeleteTask(index)}
                  className="p-2 text-quest-muted hover:text-quest-accent disabled:opacity-30 disabled:hover:text-quest-muted rounded transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddTask}
          className="mt-4 flex items-center gap-1.5 text-xs font-sans font-bold text-quest-accent border border-quest-accent/20 bg-quest-accent/5 hover:bg-quest-accent/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add Another Task
        </button>
      </div>

      <div className="bg-paper p-6 rounded-xl border border-quest-border shadow-cozy">
        <div className="flex items-center justify-between border-b border-quest-border pb-4 mb-4">
          <h3 className="font-serif font-bold text-xl text-ink flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-quest-accent-soft" /> Section 2: Custom Activity Tracks
          </h3>
          <span className="text-xs font-sans text-quest-muted">Optional tracks</span>
        </div>
        <p className="font-sans text-xs text-quest-muted mb-6 leading-relaxed">
          Enter any independent custom endeavors or specific tasks you want to complete here (e.g. "Build an AI App", "Practice speech draft"). Knavi will dynamically decompose each target into its own mountain trail!
        </p>

        <div className="space-y-4">
          {customActivities.map((act, index) => (
            <div key={index} className="flex gap-3 items-center">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="e.g. Practice violin recital solo, design portfolio wireframes"
                  value={act}
                  onChange={(e) => handleUpdateCustomActivity(index, e.target.value)}
                  className="w-full p-2.5 border border-quest-border rounded-lg font-sans text-sm text-ink bg-[#f7fbf8]/50 focus:outline-none focus:border-quest-accent"
                />
              </div>
              <button
                type="button"
                disabled={customActivities.length === 1}
                onClick={() => handleDeleteCustomActivity(index)}
                className="p-2.5 text-quest-muted hover:text-quest-accent hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent rounded-lg transition-all cursor-pointer flex-shrink-0"
                title="Remove Track"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </div>
          ))}
          {customActivities.length === 0 && (
            <p className="text-xs text-quest-muted italic py-2">
              No custom tracks added. All tasks will follow the standard Academic trail.
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleAddCustomActivity}
          className="mt-4 flex items-center gap-1.5 text-xs font-sans font-bold text-quest-accent-soft border border-quest-accent/20 bg-quest-accent/5 hover:bg-quest-accent/10 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" /> Add Custom Activity Track
        </button>
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleBuildMyWeek}
          className="flex items-center gap-2 px-8 py-3.5 bg-quest-accent text-white font-sans font-bold rounded-xl shadow-active border border-quest-accent hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer text-sm"
        >
          Build My Week Journey <Sparkles className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
}
