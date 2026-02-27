/**
 * Automatic observation categorizer.
 * Assigns semantic categories based on keyword rules.
 * Categories: architecture, debugging, refactoring, feature-dev, testing, docs, config, security, general
 */

export type ObservationCategory =
  | 'architecture'
  | 'debugging'
  | 'refactoring'
  | 'feature-dev'
  | 'testing'
  | 'docs'
  | 'config'
  | 'security'
  | 'general';

interface CategoryRule {
  category: ObservationCategory;
  /** Keywords in title/text that strongly indicate this category */
  keywords: string[];
  /** Observation types that indicate this category */
  types?: string[];
  /** File patterns in files_modified/files_read */
  filePatterns?: RegExp[];
  /** Priority weight (higher = wins in tie) */
  weight: number;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: 'security',
    keywords: [
      'security', 'vulnerability', 'cve', 'xss', 'csrf', 'injection',
      'sanitize', 'escape', 'auth', 'authentication', 'authorization',
      'permission', 'helmet', 'cors', 'rate-limit', 'token', 'encrypt',
      'decrypt', 'secret', 'redact', 'owasp',
    ],
    filePatterns: [/security/i, /auth/i, /secrets?\.ts/i],
    weight: 10,
  },
  {
    category: 'testing',
    keywords: [
      'test', 'spec', 'expect', 'assert', 'mock', 'stub', 'fixture',
      'coverage', 'jest', 'vitest', 'bun test', 'unit test',
      'integration test', 'e2e',
    ],
    types: ['test'],
    filePatterns: [/\.test\./i, /\.spec\./i, /tests?\//i, /__tests__/i],
    weight: 8,
  },
  {
    category: 'debugging',
    keywords: [
      'debug', 'fix', 'bug', 'error', 'crash', 'stacktrace', 'stack trace',
      'exception', 'breakpoint', 'investigate', 'root cause', 'troubleshoot',
      'diagnose', 'bisect', 'regression',
    ],
    types: ['bugfix'],
    weight: 8,
  },
  {
    category: 'architecture',
    keywords: [
      'architect', 'design', 'pattern', 'modular', 'migration',
      'schema', 'database', 'api design', 'abstract',
      'dependency injection', 'singleton', 'factory', 'observer', 'middleware',
      'pipeline', 'microservice', 'monolith',
    ],
    types: ['decision', 'constraint'],
    weight: 7,
  },
  {
    category: 'refactoring',
    keywords: [
      'refactor', 'rename', 'extract', 'inline', 'move', 'split', 'merge',
      'simplify', 'cleanup', 'clean up', 'dead code', 'consolidate',
      'reorganize', 'restructure', 'decouple',
    ],
    weight: 6,
  },
  {
    category: 'config',
    keywords: [
      'config', 'configuration', 'env', 'environment', 'dotenv', '.env',
      'settings', 'tsconfig', 'eslint', 'prettier', 'webpack', 'vite',
      'esbuild', 'docker', 'ci/cd', 'github actions', 'deploy', 'build',
      'bundle', 'package.json',
    ],
    filePatterns: [
      /\.config\./i, /\.env/i, /tsconfig/i, /\.ya?ml/i,
      /Dockerfile/i, /docker-compose/i,
    ],
    weight: 5,
  },
  {
    category: 'docs',
    keywords: [
      'document', 'readme', 'changelog', 'jsdoc', 'comment', 'explain',
      'guide', 'tutorial', 'api doc', 'openapi', 'swagger',
    ],
    types: ['docs'],
    filePatterns: [/\.md$/i, /docs?\//i, /readme/i, /changelog/i],
    weight: 5,
  },
  {
    category: 'feature-dev',
    keywords: [
      'feature', 'implement', 'add', 'create', 'new', 'endpoint', 'component',
      'module', 'service', 'handler', 'route', 'hook', 'plugin', 'integration',
    ],
    types: ['feature', 'file-write'],
    weight: 3, // lowest — generic catch-all for development
  },
];

/**
 * Categorize an observation based on its content.
 * Returns the best matching category, or 'general' if no strong match.
 */
export function categorize(input: {
  type: string;
  title: string;
  text?: string | null;
  narrative?: string | null;
  concepts?: string | null;
  filesModified?: string | null;
  filesRead?: string | null;
}): ObservationCategory {
  const scores: Map<ObservationCategory, number> = new Map();

  // Combine searchable text (lowercase for case-insensitive matching)
  const searchText = [
    input.title,
    input.text || '',
    input.narrative || '',
    input.concepts || '',
  ].join(' ').toLowerCase();

  const allFiles = [input.filesModified || '', input.filesRead || ''].join(',');

  for (const rule of CATEGORY_RULES) {
    let score = 0;

    // Keyword matching (each match adds the rule's weight)
    for (const kw of rule.keywords) {
      if (searchText.includes(kw.toLowerCase())) {
        score += rule.weight;
      }
    }

    // Type matching (strong signal)
    if (rule.types && rule.types.includes(input.type)) {
      score += rule.weight * 2;
    }

    // File pattern matching
    if (rule.filePatterns && allFiles) {
      for (const pattern of rule.filePatterns) {
        if (pattern.test(allFiles)) {
          score += rule.weight;
        }
      }
    }

    if (score > 0) {
      scores.set(rule.category, (scores.get(rule.category) || 0) + score);
    }
  }

  // Find the highest scoring category
  let bestCategory: ObservationCategory = 'general';
  let bestScore = 0;

  for (const [category, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * Get all available categories.
 */
export function getCategories(): ObservationCategory[] {
  return [
    'architecture', 'debugging', 'refactoring', 'feature-dev',
    'testing', 'docs', 'config', 'security', 'general',
  ];
}
