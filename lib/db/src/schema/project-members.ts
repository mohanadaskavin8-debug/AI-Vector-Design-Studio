import { index, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const projectPermissionEnum = pgEnum("project_permission", ["view", "edit"]);
export const projectMembersTable = pgTable("project_members", {
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  permission: projectPermissionEnum("permission").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [primaryKey({ columns: [table.projectId, table.userId] }), index("project_members_user_idx").on(table.userId)]);
export const insertProjectMemberSchema = createInsertSchema(projectMembersTable).omit({ createdAt: true, updatedAt: true });
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;
export type ProjectMember = typeof projectMembersTable.$inferSelect;