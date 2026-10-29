// Glimpse format engine v2: clipboard text in, readable markdown out, plus a per-input-line trace.
// Design: docs/engine-v2.md (ratified revision 3). Contract: docs/dataset.md.
//
//   format(text, { parseMermaid }) -> Promise<{ markdown, lines: [{ type, cont, demoted? }], trace }>
//
// format.js is generated: `cat engine/*.js` (build.sh). Each file is one section of this IIFE, in name order:
// policy, profiles, lex, geometry, features, readings, segment + decide, join, render, entry.
(function () {
  'use strict';
