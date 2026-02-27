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
    this.db.run('PRAGMA busy_timeout = 5000'); // Attesa fino a 5s su lock concorrente (hook + worker)
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
   * Esegue una funzione all'interno di una transazione atomica.
   * Se fn() lancia un errore, la transazione viene annullata automaticamente.
   */
  withTransaction<T>(fn: (db: Database) => T): T {
    const transaction = this.db.transaction(fn);
    return transaction(this.db);
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
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
      },
      {
        version: 4,
        up: (db) => {
          // Tabella embeddings per ricerca semantica locale
          db.run(`
            CREATE TABLE IF NOT EXISTS observation_embeddings (
              observation_id INTEGER PRIMARY KEY,
              embedding BLOB NOT NULL,
              model TEXT NOT NULL,
              dimensions INTEGER NOT NULL,
              created_at TEXT NOT NULL,
              FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
            )
          `);

          db.run('CREATE INDEX IF NOT EXISTS idx_embeddings_model ON observation_embeddings(model)');
        }
      },
      {
        version: 5,
        up: (db) => {
          // Traccia ultimo accesso (ricerca che ha trovato l'osservazione)
          db.run('ALTER TABLE observations ADD COLUMN last_accessed_epoch INTEGER');
          // Flag stale: 0 = fresh, 1 = file modificato dopo l'osservazione
          db.run('ALTER TABLE observations ADD COLUMN is_stale INTEGER DEFAULT 0');
          // Indice per query decay
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_last_accessed ON observations(last_accessed_epoch)');
          // Indice per query stale
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_stale ON observations(is_stale)');
        }
      },
      {
        version: 6,
        up: (db) => {
          // Tabella checkpoint per session resume
          db.run(`
            CREATE TABLE IF NOT EXISTS checkpoints (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              session_id INTEGER NOT NULL,
              project TEXT NOT NULL,
              task TEXT NOT NULL,
              progress TEXT,
              next_steps TEXT,
              open_questions TEXT,
              relevant_files TEXT,
              context_snapshot TEXT,
              created_at TEXT NOT NULL,
              created_at_epoch INTEGER NOT NULL,
              FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
          `);
          db.run('CREATE INDEX IF NOT EXISTS idx_checkpoints_session ON checkpoints(session_id)');
          db.run('CREATE INDEX IF NOT EXISTS idx_checkpoints_project ON checkpoints(project)');
          db.run('CREATE INDEX IF NOT EXISTS idx_checkpoints_epoch ON checkpoints(created_at_epoch)');
        }
      },
      {
        version: 7,
        up: (db) => {
          // Content hash per deduplicazione basata su contenuto (SHA256)
          db.run('ALTER TABLE observations ADD COLUMN content_hash TEXT');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_hash ON observations(content_hash)');
        }
      },
      {
        version: 8,
        up: (db) => {
          // Token economics: token spesi per generare l'osservazione (discovery cost)
          db.run('ALTER TABLE observations ADD COLUMN discovery_tokens INTEGER DEFAULT 0');
          // Token economics sui summary
          db.run('ALTER TABLE summaries ADD COLUMN discovery_tokens INTEGER DEFAULT 0');
        }
      },
      {
        version: 9,
        up: (db) => {
          // Indici compositi per paginazione e filtri per progetto
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_project_epoch ON observations(project, created_at_epoch DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_observations_project_type ON observations(project, type)');
          db.run('CREATE INDEX IF NOT EXISTS idx_summaries_project_epoch ON summaries(project, created_at_epoch DESC)');
          db.run('CREATE INDEX IF NOT EXISTS idx_prompts_project_epoch ON prompts(project, created_at_epoch DESC)');
        }
      }
    ];
  }
}

// Re-export bun:sqlite Database type
export { Database };
