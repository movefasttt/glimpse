
  // ================================================================ text helpers
  // CJK and emoji take two terminal columns.
  function charWidth(cp) {
    if (cp >= 0x1100 && (cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
        (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) || (cp >= 0xac00 && cp <= 0xd7a3) ||
        (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
        (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd))) return 2;
    return 1;
  }
  function width(s) { let w = 0; for (const ch of s) w += charWidth(ch.codePointAt(0)); return w; }
  const maxOf = (arr, init = 0) => arr.reduce((m, x) => (x > m ? x : m), init);   // no spread: huge inputs overflow the stack
  const minOf = (arr, init = Infinity) => arr.reduce((m, x) => (x < m ? x : m), init);
  const indentOf = l => { const k = l.search(/\S/); return k < 0 ? l.length : k; };
  const WORD = /[\p{L}\p{N}]+/gu;

  // ================================================================ source profiles
  // Tool knowledge lives here as data, never in the stages. A new tool is a new profile.
  // `detect` gates every hint; `ui` holds the tool's terminal-UI line shapes (demoted, never deleted).
  const RULE_LINE = new RegExp('^\\s*[─━═]{' + policy.ruleMin + ',}\\s*$');
  const profiles = {
    plain: { name: 'plain', detect: () => false, hints: { quote: /^\s*>\s?/ } },
    'claude-code': {
      name: 'claude-code',
      // Claude Code's own marks: reply marker, prompt, tool output, quote bar, box drawing at line start.
      // ... and its display of a fenced diagram: a bare `mermaid` line over a diagram header
      detect: lines => lines.some((l, i) => /^[ \t]*[⏺❯⎿▎┌│]/.test(l) || RULE_LINE.test(l) || /^\s*mermaid\s*$/.test(l) && MERMAID_HEAD.test(lines[i + 1] || '')),
      ui: {
        always: [
          /^\s*⏺\s+[A-Za-z_][\w.-]*\(/,          // tool call: needs the call shape (⏺ Done. is a reply)
          /^\s*⎿/,                                 // tool output
          /^\s*❯/,                                 // prompt
          /^\s*⏺\s+(Teammate\s+@|Agent\s+"|Background command\s+"|\d+\s+background\s+(agents?|tasks?|commands?)|Interrupted|Compacted)/,
        ],
        withEvidence: [
          /^\s*[├└│]\s+@\S/,                       // agent tree
          /^\s*…\s*\+\d+ lines?\b|ctrl\+o to expand/,
          /^\s*(model\s+\S|⏵⏵|⏸|\?\s+for shortcuts|esc to interrupt|auto mode|accept edits|bypass permissions)/,
          /^\s*(~|\/|[-]|\S+@\S+).*[-]/,   // powerline shell prompt
          /^\s*[✻✢✳✶✽✺]\s/,                         // status / spinner
        ],
        // a call, its output, or a prompt owns the deeper-indented lines right after it
        owner: [/^\s*⏺\s+[A-Za-z_][\w.-]*\(/, /^\s*⎿/, /^\s*❯/],
        prompt: /^\s*❯/,
      },
      hints: { replyIndent: 2, promptBorder: true, langTagLine: true, labelTables: true, replyMarker: /^(\s*)⏺ /,
        quote: /^\s*(▎|>)\s?/, quoteBar: /^\s*▎/ },   // its terminal shows `> quote` as `▎ quote`
    },
  };
  const profileFor = lines => profiles['claude-code'].detect(lines) ? profiles['claude-code'] : profiles.plain;
  // Terminal marks: a tool's profile or box drawing at line start. Text without them has no terminal rows to recover.
  const terminalMarks = (lines, profile) => profile.name !== 'plain' || /^[ \t]*[┌├└│]/m.test(lines.join('\n'));
