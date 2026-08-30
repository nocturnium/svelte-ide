/**
 * The shared Cognitive Complexity corpus.
 *
 * One list, judged by every implementation this repo ships: the token scanner
 * (complexity-differential.test.ts) and the AST walker consumers plug parsers
 * into (complexity-ast.test.ts). Kept in one place so a case added to catch a
 * defect in one implementation automatically interrogates the other.
 *
 * Every entry is plain JS so acorn parses it without a TS plugin; the token
 * scanner is run in `typescript` mode regardless, which is the mode the editor,
 * the hero and the demo all default to.
 */
export const CORPUS: Array<{ name: string; code: string }> = [
	{ name: 'empty function', code: 'function f() {\n  return 1;\n}' },
	{ name: 'single if', code: 'function f(a) {\n  if (a) return 1;\n  return 0;\n}' },
	{
		name: 'if/else',
		code: 'function f(a) {\n  if (a) {\n    return 1;\n  } else {\n    return 0;\n  }\n}'
	},
	{
		name: 'if/else-if/else',
		code: 'function f(a) {\n  if (a > 2) {\n    return 2;\n  } else if (a > 1) {\n    return 1;\n  } else {\n    return 0;\n  }\n}'
	},
	{
		name: 'braceless if chain',
		code: 'function f(a, b, c) {\n  if (a) if (b) if (c) return 1;\n  return 0;\n}'
	},
	{
		name: 'braceless for + if',
		code: 'function f(xs) {\n  for (const x of xs) if (x > 0) return x;\n  return 0;\n}'
	},
	{
		name: 'braced for + if',
		code: 'function f(xs) {\n  for (const x of xs) {\n    if (x > 0) {\n      return x;\n    }\n  }\n  return 0;\n}'
	},
	{
		name: 'nested loops with if',
		code: 'function f(rows) {\n  for (let i = 0; i < rows.length; i++) {\n    for (let j = 0; j < rows[i].length; j++) {\n      if (rows[i][j]) {\n        return 1;\n      }\n    }\n  }\n  return 0;\n}'
	},
	{
		name: 'whitepaper sumOfPrimes',
		code: 'function sumOfPrimes(max) {\n  let total = 0;\n  OUT: for (let i = 1; i <= max; i++) {\n    for (let j = 2; j < i; j++) {\n      if (i % j === 0) {\n        continue OUT;\n      }\n    }\n    total += i;\n  }\n  return total;\n}'
	},
	{
		name: 'whitepaper getWords',
		code: 'function getWords(num) {\n  switch (num) {\n    case 1:\n      return "one";\n    case 2:\n      return "a couple";\n    default:\n      return "lots";\n  }\n}'
	},
	{ name: 'single ternary', code: 'function f(a) {\n  return a ? 1 : 2;\n}' },
	{ name: 'string ternary', code: "function f(a) {\n  return a ? 'yes' : 'no';\n}" },
	{
		name: 'chained ternary',
		code: "function f(n) {\n  return n > 90 ? 'A' : n > 80 ? 'B' : 'C';\n}"
	},
	{
		name: 'sibling ternaries',
		code: 'function f(a, b, c) {\n  return (a ? 1 : 2) && (b ? 3 : 4) && (c ? 5 : 6);\n}'
	},
	{
		name: 'boolean run &&',
		code: 'function f(a) {\n  if (a.x && a.y && a.z) return 1;\n  return 0;\n}'
	},
	{
		name: 'boolean runs mixed',
		code: 'function f(a) {\n  if (a.w && a.x || a.y && a.z) return 1;\n  return 0;\n}'
	},
	{
		name: 'boolean wrapped over lines',
		code: 'function f(a) {\n  if (\n    a.w &&\n    a.x &&\n    a.y\n  ) {\n    return 1;\n  }\n  return 0;\n}'
	},
	{
		name: 'try/catch',
		code: 'function f(a) {\n  try {\n    if (a) return 1;\n  } catch (e) {\n    return 0;\n  }\n  return 2;\n}'
	},
	{
		name: 'while with break',
		code: 'function f(n) {\n  let i = 0;\n  while (i < n) {\n    if (i === 3) {\n      break;\n    }\n    i++;\n  }\n  return i;\n}'
	},
	{
		name: 'recursion',
		code: 'function fact(n) {\n  if (n <= 1) return 1;\n  return n * fact(n - 1);\n}'
	},
	{
		// Two call sites, ONE method. The corpus previously held only `fact`, whose
		// single self-call scores the same whether recursion is charged per method
		// or per call site — so every implementation and the oracle itself could
		// charge per site and agree with each other forever.
		name: 'recursion with two call sites',
		code: 'function fib(n) {\n  if (n <= 1) return n;\n  return fib(n - 1) + fib(n - 2);\n}'
	},
	{
		name: 'nested function raises nesting',
		code: 'function outer(xs) {\n  return xs.map(function (x) {\n    if (x > 0) {\n      return 1;\n    }\n    return 0;\n  });\n}'
	},
	{
		name: 'arrow with block body',
		code: 'function outer(xs) {\n  return xs.map((x) => {\n    if (x > 0) {\n      return 1;\n    }\n    return 0;\n  });\n}'
	},
	{
		name: 'deeply nested conditionals',
		code: 'function f(a, b, c, d) {\n  if (a) {\n    if (b) {\n      if (c) {\n        if (d) {\n          return 1;\n        }\n      }\n    }\n  }\n  return 0;\n}'
	},
	{
		name: 'do/while',
		code: 'function f(n) {\n  let i = 0;\n  do {\n    if (i === n) {\n      return i;\n    }\n    i++;\n  } while (i < 10);\n  return -1;\n}'
	},
	{
		name: 'switch inside loop',
		code: 'function f(xs) {\n  for (const x of xs) {\n    switch (x) {\n      case 1:\n        return 1;\n      default:\n        break;\n    }\n  }\n  return 0;\n}'
	},
	{
		name: 'regex literal containing braces',
		code: 'function atKey(b) {\n  if (/[{,]\\s*$/.test(b)) {\n    if (/\\{\\s*$/.test(b)) {\n      return true;\n    }\n  }\n  return false;\n}'
	},
	{
		name: 'regex with brace then unrelated branch',
		code: 'function scan(s) {\n  const re = /^\\{\\s*/;\n  if (re.test(s)) {\n    return 1;\n  }\n  return 0;\n}'
	},
	{
		name: 'division is not a regex',
		code: 'function ratio(a, b) {\n  const r = a / b;\n  if (r > 1) {\n    return r;\n  }\n  return 0;\n}'
	},
	{
		name: 'hero triageLoad',
		code: "function triageLoad(signals, queueDepth) {\n  let score = 0;\n  for (const signal of signals) {\n    if (signal.kind === 'error') {\n      if (signal.count > 3 && queueDepth > 20) {\n        if (signal.owner) score += signal.count * 6;\n        else if (queueDepth > 80) score += 24;\n        else score += 12;\n      } else {\n        score += 3;\n      }\n    } else if (signal.count > 5) {\n      score += 10;\n    }\n  }\n  return score > 80 ? 'critical' : 'clear';\n}"
	},
	{
		name: 'demo processUser',
		code: "function processUser(user, request) {\n  if (!user) {\n    return 'No user';\n  }\n\n  if (user.role === 'admin') {\n    if (user.permissions.includes('write')) {\n      return request.channel === 'api' ? 'Admin API write access' : 'Admin with write access';\n    } else {\n      return 'Admin readonly';\n    }\n  }\n\n  return 'Regular user';\n}"
	},
	{
		name: 'logical assignment is not a sequence',
		code: 'function f(a, b, c) {\n  a.x ||= 1;\n  a.y &&= 2;\n  return b || c;\n}'
	},
	{
		name: 'logical assignment beside a real chain',
		code: 'function f(a, b, c, d) {\n  a.x ||= 1;\n  return b && c || d;\n}'
	},
	// The parameter-scoring rule, pinned. Three implementations gave three answers
	// here (2 / 0 / 1) until it was decided: a construct in a default IS scored,
	// at the function's own nesting level, and an arrow in a default is still a
	// nested function that raises nesting for its own body.
	{
		name: 'ternary in a parameter default',
		code: 'function f(a, b = a ? 1 : 2) {\n  return b;\n}'
	},
	{
		name: 'boolean run in a parameter default',
		code: 'function f(a, b = a || 2) {\n  return b;\n}'
	},
	{
		name: 'arrow in a parameter default raises nesting',
		code: 'function f(cb = (v) => { if (v) return 1; }) {\n  return cb;\n}'
	},
	{
		name: 'nested if inside a parameter default arrow',
		code: 'function f(cb = (v) => { if (v) { if (v) return 1; } }) {\n  return cb;\n}'
	}
];

/**
 * Go and Python translations of the JavaScript cases above.
 *
 * The problem this solves: the oracle is an acorn ESTree walk, so it speaks
 * JavaScript and nothing else, while the token scanner claims four languages.
 * Go and Python were therefore asserted only against the scanner's own output —
 * which is not evidence, it is a restatement.
 *
 * So each entry here is a TRANSLATION of a named JS case and inherits that
 * case's oracle value. The expected number is produced by running acorn over the
 * JavaScript original; the Go or Python source is never parsed by anything but
 * the scanner under test. A translation that scores differently is either a
 * scanner defect or an unfaithful translation, and both are worth knowing.
 *
 * Deliberately NOT translated:
 *
 *  - Anything parameter-shaped. The four parameter cases encode a convention
 *    about JavaScript defaults; Go has no defaults at all and Python's differ.
 *  - Go `select`, Python `for...else`, comprehension `if`, and `case` guards.
 *    There is no citable SonarSource rule for any of them, so a corpus entry
 *    would be inventing an answer and then agreeing with itself.
 *  - Constructs the target language does not have: ternaries and `try`/`catch`
 *    for Go, `switch` and labelled `continue` for Python.
 */
export const PARITY_CORPUS: Array<{
	name: string;
	language: 'go' | 'python';
	/** `name` of the CORPUS entry whose oracle value this inherits. */
	inherits: string;
	code: string;
}> = [
	// ---- Go ------------------------------------------------------------------
	{
		name: 'go: empty function',
		language: 'go',
		inherits: 'empty function',
		code: 'func f() int {\n\treturn 1\n}'
	},
	{
		name: 'go: single if',
		language: 'go',
		inherits: 'single if',
		code: 'func f(a bool) int {\n\tif a {\n\t\treturn 1\n\t}\n\treturn 0\n}'
	},
	{
		name: 'go: if/else',
		language: 'go',
		inherits: 'if/else',
		code: 'func f(a bool) int {\n\tif a {\n\t\treturn 1\n\t} else {\n\t\treturn 0\n\t}\n}'
	},
	{
		name: 'go: if/else-if/else',
		language: 'go',
		inherits: 'if/else-if/else',
		code: 'func f(a int) int {\n\tif a > 2 {\n\t\treturn 2\n\t} else if a > 1 {\n\t\treturn 1\n\t} else {\n\t\treturn 0\n\t}\n}'
	},
	{
		name: 'go: for + if',
		language: 'go',
		inherits: 'braced for + if',
		code: 'func f(xs []int) int {\n\tfor _, x := range xs {\n\t\tif x > 0 {\n\t\t\treturn x\n\t\t}\n\t}\n\treturn 0\n}'
	},
	{
		name: 'go: nested loops with if',
		language: 'go',
		inherits: 'nested loops with if',
		code: 'func f(rows [][]int) int {\n\tfor i := 0; i < len(rows); i++ {\n\t\tfor j := 0; j < len(rows[i]); j++ {\n\t\t\tif rows[i][j] != 0 {\n\t\t\t\treturn 1\n\t\t\t}\n\t\t}\n\t}\n\treturn 0\n}'
	},
	{
		// The whitepaper's own example, in Go. `continue OUT` is the labelled jump
		// that makes this a 7 rather than a 6.
		name: 'go: whitepaper sumOfPrimes',
		language: 'go',
		inherits: 'whitepaper sumOfPrimes',
		code: 'func sumOfPrimes(max int) int {\n\ttotal := 0\nOUT:\n\tfor i := 1; i <= max; i++ {\n\t\tfor j := 2; j < i; j++ {\n\t\t\tif i%j == 0 {\n\t\t\t\tcontinue OUT\n\t\t\t}\n\t\t}\n\t\ttotal += i\n\t}\n\treturn total\n}'
	},
	{
		name: 'go: boolean run &&',
		language: 'go',
		inherits: 'boolean run &&',
		code: 'func f(a Point) int {\n\tif a.x && a.y && a.z {\n\t\treturn 1\n\t}\n\treturn 0\n}'
	},
	{
		name: 'go: boolean runs mixed',
		language: 'go',
		inherits: 'boolean runs mixed',
		code: 'func f(a Point) int {\n\tif a.w && a.x || a.y && a.z {\n\t\treturn 1\n\t}\n\treturn 0\n}'
	},
	{
		// Go has one loop keyword; `for cond {}` is its while.
		name: 'go: for-as-while with break',
		language: 'go',
		inherits: 'while with break',
		code: 'func f(n int) int {\n\ti := 0\n\tfor i < n {\n\t\tif i == 3 {\n\t\t\tbreak\n\t\t}\n\t\ti++\n\t}\n\treturn i\n}'
	},
	{
		name: 'go: recursion with two call sites',
		language: 'go',
		inherits: 'recursion with two call sites',
		code: 'func fib(n int) int {\n\tif n <= 1 {\n\t\treturn n\n\t}\n\treturn fib(n-1) + fib(n-2)\n}'
	},
	{
		name: 'py: recursion with two call sites',
		language: 'python',
		inherits: 'recursion with two call sites',
		code: 'def fib(n):\n    if n <= 1:\n        return n\n    return fib(n - 1) + fib(n - 2)'
	},
	{
		name: 'go: recursion',
		language: 'go',
		inherits: 'recursion',
		code: 'func fact(n int) int {\n\tif n <= 1 {\n\t\treturn 1\n\t}\n\treturn n * fact(n-1)\n}'
	},
	{
		name: 'go: func literal raises nesting',
		language: 'go',
		inherits: 'nested function raises nesting',
		code: 'func outer(xs []int) []int {\n\treturn mapInts(xs, func(x int) int {\n\t\tif x > 0 {\n\t\t\treturn 1\n\t\t}\n\t\treturn 0\n\t})\n}'
	},
	{
		name: 'go: deeply nested conditionals',
		language: 'go',
		inherits: 'deeply nested conditionals',
		code: 'func f(a, b, c, d bool) int {\n\tif a {\n\t\tif b {\n\t\t\tif c {\n\t\t\t\tif d {\n\t\t\t\t\treturn 1\n\t\t\t\t}\n\t\t\t}\n\t\t}\n\t}\n\treturn 0\n}'
	},
	{
		name: 'go: switch inside loop',
		language: 'go',
		inherits: 'switch inside loop',
		code: 'func f(xs []int) int {\n\tfor _, x := range xs {\n\t\tswitch x {\n\t\tcase 1:\n\t\t\treturn 1\n\t\tdefault:\n\t\t\tbreak\n\t\t}\n\t}\n\treturn 0\n}'
	},

	// ---- Python --------------------------------------------------------------
	{
		name: 'py: empty function',
		language: 'python',
		inherits: 'empty function',
		code: 'def f():\n    return 1'
	},
	{
		name: 'py: single if',
		language: 'python',
		inherits: 'single if',
		code: 'def f(a):\n    if a:\n        return 1\n    return 0'
	},
	{
		name: 'py: if/else',
		language: 'python',
		inherits: 'if/else',
		code: 'def f(a):\n    if a:\n        return 1\n    else:\n        return 0'
	},
	{
		name: 'py: if/elif/else',
		language: 'python',
		inherits: 'if/else-if/else',
		code: 'def f(a):\n    if a > 2:\n        return 2\n    elif a > 1:\n        return 1\n    else:\n        return 0'
	},
	{
		name: 'py: for + if',
		language: 'python',
		inherits: 'braced for + if',
		code: 'def f(xs):\n    for x in xs:\n        if x > 0:\n            return x\n    return 0'
	},
	{
		name: 'py: nested loops with if',
		language: 'python',
		inherits: 'nested loops with if',
		code: 'def f(rows):\n    for row in rows:\n        for cell in row:\n            if cell:\n                return 1\n    return 0'
	},
	{
		name: 'py: single ternary',
		language: 'python',
		inherits: 'single ternary',
		code: 'def f(a):\n    return 1 if a else 2'
	},
	{
		name: 'py: boolean run and',
		language: 'python',
		inherits: 'boolean run &&',
		code: 'def f(a):\n    if a.x and a.y and a.z:\n        return 1\n    return 0'
	},
	{
		name: 'py: boolean runs mixed',
		language: 'python',
		inherits: 'boolean runs mixed',
		code: 'def f(a):\n    if a.w and a.x or a.y and a.z:\n        return 1\n    return 0'
	},
	{
		name: 'py: try/except',
		language: 'python',
		inherits: 'try/catch',
		code: 'def f(a):\n    try:\n        if a:\n            return 1\n    except ValueError:\n        return 0\n    return 2'
	},
	{
		name: 'py: while with break',
		language: 'python',
		inherits: 'while with break',
		code: 'def f(n):\n    i = 0\n    while i < n:\n        if i == 3:\n            break\n        i += 1\n    return i'
	},
	{
		name: 'py: recursion',
		language: 'python',
		inherits: 'recursion',
		code: 'def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)'
	},
	{
		name: 'py: nested def raises nesting',
		language: 'python',
		inherits: 'nested function raises nesting',
		code: 'def outer(xs):\n    def inner(x):\n        if x > 0:\n            return 1\n        return 0\n    return list(map(inner, xs))'
	},
	{
		name: 'py: deeply nested conditionals',
		language: 'python',
		inherits: 'deeply nested conditionals',
		code: 'def f(a, b, c, d):\n    if a:\n        if b:\n            if c:\n                if d:\n                    return 1\n    return 0'
	}
];
