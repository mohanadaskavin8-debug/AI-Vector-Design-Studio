import { index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectPresenceTable = pgTable("project_presence", {
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  clientId: text("client_id").notNull(),
  state: jsonb("state").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId, table.clientId] }),
  index("project_presence_expiry_idx").on(table.expiresAt),
]);
export const insertProjectPresenceSchema = createInsertSchema(projectPresenceTable).omit({ updatedAt: true });
export type InsertProjectPresence = z.infer<typeof insertProjectPresenceSchema>;
export type ProjectPresence = typeof projectPresenceTable.$inferSelect;