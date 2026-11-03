
  // ================================================================ features
  // One table of facts per line, computed once. Readings read only this table (and validators).
  const BULLET = /^(\s*)([-*+•◦▪‣]|\d{1,3}[.)]|[a-zA-Z][.)])\s+\S/;
  const BOX = /[┌┐└┘├┤┬┴┼│─]/;
  const BOX_START = /^\s*[┌├└│┬┴┼]/;
  const POINTER = /[▲▼◀▶↑↓←→]|─+┘|└─+|─+>/;
  const MERMAID_HEAD = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|sankey(-beta)?|xychart(-beta)?|block(-beta)?|packet(-beta)?|kanban|architecture(-beta)?|requirementDiagram|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|radar(-beta)?|treemap(-beta)?)\b/;
  const MERMAID_BODY = /-->|-\.->|==>|---|\|.*\||^\s*(subgraph|end|style|classDef|class|linkStyle|participant|actor|note|loop|alt|else|opt|par|rect|section|title|direction)\b|^\s*\w+[\[({]|^\s*\w+\s*:/;
  const CODE_START = /^\s*(def |class |func |fn |function\b|return\b|import |from \S+ import|package |const |let |var |if\s*\(|for\s*\(|while\s*\(|switch\b|case\b|#include|#!\/|SELECT\b|FROM\b|WHERE\b|WITH\b|INSERT\b|UPDATE\b|CREATE\b|JOIN\b|GROUP BY|ORDER BY|\$ |>>> |\w+\s*:=|\w+\s*=\s*\S|[}\])]\s*[;,)]?\s*$|\/\/|--\s|@\w+)/;
  const SHELL = /^\s*(git|gh|cd|ls|cat|grep|rg|sed|awk|curl|npm|npx|node|python3?|pip|go|cargo|make|docker|kubectl|gcloud|bq|brew|claude|tmux|ssh|export|echo|sudo|chmod|mkdir|rm|cp|mv)\s+\S/;
  const INLINE = { bold: /\*\*[^*\n]+\*\*/, code: /`[^`\n]+`/, link: /\[[^\]\n]+\]\([^)\s]+\)/ };   // v1's evidence: nothing parses as markdown that v1 kept as text

  // Code evidence of one line: sum of named flags x policy weights (v1's measured rules of thumb).
  function lineCode(raw) {
    const t = raw.trim(), w = policy.code;
    if (!t) return 0;
    const sym = (t.match(/[{}()[\];=<>|&$#@\\/*+]/g) || []).length / t.length;
    const flags = {
      start: CODE_START.test(raw) || SHELL.test(raw),
      statementEnd: /[;{}]\s*$|[({[,]\s*$|^\s*[)}\]]/.test(t),
      jsonLine: /^[{[]/.test(t) && /[}\]],?$/.test(t),
      logTime: /^\[?\d{4}-\d{2}-\d{2}[T ]\d|^\[?\d{2}:\d{2}:\d{2}/.test(t),
      logLevel: /\b(INFO|WARN(ING)?|ERROR|DEBUG|TRACE|FATAL)\b/.test(t),
      csv: /^[^\s,]+(,[^\s,]*){2,}$/.test(t),
      html: /^<!--|^<\/?[a-zA-Z][\w-]*(\s[^>]*)?>/.test(t),
      cliFlag: /^-{1,2}[a-zA-Z][\w-]*(\s|=|$)/.test(t) && /['"=\\]/.test(t),
      trailingComment: /\S\s+\/\/\s/.test(t) && /[.(]/.test(t.split('//')[0]),
      methodCall: /^\w[\w.]*\.\w+\(.*\)/.test(t),
      operator: /(==|!=|=>|->|::|&&|\|\||\+=|<-|:=)/.test(t),
      callShape: /\w\(.*\)/.test(t) && !/\s\w+\s\w+\s\w+\s\w+/.test(t.replace(/\(.*\)/, '')),
      identifier: /^[a-z_]+[A-Z]\w*|\b[a-z]+_[a-z_]+\b/.test(t) && !/[.!?]$/.test(t),
      edge: /^\w+(\[[^\]]*\]|\([^)]*\)|\{[^}]*\})?\s*(-->|-\.->|==>|---|-\.|--)/.test(t),   // diagram edge, kept as code when it no longer parses
      drawing: /[─━═│┃┌┐└┘├┤┬┴┼]/.test(t) && !/[\p{L}\p{N}]/u.test(t),   // only drawing characters: no words to be prose
      aligned: /\S {3,}\S/.test(t),                          // prose never has 3+ inner spaces
      symbols: Math.min(1, sym * w.symbols),
      sentence: /[.!?]["')]?$/.test(t) && /\b(the|a|an|is|are|and|to|of|we|it|this|that)\b/i.test(t),
      wordy: (t.match(/\b[A-Za-z]+\b/g) || []).length >= w.wordyWords && sym < w.wordySymbols,
    };
    let s = 0;
    for (const k in flags) s += (k === 'symbols' ? 1 : w[k]) * Number(flags[k]);
    return s;
  }

  // Inline markdown syntax is markdown evidence, not code symbols: score code on the text without it.
  const stripInline = l => l.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/`([^`\n]+)`/g, '$1').replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1');

  function features(body, hints) {
    return body.map((l, i) => {
      if (l == null || !l.trim()) return null;
      const t = l.trim();
      return {
        indent: indentOf(l), cols: width(t),
        code: lineCode(stripInline(l)),
        bullet: BULLET.test(l),
        quote: hints.quote.test(l), quoteBar: Boolean(hints.quoteBar && hints.quoteBar.test(l)),
        boxStart: BOX_START.test(l), box: BOX.test(t), pointer: POINTER.test(t),
        // drawn (invariant 2): starts with drawing, or is placed - no letter or digit, deeper than the line above (a caret,
        // a pointer): its column is content. A wrapped remainder (`.` alone) sits at the text's own column.
        drawn: BOX_START.test(l) || /^\s*[▲▼↑↓]/.test(l) || (!/[\p{L}\p{N}]/u.test(t) && i > 0 && body[i - 1] != null && body[i - 1].trim() !== '' && indentOf(l) > indentOf(body[i - 1])),
        rule: RULE_LINE.test(l) || /^\s*([-*_])\1{2,}\s*$/.test(l),
        mdHeading: /^#{1,6}[ \t]+\S/.test(l),
        mdPipe: /^[ \t]*\|.*\|[ \t]*$/.test(l),
        mermaid: MERMAID_HEAD.test(l), langTag: /^\s*mermaid\s*$/.test(l),
        endsColon: /:\s*$/.test(t), endsSentence: /[.,;:!?]$/.test(t),
        inline: Object.keys(INLINE).filter(k => INLINE[k].test(t)),
      };
    });
  }
