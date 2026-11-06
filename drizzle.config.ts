import { defineConfig } from 'drizzle-kit'

// Solo se usa para GENERAR migraciones (npm run db:generate).
// La app aplica las migraciones en tiempo de ejecución desde src/main/db/client.ts.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true
})
