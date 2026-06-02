import { execSync } from 'child_process'

const CONTAINER = 'prompt-saviour-pg'
const DB        = 'promptshield_test'
const USER      = 'postgres'

function query(label, sql) {
  if (label) console.log(`\n=== ${label} ===`)
  try {
    execSync(`docker exec ${CONTAINER} psql -U ${USER} -d ${DB} -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'inherit' })
  } catch {
    console.error('Query failed — is the container running? Try: pnpm run db:setup')
    process.exit(1)
  }
}

const customSql = process.argv[2]

if (customSql) {
  query(null, customSql)
} else {
  query('Tenants (check clerk_org_id)', 'SELECT id, name, slug, clerk_org_id FROM tenants;')
  query('Members (check clerk_id and role)', 'SELECT id, email, role, clerk_id FROM members;')
}
