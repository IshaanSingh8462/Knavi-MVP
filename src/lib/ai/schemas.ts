import { z } from 'zod';

export const LevelSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  estimated_minutes: z.number().int().min(20).max(30),
  branch: z.enum(['academic', 'activity', 'light', 'custom']),
  branch_order: z.number().int().nonnegative(),
  task_index: z.number().int().nonnegative().optional()
});

export const WeeklyPlanSchema = z.object({
  goal: z.string().optional(),
  levels: z.array(LevelSchema)
});

export const LevelsArraySchema = z.array(LevelSchema);

export const NodeBreakdownResponseSchema = z.object({
  sufficientAlready: z.boolean().optional().default(false),
  levels: z.array(LevelSchema).max(4)
});

export type DecodedLevel = z.infer<typeof LevelSchema>;
export type DecodedPlan = z.infer<typeof WeeklyPlanSchema>;
export type DecodedNodeBreakdown = z.infer<typeof NodeBreakdownResponseSchema>;
