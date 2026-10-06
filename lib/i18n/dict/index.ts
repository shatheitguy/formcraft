// Translation dictionaries, split by area so they can be maintained independently.
// Keys are the exact English source strings passed to t().
import auth from './auth';
import builder from './builder';
import core from './core';
import hub from './hub';
import settings from './settings';
import submissions from './submissions';

export type Dict = Record<string, string>;
export interface AreaDict {
  ar: Dict;
  ta: Dict;
}

const AREAS: AreaDict[] = [core, auth, hub, builder, submissions, settings];

export const DICTIONARIES: Record<'ar' | 'ta', Dict> = {
  ar: Object.assign({}, ...AREAS.map((a) => a.ar)),
  ta: Object.assign({}, ...AREAS.map((a) => a.ta)),
};
