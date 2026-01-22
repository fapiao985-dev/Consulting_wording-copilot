import { eq, like, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, industryReports, InsertIndustryReport, IndustryReport } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ============================================
// Industry Reports - Database Helpers
// ============================================

// Quality admission criteria constants
export const QUALITY_CRITERIA = {
  MIN_FILE_SIZE_KB: 200,
  MIN_PAGE_COUNT: 15,
  MIN_YEAR: 2020,
  MAX_YEAR: 2025,
  // Tier 1: 国内头部券商
  TIER_1_SOURCES: ["广发证券", "天风证券", "国金证券", "中信证券", "招商证券", "华泰证券", "国海证券", "东方证券"],
  // Tier 2: 国外顶级投行
  TIER_2_SOURCES: ["Morgan Stanley", "Goldman Sachs", "JP Morgan", "Bank of America", "Credit Suisse"],
  // Tier 3: 知名咨询机构
  TIER_3_SOURCES: ["艾瑞咨询", "灼识咨询", "CIC", "久谦咨询", "艺恩咨询", "德勤", "麦肯锡", "BCG", "贝恩咨询", "Bain"],
  // Tier 4: 行业研究机构
  TIER_4_SOURCES: ["华经情报网", "共研网", "智研咨询", "观研报告网", "中国报告网"],
  // Excluded content types (in title or content)
  EXCLUDED_KEYWORDS: ["目录", "新闻", "通稿", "财报", "摘要", "简报", "营销", "广告", "宣传"],
};

/**
 * Determine source tier based on source name
 */
export function getSourceTier(sourceName: string): "1" | "2" | "3" | "4" | "5" {
  if (QUALITY_CRITERIA.TIER_1_SOURCES.some(s => sourceName.includes(s))) return "1";
  if (QUALITY_CRITERIA.TIER_2_SOURCES.some(s => sourceName.toLowerCase().includes(s.toLowerCase()))) return "2";
  if (QUALITY_CRITERIA.TIER_3_SOURCES.some(s => sourceName.includes(s))) return "3";
  if (QUALITY_CRITERIA.TIER_4_SOURCES.some(s => sourceName.includes(s))) return "4";
  return "5";
}

/**
 * Validate report meets quality admission criteria
 */
export function validateReportQuality(report: {
  title: string;
  sourceName: string;
  publicationYear?: string;
  fileSizeKb?: number;
  pageCount?: number;
}): { valid: boolean; reason?: string } {
  // Check excluded keywords in title
  for (const keyword of QUALITY_CRITERIA.EXCLUDED_KEYWORDS) {
    if (report.title.includes(keyword)) {
      return { valid: false, reason: `Title contains excluded keyword: ${keyword}` };
    }
  }
  
  // Check publication year
  if (report.publicationYear) {
    const year = parseInt(report.publicationYear);
    if (year < QUALITY_CRITERIA.MIN_YEAR || year > QUALITY_CRITERIA.MAX_YEAR) {
      return { valid: false, reason: `Publication year ${year} outside range ${QUALITY_CRITERIA.MIN_YEAR}-${QUALITY_CRITERIA.MAX_YEAR}` };
    }
  }
  
  // Check file size (if provided)
  if (report.fileSizeKb !== undefined && report.fileSizeKb < QUALITY_CRITERIA.MIN_FILE_SIZE_KB) {
    return { valid: false, reason: `File size ${report.fileSizeKb}KB below minimum ${QUALITY_CRITERIA.MIN_FILE_SIZE_KB}KB` };
  }
  
  // Check page count (if provided)
  if (report.pageCount !== undefined && report.pageCount < QUALITY_CRITERIA.MIN_PAGE_COUNT) {
    return { valid: false, reason: `Page count ${report.pageCount} below minimum ${QUALITY_CRITERIA.MIN_PAGE_COUNT}` };
  }
  
  return { valid: true };
}

/**
 * Add a new industry report to the database
 * Validates quality criteria before insertion
 */
export async function addIndustryReport(report: InsertIndustryReport): Promise<{ success: boolean; id?: number; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Database not available" };
  }
  
  // Validate quality criteria
  const validation = validateReportQuality({
    title: report.title,
    sourceName: report.sourceName,
    publicationYear: report.publicationYear ?? undefined,
    fileSizeKb: report.fileSizeKb ?? undefined,
    pageCount: report.pageCount ?? undefined,
  });
  
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }
  
  // Auto-determine source tier if not provided
  const sourceTier = report.sourceTier || getSourceTier(report.sourceName);
  
  try {
    const result = await db.insert(industryReports).values({
      ...report,
      sourceTier,
    });
    
    return { success: true, id: result[0].insertId };
  } catch (error) {
    console.error("[Database] Failed to add industry report:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Normalize industry name for fuzzy matching
 * Removes special characters and diacritics for better matching
 */
function normalizeIndustryName(name: string): string {
  return name
    .normalize('NFD') // Decompose characters with diacritics
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics (ā → a)
    .toLowerCase()
    .trim();
}

/**
 * Get industry reports by industry name
 * Supports fuzzy matching with normalization (e.g., "Mānuka" matches "Manuka")
 */
export async function getIndustryReports(industry: string, limit = 20): Promise<IndustryReport[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get reports: database not available");
    return [];
  }
  
  try {
    // Normalize input for better matching
    const normalizedInput = normalizeIndustryName(industry);
    console.log('[getIndustryReports] Input:', industry, '→ Normalized:', normalizedInput);
    
    // Get all reports and filter in-memory for normalized matching
    // This allows "Mānuka Honey" to match "Manuka Honey" in database
    const allResults = await db
      .select()
      .from(industryReports)
      .where(eq(industryReports.urlValidated, "valid"))
      .orderBy(desc(industryReports.createdAt));
    
    // Filter by normalized name matching
    const filteredResults = allResults.filter(report => {
      const normalizedDbName = normalizeIndustryName(report.industry);
      const matches = normalizedDbName.includes(normalizedInput) || normalizedInput.includes(normalizedDbName);
      if (matches) {
        console.log('[getIndustryReports] Match found:', report.industry, '(normalized:', normalizedDbName, ')');
      }
      return matches;
    });
    
    console.log('[getIndustryReports] Total results:', allResults.length, '→ Filtered:', filteredResults.length);
    return filteredResults.slice(0, limit);
  } catch (error) {
    console.error("[Database] Failed to get industry reports:", error);
    return [];
  }
}

/**
 * Get all reports for an industry (including pending validation)
 */
export async function getAllIndustryReports(industry: string): Promise<IndustryReport[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    return await db
      .select()
      .from(industryReports)
      .where(like(industryReports.industry, `%${industry}%`))
      .orderBy(desc(industryReports.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get all industry reports:", error);
    return [];
  }
}

/**
 * Update report validation status
 */
export async function updateReportValidation(
  id: number, 
  status: "pending" | "valid" | "invalid"
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db
      .update(industryReports)
      .set({ 
        urlValidated: status,
        validatedAt: new Date(),
      })
      .where(eq(industryReports.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to update report validation:", error);
    return false;
  }
}

/**
 * Delete an industry report
 */
export async function deleteIndustryReport(id: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  try {
    await db.delete(industryReports).where(eq(industryReports.id, id));
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete industry report:", error);
    return false;
  }
}

/**
 * List all unique industries in the database
 */
export async function listIndustries(): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  
  try {
    const results = await db
      .selectDistinct({ industry: industryReports.industry })
      .from(industryReports)
      .where(eq(industryReports.urlValidated, "valid"));
    
    return results.map(r => r.industry);
  } catch (error) {
    console.error("[Database] Failed to list industries:", error);
    return [];
  }
}
