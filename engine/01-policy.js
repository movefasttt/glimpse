
  // ================================================================ policy
  // Every tunable number in the engine lives here, named. Stages read policy; they never hold a threshold.
  const policy = {
    // Geometry: how sure we are of the wrap width. Low confidence = no joins.
    width: {
      nearCols: 3,          // medium: at least `minNear` lines end within `nearCols` of one width...
      minNear: 1,           // ...and the text shows terminal evidence (1, measured: 2 drops join recall 97.1 -> 91.7, gold 100 -> 81.1, never-worse unchanged)
    },
    // Risk matrix classes: the reading damage of showing type A when the truth is type B (docs/engine-v2.md "Risk policy").
    risk: {
      proseSwap: 1,         // prose-family shown as another prose-family type (para as heading, list as para)
      proseAsStructure: 2,  // prose shown as code or table: right text, heavier styling, breaks kept
      verbatimProse: 1.5,   // the floor on prose: breaks kept, nothing restyled
      verbatimStructure: 3, // the floor on code/table/diagram: proportional font loses the alignment
      structureSwap: 3,     // code shown as diagram or the reverse
      structureAsProse: 10, // code/table/diagram shown as prose: lines run together, layout lost
    },
    // Evidence weights. A reading's score is sum(weight * flag); scores become likelihoods by softmax.
    validator: 12,          // a parser or exact inversion accepted it (mermaid, JSON, exact grid, Label: groups, fence, `#`, `▎`)
    code: {
      // per-line flags (v1's measured rules of thumb, kept as evidence)
      start: 1.2, statementEnd: 1, jsonLine: 1, logTime: 1.5, logLevel: 0.6, csv: 1.5, html: 1.5, cliFlag: 1.2,
      trailingComment: 1, methodCall: 0.8, operator: 0.6, callShape: 0.5, identifier: 0.3, edge: 1.5, drawing: 1.5, aligned: 1.5,
      symbols: 6,           // symbol density x this, capped at 1
      sentence: -1.2, wordy: -1, wordyWords: 8, wordySymbols: 0.05,   // wordy = many words, few symbols
      // atom flags
      deepIndent: 0.8, deepCols: 6, deepShare: 0.25,
      layout2d: 3,          // geometry is content: box drawing that is not an exact grid, pointers placed by column
      slope: 4, center: 0.9,   // code score = slope * (mean line score - center)
      wraps: -1.5,          // every break in the atom is a clean soft wrap: prose evidence
    },
    list: 2.5,              // first line carries a bullet marker
    heading: { score: 1.2, maxCols: 80 },
    mermaidGap: 3,          // a diagram may span blank-line runs up to this long
    kv: { labelMax: 40, ruleMin: 10 },
    ruleMin: 8,             // ──── run that is a horizontal rule or prompt-box border
    // Claude Code profile
    claude: { promptPadSlack: 1, promptPadMin: 40, borderMin: 60, promptNear: 2 },   // prompt-box border within promptNear lines of the prompt
  };
