import { execSync } from 'child_process'
import { chdir } from 'process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONTAINER = 'prompt-saviour-pg'
const VOLUME    = 'prompt-saviour-pg-data'
const DB        = 'promptshield_test'

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// 1. Stop and remove old container (ignore if it doesn't exist)
try { execSync(`docker rm -f ${CONTAINER}`, { stdio: 'pipe' }) } catch {}

// 2. Start fresh with a named volume so data survives container deletion
run(
  `docker run -d --name ${CONTAINER}` +
  ` -e POSTGRES_PASSWORD=postgres` +
  ` -e POSTGRES_DB=${DB}` +
  ` -p 5432:5432` +
  ` -v ${VOLUME}:/var/lib/postgresql/data` +
  ` postgres:16`
)

// 3. Wait up to 30s for Postgres to accept connections
process.stdout.write('Waiting for Postgres')
let ready = false
for (let i = 0; i < 30; i++) {
  try {
    execSync(`docker exec ${CONTAINER} pg_isready -U postgres`, { stdio: 'pipe' })
    ready = true
    break
  } catch {
    process.stdout.write('.')
    sleep(1000)
  }
}
if (!ready) {
  console.error('\nPostgres did not start in time — check: docker logs prompt-saviour-pg')
  process.exit(1)
}
console.log(' ready!\n')

// 4. Run migrations and seed from the backend directory
chdir(join(__dirname, '..', 'backend'))
run('npm run db:migrate')
run('npm run seed:fintech')

console.log('\n✓ Local DB ready.')
console.log('  Start the backend: cd backend && npm run dev')
