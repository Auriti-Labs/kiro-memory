declare const __TOTALRECALL_VERSION__: string | undefined;

const FALLBACK_VERSION = '4.0.1';

export const TOTALRECALL_VERSION =
  typeof __TOTALRECALL_VERSION__ !== 'undefined' && __TOTALRECALL_VERSION__
    ? __TOTALRECALL_VERSION__
    : FALLBACK_VERSION;
