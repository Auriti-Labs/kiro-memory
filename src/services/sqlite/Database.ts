import { Database } from 'bun:sqlite';
import { DATA_DIR, DB_PATH, ensureDir } from '../../shared/paths.js';
import { logger } from '../../utils/logger.js';

// SQLite configuration constants
const SQLITE_MMAP_SIZE_BYTES = 256 * 1024 * 1024; // 256MB
const SQLITE_CACHE_SIZE_PAGES = 10_000;

export interface Migration {
  version: number;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

let dbInstance: Database | null = null;

/**
 * KiroMemoryDatabase - Main entry point for the sqlite module
 *
 * Sets up bun:sqlite with optimized settings and runs all migrations.
 *
 * Usage:
 *   const db = new KiroMemoryDatabase();  // uses default DB_PATH
 *   const db = new KiroMemoryDatabase('/path/to/db.sqlite');
 *   const db = new KiroMemoryDatabase(':memory:');  // for tests
 */
export class KiroMemoryDatabase {
  public db: Database;

  /**
   * @param dbPath - Percorso al file SQLite (default: DB_PATH)
   * @param skipMigrations - Se true, salta il migration runner (per hook ad alta frequenza)
   */
  constructor(dbPath: string = DB_PATH, skipMigrations: boolean = false) {
    // Ensure data directory exists (skip for in-memory databases)
    if (dbPath !== ':memory:') {
      ensureDir(DATA_DIR);
    }

    // Create database connection
    this.db = new Database(dbPath, { create: true, readwrite: true });

    // Apply optimized SQLite settings
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA synchronous = NORMAL');
    this.db.run('PRAGMA foreign_keys = ON');
    this.db.run('PRAGMA temp_store = memory');
    this.db.run(`PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);
    this.db.run(`PRAGMA cache_size = ${SQLITE_CACHE_SIZE_PAGES}`);

    // Esegui migrazioni solo se necessario (i hook le saltano per performance)
    if (!skipMigrations) {
      const migrationRunner = new MigrationRunner(this.db);
      migrationRunner.runAllMigrations();
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}

/**
 * SQLite Database singleton with migration support
 * @deprecated Use KiroMemoryDatabase instead for new code
 */
export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: Database | null = null;
  private migrations: Migration[] = [];

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Register a migration to be run during initialization
   */
  registerMigration(migration: Migration): void {
    this.migrations.push(migration);
    this.migrations.sort((a, b) => a.version - b.version);
  }

  /**
   * Initialize database connection with optimized settings
   */
  async initialize(): Promise<Database> {
    if (this.db) {
      return this.db;
    }

    ensureDir(DATA_DIR);

    this.db = new Database(DB_PATH, { create: true, readwrite: true });

    // Apply optimized SQLite settings
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA synchronous = NORMAL');
    this.db.run('PRAGMA foreign_keys = ON');
    this.db.run('PRAGMA temp_store = memory');
    this.db.run(`PRAGMA mmap_size = ${SQLITE_MMAP_SIZE_BYTES}`);
    this.db.run(`PRAGMA cache_size = ${SQLITE_CACHE_SIZE_PAGES}`);

    // Initialize schema_versions table
    this.initializeSchemaVersions();

    // Run migrations
    await this.runMigrations();

    dbInstance = this.db;
    return this.db;
  }

  /**
   * Get the current database connection
   */
  getConnection(): Database {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Execute a function within a transaction
   */
  withTransaction<T>(fn: (db: Database) => T): T {
    const db = this.getConnection();
    const transaction = db.transaction(fn);
    return transaction(db);
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      dbInstance = null;
    }
  }

  /**
   * Initialize the schema_versions table
   */
  private initializeSchemaVersions(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);
  }

  /**
   * Run all pending migrations
   */
  private async runMigrations(): Promise<void> {
    if (!this.db) return;

    const query = this.db.query('SELECT version FROM schema_versions ORDER BY version');
    const appliedVersions = query.all().map((row: any) => row.version);

    const maxApplied = appliedVersions.length > 0 ? Math.max(...appliedVersions) : 0;

    for (const migration of this.migrations) {
      if (migration.version > maxApplied) {
        logger.info('DB', `Applying migration ${migration.version}`);

        const transaction = this.db.transaction(() => {
          migration.up(this.db!);

          const insertQuery = this.db!.query('INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)');
          insertQuery.run(migration.version, new Date().toISOString());
        });

        transaction();
        logger.info('DB', `Migration ${migration.version} applied successfully`);
      }
    }
  }

  /**
   * Get current schema version
   */
  getCurrentVersion(): number {
    if (!this.db) return 0;

    const query = this.db.query('SELECT MAX(version) as version FROM schema_versions');
    const result = query.get() as { version: number } | undefined;

    return result?.version || 0;
  }
}

/**
 * Migration runner for Kiro Memory
 */
class MigrationRunner {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  runAllMigrations(): void {
    // Create schema_versions table if not exists
    this.db.run(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        id INTEGER PRIMARY KEY,
        version INTEGER UNIQUE NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    // Get current version
    const versionQuery = this.db.query('SELECT MAX(version) as version FROM schema_versions');
    const result = versionQuery.get() as { version: number } | null;
    const currentVersion = result?.version || 0;

    // Run migrations
    const migrations = this.getMigrations();
    for (const migration of migrations) {
      if (migration.version > currentVersion) {
        logger.info('DB', `Applying migration ${migration.version}`);
        
        const transaction = this.db.transaction(() => {
          migration.up(this.db);
          const insert = this.db.query('INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)');
          insert.run(migration.version, new Date().toISOString());
        });
        
        transaction();
        logger.info('DB', `Migration ${migration.version} applied successfully`);
      }
    }
  }

  private getMigrations(): Migration[] {
    return [
      {
        version: 1,
        up: (db) => {
          // Sessions table
          db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL UNIQUE,
              project TEXT NOT NULL,
              user_prompt TEXT NOT NULL,
              memory_session_id TEXT,
              status TEXT DEFAULT 'active',
              started_at TEXT NOT NULL,
              started_at_epoch INTEGER NOT NULL,
              completed_at TEXT,
              completed_at_epoch INTEGER
            )
          `);

          // Observations table
          db.run(`
            CREATE TABLE IF NOT EXISTS observations (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              memory_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              type TEXT NOT NULL,
              title TEXT NOT NULL,
              subtitle TEXT,
              text TEXT,
              narrative TEXT,
              facts TEXT,
              concepts TEXT,
              files_read TEXT,
              files_modified TEXT,
              prompt_number INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);

          // Summaries table
          db.run(`
            CREATE TABLE IF NOT EXISTS summaries (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              request TEXT,
              investigated TEXT,
              learned TEXT,
              completed TEXT,
              next_steps TEXT,
              notes TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);

          // Prompts table
          db.run(`
            CREATE TABLE IF NOT EXISTS prompts (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              project TEXT NOT NULL,
              prompt_number INTEGER NOT NULL,
              prompt_text TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);

          // Pending messages table
          db.run(`
            CREATE TABLE IF NOT EXISTS pending_messages (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              content_session_id TEXT NOT NULL,
              type TEXT NOT NULL,
              data TEXT NOT NULL,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL
            )
          `);

          // Indexes
          db.run('CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_project ON observations(project)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_session ON observations(memory_session_id)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_session ON summaries(session_id)');
          db.run('CREATE INDEX IF NOT EXISTS idx_prompts_session ON prompts(content_session_id)');
        }
      },
      {
        version: 2,
        up: (db) => {
          // Tabella FTS5 per ricerca full-text sulle osservazioni
          db.run(`
            CREATE VIRTUAL TABLE IF NOT EXISTS observations_fts USING fts5(
              title, text, narrative, concepts,
              content='observations',
              content_rowid='id'
            )
          `);

          // Trigger per mantenere FTS5 sincronizzato
          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ai AFTER INSERT ON observations BEGIN
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);

          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_ad AFTER DELETE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
            END
          `);

          db.run(`
            CREATE TRIGGER IF NOT EXISTS observations_au AFTER UPDATE ON observations BEGIN
              INSERT INTO observations_fts(observations_fts, rowid, title, text, narrative, concepts)
              VALUES ('delete', old.id, old.title, old.text, old.narrative, old.concepts);
              INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
              VALUES (new.id, new.title, new.text, new.narrative, new.concepts);
            END
          `);

          // Backfill osservazioni esistenti nella tabella FTS5
          db.run(`
            INSERT INTO observations_fts(rowid, title, text, narrative, concepts)
            SELECT id, title, text, narrative, concepts FROM observations
          `);

          // Indici aggiuntivi per performance di ricerca
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_epoch ON observations(created_at_epoch)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_epoch ON summaries(created_at_epoch)');
          db.run('CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project)');
        }
      },
      {
        version: 3,
        up: (db) => {
          // Tabella alias per rinominare i progetti nella UI
          db.run(`
            CREATE TABLE IF NOT EXISTS project_aliases (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_name TEXT NOT NULL UNIQUE,
              display_name TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
          `);

          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_project_aliases_name ON project_aliases(project_name)');
        }
      }
    ];
  }
}

/**
 * Get the global database instance
 */
export function getDatabase(): Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call DatabaseManager.getInstance().initialize() first.');
  }
  return dbInstance;
}

/**
 * Initialize and get database manager
 */
export async function initializeDatabase(): Promise<Database> {
  const manager = DatabaseManager.getInstance();
  return await manager.initialize();
}

// Re-export bun:sqlite Database type
export { Database };
