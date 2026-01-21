import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Industry research reports table for storing validated report URLs.
 * Manus agent pre-populates this table with real, validated URLs.
 * Quality admission criteria:
 * - Source tier: 1 (券商) > 2 (投行) > 3 (咨询) > 4 (研究机构)
 * - File size >200KB, Page count >15, Year 2020-2025
 * - Must include data/charts/deep analysis
 * - Excludes: 纯目录, 新闻稿, 财报, 摘要, 营销文档
 */
export const industryReports = mysqlTable("industry_reports", {
  id: int("id").autoincrement().primaryKey(),
  
  // Industry identification
  industry: varchar("industry", { length: 100 }).notNull(), // e.g., "现制咖啡", "新能源汽车"
  industryEn: varchar("industryEn", { length: 200 }), // English name for search
  
  // Report metadata
  title: text("title").notNull(),
  url: text("url").notNull(),
  
  // Source information
  sourceName: varchar("sourceName", { length: 100 }).notNull(), // e.g., "中信证券", "艾瑞咨询"
  sourceType: mysqlEnum("sourceType", ["Report", "Web", "WeChat"]).default("Report").notNull(),
  sourceTier: mysqlEnum("sourceTier", ["1", "2", "3", "4", "5"]).default("5").notNull(),
  // Tier 1: 国内头部券商 (广发、天风、国金、中信、招商、华泰、国海、东方)
  // Tier 2: 国外顶级投行 (Morgan Stanley, Goldman Sachs, JP Morgan, etc.)
  // Tier 3: 知名咨询机构 (艾瑞、灼识、久谦、艺恩、德勤、麦肯锡、BCG、贝恩)
  // Tier 4: 行业研究机构 (华经情报网、共研网、智研咨询、观研报告网)
  // Tier 5: Other/Unknown
  
  // Quality metrics
  publicationYear: varchar("publicationYear", { length: 4 }), // e.g., "2024"
  fileSizeKb: int("fileSizeKb"), // File size in KB, must be >200
  pageCount: int("pageCount"), // Page count, must be >15
  
  // Content summary
  insight: text("insight"), // Key insight from this report
  relevance: text("relevance"), // Why this report is relevant
  
  // Validation status
  urlValidated: mysqlEnum("urlValidated", ["pending", "valid", "invalid"]).default("pending").notNull(),
  validatedAt: timestamp("validatedAt"),
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type IndustryReport = typeof industryReports.$inferSelect;
export type InsertIndustryReport = typeof industryReports.$inferInsert;