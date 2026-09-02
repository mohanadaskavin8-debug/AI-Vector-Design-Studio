import { bigint, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

export const assetKindEnum = pgEnum("project_asset_kind", ["image", "font", "export", "thumbnail", "other"]);
export const projectAssetsTable = pgTable("project_assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  ownerId: text("owner_id").notNull(),
  objectPath: text("object_path").notNull().unique(),
  kind: assetKindEnum("kind").notNull(),
  name: text("name").notNull(),
  contentType: text("content_type").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index("project_assets_project_idx").on(table.projectId)]);
export const insertProjectAssetSchema = createInsertSchema(projectAssetsTable).omit({ id: true, createdAt: true });
export type InsertProjectAsset = z.infer<typeof insertProjectAssetSchema>;
export type ProjectAsset = typeof projectAssetsTable.$inferSelect;