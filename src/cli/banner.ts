/**
 * Banner ASCII art con gradient ANSI per Kiro Memory
 * Output finale dopo installazione — zero dipendenze esterne
 */

/* Palette gradient violet → blue (colori brand) */
const G = [
  '\x1b[38;5;135m',  // viola
  '\x1b[38;5;99m',   // viola-blu
  '\x1b[38;5;63m',   // indaco
  '\x1b[38;5;33m',   // blu
  '\x1b[38;5;39m',   // blu chiaro
  '\x1b[38;5;44m',   // ciano
];
const R = '\x1b[0m';       // reset
const B = '\x1b[1m';       // bold
const D = '\x1b[2m';       // dim
const U = '\x1b[4m';       // underline
const GRN = '\x1b[32m';    // verde
const CYN = '\x1b[36m';    // ciano

/* Logo ASCII art — 6 righe per il gradient */
const LOGO = [
  ' ██╗  ██╗██╗██████╗  ██████╗ ',
  ' ██║ ██╔╝██║██╔══██╗██╔═══██╗',
  ' █████╔╝ ██║██████╔╝██║   ██║',
  ' ██╔═██╗ ██║██╔══██╗██║   ██║',
  ' ██║  ██╗██║██║  ██║╚██████╔╝',
  ' ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝ ╚═════╝',
];

const MEMORY_TAG = '          M E M O R Y';
const LINE = '─'.repeat(48);

export interface BannerOptions {
  editor: string;         // "Kiro CLI", "Claude Code", "Cursor", ecc.
  version: string;        // "1.8.1"
  dashboardUrl: string;   // "http://localhost:3001"
  dataDir: string;        // "~/.contextkit"
  configPaths: string[];  // percorsi config installati
}

/** Rileva se il terminale supporta i colori */
function supportsColor(): boolean {
  if (process.env.NO_COLOR || process.env.TERM === 'dumb') return false;
  return process.stdout.isTTY ?? false;
}

export function printBanner(opts: BannerOptions): void {
  const color = supportsColor();

  /* Helper: applica colore solo se supportato */
  const c = (code: string, text: string) => color ? `${code}${text}${R}` : text;

  console.log('');

  /* Logo con gradient per riga */
  for (let i = 0; i < LOGO.length; i++) {
    console.log(`  ${c(G[i], LOGO[i])}`);
  }
  console.log(`  ${c(`${G[G.length - 1]}${B}`, MEMORY_TAG)}`);
  console.log('');
  console.log(`  ${c(D, LINE)}`);
  console.log('');

  /* Riepilogo installazione */
  console.log(`  ${c(`${GRN}${B}`, '✓ Installation complete!')}  v${opts.version}`);
  console.log(`  ${c(D, `Editor: ${opts.editor}`)}`);
  console.log('');

  /* Cosa è stato installato */
  console.log(`  ${c(`${CYN}${B}`, 'Installed:')}`);
  for (const p of opts.configPaths) {
    console.log(`    ${c(D, '→')} ${p}`);
  }
  console.log(`    ${c(D, '→')} Data: ${opts.dataDir}`);
  console.log('');

  /* Dashboard link — ben visibile */
  console.log(`  ${c(`${CYN}${B}`, 'Dashboard:')}  ${c(U, opts.dashboardUrl)}`);
  console.log(`  ${c(D, 'Docs:       https://auritidesign.it/docs/kiro-memory/')}`);
  console.log('');

  /* Tagline motivazionale */
  console.log(`  ${c(D, LINE)}`);
  console.log(`  ${c(G[2], 'Your AI assistant now has persistent memory.')}`);
  console.log(`  ${c(G[3], 'Every session builds on the last.')}`);
  console.log(`  ${c(D, LINE)}`);
  console.log('');
}
