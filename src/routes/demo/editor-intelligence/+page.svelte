<script lang="ts">
	/**
	 * Editor Intelligence Features Demo
	 *
	 * Demonstrates Minimap, Breadcrumbs, Quick Actions, Symbol Outline, and overlay intelligence.
	 */

	import { onMount } from 'svelte';
	import DemoPage from '../_components/DemoPage.svelte';
	import DemoExhibit from '../_components/DemoExhibit.svelte';
	import Minimap from '$lib/components/editor/Minimap.svelte';
	import Breadcrumbs, { type BreadcrumbSymbol } from '$lib/components/editor/Breadcrumbs.svelte';
	import QuickActionsMenu from '$lib/components/editor/QuickActionsMenu.svelte';
	import SymbolOutline, { type DocumentSymbol } from '$lib/components/editor/SymbolOutline.svelte';
	import EchoCursorLayer from '$lib/components/editor/EchoCursorLayer.svelte';
	import GhostBracketLayer from '$lib/components/editor/GhostBracketLayer.svelte';
	import ContextLens from '$lib/components/editor/ContextLens.svelte';
	import CustomEditor from '$lib/components/editor/CustomEditor.svelte';
	import {
		createQuickActionsManager,
		type QuickActionsManager,
		type CodeAction
	} from '$lib/components/editor/core/quick-actions';
	import {
		createEchoCursorManager,
		type EchoCursorManager
	} from '$lib/components/editor/core/echo-cursor';
	import {
		createBracketHealer,
		type BracketHealer
	} from '$lib/components/editor/core/bracket-healer';
	import {
		createEditorState,
		type EditorState,
		type Line,
		type Position
	} from '$lib/components/editor/core/state';

	// Demo state
	let activeDemo = $state<
		'minimap' | 'breadcrumbs' | 'quickactions' | 'outline' | 'echo' | 'ghost' | 'context'
	>('minimap');

	// Sample code for all demos
	const sampleCode = `import { useState, useEffect, useCallback } from 'react';
import { fetchUserData, updateUserProfile } from '../api/users';
import { Logger } from '../utils/logger';
import type { User, UserProfile, ApiResponse } from '../types';

const logger = new Logger('UserManager');

/**
 * User profile management component
 * Handles loading, displaying, and updating user profiles
 */
interface UserManagerProps {
  userId: string;
  onProfileUpdate?: (profile: UserProfile) => void;
  enableNotifications?: boolean;
}

export class UserManager {
  private cache: Map<string, User> = new Map();
  private logger: Logger;

  constructor(private config: { cacheTimeout: number }) {
    this.logger = new Logger('UserManager');
  }

  async getUser(id: string): Promise<User | null> {
    if (this.cache.has(id)) {
      return this.cache.get(id)!;
    }

    try {
      const response = await fetchUserData(id);
      if (response.success) {
        this.cache.set(id, response.data);
        return response.data;
      }
    } catch (error) {
      this.logger.error('Failed to fetch user:', error);
    }

    return null;
  }

  async updateProfile(id: string, updates: Partial<UserProfile>): Promise<boolean> {
    try {
      const response = await updateUserProfile(id, updates);
      if (response.success) {
        const user = this.cache.get(id);
        if (user) {
          this.cache.set(id, { ...user, profile: { ...user.profile, ...updates } });
        }
        return true;
      }
    } catch (error) {
      this.logger.error('Failed to update profile:', error);
    }
    return false;
  }

  clearCache(): void {
    this.cache.clear();
    this.logger.info('Cache cleared');
  }
}

export function useUserProfile(userId: string) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUserData(userId);
      setUser(data);
      setError(null);
    } catch (err) {
      setError('Failed to load user');
      logger.error('Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return false;

    try {
      await updateUserProfile(user.id, updates);
      setUser({ ...user, profile: { ...user.profile, ...updates } });
      return true;
    } catch (err) {
      logger.error('Update failed:', err);
      return false;
    }
  };

  return { user, loading, error, updateProfile, reload: loadUser };
}

export const DEFAULT_CONFIG = {
  cacheTimeout: 5000,
  maxRetries: 3,
  enableLogging: true
};`;

	const sampleLines = sampleCode.split('\n');
	const lineHeight = 20;
	const charWidth = 7.8;
	const gutterWidth = 50;
	const editorHeight = 400;

	const ghostBracketCode = `export function reconcileProfile(user: User) {
  if (user.profile?.settings) {
    return {
      id: user.id,
      notifications: user.profile.settings.notifications,
      theme: user.profile.settings.theme
  }

  return null;
}`;
	const ghostBracketLines = ghostBracketCode.split('\n');

	const contextLensCode = `interface UserSession {
  userId: string;
  expiresAt: Date;
}

export async function loadSession(userId: string): Promise<UserSession | null> {
  const response = await fetchSession(userId);
  return response.ok ? response.data : null;
}

export const formatSession = (session: UserSession): string => {
  return session.expiresAt.toISOString();
};`;
	const contextLensLines: Line[] = contextLensCode
		.split('\n')
		.map((text, number) => ({ number, text }));
	const contextLensCursorLine = 5;

	// Minimap usage snippet (Code tab of the Minimap exhibit).
	const minimapUsage = `<script lang="ts">
  import { Minimap } from '@nocturnium/svelte-ide';

  let lines = $state(sourceCode.split('\\n'));
  let scrollTop = $state(0);
  const editorHeight = 400;
  const lineHeight = 20;

  function onNavigate(line: number) {
    scrollTop = line; // scroll the editor to the clicked line
  }
<${'/'}script>

<Minimap
  {lines}
  {scrollTop}
  {editorHeight}
  visibleLines={Math.floor(editorHeight / lineHeight)}
  highlights={[
    { line: 35, type: 'error' },
    { line: 42, type: 'warning' }
  ]}
  enabled
  width={100}
  {onNavigate}
/>`;

	// Minimap state
	let minimapScrollTop = $state(0);
	let minimapHighlights = $state<
		Array<{ line: number; type: 'search' | 'error' | 'warning' | 'change' }>
	>([
		{ line: 5, type: 'change' },
		{ line: 6, type: 'change' },
		{ line: 35, type: 'error' },
		{ line: 42, type: 'warning' },
		{ line: 67, type: 'search' },
		{ line: 68, type: 'search' },
		{ line: 69, type: 'search' }
	]);

	// Breadcrumbs state
	let breadcrumbPath = $state<BreadcrumbSymbol[]>([
		{
			id: 'class-usermanager',
			name: 'UserManager',
			type: 'class',
			line: 17,
			siblings: [
				{ id: 'class-usermanager', name: 'UserManager', type: 'class', line: 17 },
				{ id: 'fn-useuserprofile', name: 'useUserProfile', type: 'function', line: 65 }
			]
		},
		{
			id: 'method-getuser',
			name: 'getUser',
			type: 'method',
			line: 25,
			detail: '(id: string): Promise<User | null>',
			siblings: [
				{
					id: 'method-getuser',
					name: 'getUser',
					type: 'method',
					line: 25,
					detail: '(id: string): Promise<User | null>'
				},
				{
					id: 'method-updateprofile',
					name: 'updateProfile',
					type: 'method',
					line: 43,
					detail: '(id, updates): Promise<boolean>'
				},
				{
					id: 'method-clearcache',
					name: 'clearCache',
					type: 'method',
					line: 59,
					detail: '(): void'
				}
			]
		}
	]);
	// Seed the cursor on the active breadcrumb's definition line (getUser, line
	// index 25) so the breadcrumb "Ln" chip, the "Current: Line N" label, and the
	// editor highlight all agree on one answer to "where am I" — the page's whole
	// theme is navigation precision, so the indicators must not contradict.
	let cursorLine = $state(25);

	// Quick Actions state
	let quickActionsManager = $state<QuickActionsManager>(null!);
	let quickActionsEnabled = $state(true);

	// Quick Actions tab: a REAL editor so the advertised actions actually run.
	// The leading imports are intentionally unsorted + duplicated so "Organize
	// imports" has a real change to make; the body gives "Extract to variable"
	// (an expression) and "Extract to function" (the const block) real targets.
	const qaSampleCode = `import { formatCurrency } from './money';
import { printLine } from './io';
import { formatCurrency } from './money';

function renderInvoice(order) {
	const subtotal = order.items.reduce((sum, item) => sum + item.price, 0);
	const tax = subtotal * order.taxRate;
	const total = subtotal + tax;
	printLine(\`Subtotal: \${formatCurrency(subtotal)}\`);
	printLine(\`Tax: \${formatCurrency(tax)}\`);
	printLine(\`Total: \${formatCurrency(total)}\`);
}`;
	let qaEditorRef = $state<CustomEditor | null>(null);
	let qaContent = $state(qaSampleCode);
	let qaCursorLine = $state(0);
	let qaActionResult = $state<{ text: string; ok: boolean } | null>(null);
	let qaActionTimer: ReturnType<typeof setTimeout> | undefined;

	// Overlay state
	let echoCursorManager = $state<EchoCursorManager | null>(null);
	let echoEditorState = $state<EditorState | null>(null);
	let echoSourceContent = $state(contextLensCode);
	let bracketHealer = $state<BracketHealer | null>(null);

	// Symbol Outline state
	let symbols = $state<DocumentSymbol[]>([
		{
			id: 'imports',
			name: 'Imports',
			kind: 'module',
			line: 0,
			endLine: 3,
			children: [
				{ id: 'imp-react', name: 'react', kind: 'import', line: 0 },
				{ id: 'imp-users', name: 'users', kind: 'import', line: 1 },
				{ id: 'imp-logger', name: 'Logger', kind: 'import', line: 2 },
				{ id: 'imp-types', name: 'types', kind: 'import', line: 3 }
			]
		},
		{
			id: 'const-logger',
			name: 'logger',
			kind: 'constant',
			line: 5,
			detail: 'Logger'
		},
		{
			id: 'interface-props',
			name: 'UserManagerProps',
			kind: 'interface',
			line: 11,
			endLine: 15,
			children: [
				{ id: 'prop-userid', name: 'userId', kind: 'property', line: 12, detail: 'string' },
				{
					id: 'prop-onupdate',
					name: 'onProfileUpdate',
					kind: 'property',
					line: 13,
					detail: '(profile) => void'
				},
				{
					id: 'prop-notifications',
					name: 'enableNotifications',
					kind: 'property',
					line: 14,
					detail: 'boolean'
				}
			]
		},
		{
			id: 'class-usermanager',
			name: 'UserManager',
			kind: 'class',
			line: 17,
			endLine: 63,
			children: [
				{
					id: 'prop-cache',
					name: 'cache',
					kind: 'property',
					line: 18,
					detail: 'Map<string, User>',
					visibility: 'private'
				},
				{
					id: 'prop-logger',
					name: 'logger',
					kind: 'property',
					line: 19,
					detail: 'Logger',
					visibility: 'private'
				},
				{
					id: 'method-constructor',
					name: 'constructor',
					kind: 'method',
					line: 21,
					detail: '(config)'
				},
				{
					id: 'method-getuser',
					name: 'getUser',
					kind: 'method',
					line: 25,
					endLine: 41,
					detail: '(id): Promise<User | null>'
				},
				{
					id: 'method-updateprofile',
					name: 'updateProfile',
					kind: 'method',
					line: 43,
					endLine: 57,
					detail: '(id, updates): Promise<boolean>'
				},
				{
					id: 'method-clearcache',
					name: 'clearCache',
					kind: 'method',
					line: 59,
					detail: '(): void'
				}
			]
		},
		{
			id: 'fn-useuserprofile',
			name: 'useUserProfile',
			kind: 'function',
			line: 65,
			endLine: 102,
			detail: '(userId: string)',
			children: [
				{ id: 'var-user', name: 'user', kind: 'variable', line: 66, detail: 'User | null' },
				{ id: 'var-loading', name: 'loading', kind: 'variable', line: 67, detail: 'boolean' },
				{ id: 'var-error', name: 'error', kind: 'variable', line: 68, detail: 'string | null' },
				{
					id: 'fn-loaduser',
					name: 'loadUser',
					kind: 'function',
					line: 70,
					detail: 'useCallback async'
				},
				{
					id: 'fn-updateprofile',
					name: 'updateProfile',
					kind: 'function',
					line: 88,
					detail: 'async'
				}
			]
		},
		{
			id: 'const-config',
			name: 'DEFAULT_CONFIG',
			kind: 'constant',
			line: 104,
			detail: '{ cacheTimeout, maxRetries, enableLogging }'
		}
	]);
	let activeSymbolId = $state<string>('method-getuser');
	let outlineSortBy = $state<'position' | 'name' | 'kind'>('position');

	onMount(() => {
		// Initialize quick actions manager
		quickActionsManager = createQuickActionsManager();

		// Set initial context
		quickActionsManager.updateContext({
			position: { line: 0, column: 0 },
			diagnostics: [],
			lineContent: qaContent.split('\n')[0] ?? '',
			language: 'typescript',
			content: qaContent
		});

		const echoManager = createEchoCursorManager({ defaultDelay: 220 });
		const realEchoEditor = createEditorState({
			content: echoSourceContent,
			language: 'typescript'
		});
		const detachEchoEditor = echoManager.attach(realEchoEditor);
		echoManager.enable();
		echoManager.addEchoPoint({ line: 5, column: 22 }, { delay: 220, label: 'Mirror A' });
		echoManager.addEchoPoint({ line: 10, column: 8 }, { delay: 420, label: 'Mirror B' });
		echoEditorState = realEchoEditor;
		echoCursorManager = echoManager;

		const healer = createBracketHealer({ debounceMs: 0, minConfidence: 0.5, maxGhosts: 4 });
		healer.setLanguage('typescript');
		healer.analyzeImmediate(ghostBracketCode);
		bracketHealer = healer;

		return () => {
			detachEchoEditor();
			quickActionsManager?.destroy();
			healer.destroy();
		};
	});

	function handleMinimapNavigate(line: number) {
		minimapScrollTop = line;
		cursorLine = line;
	}

	function handleBreadcrumbNavigate(symbol: BreadcrumbSymbol) {
		cursorLine = symbol.line;
	}

	function syncQuickActions() {
		const editor = qaEditorRef;
		if (!editor || !quickActionsManager) return;
		const sel = editor.getSelection();
		const startLine = Math.min(sel.anchor.line, sel.head.line);
		const endLine = Math.max(sel.anchor.line, sel.head.line);
		qaCursorLine = startLine;
		quickActionsManager.updateContext({
			position: { line: sel.head.line, column: sel.head.column },
			selection: {
				start: { line: startLine, column: 0 },
				end: { line: endLine, column: 0 }
			},
			selectedText: editor.getSelectedText(),
			diagnostics: [],
			lineContent: qaContent.split('\n')[sel.head.line] ?? '',
			language: 'typescript',
			content: qaContent
		});
	}

	function handleQuickActionExecute(action: CodeAction) {
		clearTimeout(qaActionTimer);
		qaActionResult = runQuickAction(action);
		const ok = qaActionResult?.ok ?? false;
		qaActionTimer = setTimeout(() => (qaActionResult = null), ok ? 2600 : 4200);
	}

	// Route each advertised action to its real editor method or to an HONEST,
	// specific refusal. Extract-variable/-function and organize-imports apply real
	// single-undo edits (and refuse loudly when unsafe). Rename and fix-all cannot
	// be done safely in a self-contained demo, so they say exactly why rather than
	// fake an "Executed" toast; everything else is labeled preview-only.
	function runQuickAction(action: CodeAction): { text: string; ok: boolean } | null {
		const editor = qaEditorRef;
		switch (action.command?.command) {
			case 'refactor.extractFunction': {
				const result = editor?.extractFunction();
				if (!result) return null;
				return { text: result.ok ? 'Extracted into a new function' : result.reason, ok: result.ok };
			}
			case 'refactor.extractVariable': {
				const result = editor?.extractVariable();
				if (!result) return null;
				return { text: result.ok ? 'Extracted into a new variable' : result.reason, ok: result.ok };
			}
			case 'source.organizeImports': {
				const result = editor?.organizeImports();
				if (!result) return null;
				return { text: result.ok ? 'Imports organized' : result.reason, ok: result.ok };
			}
			case 'refactor.rename':
				return {
					text: 'Rename needs project-wide symbol resolution — not wired in this build.',
					ok: false
				};
			case 'source.fixAll':
				return { text: 'No live diagnostics in this demo, so there is nothing to fix.', ok: false };
			default:
				return { text: `${action.title} — preview only in this build.`, ok: false };
		}
	}

	function handleSymbolNavigate(symbol: DocumentSymbol) {
		cursorLine = symbol.line;
		activeSymbolId = symbol.id;

		// Update breadcrumb path based on selected symbol
		if (symbol.kind === 'class') {
			breadcrumbPath = [{ ...symbol, type: symbol.kind }];
		} else if (symbol.kind === 'method' || symbol.kind === 'function') {
			// Find parent class if exists
			const parentClass = symbols.find(
				(s) => s.kind === 'class' && s.children?.some((c: DocumentSymbol) => c.id === symbol.id)
			);
			if (parentClass) {
				breadcrumbPath = [
					{ ...parentClass, type: 'class' },
					{ ...symbol, type: symbol.kind }
				];
			} else {
				breadcrumbPath = [{ ...symbol, type: symbol.kind }];
			}
		}
	}

	function positionFromIndex(content: string, index: number): Position {
		const lines = content.slice(0, index).split('\n');
		return {
			line: lines.length - 1,
			column: lines[lines.length - 1].length
		};
	}

	function applyEchoSourceContent(nextContent: string) {
		const state = echoEditorState;
		if (!state || nextContent === echoSourceContent) return;

		const previous = echoSourceContent;
		let prefix = 0;
		while (
			prefix < previous.length &&
			prefix < nextContent.length &&
			previous[prefix] === nextContent[prefix]
		) {
			prefix++;
		}

		let suffix = 0;
		while (
			suffix < previous.length - prefix &&
			suffix < nextContent.length - prefix &&
			previous[previous.length - 1 - suffix] === nextContent[nextContent.length - 1 - suffix]
		) {
			suffix++;
		}

		const from = positionFromIndex(previous, prefix);
		const removedEndIndex = previous.length - suffix;
		const insertedText = nextContent.slice(prefix, nextContent.length - suffix);

		if (removedEndIndex > prefix) {
			state.deleteRange(from, positionFromIndex(previous, removedEndIndex));
		}
		if (insertedText) {
			state.insertAt(from, insertedText);
		}

		echoSourceContent = state.getContent();
	}
</script>

<DemoPage
	eyebrow="Intelligence"
	title="Editor Intelligence"
	description="Navigation aids, code actions, and rendered intelligence overlays."
>
	<!-- Demo tabs -->
	<div class="demo-tabs" role="tablist" aria-label="Editor intelligence demos">
		<button
			id="tab-minimap"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'minimap'}
			aria-controls="panel-minimap"
			class:active={activeDemo === 'minimap'}
			onclick={() => (activeDemo = 'minimap')}
		>
			Minimap
		</button>
		<button
			id="tab-breadcrumbs"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'breadcrumbs'}
			aria-controls="panel-breadcrumbs"
			class:active={activeDemo === 'breadcrumbs'}
			onclick={() => (activeDemo = 'breadcrumbs')}
		>
			Breadcrumbs
		</button>
		<button
			id="tab-quickactions"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'quickactions'}
			aria-controls="panel-quickactions"
			class:active={activeDemo === 'quickactions'}
			onclick={() => (activeDemo = 'quickactions')}
		>
			Quick Actions
		</button>
		<button
			id="tab-outline"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'outline'}
			aria-controls="panel-outline"
			class:active={activeDemo === 'outline'}
			onclick={() => (activeDemo = 'outline')}
		>
			Symbol Outline
		</button>
		<button
			id="tab-echo"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'echo'}
			aria-controls="panel-echo"
			class:active={activeDemo === 'echo'}
			onclick={() => (activeDemo = 'echo')}
		>
			Echo Cursors
		</button>
		<button
			id="tab-ghost"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'ghost'}
			aria-controls="panel-ghost"
			class:active={activeDemo === 'ghost'}
			onclick={() => (activeDemo = 'ghost')}
		>
			Ghost Brackets
		</button>
		<button
			id="tab-context"
			class="tab"
			role="tab"
			aria-selected={activeDemo === 'context'}
			aria-controls="panel-context"
			class:active={activeDemo === 'context'}
			onclick={() => (activeDemo = 'context')}
		>
			Context Lens
		</button>
	</div>

	<!-- Minimap Demo -->
	{#if activeDemo === 'minimap'}
		<div
			class="demo-section"
			id="panel-minimap"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-minimap"
		>
			<div class="section-header">
				<h2>Minimap</h2>
				<p>A scaled-down overview of the document with highlights and click-to-navigate.</p>
			</div>

			<DemoExhibit code={minimapUsage} language="svelte" filename="Minimap.svelte">
				<div class="minimap-demo">
					<div class="editor-container">
						<div class="editor-preview" style="height: {editorHeight}px;">
							<div
								class="code-viewport"
								style="transform: translateY(-{minimapScrollTop * lineHeight}px);"
							>
								{#each sampleLines as line, i (i)}
									<div
										class="code-line"
										class:code-line--current={i === cursorLine}
										style="height: {lineHeight}px;"
									>
										<span class="line-num">{i + 1}</span>
										<span class="line-content">{line || ' '}</span>
									</div>
								{/each}
							</div>
						</div>

						<Minimap
							lines={sampleLines}
							scrollTop={minimapScrollTop}
							visibleLines={Math.floor(editorHeight / lineHeight)}
							{editorHeight}
							highlights={minimapHighlights}
							enabled={true}
							width={100}
							onNavigate={handleMinimapNavigate}
						/>
					</div>

					<div class="minimap-controls">
						<div class="control-group">
							<label>
								Scroll Position: {minimapScrollTop}
								<input
									type="range"
									min="0"
									max={sampleLines.length - 20}
									bind:value={minimapScrollTop}
								/>
							</label>
						</div>

						<div class="highlight-legend">
							<h4>Highlights</h4>
							<div class="legend-items">
								<div class="legend-item">
									<span class="legend-color" style="background: #f9e64f;"></span>
									<span>Search results (3)</span>
								</div>
								<div class="legend-item">
									<span class="legend-color" style="background: #f44747;"></span>
									<span>Errors (1)</span>
								</div>
								<div class="legend-item">
									<span class="legend-color" style="background: #ff8c00;"></span>
									<span>Warnings (1)</span>
								</div>
								<div class="legend-item">
									<span class="legend-color" style="background: #3b82f6;"></span>
									<span>Changes (2)</span>
								</div>
							</div>
						</div>
					</div>

					<div class="feature-info">
						<h4>Features</h4>
						<ul>
							<li>Scaled code preview with syntax coloring</li>
							<li>Viewport slider showing current position</li>
							<li>Highlighted regions for search, errors, warnings</li>
							<li>Click or drag to navigate</li>
							<li>Auto-scaling for large files</li>
						</ul>
					</div>
				</div>
			</DemoExhibit>
		</div>
	{/if}

	<!-- Breadcrumbs Demo -->
	{#if activeDemo === 'breadcrumbs'}
		<div
			class="demo-section"
			id="panel-breadcrumbs"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-breadcrumbs"
		>
			<div class="section-header">
				<h2>Breadcrumbs</h2>
				<p>Navigation trail showing current location in code structure.</p>
			</div>

			<div class="breadcrumbs-demo">
				<div class="breadcrumbs-container">
					<Breadcrumbs
						path={breadcrumbPath}
						fileName="src/components/UserManager.tsx"
						enabled={true}
						onNavigate={handleBreadcrumbNavigate}
					/>
				</div>

				<div class="editor-preview-small">
					{#each sampleLines.slice(15, 45) as line, i (i)}
						<div
							class="code-line"
							class:code-line--current={i + 15 === cursorLine}
							style="height: {lineHeight}px;"
						>
							<span class="line-num">{i + 16}</span>
							<span class="line-content">{line || ' '}</span>
						</div>
					{/each}
				</div>

				<div class="breadcrumbs-controls">
					<h4>Click breadcrumb items to:</h4>
					<ul>
						<li>Navigate to that symbol</li>
						<li>View sibling symbols (click dropdown arrow)</li>
						<li>Jump between related code sections</li>
					</ul>

					<div class="current-position">
						<strong>Current:</strong> Line {cursorLine + 1}
					</div>
				</div>

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Shows file > class > method hierarchy</li>
						<li>Click segments to navigate</li>
						<li>Dropdown shows sibling symbols</li>
						<li>Type-specific icons and colors</li>
						<li>Current line position indicator</li>
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Quick Actions Demo -->
	{#if activeDemo === 'quickactions'}
		<div
			class="demo-section"
			id="panel-quickactions"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-quickactions"
		>
			<div class="section-header">
				<h2>Quick Actions</h2>
				<p>Context-aware code actions with lightbulb indicator.</p>
			</div>

			<div class="quickactions-demo">
				<div class="quickactions-editor">
					<p class="qa-callout">
						<span class="qa-callout__glint" aria-hidden="true">💡</span>
						<span
							>This is a live editor — <strong>select code</strong> or click a line, then open the lightbulb
							to run a real refactor.</span
						>
					</p>
					<div class="qa-editor-wrap">
						<CustomEditor
							bind:this={qaEditorRef}
							bind:content={qaContent}
							language="typescript"
							complexityHighlighting={false}
							onCursorChange={syncQuickActions}
							onChange={syncQuickActions}
						/>
						{#if quickActionsManager && quickActionsEnabled}
							<div class="qa-menu-layer">
								<QuickActionsMenu
									manager={quickActionsManager}
									lineHeight={20}
									cursorLine={qaCursorLine}
									gutterWidth={50}
									showLightbulb={true}
									onExecute={handleQuickActionExecute}
								/>
							</div>
						{/if}

						{#if qaActionResult}
							<div class="action-toast" class:action-toast--ok={qaActionResult.ok}>
								{qaActionResult.text}
							</div>
						{/if}
					</div>

					<div class="qa-hint">
						<p class="qa-hint__lead">
							Three actions apply a <strong>real, single-undo edit</strong> (green = done, amber = safely
							refused). Try each:
						</p>
						<ul class="qa-triggers">
							<li>
								<span class="qa-triggers__do">select <code>subtotal * order.taxRate</code></span>
								<span class="qa-triggers__arrow" aria-hidden="true">→</span>
								<span class="qa-triggers__action">Extract to variable</span>
							</li>
							<li>
								<span class="qa-triggers__do">select the three <code>const</code> lines</span>
								<span class="qa-triggers__arrow" aria-hidden="true">→</span>
								<span class="qa-triggers__action">Extract to function</span>
							</li>
							<li>
								<span class="qa-triggers__do">click into the imports</span>
								<span class="qa-triggers__arrow" aria-hidden="true">→</span>
								<span class="qa-triggers__action">Organize imports</span>
								<span class="qa-triggers__note">(removes the duplicate)</span>
							</li>
						</ul>
						<p class="qa-hint__foot">Other menu items are preview-only and say so.</p>
					</div>
				</div>

				<div class="quickactions-controls">
					<button
						class="control-btn"
						class:active={quickActionsEnabled}
						onclick={() => (quickActionsEnabled = !quickActionsEnabled)}
					>
						{quickActionsEnabled ? 'Disable' : 'Enable'} Quick Actions
					</button>

					<div class="shortcut-hint">
						Keyboard: <code>Ctrl+.</code> to open menu
					</div>
				</div>

				<div class="feature-info">
					<h4>What actually runs here</h4>
					<div class="action-categories">
						<div class="category">
							<h5 class="category-title category-title--real">Wired — genuinely applied</h5>
							<ul class="action-list action-list--real">
								<li>Extract to variable</li>
								<li>Extract to function</li>
								<li>Organize imports</li>
							</ul>
						</div>
						<div class="category">
							<h5 class="category-title category-title--preview">Preview only — not wired</h5>
							<ul class="action-list action-list--preview">
								<li>Rename symbol — needs project-wide resolution</li>
								<li>Fix all problems — needs live diagnostics</li>
								<li>Add semicolon / remove unused</li>
								<li>Convert to arrow, generate JSDoc</li>
							</ul>
						</div>
					</div>
					<p class="qa-honesty">
						Wired actions apply a real, single-undo edit and refuse (amber) when the selection isn't
						safe. Preview-only items show the menu surface but don't modify code in this build —
						they say so when chosen rather than faking success.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Symbol Outline Demo -->
	{#if activeDemo === 'outline'}
		<div
			class="demo-section"
			id="panel-outline"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-outline"
		>
			<div class="section-header">
				<h2>Symbol Outline</h2>
				<p>Document structure panel for navigation and overview.</p>
			</div>

			<div class="outline-demo">
				<div class="outline-layout">
					<div class="editor-preview-small">
						{#each sampleLines as line, i (i)}
							<div
								class="code-line"
								class:code-line--current={i === cursorLine}
								style="height: {lineHeight}px;"
							>
								<span class="line-num">{i + 1}</span>
								<span class="line-content">{line || ' '}</span>
							</div>
						{/each}
					</div>

					<SymbolOutline
						{symbols}
						{activeSymbolId}
						enabled={true}
						sortBy={outlineSortBy}
						onNavigate={handleSymbolNavigate}
						width={280}
					/>
				</div>

				<div class="outline-controls">
					<div class="sort-controls">
						<span>Sort by:</span>
						<button
							class="sort-btn"
							class:active={outlineSortBy === 'position'}
							onclick={() => (outlineSortBy = 'position')}
						>
							Position
						</button>
						<button
							class="sort-btn"
							class:active={outlineSortBy === 'name'}
							onclick={() => (outlineSortBy = 'name')}
						>
							Name
						</button>
						<button
							class="sort-btn"
							class:active={outlineSortBy === 'kind'}
							onclick={() => (outlineSortBy = 'kind')}
						>
							Kind
						</button>
					</div>
				</div>

				<div class="feature-info">
					<h4>Features</h4>
					<ul>
						<li>Hierarchical symbol tree (classes, methods, properties)</li>
						<li>Search/filter symbols</li>
						<li>Click to navigate to symbol</li>
						<li>Collapse/expand sections</li>
						<li>Sort by position, name, or kind</li>
						<li>Active symbol highlighting</li>
					</ul>
				</div>
			</div>
		</div>
	{/if}

	<!-- Echo Cursor Demo -->
	{#if activeDemo === 'echo'}
		<div
			class="demo-section"
			id="panel-echo"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-echo"
		>
			<div class="section-header">
				<h2>Echo Cursors</h2>
				<p>Delayed mirror cursors replay edits at prepared locations for repeated code changes.</p>
			</div>

			<div class="overlay-demo">
				<div class="overlay-editor">
					{#if echoCursorManager}
						<EchoCursorLayer
							manager={echoCursorManager}
							{lineHeight}
							{charWidth}
							{gutterWidth}
							enabled={true}
						/>
					{/if}

					{#each contextLensLines as line (line.number)}
						<div class="code-line" style="height: {lineHeight}px;">
							<span class="line-num">{line.number + 1}</span>
							<span class="line-content">{line.text || ' '}</span>
						</div>
					{/each}
				</div>

				<div class="feature-info">
					<h4>What It Shows</h4>
					<p>
						Two echo cursors are armed in the editor. Type in the source buffer and the same real
						editor edits propagate after separate delays.
					</p>
				</div>

				<label class="echo-source">
					<span>Source buffer</span>
					<textarea
						value={echoSourceContent}
						oninput={(event) =>
							applyEchoSourceContent((event.currentTarget as HTMLTextAreaElement).value)}
						spellcheck="false"
					></textarea>
				</label>
			</div>
		</div>
	{/if}

	<!-- Ghost Bracket Demo -->
	{#if activeDemo === 'ghost'}
		<div
			class="demo-section"
			id="panel-ghost"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-ghost"
		>
			<div class="section-header">
				<h2>Ghost Brackets</h2>
				<p>
					Structural healing suggestions show missing brackets before the document breaks further.
				</p>
			</div>

			<div class="overlay-demo">
				<div class="overlay-editor">
					{#if bracketHealer}
						<GhostBracketLayer
							healer={bracketHealer}
							{lineHeight}
							{charWidth}
							{gutterWidth}
							enabled={true}
						/>
					{/if}

					{#each ghostBracketLines as line, i (i)}
						<div class="code-line" style="height: {lineHeight}px;">
							<span class="line-num">{i + 1}</span>
							<span class="line-content">{line || ' '}</span>
						</div>
					{/each}
				</div>

				<div class="feature-info">
					<h4>What It Shows</h4>
					<p>
						The <code>return &#123;</code> object on line 3 is never closed. The healer marks the
						break and floats a glowing ghost <code>&#125;</code> where it expects the structure to recover
						— so you see the missing brace before the document drifts further.
					</p>
				</div>
			</div>
		</div>
	{/if}

	<!-- Context Lens Demo -->
	{#if activeDemo === 'context'}
		<div
			class="demo-section"
			id="panel-context"
			role="tabpanel"
			tabindex="0"
			aria-labelledby="tab-context"
		>
			<div class="section-header">
				<h2>Context Lens</h2>
				<p>
					Inline context labels surface the active symbol signature without opening a side panel.
				</p>
			</div>

			<div class="overlay-demo">
				<div class="overlay-editor overlay-editor--context">
					<ContextLens
						lines={contextLensLines}
						cursorLine={contextLensCursorLine}
						{lineHeight}
						{charWidth}
						{gutterWidth}
						enabled={true}
						language="typescript"
					/>

					{#each contextLensLines as line (line.number)}
						<div
							class="code-line"
							class:code-line--current={line.number === contextLensCursorLine}
							style="height: {lineHeight}px;"
						>
							<span class="line-num">{line.number + 1}</span>
							<span class="line-content">{line.text || ' '}</span>
						</div>
					{/each}
				</div>

				<div class="feature-info">
					<h4>What It Shows</h4>
					<p>
						The cursor is inside an async TypeScript function, so the lens floats its signature
						above the declaration line.
					</p>
				</div>
			</div>
		</div>
	{/if}
</DemoPage>

<style>
	/* Tabs */
	.demo-tabs {
		display: flex;
		flex-wrap: nowrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		border-bottom: 1px solid var(--ide-border, #333);
		padding-bottom: 0.5rem;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		/* Show a thin accent thumb so the off-screen tabs read as
		   scrollable, not just technically reachable. Renders only when
		   the strip overflows (i.e. on narrow/phone widths). */
		scrollbar-width: thin;
		scrollbar-color: color-mix(in srgb, var(--ide-interactive) 50%, transparent) transparent;
	}

	.demo-tabs::-webkit-scrollbar {
		height: 4px;
	}

	.demo-tabs::-webkit-scrollbar-thumb {
		background: color-mix(in srgb, var(--ide-interactive) 50%, transparent);
		border-radius: 2px;
	}

	.tab {
		flex-shrink: 0;
		padding: 0.75rem 1.5rem;
		background: transparent;
		border: none;
		border-radius: 6px 6px 0 0;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tab:hover {
		color: var(--ide-text-primary, #e8e8f0);
		background: rgba(255, 255, 255, 0.05);
	}

	.tab:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.tab.active {
		color: var(--ide-interactive);
		background: color-mix(in srgb, var(--ide-interactive) 14%, transparent);
	}

	/* Section: a flat grouping container — the DemoExhibit (and each panel's own
	   inner cards) supply the only frame, so the wrapper stays frameless to avoid
	   a card-on-card double frame. */
	.demo-section {
		background: transparent;
		border: none;
		border-radius: 0;
		box-shadow: none;
		padding: 0;
	}

	.section-header {
		margin-bottom: 1.5rem;
	}

	.section-header h2 {
		margin: 0 0 0.5rem;
		font-size: 1.35rem;
		letter-spacing: -0.01em;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.section-header p {
		margin: 0;
		/* Lift the lead-in copy one step toward primary so the eye lands
		   on the demo content rather than washing into the chrome. */
		color: color-mix(
			in srgb,
			var(--ide-text-secondary, #aaa) 55%,
			var(--ide-text-primary, #e8e8f0)
		);
		font-size: 0.9rem;
	}

	/* Editor preview */
	.editor-container {
		display: flex;
		gap: 0;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
		margin-bottom: 1rem;
	}

	.editor-preview {
		flex: 1;
		overflow: hidden;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
	}

	.editor-preview-small {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: auto;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		max-height: 400px;
		position: relative;
	}

	/* Quick Actions tab: real editor + overlaid lightbulb menu */
	.qa-editor-wrap {
		position: relative;
		height: 264px;
		border: 1px solid var(--ide-border);
		border-radius: 8px;
		overflow: hidden;
	}

	.qa-menu-layer {
		position: absolute;
		inset: 8px 0 0 0; /* offset by the editor's top content padding so the bulb sits on its row */
		pointer-events: none;
		z-index: 30;
	}

	.qa-menu-layer :global(.quick-actions) {
		pointer-events: auto;
	}

	/* First-glance "this is interactive" callout: a thin accent rail + a glint
	   that pulses once on load so the live editor invites a click instead of
	   relying on muted body copy to carry all the discovery load. */
	.qa-callout {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0 0 0.75rem;
		padding: 0.55rem 0.75rem;
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--ide-text-secondary);
		background: color-mix(in srgb, var(--ide-interactive) 12%, transparent);
		border-left: 3px solid var(--ide-interactive);
		border-radius: 0 6px 6px 0;
	}

	.qa-callout strong {
		color: var(--ide-interactive);
		font-weight: 600;
	}

	.qa-callout__glint {
		flex-shrink: 0;
		font-size: 1rem;
		line-height: 1;
		transform-origin: center;
		animation: qaGlint 1.6s ease-in-out 2;
	}

	@keyframes qaGlint {
		0%,
		100% {
			transform: scale(1);
			filter: none;
		}
		50% {
			transform: scale(1.18);
			filter: drop-shadow(0 0 6px color-mix(in srgb, var(--ide-interactive) 70%, transparent));
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.qa-callout__glint {
			animation: none;
		}
	}

	.qa-hint {
		margin: 0.75rem 0 0;
		font-size: 0.8125rem;
		line-height: 1.5;
		color: var(--ide-text-secondary);
	}

	.qa-hint__lead {
		margin: 0 0 0.5rem;
	}

	.qa-hint__lead strong {
		color: var(--ide-text-primary);
	}

	.qa-hint__foot {
		margin: 0.5rem 0 0;
		color: var(--ide-text-muted);
	}

	/* The actionable steps, lifted out of the muted paragraph into discrete
	   rows so the gesture (left) and the refactor it triggers (accented, right)
	   read at a glance. */
	.qa-triggers {
		display: grid;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.qa-triggers li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem;
	}

	.qa-triggers__do {
		color: var(--ide-text-secondary);
	}

	.qa-triggers__do code {
		padding: 1px 5px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.78rem;
	}

	.qa-triggers__arrow {
		color: var(--ide-text-muted);
	}

	.qa-triggers__action {
		padding: 1px 8px;
		font-weight: 600;
		color: var(--ide-interactive);
		background: color-mix(in srgb, var(--ide-interactive) 14%, transparent);
		border-radius: 999px;
	}

	.qa-triggers__note {
		color: var(--ide-text-muted);
		font-size: 0.78rem;
	}

	.code-viewport {
		transition: transform 0.1s ease;
	}

	.code-line {
		display: flex;
		line-height: 20px;
		transition: background 0.1s ease;
	}

	.code-line:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.code-line--current {
		background: color-mix(in srgb, var(--ide-interactive) 15%, transparent);
	}

	.line-num {
		/* width == gutterWidth (50). box-sizing is border-box, so line-content
		   starts exactly where the editor overlays (echo lane, complexity layer)
		   are anchored — otherwise the lane leaves a leading-glyph seam. */
		width: 50px;
		padding-right: 8px;
		text-align: right;
		color: var(--ide-text-muted, #666);
		user-select: none;
		flex-shrink: 0;
	}

	.line-content {
		flex: 1;
		white-space: pre;
		color: var(--ide-text-primary, #e8e8f0);
	}

	/* Minimap demo */
	.minimap-demo {
		display: grid;
		gap: 1rem;
	}

	.minimap-controls {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}

	.control-group {
		flex: 1;
	}

	.control-group label {
		display: block;
		margin-bottom: 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.control-group input[type='range'] {
		width: 100%;
	}

	.highlight-legend h4 {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.legend-items {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.legend-color {
		width: 12px;
		height: 12px;
		border-radius: 2px;
	}

	/* Breadcrumbs demo */
	.breadcrumbs-demo {
		display: grid;
		gap: 1rem;
	}

	.breadcrumbs-container {
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
	}

	.breadcrumbs-controls {
		padding: 1rem;
		background: color-mix(in srgb, var(--ide-interactive) 10%, transparent);
		border-radius: 8px;
	}

	.breadcrumbs-controls h4 {
		margin: 0 0 0.5rem;
		font-size: 0.9rem;
		color: var(--ide-interactive);
	}

	.breadcrumbs-controls ul {
		margin: 0 0 1rem;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #c4c4d4);
	}

	.current-position {
		font-size: 0.85rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	/* Quick Actions demo */
	.quickactions-demo {
		display: grid;
		gap: 1rem;
	}

	.quickactions-editor {
		position: relative;
	}

	.quickactions-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.control-btn {
		padding: 0.5rem 1rem;
		background: color-mix(in srgb, var(--ide-interactive) 20%, transparent);
		border: 1px solid color-mix(in srgb, var(--ide-interactive) 30%, transparent);
		border-radius: 6px;
		color: var(--ide-interactive);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		background: color-mix(in srgb, var(--ide-interactive) 30%, transparent);
	}

	.control-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.control-btn.active {
		/* Filled active state: white on the deeper ocean blue clears AA (~5.3:1),
		   where white on the base interactive blue (#4a8db7) is only ~3.4:1. */
		background: var(--ide-interactive-strong);
		border-color: var(--ide-interactive-strong);
		color: #fff;
	}

	.shortcut-hint {
		font-size: 0.8rem;
		color: var(--ide-text-muted, #666);
	}

	.shortcut-hint code {
		background: rgba(255, 255, 255, 0.1);
		padding: 2px 6px;
		border-radius: 3px;
	}

	.action-toast {
		position: absolute;
		bottom: 12px;
		right: 12px;
		max-width: 80%;
		padding: 8px 16px;
		background: color-mix(in srgb, var(--ide-warning) 16%, var(--ide-bg-elevated, #252536));
		color: var(--ide-warning);
		border: 1px solid color-mix(in srgb, var(--ide-warning) 40%, transparent);
		border-radius: 6px;
		font-size: 0.85rem;
		animation: fadeIn 0.2s ease;
		z-index: 40;
	}

	.action-toast--ok {
		background: color-mix(in srgb, var(--ide-success) 16%, var(--ide-bg-elevated, #252536));
		color: var(--ide-success);
		border-color: color-mix(in srgb, var(--ide-success) 40%, transparent);
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.action-categories {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
	}

	.category h5 {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.category ul {
		margin: 0;
		padding: 0;
		list-style: none;
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.category li {
		margin: 0.25rem 0;
		padding-left: 1rem;
		position: relative;
	}

	.category li::before {
		content: '•';
		position: absolute;
		left: 0;
		color: var(--ide-interactive);
	}

	h5.category-title--real {
		color: var(--ide-success);
	}

	h5.category-title--preview {
		color: var(--ide-text-muted);
	}

	.action-list--real li::before {
		content: '✓';
		color: var(--ide-success);
	}

	.action-list--preview li::before {
		content: '◦';
		color: var(--ide-text-muted);
	}

	.qa-honesty {
		margin: 0.85rem 0 0;
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--ide-text-secondary, #c4c4d4);
	}

	/* Outline demo */
	.outline-demo {
		display: grid;
		gap: 1rem;
	}

	.outline-layout {
		display: flex;
		gap: 0;
		background: rgba(0, 0, 0, 0.3);
		border-radius: 8px;
		overflow: hidden;
		height: 500px;
	}

	.outline-layout .editor-preview-small {
		flex: 1;
		border-radius: 0;
		max-height: none;
	}

	.outline-controls {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.sort-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.sort-btn {
		padding: 4px 10px;
		background: rgba(255, 255, 255, 0.1);
		border: none;
		border-radius: 4px;
		color: var(--ide-text-secondary, #aaa);
		font-size: 0.8rem;
		cursor: pointer;
	}

	.sort-btn:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.sort-btn:focus-visible {
		outline: 2px solid var(--ide-interactive-focus);
		outline-offset: 2px;
	}

	.sort-btn.active {
		/* Tinted (not filled) active state: the accent text rides on a 30% blue
		   wash, so it keeps the interactive blue rather than the deeper fill. */
		background: color-mix(in srgb, var(--ide-interactive) 30%, transparent);
		color: var(--ide-interactive);
	}

	/* Overlay demos */
	.overlay-demo {
		display: grid;
		gap: 1rem;
	}

	.overlay-editor {
		position: relative;
		min-height: 260px;
		overflow: hidden;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 13px;
		padding: 18px 0 14px;
	}

	.overlay-editor--context {
		padding-top: 30px;
	}

	.echo-source {
		display: grid;
		gap: 0.5rem;
	}

	.echo-source span {
		font-size: 0.8rem;
		color: var(--ide-text-secondary, #aaa);
	}

	.echo-source textarea {
		min-height: 160px;
		padding: 0.75rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid var(--ide-border, #333);
		border-radius: 6px;
		color: var(--ide-text-primary, #e8e8f0);
		font:
			13px/1.5 'JetBrains Mono',
			monospace;
		resize: vertical;
	}

	.overlay-editor :global(.context-lens),
	.overlay-editor :global(.echo-cursor-layer),
	.overlay-editor :global(.ghost-bracket-layer) {
		top: 18px;
		bottom: 14px;
	}

	/* Ghost-bracket legibility boost (page-side): the component renders the
	   inferred brace at opacity 0.5 in the confidence color, which on this dark
	   panel sits too close to real glyphs to read as a suggestion. Lift the
	   resting opacity and add an accent glow so the ghost brace announces itself
	   at a glance. (The component still owns the deeper fix — anchoring the
	   marker on the unclosed line — tracked as a component change.) */
	.overlay-editor :global(.ghost-bracket__char) {
		opacity: 0.92;
		font-weight: 700;
		text-shadow: 0 0 8px color-mix(in srgb, var(--ide-interactive) 60%, transparent);
	}

	/* Re-anchor the echo status pill to THIS editor instead of the viewport.
	   The component ships position:fixed (bottom/right:16px), which leaves the
	   "~ N echos" chip clinging to the section's outer right edge, detached from
	   the editor it reports on. Pin it to the overlay editor's top-right corner
	   so it reads like the Context Lens / Ghost markers — a status chip bound to
	   its surface. (.overlay-editor is position:relative.) */
	.overlay-editor :global(.echo-mode-indicator) {
		position: absolute;
		inset: 8px 8px auto auto;
		bottom: auto;
	}

	.overlay-editor--context :global(.context-lens) {
		top: 30px;
	}

	/* Feature info */
	.feature-info {
		padding: 1rem;
		background: color-mix(in srgb, var(--ide-interactive) 10%, transparent);
		border-radius: 8px;
		margin-top: 1rem;
	}

	.feature-info h4 {
		margin: 0 0 0.75rem;
		font-size: 0.9rem;
		color: var(--ide-interactive);
	}

	.feature-info ul {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.85rem;
		color: var(--ide-text-secondary, #c4c4d4);
	}

	.feature-info p {
		margin: 0;
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--ide-text-secondary, #c4c4d4);
	}

	.feature-info p code {
		padding: 1px 5px;
		background: rgba(255, 255, 255, 0.08);
		border-radius: 3px;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.8rem;
		color: var(--ide-text-primary, #e8e8f0);
	}

	.feature-info li {
		margin: 0.25rem 0;
	}

	/* Responsive: tablet -> mobile */
	@media (max-width: 860px) {
		.minimap-controls {
			flex-direction: column;
			gap: 1rem;
		}

		/* Stack the outline editor above the symbol panel so neither
		   steals a fixed width that overflows the viewport. */
		.outline-layout {
			flex-direction: column;
			height: auto;
		}

		.outline-layout .editor-preview-small {
			max-height: 320px;
		}
	}

	/* Responsive: phones */
	@media (max-width: 640px) {
		.tab {
			padding: 0.6rem 1rem;
			font-size: 0.85rem;
			/* keep a comfortable tap target */
			min-height: 44px;
		}

		/* Let the minimap editor scroll horizontally with a fade cue
		   instead of clipping long import lines. Stack the 100px minimap
		   below the code so it never steals editor width on a phone. */
		.editor-container {
			flex-direction: column;
		}

		/* Once the 100px minimap stacks under the code, centre it and swap
		   its side border for a top border so it reads as a deliberate
		   scaled overview rather than a clipped sidebar. */
		.editor-container :global(.minimap) {
			align-self: center;
			border-left: none;
			border-top: 1px solid var(--ide-border, #333);
		}

		.editor-preview {
			/* Re-assert the fixed viewport after .editor-container reflows to a
			   column at this breakpoint: without this the inline height:400px no
			   longer constrains the child, the editor renders all ~109 lines
			   inline, and the minimap (which encodes a 400px scroll window)
			   becomes decorative noise. Keep it framed and scrollable. */
			height: 400px;
			max-height: 400px;
			overflow-x: auto;
			overflow-y: auto;
			-webkit-overflow-scrolling: touch;
			font-size: 12px;
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
		}

		.editor-preview-small {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			font-size: 12px;
			-webkit-mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
			mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
		}

		.legend-items {
			gap: 0.75rem;
		}

		.quickactions-controls,
		.outline-controls {
			flex-wrap: wrap;
		}

		.control-btn {
			min-height: 44px;
		}

		.sort-controls {
			flex-wrap: wrap;
			gap: 0.4rem;
		}

		.sort-btn {
			min-height: 36px;
			padding: 6px 12px;
		}

		.action-categories {
			grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		}

		/* The outline panel ships a fixed 280px inline width; cap it so it
		   never overflows a narrow phone once stacked under the editor. */
		.outline-layout :global(.symbol-outline) {
			width: 100% !important;
			max-width: 100%;
		}
	}
</style>
