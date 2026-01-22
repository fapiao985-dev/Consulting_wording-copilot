import { db } from './server/db.js';
import { industryReports } from './drizzle/schema.js';
import { like, or } from 'drizzle-orm';

const reports = await db.select().from(industryReports).where(
  or(
    like(industryReports.industry, '%Manuka%'),
    like(industryReports.industry, '%Mānuka%'),
    like(industryReports.industry, '%manuka%')
  )
);

console.log('Found', reports.length, 'Manuka Honey reports:');
reports.forEach(r => {
  console.log('-', r.title, '(' + r.source_name + ',', r.publication_year + ')');
});
