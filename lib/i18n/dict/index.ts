// Translation dictionaries, split by area so they can be maintained independently.
// Keys are the exact English source strings passed to t().
import activity from './activity';
import auth from './auth';
import builder from './builder';
import core from './core';
import hub from './hub';
import security from './security';
import settings from './settings';
import submissions from './submissions';

export type Dict = Record<string, string>;
export interface AreaDict {
  ar: Dict;
  ta: Dict;
}

// security goes first so an area's own wording wins for shared words like 'Copy' or 'Back'.
const AREAS: AreaDict[] = [security, activity, core, auth, hub, builder, submissions, settings];

export const DICTIONARIES: Record<'ar' | 'ta', Dict> = {
  ar: Object.assign({}, ...AREAS.map((a) => a.ar)),
  ta: Object.assign({}, ...AREAS.map((a) => a.ta)),
};
