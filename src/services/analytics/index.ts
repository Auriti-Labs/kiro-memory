/**
 * Analytics module for Total Recall.
 * Exports anomaly detection and statistical helpers.
 */

export { AnomalyDetector } from './AnomalyDetector.js';
export type { Anomaly, AnomalyType, ProjectBaseline } from './AnomalyDetector.js';
export { mean, stdDev } from './AnomalyDetector.js';
