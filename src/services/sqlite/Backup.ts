/**
 * Modulo Backup per Kiro Memory.
 *
 * Fornisce funzioni per creare, elencare, ripristinare e ruotare i backup
 * del database SQLite. Utilizza copia diretta del file per compatibilità
 * con WAL mode senza dipendere da API bun:sqlite native.
 *
 * Directory backup: ~/.contextkit/backups/
 * Nome file DB:     backup-YYYY-MM-DD-HHmmss.db
 * Nome metadata:    backup-YYYY-MM-DD-HHmmss.meta.json
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
import type { Database } from 'bun:sqlite';
import { logger } from '../../utils/logger.js';

// ─── Tipi pubblici ───

/** Statistiche del database incluse nel metadata del backup */
export interface BackupStats {
  /** Numero di observations nel DB al momento del backup */
  observations: number;
  /** Numero di sessioni nel DB al momento del backup */
  sessions: number;
  /** Numero di summary nel DB al momento del backup */
  summaries: number;
  /** Numero di prompts nel DB al momento del backup */
  prompts: number;
  /** Dimensione del file DB in byte */
  dbSizeBytes: number;
}

/** Metadata associato a ogni backup */
export interface BackupMetadata {
  /** Timestamp ISO del backup */
  timestamp: string;
  /** Timestamp epoch Unix (ms) */
  timestampEpoch: number;
  /** Versione schema DB (dalla tabella schema_versions) */
  schemaVersion: number;
  /** Statistiche del DB al momento del backup */
  stats: BackupStats;
  /** Percorso assoluto del file DB originale */
  sourcePath: string;
  /** Nome base del file backup (senza directory) */
  filename: string;
}

/** Voce nell'elenco backup (metadata + percorso assoluto) */
export interface BackupEntry {
  /** Percorso assoluto del file .db */
  filePath: string;
  /** Percorso assoluto del file .meta.json */
  metaPath: string;
  /** Metadata del backup */
  metadata: BackupMetadata;
}

// ─── Funzioni interne ───

/**
 * Genera il timestamp formattato per il nome del file.
 * Formato: YYYY-MM-DD-HHmmss-mmm (inclusi millisecondi per unicità)
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
 * Raccoglie le statistiche dal database tramite COUNT(*) sulle tabelle principali.
 * Se una tabella non esiste, il conteggio è 0.
 */
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

/**
 * Legge la versione dello schema dal database.
 * Ritorna 0 se la tabella non esiste.
 */
function getSchemaVersion(db: Database): number {
  try {
    const row = db.query('SELECT MAX(version) as v FROM schema_versions').get() as { v: number } | null;
    return row?.v ?? 0;
  } catch {
    return 0;
  }
}

// ─── API pubblica ───

/**
 * Crea un backup del database SQLite.
 *
 * Copia il file .db e, se presenti in modalità WAL, anche -wal e -shm.
 * Genera il file metadata JSON con versione schema e statistiche.
 *
 * @param dbPath     - Percorso assoluto del file DB sorgente
 * @param backupDir  - Directory dove salvare i backup
 * @param db         - Istanza Database per raccogliere le statistiche
 * @returns BackupEntry con metadata e percorsi dei file creati
 */
export function createBackup(
  dbPath: string,
  backupDir: string,
  db: Database
): BackupEntry {
  // Assicura che la directory esista
  mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const ts = formatTimestamp(now);
  const filename = `backup-${ts}.db`;
  const destPath = join(backupDir, filename);
  const metaFilename = `backup-${ts}.meta.json`;
  const metaPath = join(backupDir, metaFilename);

  // Copia il file principale
  if (!existsSync(dbPath)) {
    throw new Error(`Database non trovato: ${dbPath}`);
  }
  copyFileSync(dbPath, destPath);
  logger.info('BACKUP', `File DB copiato: ${dbPath} → ${destPath}`);

  // Copia WAL e SHM se esistono (modalità WAL di SQLite)
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

  // Raccoglie statistiche e versione schema
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

  // Scrive il file metadata
  writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf8');
  logger.info('BACKUP', `Metadata scritto: ${metaPath}`);

  return {
    filePath: destPath,
    metaPath,
    metadata,
  };
}

/**
 * Elenca i backup presenti nella directory, ordinati dal più recente al più vecchio.
 *
 * Legge i file .meta.json per ottenere i dati strutturati.
 * I backup senza metadata vengono ignorati con un warning.
 *
 * @param backupDir - Directory dove cercare i backup
 * @returns Array di BackupEntry ordinate per timestamp DESC
 */
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

  // Trova tutti i file .meta.json dei backup
  const metaFiles = files.filter(f => f.startsWith('backup-') && f.endsWith('.meta.json'));

  for (const metaFile of metaFiles) {
    const metaPath = join(backupDir, metaFile);
    // Deriva il nome del file DB sostituendo .meta.json con .db
    // Esempio: backup-2026-02-27-150000.meta.json → backup-2026-02-27-150000.db
    const dbFilename = metaFile.replace(/\.meta\.json$/, '.db');
    const filePath = join(backupDir, dbFilename);

    // Legge il metadata
    let metadata: BackupMetadata;
    try {
      const raw = readFileSync(metaPath, 'utf8');
      metadata = JSON.parse(raw) as BackupMetadata;
    } catch (err) {
      logger.warn('BACKUP', `Metadata non leggibile: ${metaPath}`, {}, err as Error);
      continue;
    }

    // Verifica che il file DB esista
    if (!existsSync(filePath)) {
      logger.warn('BACKUP', `File backup mancante per metadata: ${filePath}`);
      continue;
    }

    entries.push({ filePath, metaPath, metadata });
  }

  // Ordina dal più recente al più vecchio
  entries.sort((a, b) => b.metadata.timestampEpoch - a.metadata.timestampEpoch);

  return entries;
}

/**
 * Ripristina il database da un file di backup.
 *
 * Sovrascrive il file DB corrente con il backup selezionato.
 * Ripristina anche -wal e -shm se presenti nel backup.
 *
 * ATTENZIONE: Il database deve essere chiuso prima di chiamare questa funzione,
 * altrimenti la copia potrebbe corrompere il DB.
 *
 * @param backupFile - Percorso assoluto del file .db da ripristinare
 * @param dbPath     - Percorso assoluto del file DB destinazione
 */
export function restoreBackup(backupFile: string, dbPath: string): void {
  if (!existsSync(backupFile)) {
    throw new Error(`File backup non trovato: ${backupFile}`);
  }

  // Copia il file principale
  copyFileSync(backupFile, dbPath);
  logger.info('BACKUP', `Database ripristinato: ${backupFile} → ${dbPath}`);

  // Ripristina WAL e SHM se presenti nel backup
  const walBackup = `${backupFile}-wal`;
  const shmBackup = `${backupFile}-shm`;
  const walDest = `${dbPath}-wal`;
  const shmDest = `${dbPath}-shm`;

  if (existsSync(walBackup)) {
    copyFileSync(walBackup, walDest);
    logger.debug('BACKUP', 'File WAL ripristinato');
  } else if (existsSync(walDest)) {
    // Rimuove il WAL corrente se il backup non ne aveva uno
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

/**
 * Ruota i backup eliminando quelli più vecchi.
 *
 * Mantiene gli ultimi N backup (per timestamp) e rimuove i rimanenti,
 * inclusi i relativi file .meta.json, -wal e -shm.
 *
 * @param backupDir - Directory dove cercare i backup
 * @param maxKeep   - Numero massimo di backup da mantenere
 * @returns Numero di backup eliminati
 */
export function rotateBackups(backupDir: string, maxKeep: number): number {
  if (maxKeep <= 0) {
    throw new Error(`maxKeep deve essere > 0, ricevuto: ${maxKeep}`);
  }

  const entries = listBackups(backupDir);

  // Se non supera il limite, nessuna rotazione necessaria
  if (entries.length <= maxKeep) {
    logger.debug('BACKUP', `Rotazione non necessaria: ${entries.length}/${maxKeep} backup presenti`);
    return 0;
  }

  // I backup da eliminare sono quelli oltre il limite (listBackups è già ordinata DESC)
  const toDelete = entries.slice(maxKeep);
  let deleted = 0;

  for (const entry of toDelete) {
    // Elimina file DB
    try {
      if (existsSync(entry.filePath)) {
        unlinkSync(entry.filePath);
      }
    } catch (err) {
      logger.warn('BACKUP', `Impossibile eliminare: ${entry.filePath}`, {}, err as Error);
    }

    // Elimina file WAL e SHM se presenti
    for (const extra of [`${entry.filePath}-wal`, `${entry.filePath}-shm`]) {
      try {
        if (existsSync(extra)) unlinkSync(extra);
      } catch { /* ignora */ }
    }

    // Elimina metadata
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
