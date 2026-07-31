import express from 'express';
import path from 'path';
import { randomUUID } from 'crypto';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { generatePlan, decomposeTasks, decomposeNodeFurther, MAX_NODE_DEPTH } from './src/lib/ai/client';
import { getRequestUser } from './src/lib/supabase/serverClient';

dotenv.config({ path: '.env.local' });
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const result = await getRequestUser(req.headers.authorization);
      if (!result) {
        res.status(401).json({ error: 'Unauthorized. Please sign in again.' });
        return;
      }
      (req as any).user = result.user;
      (req as any).supabase = result.client;
      next();
    } catch (err: any) {
      console.error('Auth check failed:', err);
      res.status(401).json({ error: 'Unauthorized. Please sign in again.' });
    }
  };

  // --- AI PLAN GENERATION ENDPOINT (JOB 1) ---
  app.post('/api/plan/generate', requireAuth, async (req: any, res) => {
    const { goal, tasks, customActivities, weekStartDate } = req.body;
    const supabase = req.supabase;
    const userId = req.user.id;

    if (!weekStartDate) {
      res.status(400).json({ error: 'weekStartDate represents starting date of the plan and is required.' });
      return;
    }

    try {
      const { data: allowed, error: rateLimitError } = await supabase.rpc('check_and_increment_ai_rate_limit', {
        p_limit: 10,
      });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) {
        res.status(429).json({ error: 'Daily rate limit reached. Max 10 AI generation requests per user per day.' });
        return;
      }

      // Protected activities are optional now — an empty list just means
      // the AI schedules freely, it's not an error state.
      const { data: protectedActivities, error: actErr } = await supabase.from('activities').select('*');
      if (actErr) throw actErr;

      const simpleCustomActivities = Array.isArray(customActivities)
        ? customActivities.filter((act) => typeof act === 'string' && act.trim() !== '')
        : [];

      const [planResult, customDecompositions] = await Promise.all([
        generatePlan({
          goal: goal || 'Productive balanced week with custom tracks',
          tasks: Array.isArray(tasks) ? tasks : [],
          protectedActivities: protectedActivities || [],
          weekStartDate,
        }),
        Promise.all(
          simpleCustomActivities.map(async (actTitle: string) => {
            try {
              const levels = await decomposeTasks({
                title: actTitle,
                subject: 'Custom',
                due_date: 'this week',
                days_until_due: 7,
              });
              return { title: actTitle, levels };
            } catch (e) {
              console.error(`Decompose failed for custom activity "${actTitle}":`, e);
              return { title: actTitle, levels: [] };
            }
          })
        ),
      ]);

      await supabase.from('weekly_plans').update({ status: 'complete' }).eq('status', 'active');

      const { data: activePlan, error: planErr } = await supabase
        .from('weekly_plans')
        .insert({
          user_id: userId,
          week_start_date: weekStartDate,
          goal: goal || 'Productive balanced week with custom tracks',
          raw_ai_output: planResult,
          status: 'active',
        })
        .select()
        .single();
      if (planErr) throw planErr;

      const simpleTasksInput = Array.isArray(tasks) ? tasks : [];
      const academicTasksToInsert = simpleTasksInput.map((t) => ({
        title: t.title,
        subject: t.subject,
        due_date: t.due_date,
        branch: 'academic' as const,
        estimated_minutes: 25,
      }));
      const customTaskTitles = simpleCustomActivities.map((actTitle) => ({
        title: actTitle,
        subject: 'Custom',
        due_date: new Date().toISOString().split('T')[0],
        branch: 'custom' as const,
        estimated_minutes: 25,
      }));
      const finalTasksArray = [...academicTasksToInsert, ...customTaskTitles];

      // Assign every task's id ourselves before inserting, rather than
      // trusting insert-then-select to come back in input order (Postgres
      // does preserve it for a single multi-row INSERT in practice, but
      // there's no reason to depend on that when we can just know for
      // certain). This is also what makes each task's levels linkable
      // deterministically, instead of the old fragile title-matching.
      const taskIds = finalTasksArray.map(() => randomUUID());

      await supabase.from('levels').delete().eq('user_id', userId);
      await supabase.from('tasks').delete().eq('user_id', userId);

      const tasksToInsert = finalTasksArray.map((t, i) => ({
        ...t,
        id: taskIds[i],
        user_id: userId,
        plan_id: activePlan.id,
      }));
      const { data: savedTasks, error: tasksErr } =
        tasksToInsert.length > 0
          ? await supabase.from('tasks').insert(tasksToInsert).select()
          : { data: [], error: null };
      if (tasksErr) throw tasksErr;

      // Every academic task becomes its OWN trail, exactly like a custom
      // one — no more bucketing every academic level into one shared
      // "Academic" aggregate. That aggregate was both the "can't make
      // Academic public" bug (no single task to attach a public flag to)
      // and the source of the cross-account mixing risk, since it had no
      // natural single owner-task boundary.
      const finalLevelsArray: any[] = [];
      const levelsByTaskIndex: Record<number, typeof planResult.levels> = {};
      planResult.levels.forEach((lvl) => {
        const idx = typeof lvl.task_index === 'number' ? lvl.task_index : -1;
        if (idx < 0 || idx >= academicTasksToInsert.length) return;
        if (!levelsByTaskIndex[idx]) levelsByTaskIndex[idx] = [];
        levelsByTaskIndex[idx].push(lvl);
      });

      Object.keys(levelsByTaskIndex).forEach((key) => {
        const idx = Number(key);
        const taskLevels = levelsByTaskIndex[idx].sort((a, b) => a.branch_order - b.branch_order);
        const taskId = taskIds[idx];
        taskLevels.forEach((lvl, order) => {
          finalLevelsArray.push({
            task_id: taskId,
            title: lvl.title,
            description: lvl.description,
            estimated_minutes: lvl.estimated_minutes,
            branch: 'academic',
            branch_order: order,
            status: order === 0 ? 'active' : 'locked',
            skipped: false,
            completed_at: null,
            depth: 0,
            parent_level_id: null,
          });
        });
      });

      simpleCustomActivities.forEach((_actTitle: string, custIdx: number) => {
        const decomp = customDecompositions[custIdx];
        const taskId = taskIds[academicTasksToInsert.length + custIdx];
        decomp.levels.forEach((lvl, idx) => {
          finalLevelsArray.push({
            task_id: taskId,
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
          });
        });
      });

      const levelsToInsert = finalLevelsArray.map((l) => ({
        ...l,
        user_id: userId,
        estimated_minutes: Math.max(20, Math.min(30, l.estimated_minutes)),
      }));
      const { data: savedLevels, error: levelsErr } =
        levelsToInsert.length > 0
          ? await supabase.from('levels').insert(levelsToInsert).select()
          : { data: [], error: null };
      if (levelsErr) throw levelsErr;

      res.json({ plan: activePlan, tasks: savedTasks || [], levels: savedLevels || [] });
    } catch (err: any) {
      console.error('AI plan generation route error:', err);
      res.status(500).json({ error: err.message || 'Failed to generate weekly schedule.' });
    }
  });

  // --- TASK DECOMPOSITION ENDPOINT (JOB 2) ---
  app.post('/api/tasks/decompose', requireAuth, async (req: any, res) => {
    const { title, subject, due_date, days_until_due } = req.body;
    if (!title || !subject) {
      res.status(400).json({ error: 'Task title and subject are required.' });
      return;
    }

    try {
      const levels = await decomposeTasks({
        title,
        subject,
        due_date: due_date || 'this week',
        days_until_due: days_until_due || 7,
      });
      res.json({ levels });
    } catch (err: any) {
      console.error('AI Task decomposition route error:', err);
      res.status(500).json({ error: err.message || 'Failed to decompose task.' });
    }
  });

  // --- TASK DECOMPOSITION & ADD ENDPOINT ---
  app.post('/api/tasks/decompose_and_add', requireAuth, async (req: any, res) => {
    const { title, subject, branch } = req.body;
    const supabase = req.supabase;
    const userId = req.user.id;

    if (!title || !subject || !branch) {
      res.status(400).json({ error: 'title, subject, and branch (academic, light, or custom) are required.' });
      return;
    }

    try {
      const { data: activePlan, error: planErr } = await supabase
        .from('weekly_plans')
        .select('*')
        .eq('status', 'active')
        .maybeSingle();
      if (planErr) throw planErr;
      if (!activePlan) {
        res.status(400).json({ error: 'No active plan found. Please generate a weekly plan first.' });
        return;
      }

      const decomposedLevels = await decomposeTasks({
        title,
        subject,
        due_date: 'this week',
        days_until_due: 7,
      });

      const { data: existingLevels, error: existingErr } = await supabase
        .from('levels')
        .select('*')
        .eq('user_id', userId);
      if (existingErr) throw existingErr;

      const isCustom = branch === 'custom';
      const branchLevels = (existingLevels || []).filter((l: any) => l.branch === branch && l.depth === 0);
      let highestOrder = -1;
      branchLevels.forEach((l: any) => {
        if (l.branch_order > highestOrder) highestOrder = l.branch_order;
      });
      const anyActiveInBranch = branchLevels.some((l: any) => l.status === 'active');

      const { data: savedTask, error: taskErr } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          plan_id: activePlan.id,
          title,
          subject,
          due_date: new Date().toISOString().split('T')[0],
          branch,
          estimated_minutes: decomposedLevels.reduce((acc, cur) => acc + (cur.estimated_minutes || 25), 0),
        })
        .select()
        .single();
      if (taskErr) throw taskErr;

      const levelsWithState = decomposedLevels.map((lvl, idx) => {
        const nextOrder = isCustom ? idx : highestOrder + 1 + idx;
        const status =
          (isCustom && idx === 0) || (!isCustom && !anyActiveInBranch && idx === 0) ? 'active' : 'locked';
        return {
          user_id: userId,
          task_id: savedTask.id,
          title: lvl.title || `${subject}: Level ${idx + 1}`,
          description: lvl.description || '',
          estimated_minutes: lvl.estimated_minutes || 25,
          branch,
          branch_order: nextOrder,
          status,
          skipped: false,
          completed_at: null,
          depth: 0,
          parent_level_id: null,
        };
      });

      const { data: savedLevels, error: levelsErr } = await supabase.from('levels').insert(levelsWithState).select();
      if (levelsErr) throw levelsErr;

      res.json({ success: true, task: savedTask, levels: savedLevels });
    } catch (err: any) {
      console.error('AI Decompose & Add route error:', err);
      res.status(500).json({ error: err.message || 'Failed to decompose and append task.' });
    }
  });

  // --- BREAK DOWN A SINGLE NODE FURTHER (with a depth cap) ---
  app.post('/api/levels/:levelId/decompose_further', requireAuth, async (req: any, res) => {
    const { levelId } = req.params;
    const supabase = req.supabase;
    const userId = req.user.id;

    try {
      const { data: parent, error: parentErr } = await supabase
        .from('levels')
        .select('*')
        .eq('id', levelId)
        .maybeSingle();
      if (parentErr) throw parentErr;
      if (!parent) {
        res.status(404).json({ error: 'Step not found.' });
        return;
      }
      // Public journeys are readable by anyone now (that's the whole
      // point of the gallery), but that must never imply writable. Only
      // the owner can trigger a real breakdown on a real level.
      if (parent.user_id !== userId) {
        res.status(403).json({ error: "You can only break down steps on your own trail. Fork this journey first." });
        return;
      }

      // Depth cap hit — this is the "I think that's enough, try it, and
      // research further if you get stuck" moment instead of letting the
      // student spiral into infinite sub-breakdowns like a bottomless
      // task-breakdown tool would.
      if (parent.depth >= MAX_NODE_DEPTH) {
        res.json({
          stopped: true,
          message:
            "This step is about as broken-down as it's useful to go. Give it a shot — if you're still stuck on a specific part, that's a great moment to look it up or ask a teacher, rather than waiting on another breakdown.",
          levels: [],
        });
        return;
      }

      // Only the currently-existing sub-steps of THIS parent matter for
      // the "already broken down" check.
      const { data: existingChildren, error: childErr } = await supabase
        .from('levels')
        .select('*')
        .eq('parent_level_id', levelId)
        .eq('user_id', userId);
      if (childErr) throw childErr;

      if ((existingChildren || []).length > 0) {
        res.json({ stopped: false, message: null, levels: existingChildren });
        return;
      }

      const result = await decomposeNodeFurther({
        title: parent.title,
        description: parent.description || '',
        subject: parent.branch,
      });

      if (result.sufficientAlready || result.levels.length === 0) {
        res.json({
          stopped: true,
          message:
            "This step is already specific enough to just start on. If you get stuck partway through, that's the right time to search it up rather than break it down further.",
          levels: [],
        });
        return;
      }

      // Insert the new sub-steps directly into the SAME trail sequence,
      // right after the parent — no branching. Everything after the parent
      // shifts down to make room, then the new nodes fill the gap.
      const newCount = result.levels.length;
      const { data: siblingsAfter, error: siblingsErr } = await supabase
        .from('levels')
        .select('id, branch_order')
        .eq('branch', parent.branch)
        .eq('user_id', userId)
        .gt('branch_order', parent.branch_order)
        .filter('task_id', parent.task_id === null ? 'is' : 'eq', parent.task_id);
      if (siblingsErr) throw siblingsErr;

      for (const sibling of siblingsAfter || []) {
        const { error: shiftErr } = await supabase
          .from('levels')
          .update({ branch_order: sibling.branch_order + newCount })
          .eq('id', sibling.id);
        if (shiftErr) throw shiftErr;
      }

      const rows = result.levels.map((lvl, idx) => ({
        user_id: userId,
        task_id: parent.task_id,
        title: lvl.title,
        description: lvl.description,
        estimated_minutes: lvl.estimated_minutes,
        branch: parent.branch,
        branch_order: parent.branch_order + idx + 1,
        status: 'locked',
        skipped: false,
        completed_at: null,
        depth: parent.depth + 1,
        parent_level_id: parent.id,
      }));

      const { data: savedLevels, error: insertErr } = await supabase.from('levels').insert(rows).select();
      if (insertErr) throw insertErr;

      res.json({ stopped: false, message: null, levels: savedLevels || [] });
    } catch (err: any) {
      console.error('Node breakdown route error:', err);
      res.status(500).json({ error: err.message || 'Failed to break this step down further.' });
    }
  });

  // --- STATELESS BREAKDOWN PREVIEW (powers the guest sandbox) ---
  // Same AI call as the real per-node breakdown, but takes raw text
  // instead of a level id and never reads or writes the database. This
  // lets a guest (anonymous-auth session, so still passes requireAuth)
  // experience real AI breakdown on a public journey they don't own,
  // entirely client-side-ephemeral — nothing here is ever saved.
  app.post('/api/preview/decompose_further', requireAuth, async (req: any, res) => {
    const { title, description, subject, depth } = req.body;
    if (!title) {
      res.status(400).json({ error: 'title is required.' });
      return;
    }

    if (typeof depth === 'number' && depth >= MAX_NODE_DEPTH) {
      res.json({
        stopped: true,
        message:
          "This step is about as broken-down as it's useful to go. Give it a shot — if you're still stuck on a specific part, that's a great moment to look it up or ask a teacher, rather than waiting on another breakdown.",
        levels: [],
      });
      return;
    }

    try {
      const result = await decomposeNodeFurther({ title, description: description || '', subject: subject || 'custom' });
      if (result.sufficientAlready || result.levels.length === 0) {
        res.json({
          stopped: true,
          message:
            "This step is already specific enough to just start on. If you get stuck partway through, that's the right time to search it up rather than break it down further.",
          levels: [],
        });
        return;
      }
      res.json({ stopped: false, message: null, levels: result.levels });
    } catch (err: any) {
      console.error('Preview breakdown route error:', err);
      res.status(500).json({ error: err.message || 'Failed to break this step down further.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
