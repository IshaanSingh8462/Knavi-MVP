export type ActivityType = 'sport' | 'music' | 'creative' | 'other';
export type BranchType = 'academic' | 'activity' | 'light' | 'custom';
export type LevelStatus = 'locked' | 'active' | 'complete';
export type WeeklyPlanStatus = 'draft' | 'active' | 'complete';
export type MountainBiome = 'grassy' | 'snowy' | 'rocky' | 'desert' | 'rainforest' | 'savannah' | 'mixed';

export interface User {
  id: string;
  email: string;
  name?: string;
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

export interface PublicJourneyCard {
  task: Task;
  levelCount: number;
}
