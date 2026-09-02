import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectPermissionEnum } from "./project-members";
import { projectsTable } from "./projects";

export const projectShareLinksTable = pgTable("project_share_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  permission: projectPermissionEnum("permission").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("project_share_links_project_idx").on(table.projectId)]);
export const insertProjectShareLinkSchema = createInsertSchema(projectShareLinksTable).omit({ id: true, createdAt: true });
export type InsertProjectShareLink = z.infer<typeof insertProjectShareLinkSchema>;
export type ProjectShareLink = typeof projectShareLinksTable.$inferSelect;