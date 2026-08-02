import { Activity } from '../../types/index.js';

export interface PlanInput {
  goal: string;
  tasks: Array<{
    title: string;
    subject: string;
    due_date: string;
    branch: 'academic';
  }>;
  protectedActivities: Activity[];
  weekStartDate: string;
}

export interface DecomposeInput {
  title: string;
  subject: string;
  due_date: string;
  days_until_due: number;
}

export interface NodeBreakdownInput {
  title: string;
  description: string;
  subject: string;
}

export function buildPlanPrompt(input: PlanInput): string {
  const prString = input.protectedActivities.map(p => 
    `- ${p.name} (${p.type}): Scheduled on: [${p.days_of_week.join(', ')}] starting at ${p.start_time} for ${p.duration_minutes} minutes.`
  ).join('\n');

  const tasksString = input.tasks.map((t, idx) => 
    `- Task index ${idx}: "${t.title}" (${t.subject}, Due: ${t.due_date})`
  ).join('\n');

  return `You are a high-fidelity scheduling AI assisting high school students.
You are building a personalized "Knavi" weekly planner starting on '${input.weekStartDate}'.

The main goal for the week is: "${input.goal}"

We have protected hours for activities (music, sport, creative hobbies) that are IMMOVABLE constraints, if any are listed below. Treat this list as optional context, not a requirement — plenty of students won't have any.
Do NOT schedule any academic/study tasks during these activity hours. They are locked, so they do NOT need interactive journey levels/nodes.

PROTECTED / LOCKED TIME WINDOWS:
${prString || "None provided — schedule freely."}

STUDENT INPUT TASKS TO DECOMPOSE (each becomes its own trail — this is important):
${tasksString || "None"}

YOUR MISSION:
1. Decompose EACH input task into its own set of 3 to 6 highly specific, granular, and actionable levels (nodes).
   - Do NOT combine multiple input tasks into one shared set of levels — every level belongs to exactly one task.
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

export function buildDecomposePrompt(input: DecomposeInput): string {
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

export function buildNodeBreakdownPrompt(input: NodeBreakdownInput): string {
  return `You are helping a student break ONE existing study step into a couple of smaller, more concrete sub-steps.

PARENT STEP: "${input.title}"
SUBJECT: ${input.subject}
CURRENT DESCRIPTION: "${input.description}"

DIRECTIONS:
1. Produce 2 to 4 sub-steps that make the parent step more concrete and easier to start. Each sub-step should describe a specific, doable action tied directly to the parent step — not a generic restatement of it.
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
