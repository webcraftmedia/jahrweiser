import { datetime, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

export const syncState = mysqlTable('sync_state', {
  collectionUrl: varchar('collection_url', { length: 500 }).primaryKey(),
  syncToken: varchar('sync_token', { length: 255 }),
  lastSyncedAt: datetime('last_synced_at'),
  runningSince: datetime('running_since'),
})

export type SyncState = typeof syncState.$inferSelect
export type NewSyncState = typeof syncState.$inferInsert
