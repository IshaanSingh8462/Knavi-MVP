import { supabase } from './client';
import { Activity, Level, Streak, Task, WeeklyPlan } from '../../types/index';

export async function signUp(email: string, password: string, name: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getActivities(): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as Activity[];
}

export async function saveActivities(
  activities: Omit<Activity, 'id' | 'user_id'>[]
): Promise<Activity[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { error: deleteError } = await supabase.from('activities').delete().eq('user_id', user.id);
  if (deleteError) throw deleteError;

  if (activities.length === 0) return [];

  const rows = activities.map((a) => ({ ...a, user_id: user.id }));
  const { data, error } = await supabase.from('activities').insert(rows).select();
  if (error) throw error;
  return (data || []) as Activity[];
}

// RLS on `levels` now permits reading other users' rows too, when their
// parent task is public (that's how the gallery works). So this query
// can no longer rely on RLS alone to mean "only my levels" — it has to
// say so explicitly, or another account's published trail leaks in here.
export async function getLevels(): Promise<Level[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('levels')
    .select('*')
    .eq('user_id', user.id)
    .order('branch_order', { ascending: true });
  if (error) throw error;
  return (data || []) as Level[];
}

export async function getActivePlan(): Promise<WeeklyPlan | null> {
  const { data, error } = await supabase
    .from('weekly_plans')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as WeeklyPlan) || null;
}

export async function getTasksForPlan(planId: string): Promise<Task[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('plan_id', planId)
    .eq('user_id', user.id);
  if (error) throw error;
  return (data || []) as Task[];
}

// Toggles a custom task's "Public Journey" flag. Only the owner can do
// this (still governed by the "owner full access" RLS policy) — captures
// a display name at the moment it's published so the gallery never has to
// touch auth.users directly.
export async function setTaskPublic(taskId: string, isPublic: boolean, authorName: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ is_public: isPublic, author_name: isPublic ? authorName : null })
    .eq('id', taskId);
  if (error) throw error;
}

// Browsing the Public Journeys gallery. Relies on the "public read
// published tasks" RLS policy, which works for a signed-in user OR a
// guest (anonymous-auth) session alike, since both carry a real auth.uid().
export async function getPublicTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw error;
  return (data || []) as Task[];
}

export async function getPublicLevelCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {};
  const { data, error } = await supabase.from('levels').select('task_id').in('task_id', taskIds);
  if (error) throw error;
  const counts: Record<string, number> = {};
  (data || []).forEach((row: any) => {
    if (row.task_id) counts[row.task_id] = (counts[row.task_id] || 0) + 1;
  });
  return counts;
}

export async function getPublicLevelsForTask(taskId: string): Promise<Level[]> {
  const { data, error } = await supabase
    .from('levels')
    .select('*')
    .eq('task_id', taskId)
    .order('branch_order', { ascending: true });
  if (error) throw error;
  return (data || []) as Level[];
}

// One-click "fork" — copies a public journey into the current user's own
// tasks/levels so they can complete, undo, and break it down further just
// like anything else in their trail. Deliberately resets branch_order to
// a clean 0-based sequence (not copied from the source) and depth to 0 for
// every node, so the fork starts as a fresh, fully-unlockable trail rather
// than inheriting the original owner's progress or breakdown history.
export async function forkPublicJourney(sourceTask: Task, sourceLevels: Level[]): Promise<Task> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const activePlan = await getActivePlan();
  if (!activePlan) {
    throw new Error('You need an active weekly plan before forking a journey — build your week first.');
  }

  const { data: newTask, error: taskErr } = await supabase
    .from('tasks')
    .insert({
      user_id: user.id,
      plan_id: activePlan.id,
      title: sourceTask.title,
      subject: sourceTask.subject,
      due_date: new Date().toISOString().split('T')[0],
      branch: 'custom',
      estimated_minutes: sourceTask.estimated_minutes,
      is_public: false,
      author_name: null,
    })
    .select()
    .single();
  if (taskErr) throw taskErr;

  if (sourceLevels.length > 0) {
    const rows = sourceLevels
      .slice()
      .sort((a, b) => a.branch_order - b.branch_order)
      .map((lvl, idx) => ({
        user_id: user.id,
        task_id: newTask.id,
        title: lvl.title,
        description: lvl.description,
        estimated_minutes: lvl.estimated_minutes,
        branch: 'custom',
        branch_order: idx,
        status: idx === 0 ? 'active' : 'locked',
        skipped: false,
        completed_at: null,
        depth: 0,
        parent_level_id: null,
      }));
    const { error: levelsErr } = await supabase.from('levels').insert(rows);
    if (levelsErr) throw levelsErr;
  }

  return newTask as Task;
}

export async function getStreak(): Promise<Streak> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const { data, error } = await supabase.from('streaks').select('*').maybeSingle();
  if (error) throw error;
  if (data) return data as Streak;

  const { data: created, error: createError } = await supabase
    .from('streaks')
    .insert({ user_id: user.id, streak_count: 0, last_active_date: null, longest_streak: 0 })
    .select()
    .single();
  if (createError) throw createError;
  return created as Streak;
}

export interface CompleteLevelResult {
  completedLevel: Level;
  nextUnlockedLevel: Level | null;
  streak: Streak;
}

export async function completeLevel(levelId: string, skipped: boolean): Promise<CompleteLevelResult> {
  const { data, error } = await supabase.rpc('complete_level', {
    p_level_id: levelId,
    p_skipped: skipped,
  });
  if (error) throw error;
  return data as CompleteLevelResult;
}

// Undo an accidental "Mark Complete". The DB function only allows this for
// the most recently completed node in a trail (see schema.sql) — anything
// further back would need a cascading re-lock that risks discarding real
// progress, so we don't attempt it.
export async function revertLevelCompletion(levelId: string): Promise<void> {
  const { error } = await supabase.rpc('revert_level_completion', { p_level_id: levelId });
  if (error) throw error;
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('Not signed in.');

  return fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`,
    },
  });
}

export interface BreakdownResult {
  stopped: boolean;
  message: string | null;
  levels: Level[];
}

// Powers the node detail drawer's "Break Down Further" button. The server
// decides whether to actually call the AI or return the depth-cap stop
// message — this just calls the route and hands back whichever it gets.
export async function breakDownNodeFurther(levelId: string): Promise<BreakdownResult> {
  const response = await authFetch(`/api/levels/${levelId}/decompose_further`, { method: 'POST' });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to break this step down further.');
  }
  return response.json();
}

// Powers the guest sandbox's "Break Down Further" — same shape as
// breakDownNodeFurther but stateless (no level id, nothing persisted).
export async function previewDecomposeFurther(
  title: string,
  description: string,
  subject: string,
  depth: number
): Promise<BreakdownResult> {
  const response = await authFetch('/api/preview/decompose_further', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description, subject, depth }),
  });
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to break this step down further.');
  }
  return response.json();
}
