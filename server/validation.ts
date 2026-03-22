// server/validation.ts — Zod-schemata voor alle REST API-invoer
import { z } from "zod";

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const TaskCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  due_date: z.string().datetime({ offset: true }).optional().nullable(),
  priority: z.number().int().min(1).max(4).default(3),
  project_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export const TaskUpdateSchema = TaskCreateSchema.partial();

export type TaskCreate = z.infer<typeof TaskCreateSchema>;
export type TaskUpdate = z.infer<typeof TaskUpdateSchema>;

// ─── Calendar ────────────────────────────────────────────────────────────────

export const EventCreateSchema = z.object({
  title: z.string().min(1).max(255),
  start_at: z.string().datetime({ offset: true }),
  end_at: z.string().datetime({ offset: true }).optional().nullable(),
  description: z.string().optional(),
  location: z.string().optional(),
  recurring_rule: z.string().optional(),
  all_day: z.boolean().default(false),
});

export const EventUpdateSchema = EventCreateSchema.partial();

export type EventCreate = z.infer<typeof EventCreateSchema>;
export type EventUpdate = z.infer<typeof EventUpdateSchema>;

// ─── Notes ───────────────────────────────────────────────────────────────────

export const NoteCreateSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().optional(),
  pinned: z.boolean().default(false),
  thought_id: z.string().uuid().optional().nullable(),
});

export const NoteUpdateSchema = NoteCreateSchema.partial();

export type NoteCreate = z.infer<typeof NoteCreateSchema>;
export type NoteUpdate = z.infer<typeof NoteUpdateSchema>;

// ─── Projects ────────────────────────────────────────────────────────────────

export const ProjectCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  color: z.string().max(20).optional(),
  columns: z.array(z.string()).optional(),
});

export const ProjectUpdateSchema = ProjectCreateSchema.partial();

export const ColumnCreateSchema = z.object({
  name: z.string().min(1).max(100),
  position: z.number().int().min(0).optional(),
});

export const CardCreateSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  column_id: z.string().uuid(),
  position: z.number().int().min(0).default(0),
});

export const CardUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional().nullable(),
});

export const CardMoveSchema = z.object({
  column_id: z.string().uuid(),
  position: z.number().int().min(0),
});

export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
export type ColumnCreate = z.infer<typeof ColumnCreateSchema>;
export type CardCreate = z.infer<typeof CardCreateSchema>;
export type CardUpdate = z.infer<typeof CardUpdateSchema>;
export type CardMove = z.infer<typeof CardMoveSchema>;

// ─── Contacts ────────────────────────────────────────────────────────────────

export const ContactCreateSchema = z.object({
  name: z.string().min(1).max(255),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  company: z.string().max(255).optional().nullable(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export const ContactUpdateSchema = ContactCreateSchema.partial();

export const InteractionCreateSchema = z.object({
  type: z.string().min(1).max(50),
  summary: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type ContactCreate = z.infer<typeof ContactCreateSchema>;
export type ContactUpdate = z.infer<typeof ContactUpdateSchema>;
export type InteractionCreate = z.infer<typeof InteractionCreateSchema>;

// ─── Finances ─────────────────────────────────────────────────────────────────

export const FinanceCreateSchema = z.object({
  amount: z.number().positive(),
  type: z.enum(["income", "expense"]),
  category: z.string().max(100),
  description: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  currency: z.string().max(10).optional(),
  tags: z.array(z.string()).optional(),
  recurring: z.boolean().optional(),
});

export type FinanceCreate = z.infer<typeof FinanceCreateSchema>;

// ─── Health ──────────────────────────────────────────────────────────────────

export const HealthCreateSchema = z.object({
  type: z.string().min(1).max(100),
  value: z.number().optional().nullable(),
  value_text: z.string().optional().nullable(),
  unit: z.string().max(50).optional(),
  notes: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time_of_day: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type HealthCreate = z.infer<typeof HealthCreateSchema>;

// ─── Thoughts ────────────────────────────────────────────────────────────────

export const ThoughtCreateSchema = z.object({
  content: z.string().min(1),
  type: z.string().max(50).optional(),
  topic: z.string().max(255).optional(),
  person: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type ThoughtCreate = z.infer<typeof ThoughtCreateSchema>;

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Retourneert een Hono-compatible 400-response bij validatiefouten. */
export function validationError(issues: z.ZodIssue[]) {
  return {
    error: "Validation failed",
    details: issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}
