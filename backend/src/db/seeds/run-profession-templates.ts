import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { policyTemplates, professionTemplateMap } from '../schema.js'
import { professionTemplates } from './profession_templates.js'
import { eq } from 'drizzle-orm'

const sql = postgres(process.env['DATABASE_URL']!, { max: 1 })
const db = drizzle(sql)

async function seed() {
  console.log('Seeding profession templates...')

  for (const entry of professionTemplates) {
    const templateContent = { subjects: entry.subjects }

    // Upsert: if template with same (profession, followUpAnswer) exists, skip
    const existing = await db
      .select({ id: professionTemplateMap.templateId })
      .from(professionTemplateMap)
      .where(
        eq(professionTemplateMap.profession, entry.profession)
      )

    const existingEntry = existing.find(async (_) => {
      const maps = await db
        .select()
        .from(professionTemplateMap)
        .where(eq(professionTemplateMap.profession, entry.profession))
      return maps.find(m => m.followUpAnswer === entry.followUpAnswer)
    })

    if (existingEntry) {
      console.log(`  SKIP ${entry.profession}/${entry.followUpAnswer} (already exists)`)
      continue
    }

    const [template] = await db
      .insert(policyTemplates)
      .values({ name: entry.name, description: entry.description, policyJson: templateContent })
      .returning()

    if (!template) throw new Error(`Failed to insert template: ${entry.name}`)

    await db.insert(professionTemplateMap).values({
      profession: entry.profession,
      followUpAnswer: entry.followUpAnswer,
      templateId: template.id,
    })

    console.log(`  OK  ${entry.profession}/${entry.followUpAnswer} → ${template.id}`)
  }

  console.log('Done.')
  await sql.end()
}

seed().catch(err => { console.error(err); process.exit(1) })
