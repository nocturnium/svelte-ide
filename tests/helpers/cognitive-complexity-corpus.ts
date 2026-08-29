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
	}
];
