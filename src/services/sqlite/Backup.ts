/**
 * Modulo Backup per Total Recall.
 *
 * Fornisce funzioni per creare, elencare, ripristinare e ruotare i backup
 * del database SQLite. Utilizza copia diretta del file per compatibilità
 * con WAL mode senza dipendere da API bun:sqlite native.
 *
 * Directory backup: ~/.totalrecall/backups/ (legacy installs may still resolve from ~/.contextkit/backups/)
 * Nome file DB:     backup-YYYY-MM-DD-HHmmss-mmm.db
 * Nome metadata:    backup-YYYY-MM-DD-HHmmss-mmm.meta.json
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join, basename } from 'path';
import type { Database } from '../../db/types.js';
import { logger } from '../../utils/logger.js';

// ─── Tipi pubblici ───

/** Statistiche del database incluse nel metadata del backup */
export interface BackupStats {
  observations: number;
  sessions: number;
  summaries: number;
  prompts: number;
  dbSizeBytes: number;
}

/** Metadata associato a ogni backup */
export interface BackupMetadata {
  timestamp: string;
  timestampEpoch: number;
  schemaVersion: number;
  stats: BackupStats;
  sourcePath: string;
  filename: string;
}

/** Voce nell'elenco backup (metadata + percorso assoluto) */
export interface BackupEntry {
  filePath: string;
  metaPath: string;
  metadata: BackupMetadata;
}

// ─── Funzioni interne ───

/**
 * Genera il timestamp formattato per il nome del file.
 * Formato: YYYY-MM-DD-HHmmss-mmm.
 */
function formatTimestamp(date: Date): string {
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const mins = pad(date.getMinutes());
  const secs = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);
  return `${year}-${month}-${day}-${hours}${mins}${secs}-${ms}`;
}

/**
 * Risolve un nome backup univoco.
 *
 * Se più backup vengono creati nello stesso millisecondo, avanza di 1ms
 * finché trova una coppia .db/.meta.json non ancora esistente. Questo rende
 * il naming collision-safe e mantiene un ordinamento cronologico stabile.
 */
function resolveUniqueBackupTarget(backupDir: string, baseDate: Date): {
  date: Date;
  filename: string;
  filePath: string;
  metaPath: string;
} {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const date = new Date(baseDate.getTime() + attempt);
    const ts = formatTimestamp(date);
    const filename = `backup-${ts}.db`;
    const filePath = join(backupDir, filename);
    const metaPath = join(backupDir, `backup-${ts}.meta.json`);

    if (!existsSync(filePath) && !existsSync(metaPath)) {
      return { date, filename, filePath, metaPath };
    }
  }

  throw new Error(`Impossibile risolvere un nome backup univoco in ${backupDir}`);
}

function collectStats(db: Database, dbPath: string): BackupStats {
  const countTable = (table: string): number => {
    try {
      const row = db.query(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number } | null;
      return row?.c ?? 0;
    } catch {
      return 0;
    }
  };

  const dbSizeBytes = existsSync(dbPath) ? statSync(dbPath).size : 0;

  return {
    observations: countTable('observations'),
    sessions: countTable('sessions'),
    summaries: countTable('summaries'),
    prompts: countTable('prompts'),
    dbSizeBytes,
  };
}

function getSchemaVersion(db: Database): number {
  try {
    const row = db.query('SELECT MAX(version) as v FROM schema_versions').get() as { v: number } | null;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

// ─── API pubblica ───

export function createBackup(
  dbPath: string,
  backupDir: string,
  db: Database
): BackupEntry {
  mkdirSync(backupDir, { recursive: true });

  const { date: now, filename, filePath: destPath, metaPath } = resolveUniqueBackupTarget(backupDir, new Date());

  if (!existsSync(dbPath)) {
    throw new Error(`Database non trovato: ${dbPath}`);
  }
  copyFileSync(dbPath, destPath);
  logger.info('BACKUP', `File DB copiato: ${dbPath} → ${destPath}`);

  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  if (existsSync(walPath)) {
    copyFileSync(walPath, `${destPath}-wal`);
    logger.debug('BACKUP', 'File WAL copiato');
  }
  if (existsSync(shmPath)) {
    copyFileSync(shmPath, `${destPath}-shm`);
    logger.debug('BACKUP', 'File SHM copiato');
  }

  const stats = collectStats(db, dbPath);
  const schemaVersion = getSchemaVersion(db);

  const metadata: BackupMetadata = {
    timestamp: now.toISOString(),
    timestampEpoch: now.getTime(),
    schemaVersion,
    stats,
    sourcePath: dbPath,
    filename,
  };

  writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  logger.info('BACKUP', `Metadata scritto: ${metaPath}`);

  return {
    filePath: destPath,
    metaPath,
    metadata,
  };
}

export function listBackups(backupDir: string): BackupEntry[] {
  if (!existsSync(backupDir)) {
    return [];
  }

  const entries: BackupEntry[] = [];

  let files: string[];
  try {
    files = readdirSync(backupDir);
  } catch (err) {
    logger.warn('BACKUP', `Impossibile leggere la directory backup: ${backupDir}`, {}, err as Error);
    return [];
  }

  const metaFiles = files.filter(f => f.startsWith('backup-') && f.endsWith('.meta.json'));

  for (const metaFile of metaFiles) {
    const metaPath = join(backupDir, metaFile);
    const dbFilename = metaFile.replace(/\.meta\.json$/, '.db');
    const filePath = join(backupDir, dbFilename);

    let metadata: BackupMetadata;
    try {
      const raw = readFileSync(metaPath, 'utf8');
      metadata = JSON.parse(raw) as BackupMetadata;
    } catch (err) {
      logger.warn('BACKUP', `Metadata non leggibile: ${metaPath}`, {}, err as Error);
      continue;
    }

    if (!existsSync(filePath)) {
      logger.warn('BACKUP', `File backup mancante per metadata: ${filePath}`);
      continue;
    }

    entries.push({ filePath, metaPath, metadata });
  }

  entries.sort((a, b) => b.metadata.timestampEpoch - a.metadata.timestampEpoch);
  return entries;
}

export function restoreBackup(backupFile: string, dbPath: string): void {
  if (!existsSync(backupFile)) {
    throw new Error(`File backup non trovato: ${backupFile}`);
  }

  copyFileSync(backupFile, dbPath);
  logger.info('BACKUP', `Database ripristinato: ${backupFile} → ${dbPath}`);

  const walBackup = `${backupFile}-wal`;
  const shmBackup = `${backupFile}-shm`;
  const walDest = `${dbPath}-wal`;
  const shmDest = `${dbPath}-shm`;

  if (existsSync(walBackup)) {
    copyFileSync(walBackup, walDest);
    logger.debug('BACKUP', 'File WAL ripristinato');
  } else if (existsSync(walDest)) {
    unlinkSync(walDest);
    logger.debug('BACKUP', 'File WAL corrente rimosso (non presente nel backup)');
  }

  if (existsSync(shmBackup)) {
    copyFileSync(shmBackup, shmDest);
    logger.debug('BACKUP', 'File SHM ripristinato');
  } else if (existsSync(shmDest)) {
    unlinkSync(shmDest);
    logger.debug('BACKUP', 'File SHM corrente rimosso (non presente nel backup)');
  }
}

export function rotateBackups(backupDir: string, maxKeep: number): number {
  if (maxKeep <= 0) {
    throw new Error(`maxKeep deve essere > 0, ricevuto: ${maxKeep}`);
  }

  const entries = listBackups(backupDir);

  if (entries.length <= maxKeep) {
    logger.debug('BACKUP', `Rotazione non necessaria: ${entries.length}/${maxKeep} backup presenti`);
    return 0;
  }

  const toDelete = entries.slice(maxKeep);
  let deleted = 0;

  for (const entry of toDelete) {
    try {
      if (existsSync(entry.filePath)) {
        unlinkSync(entry.filePath);
      }
    } catch (err) {
      logger.warn('BACKUP', `Impossibile eliminare: ${entry.filePath}`, {}, err as Error);
    }

    for (const extra of [`${entry.filePath}-wal`, `${entry.filePath}-shm`]) {
      try {
        if (existsSync(extra)) unlinkSync(extra);
      } catch {
        /* ignora */
      }
    }

    try {
      if (existsSync(entry.metaPath)) {
        unlinkSync(entry.metaPath);
      }
    } catch (err) {
      logger.warn('BACKUP', `Impossibile eliminare metadata: ${entry.metaPath}`, {}, err as Error);
    }

    logger.info('BACKUP', `Backup rimosso (rotazione): ${basename(entry.filePath)}`);
    deleted++;
  }

  logger.info('BACKUP', `Rotazione completata: ${deleted} backup eliminati, ${maxKeep} mantenuti`);
  return deleted;
}
