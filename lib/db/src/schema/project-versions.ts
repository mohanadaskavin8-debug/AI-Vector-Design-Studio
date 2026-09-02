import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectVersionsTable = pgTable("project_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  createdBy: text("created_by").notNull(),
  label: text("label"),
  document: jsonb("document").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  revision: integer("revision").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("project_versions_project_idx").on(table.projectId, table.createdAt)]);
export const insertProjectVersionSchema = createInsertSchema(projectVersionsTable).omit({ id: true, createdAt: true });
export type InsertProjectVersion = z.infer<typeof insertProjectVersionSchema>;
export type ProjectVersion = typeof projectVersionsTable.$inferSelect;