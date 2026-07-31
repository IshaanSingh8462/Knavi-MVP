export type ActivityType = 'sport' | 'music' | 'creative' | 'other';
export type BranchType = 'academic' | 'activity' | 'light' | 'custom';
export type LevelStatus = 'locked' | 'active' | 'complete';
export type WeeklyPlanStatus = 'draft' | 'active' | 'complete';
export type MountainBiome = 'grassy' | 'snowy' | 'rocky' | 'desert' | 'rainforest' | 'savannah' | 'mixed';

export interface User {
  id: string;
  email: string;
  name?: string;
  // True for a Supabase anonymous-auth session (the "Enter as Guest" flow).
  // Guests never write anything — App.tsx routes them straight to a
  // read-only Public Journeys view instead of onboarding/setup.
  isGuest?: boolean;
}

export interface Activity {
  id: string;
  user_id: string;
  name: string;
  type: ActivityType;
  days_of_week: string[];
  start_time: string;
  duration_minutes: number;
}

export interface WeeklyPlan {
  id: string;
  user_id: string;
  week_start_date: string;
  raw_ai_output?: any;
  status: WeeklyPlanStatus;
  goal?: string;
}

export interface Task {
  id: string;
  user_id: string;
  plan_id: string;
  title: string;
  subject: string;
  due_date: string;
  branch: BranchType;
  estimated_minutes: number;
  is_public: boolean;
  author_name: string | null;
}

export interface Level {
  id: string;
  task_id: string | null;
  user_id: string;
  title: string;
  description: string;
  estimated_minutes: number;
  branch: BranchType;
  branch_order: number;
  status: LevelStatus;
  skipped: boolean;
  completed_at: string | null;
  // Sub-step breakdown tracking. depth 0 = a normal trail node. depth 1+ =
  // a node produced by "Break Down Further" on a depth-1 parent. We cap
  // depth so the app doesn't let a task spiral into infinite micro-steps.
  depth: number;
  parent_level_id: string | null;
}

export interface Streak {
  id: string;
  user_id: string;
  streak_count: number;
  last_active_date: string | null;
  longest_streak: number;
}

// Public Journeys gallery card — a published task plus a count of its steps.
export interface PublicJourneyCard {
  task: Task;
  levelCount: number;
}
