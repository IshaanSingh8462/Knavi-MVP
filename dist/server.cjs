var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_crypto = require("crypto");
var import_vite = require("vite");
var import_dotenv2 = __toESM(require("dotenv"), 1);

// src/lib/ai/client.ts
var import_dotenv = __toESM(require("dotenv"), 1);
var import_genai = require("@google/genai");

// src/lib/ai/prompts.ts
function buildPlanPrompt(input) {
  const prString = input.protectedActivities.map(
    (p) => `- ${p.name} (${p.type}): Scheduled on: [${p.days_of_week.join(", ")}] starting at ${p.start_time} for ${p.duration_minutes} minutes.`
  ).join("\n");
  const tasksString = input.tasks.map(
    (t, idx) => `- Task index ${idx}: "${t.title}" (${t.subject}, Due: ${t.due_date})`
  ).join("\n");
  return `You are a high-fidelity scheduling AI assisting high school students.
You are building a personalized "Knavi" weekly planner starting on '${input.weekStartDate}'.

The main goal for the week is: "${input.goal}"

We have protected hours for activities (music, sport, creative hobbies) that are IMMOVABLE constraints, if any are listed below. Treat this list as optional context, not a requirement \u2014 plenty of students won't have any.
Do NOT schedule any academic/study tasks during these activity hours. They are locked, so they do NOT need interactive journey levels/nodes.

PROTECTED / LOCKED TIME WINDOWS:
${prString || "None provided \u2014 schedule freely."}

STUDENT INPUT TASKS TO DECOMPOSE (each becomes its own trail \u2014 this is important):
${tasksString || "None"}

YOUR MISSION:
1. Decompose EACH input task into its own set of 3 to 6 highly specific, granular, and actionable levels (nodes).
   - Do NOT combine multiple input tasks into one shared set of levels \u2014 every level belongs to exactly one task.
   - Do NOT simplify a task into just 1 or 2 broad nodes. Instead, generate at least 3 targeted levels for EACH task.
   - For example, if a task is "Study for AP Calculus exam", do NOT make a broad "Study Calculus" node. Instead, make specific, sequential nodes like: "Review Limits & Continuity rule-sheets", "Solve 5-10 derivatives practice questions", "Work through standard calculus exam free-response metrics", and "Analyze key error-patterns with reference sheets".
   - Each node MUST specify a clear, highly specific study action, focusing on a particular sub-topic or practicing a specific set of questions/problems for 20-30 minutes.
   - "task_index" on every level MUST match the "Task index" number of the input task it belongs to, exactly as listed above.
   - Sequence each task's own levels using 'branch_order' (0, 1, 2...) starting fresh at 0 for every task.
2. Every single level's 'estimated_minutes' MUST be an integer between 20 and 30 inclusive (e.g. 24, 25, 30). No levels shorter than 20 mins or longer than 30 mins!

You MUST respond strictly with a valid JSON object matching this schema:
{
  "goal": "The primary goal for the week",
  "levels": [
    {
      "title": "Short descriptive level title (e.g., 'Learn Solo Section B', 'AP Stats Practice')",
      "description": "Clear instructions for what the student should complete in this 20-30 minute block.",
      "estimated_minutes": 25, // MUST be 20 to 30!
      "branch": "academic",
      "branch_order": 0, // Sequence integer starting from 0, fresh for EACH task
      "task_index": 0 // MUST match the "Task index" of the input task this level belongs to
    }
  ]
}

Ensure the output contains no markdown formatting except JSON, and is readable, helpful and warm in tone.`;
}
function buildDecomposePrompt(input) {
  return `You are an expert strategic planner and productivity coach. 
Your mission is to decompose the following user task into 3 to 6 high-level progressive milestones or "general moves" rather than tiny tedious micro-steps. Focus on key strategic developmental phases of the goal.
For example, if the task is "win a hackathon", the milestones should be major accomplishments like: "Plan core idea & build prompt via Gemini", "Develop full-stack boilerplate using Claude", "Integrate front-end & mock data", "Polish pitch deck & record demo video".

TASK: "${input.title}"
SUBJECT: ${input.subject}
DUE DATE: ${input.due_date} (${input.days_until_due} days away)

DIRECTIONS:
1. Decompose the task into 3 to 6 progressive high-level milestones (levels).
2. For each milestone, provide:
   - title: concise high-level title representing a major "general move" (e.g. "Brainstorm Core Architecture", "Implement API endpoints", "Fine-tune UI details")
   - description: a clear, motivational description of what the user should focus on accomplishing in this block. Keep it high-level and clear.
   - estimated_minutes: a number between 20 and 30 minutes inclusive
   - branch: must be 'academic' or 'custom'
   - branch_order: relative sequence starting precisely at 1
3. Ensure estimated_minutes is STRICTLY an integer between 20 and 30 inclusive for all levels.

You MUST respond strictly with a JSON array of levels matching this exact schema:
[
  {
    "title": "Concise Milestone Title",
    "description": "Clear high-level strategy and goal for this block.",
    "estimated_minutes": 25,
    "branch": "academic",
    "branch_order": 1
  }
]`;
}
function buildNodeBreakdownPrompt(input) {
  return `You are helping a student break ONE existing study step into a couple of smaller, more concrete sub-steps.

PARENT STEP: "${input.title}"
SUBJECT: ${input.subject}
CURRENT DESCRIPTION: "${input.description}"

DIRECTIONS:
1. Produce 2 to 4 sub-steps that make the parent step more concrete and easier to start. Each sub-step should describe a specific, doable action tied directly to the parent step \u2014 not a generic restatement of it.
2. Every sub-step's estimated_minutes MUST be an integer between 20 and 30 inclusive, same as any other level in this app.
3. branch must be "custom" and branch_order must start at 1 and increase sequentially.
4. If this step is ALREADY concrete and specific enough that breaking it down further would just be busywork or padding (for example, it's already a single clear, well-scoped action), do not force sub-steps. Instead return an empty "levels" array and set "sufficientAlready" to true.

You MUST respond strictly with a valid JSON object matching this schema:
{
  "sufficientAlready": false,
  "levels": [
    {
      "title": "Concise, concrete sub-step title",
      "description": "One or two sentences of specific instruction.",
      "estimated_minutes": 25,
      "branch": "custom",
      "branch_order": 1
    }
  ]
}

No markdown, no commentary outside the JSON.`;
}

// src/lib/ai/schemas.ts
var import_zod = require("zod");
var LevelSchema = import_zod.z.object({
  title: import_zod.z.string().min(1, "Title is required"),
  description: import_zod.z.string().min(1, "Description is required"),
  estimated_minutes: import_zod.z.number().int().min(20).max(30),
  branch: import_zod.z.enum(["academic", "activity", "light", "custom"]),
  branch_order: import_zod.z.number().int().nonnegative(),
  task_index: import_zod.z.number().int().nonnegative().optional()
});
var WeeklyPlanSchema = import_zod.z.object({
  goal: import_zod.z.string().optional(),
  levels: import_zod.z.array(LevelSchema)
});
var LevelsArraySchema = import_zod.z.array(LevelSchema);
var NodeBreakdownResponseSchema = import_zod.z.object({
  sufficientAlready: import_zod.z.boolean().optional().default(false),
  levels: import_zod.z.array(LevelSchema).max(4)
});

// src/lib/constants.ts
var MAX_NODE_DEPTH = 2;

// src/lib/ai/client.ts
import_dotenv.default.config({ path: ".env.local" });
import_dotenv.default.config();
var GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_KEY || process.env.API_KEY;
var MODEL_CANDIDATES = [
  process.env.GEMINI_MODEL,
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
].filter((m) => Boolean(m));
var MODELS = Array.from(new Set(MODEL_CANDIDATES));
var ai = GEMINI_API_KEY ? new import_genai.GoogleGenAI({
  apiKey: GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build"
    }
  }
}) : null;
function missingKeyError(feature) {
  return new Error(
    `Gemini API key is not configured. Add GEMINI_API_KEY to a .env.local file in the project root (get one free at https://aistudio.google.com/app/apikey) to activate ${feature}, then restart the dev server.`
  );
}
function classifyGeminiError(err) {
  const message = String(err?.message || err || "");
  const status = err?.status || err?.code;
  if (status === 401 || status === 403 || /API key not valid|PERMISSION_DENIED|invalid.*key/i.test(message)) {
    return new Error(
      "Gemini rejected the configured API key (invalid or missing permissions). Double-check GEMINI_API_KEY in .env.local against https://aistudio.google.com/app/apikey."
    );
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return new Error("Gemini rate limit or quota exceeded for this API key. Wait a moment and try again.");
  }
  if (status === 404 || /not found|NOT_FOUND/i.test(message)) {
    return new Error(`The Gemini model was not found or is no longer available (${message}).`);
  }
  return new Error(message || "Unknown Gemini API error.");
}
function cleanJsonString(str) {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}
async function generateWithFallback(prompt) {
  if (!ai) throw missingKeyError("AI-powered features");
  let lastErr = null;
  for (const model of MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      return response.text || "";
    } catch (err) {
      lastErr = err;
      console.warn(`Gemini call failed for model "${model}", trying next candidate...`, err?.message || err);
    }
  }
  throw classifyGeminiError(lastErr);
}
async function generatePlan(input) {
  const prompt = buildPlanPrompt(input);
  try {
    const text = await generateWithFallback(prompt);
    const jsonParsed = JSON.parse(cleanJsonString(text));
    return WeeklyPlanSchema.parse(jsonParsed);
  } catch (err) {
    console.warn("Weekly plan generation first attempt failed, retrying once...", err.message);
    const retryPrompt = `${prompt}

NOTE: The previous attempt failed validation with error: ${err.message}. Please fix the structure and ensure all estimated_minutes are strictly between 20 and 30.`;
    try {
      const text = await generateWithFallback(retryPrompt);
      const jsonParsed = JSON.parse(cleanJsonString(text));
      return WeeklyPlanSchema.parse(jsonParsed);
    } catch (retryErr) {
      console.error("Weekly plan generation failed after retry logic:", retryErr);
      throw new Error(`Failed to generate custom weekly plan: ${retryErr.message || retryErr}`);
    }
  }
}
function sanitizeLevels(jsonParsed) {
  if (!Array.isArray(jsonParsed)) return jsonParsed;
  return jsonParsed.map((item, idx) => {
    let b = item.branch;
    if (typeof b === "string") {
      b = b.toLowerCase().trim();
    }
    if (b !== "academic" && b !== "light" && b !== "activity" && b !== "custom") {
      b = "academic";
    }
    let mins = parseInt(item.estimated_minutes, 10);
    if (isNaN(mins)) {
      mins = 25;
    } else {
      mins = Math.max(20, Math.min(30, mins));
    }
    return {
      title: item.title || `Milestone ${idx + 1}`,
      description: item.description || `Execute plan objectives for milestone ${idx + 1}.`,
      estimated_minutes: mins,
      branch: b,
      branch_order: typeof item.branch_order === "number" ? item.branch_order : idx + 1
    };
  });
}
async function decomposeTasks(input) {
  const prompt = buildDecomposePrompt(input);
  try {
    const text = await generateWithFallback(prompt);
    const jsonParsed = sanitizeLevels(JSON.parse(cleanJsonString(text)));
    return LevelsArraySchema.parse(jsonParsed);
  } catch (err) {
    console.warn("Task decomposition first attempt failed, retrying once...", err.message);
    const retryPrompt = `${prompt}

NOTE: The previous attempt failed validation with error: ${err.message}. Ensure estimated_minutes are strictly between 20 and 30 for all items in the array.`;
    try {
      const text = await generateWithFallback(retryPrompt);
      const jsonParsed = sanitizeLevels(JSON.parse(cleanJsonString(text)));
      return LevelsArraySchema.parse(jsonParsed);
    } catch (retryErr) {
      console.error("Task decomposition failed after retry logic:", retryErr);
      throw new Error(`Failed to decompose custom tasks: ${retryErr.message || retryErr}`);
    }
  }
}
async function decomposeNodeFurther(input) {
  const prompt = buildNodeBreakdownPrompt(input);
  try {
    const text = await generateWithFallback(prompt);
    const jsonParsed = JSON.parse(cleanJsonString(text));
    if (Array.isArray(jsonParsed?.levels)) {
      jsonParsed.levels = sanitizeLevels(jsonParsed.levels);
    }
    return NodeBreakdownResponseSchema.parse(jsonParsed);
  } catch (err) {
    console.error("Node breakdown failed:", err);
    throw new Error(`Failed to break this step down further: ${err.message || err}`);
  }
}

// src/lib/supabase/serverClient.ts
var import_supabase_js = require("@supabase/supabase-js");
var SUPABASE_URL = process.env.VITE_SUPABASE_URL;
var SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
var isSupabaseServerConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
function getScopedClient(accessToken) {
  if (!isSupabaseServerConfigured) {
    throw new Error("Supabase is not configured on the server. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return (0, import_supabase_js.createClient)(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
async function getRequestUser(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.substring(7);
  if (!token) return null;
  const client = getScopedClient(token);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { user: data.user, client };
}

// server.ts
import_dotenv2.default.config({ path: ".env.local" });
import_dotenv2.default.config();
async function startServer() {
  const app = (0, import_express.default)();
  const PORT = 3e3;
  app.use(import_express.default.json());
  const requireAuth = async (req, res, next) => {
    try {
      const result = await getRequestUser(req.headers.authorization);
      if (!result) {
        res.status(401).json({ error: "Unauthorized. Please sign in again." });
        return;
      }
      req.user = result.user;
      req.supabase = result.client;
      next();
    } catch (err) {
      console.error("Auth check failed:", err);
      res.status(401).json({ error: "Unauthorized. Please sign in again." });
    }
  };
  app.post("/api/plan/generate", requireAuth, async (req, res) => {
    const { goal, tasks, customActivities, weekStartDate } = req.body;
    const supabase = req.supabase;
    const userId = req.user.id;
    if (!weekStartDate) {
      res.status(400).json({ error: "weekStartDate represents starting date of the plan and is required." });
      return;
    }
    try {
      const { data: allowed, error: rateLimitError } = await supabase.rpc("check_and_increment_ai_rate_limit", {
        p_limit: 10
      });
      if (rateLimitError) throw rateLimitError;
      if (!allowed) {
        res.status(429).json({ error: "Daily rate limit reached. Max 10 AI generation requests per user per day." });
        return;
      }
      const { data: protectedActivities, error: actErr } = await supabase.from("activities").select("*");
      if (actErr) throw actErr;
      const simpleCustomActivities = Array.isArray(customActivities) ? customActivities.filter((act) => typeof act === "string" && act.trim() !== "") : [];
      const [planResult, customDecompositions] = await Promise.all([
        generatePlan({
          goal: goal || "Productive balanced week with custom tracks",
          tasks: Array.isArray(tasks) ? tasks : [],
          protectedActivities: protectedActivities || [],
          weekStartDate
        }),
        Promise.all(
          simpleCustomActivities.map(async (actTitle) => {
            try {
              const levels = await decomposeTasks({
                title: actTitle,
                subject: "Custom",
                due_date: "this week",
                days_until_due: 7
              });
              return { title: actTitle, levels };
            } catch (e) {
              console.error(`Decompose failed for custom activity "${actTitle}":`, e);
              return { title: actTitle, levels: [] };
            }
          })
        )
      ]);
      await supabase.from("weekly_plans").update({ status: "complete" }).eq("status", "active");
      const { data: activePlan, error: planErr } = await supabase.from("weekly_plans").insert({
        user_id: userId,
        week_start_date: weekStartDate,
        goal: goal || "Productive balanced week with custom tracks",
        raw_ai_output: planResult,
        status: "active"
      }).select().single();
      if (planErr) throw planErr;
      const simpleTasksInput = Array.isArray(tasks) ? tasks : [];
      const academicTasksToInsert = simpleTasksInput.map((t) => ({
        title: t.title,
        subject: t.subject,
        due_date: t.due_date,
        branch: "academic",
        estimated_minutes: 25
      }));
      const customTaskTitles = simpleCustomActivities.map((actTitle) => ({
        title: actTitle,
        subject: "Custom",
        due_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        branch: "custom",
        estimated_minutes: 25
      }));
      const finalTasksArray = [...academicTasksToInsert, ...customTaskTitles];
      const taskIds = finalTasksArray.map(() => (0, import_crypto.randomUUID)());
      await supabase.from("levels").delete().eq("user_id", userId);
      await supabase.from("tasks").delete().eq("user_id", userId);
      const tasksToInsert = finalTasksArray.map((t, i) => ({
        ...t,
        id: taskIds[i],
        user_id: userId,
        plan_id: activePlan.id
      }));
      const { data: savedTasks, error: tasksErr } = tasksToInsert.length > 0 ? await supabase.from("tasks").insert(tasksToInsert).select() : { data: [], error: null };
      if (tasksErr) throw tasksErr;
      const finalLevelsArray = [];
      const levelsByTaskIndex = {};
      planResult.levels.forEach((lvl) => {
        const idx = typeof lvl.task_index === "number" ? lvl.task_index : -1;
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
            branch: "academic",
            branch_order: order,
            status: order === 0 ? "active" : "locked",
            skipped: false,
            completed_at: null,
            depth: 0,
            parent_level_id: null
          });
        });
      });
      simpleCustomActivities.forEach((_actTitle, custIdx) => {
        const decomp = customDecompositions[custIdx];
        const taskId = taskIds[academicTasksToInsert.length + custIdx];
        decomp.levels.forEach((lvl, idx) => {
          finalLevelsArray.push({
            task_id: taskId,
            title: lvl.title,
            description: lvl.description,
            estimated_minutes: lvl.estimated_minutes,
            branch: "custom",
            branch_order: idx,
            status: idx === 0 ? "active" : "locked",
            skipped: false,
            completed_at: null,
            depth: 0,
            parent_level_id: null
          });
        });
      });
      const levelsToInsert = finalLevelsArray.map((l) => ({
        ...l,
        user_id: userId,
        estimated_minutes: Math.max(20, Math.min(30, l.estimated_minutes))
      }));
      const { data: savedLevels, error: levelsErr } = levelsToInsert.length > 0 ? await supabase.from("levels").insert(levelsToInsert).select() : { data: [], error: null };
      if (levelsErr) throw levelsErr;
      res.json({ plan: activePlan, tasks: savedTasks || [], levels: savedLevels || [] });
    } catch (err) {
      console.error("AI plan generation route error:", err);
      res.status(500).json({ error: err.message || "Failed to generate weekly schedule." });
    }
  });
  app.post("/api/tasks/decompose", requireAuth, async (req, res) => {
    const { title, subject, due_date, days_until_due } = req.body;
    if (!title || !subject) {
      res.status(400).json({ error: "Task title and subject are required." });
      return;
    }
    try {
      const levels = await decomposeTasks({
        title,
        subject,
        due_date: due_date || "this week",
        days_until_due: days_until_due || 7
      });
      res.json({ levels });
    } catch (err) {
      console.error("AI Task decomposition route error:", err);
      res.status(500).json({ error: err.message || "Failed to decompose task." });
    }
  });
  app.post("/api/tasks/decompose_and_add", requireAuth, async (req, res) => {
    const { title, subject, branch } = req.body;
    const supabase = req.supabase;
    const userId = req.user.id;
    if (!title || !subject || !branch) {
      res.status(400).json({ error: "title, subject, and branch (academic, light, or custom) are required." });
      return;
    }
    try {
      const { data: activePlan, error: planErr } = await supabase.from("weekly_plans").select("*").eq("status", "active").maybeSingle();
      if (planErr) throw planErr;
      if (!activePlan) {
        res.status(400).json({ error: "No active plan found. Please generate a weekly plan first." });
        return;
      }
      const decomposedLevels = await decomposeTasks({
        title,
        subject,
        due_date: "this week",
        days_until_due: 7
      });
      const { data: existingLevels, error: existingErr } = await supabase.from("levels").select("*").eq("user_id", userId);
      if (existingErr) throw existingErr;
      const isCustom = branch === "custom";
      const branchLevels = (existingLevels || []).filter((l) => l.branch === branch && l.depth === 0);
      let highestOrder = -1;
      branchLevels.forEach((l) => {
        if (l.branch_order > highestOrder) highestOrder = l.branch_order;
      });
      const anyActiveInBranch = branchLevels.some((l) => l.status === "active");
      const { data: savedTask, error: taskErr } = await supabase.from("tasks").insert({
        user_id: userId,
        plan_id: activePlan.id,
        title,
        subject,
        due_date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
        branch,
        estimated_minutes: decomposedLevels.reduce((acc, cur) => acc + (cur.estimated_minutes || 25), 0)
      }).select().single();
      if (taskErr) throw taskErr;
      const levelsWithState = decomposedLevels.map((lvl, idx) => {
        const nextOrder = isCustom ? idx : highestOrder + 1 + idx;
        const status = isCustom && idx === 0 || !isCustom && !anyActiveInBranch && idx === 0 ? "active" : "locked";
        return {
          user_id: userId,
          task_id: savedTask.id,
          title: lvl.title || `${subject}: Level ${idx + 1}`,
          description: lvl.description || "",
          estimated_minutes: lvl.estimated_minutes || 25,
          branch,
          branch_order: nextOrder,
          status,
          skipped: false,
          completed_at: null,
          depth: 0,
          parent_level_id: null
        };
      });
      const { data: savedLevels, error: levelsErr } = await supabase.from("levels").insert(levelsWithState).select();
      if (levelsErr) throw levelsErr;
      res.json({ success: true, task: savedTask, levels: savedLevels });
    } catch (err) {
      console.error("AI Decompose & Add route error:", err);
      res.status(500).json({ error: err.message || "Failed to decompose and append task." });
    }
  });
  app.post("/api/levels/:levelId/decompose_further", requireAuth, async (req, res) => {
    const { levelId } = req.params;
    const supabase = req.supabase;
    const userId = req.user.id;
    try {
      const { data: parent, error: parentErr } = await supabase.from("levels").select("*").eq("id", levelId).maybeSingle();
      if (parentErr) throw parentErr;
      if (!parent) {
        res.status(404).json({ error: "Step not found." });
        return;
      }
      if (parent.user_id !== userId) {
        res.status(403).json({ error: "You can only break down steps on your own trail. Fork this journey first." });
        return;
      }
      if (parent.depth >= MAX_NODE_DEPTH) {
        res.json({
          stopped: true,
          message: "This step is about as broken-down as it's useful to go. Give it a shot \u2014 if you're still stuck on a specific part, that's a great moment to look it up or ask a teacher, rather than waiting on another breakdown.",
          levels: []
        });
        return;
      }
      const { data: existingChildren, error: childErr } = await supabase.from("levels").select("*").eq("parent_level_id", levelId).eq("user_id", userId);
      if (childErr) throw childErr;
      if ((existingChildren || []).length > 0) {
        res.json({ stopped: false, message: null, levels: existingChildren });
        return;
      }
      const result = await decomposeNodeFurther({
        title: parent.title,
        description: parent.description || "",
        subject: parent.branch
      });
      if (result.sufficientAlready || result.levels.length === 0) {
        res.json({
          stopped: true,
          message: "This step is already specific enough to just start on. If you get stuck partway through, that's the right time to search it up rather than break it down further.",
          levels: []
        });
        return;
      }
      const newCount = result.levels.length;
      const { data: siblingsAfter, error: siblingsErr } = await supabase.from("levels").select("id, branch_order").eq("branch", parent.branch).eq("user_id", userId).gt("branch_order", parent.branch_order).filter("task_id", parent.task_id === null ? "is" : "eq", parent.task_id);
      if (siblingsErr) throw siblingsErr;
      for (const sibling of siblingsAfter || []) {
        const { error: shiftErr } = await supabase.from("levels").update({ branch_order: sibling.branch_order + newCount }).eq("id", sibling.id);
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
        status: "locked",
        skipped: false,
        completed_at: null,
        depth: parent.depth + 1,
        parent_level_id: parent.id
      }));
      const { data: savedLevels, error: insertErr } = await supabase.from("levels").insert(rows).select();
      if (insertErr) throw insertErr;
      res.json({ stopped: false, message: null, levels: savedLevels || [] });
    } catch (err) {
      console.error("Node breakdown route error:", err);
      res.status(500).json({ error: err.message || "Failed to break this step down further." });
    }
  });
  app.post("/api/preview/decompose_further", requireAuth, async (req, res) => {
    const { title, description, subject, depth } = req.body;
    if (!title) {
      res.status(400).json({ error: "title is required." });
      return;
    }
    if (typeof depth === "number" && depth >= MAX_NODE_DEPTH) {
      res.json({
        stopped: true,
        message: "This step is about as broken-down as it's useful to go. Give it a shot \u2014 if you're still stuck on a specific part, that's a great moment to look it up or ask a teacher, rather than waiting on another breakdown.",
        levels: []
      });
      return;
    }
    try {
      const result = await decomposeNodeFurther({ title, description: description || "", subject: subject || "custom" });
      if (result.sufficientAlready || result.levels.length === 0) {
        res.json({
          stopped: true,
          message: "This step is already specific enough to just start on. If you get stuck partway through, that's the right time to search it up rather than break it down further.",
          levels: []
        });
        return;
      }
      res.json({ stopped: false, message: null, levels: result.levels });
    } catch (err) {
      console.error("Preview breakdown route error:", err);
      res.status(500).json({ error: err.message || "Failed to break this step down further." });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
