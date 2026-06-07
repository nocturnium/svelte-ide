<script lang="ts" module>
	/**
	 * FileExplorer - File tree navigation component
	 *
	 * Displays a hierarchical file tree with expandable folders,
	 * file icons, and selection support. Supports VFS lock,
	 * agent presence, and file change status indicators.
	 */

	export interface FileNode {
		id: string;
		name: string;
		type: 'file' | 'folder';
		path: string;
		children?: FileNode[];
		expanded?: boolean;
	}

	/** File change status type - for transaction/git operations */
	export type FileChangeStatus = 'created' | 'modified' | 'deleted' | 'renamed' | 'clean';

	/** @deprecated Use FileChangeStatus instead */
	export type GitFileStatus = FileChangeStatus;
</script>

<script lang="ts">
	import { Icon, Button, ContextMenu, Tooltip } from '$components/core';
	import type { ContextMenuItem } from '$components/core/ContextMenu.svelte';
	import FileIcon from './FileIcon.svelte';
	import LockIndicator from '$components/vfs/LockIndicator.svelte';
	import AgentAvatar from '$components/agents/AgentAvatar.svelte';
	import type { VFSLockStatus, Agent } from '$lib/types';
	import { tick, onDestroy } from 'svelte';

	interface Props {
		/** Root file nodes */
		files: FileNode[];
		/** Currently selected file path */
		selectedPath?: string | null;
		/** Current user ID for lock ownership detection */
		userId?: string;
		/** Map of file path to lock status */
		lockStatuses?: Map<string, VFSLockStatus>;
		/** Map of file path to agents currently editing */
		agentsByFile?: Map<string, Agent[]>;
		/** Map of file path to change status (created, modified, deleted, renamed) */
		fileStatuses?: Map<string, FileChangeStatus>;
		/** @deprecated Use fileStatuses instead */
		gitStatuses?: Map<string, FileChangeStatus>;
		/** Show lock indicators */
		showLocks?: boolean;
		/** Show agent indicators */
		showAgents?: boolean;
		/** Show file change status indicators */
		showFileStatus?: boolean;
		/** @deprecated Use showFileStatus instead */
		showGitStatus?: boolean;
		/** Called when a file is selected */
		onSelect?: (node: FileNode) => void;
		/** Called when a file is double-clicked (open) */
		onOpen?: (node: FileNode) => void;
		/** Called when a folder is toggled */
		onToggle?: (node: FileNode) => void;
		/** Called when a new file is requested (with name from inline input) */
		onNewFile?: (parentPath: string, name: string) => void;
		/** Called when a new folder is requested (with name from inline input) */
		onNewFolder?: (parentPath: string, name: string) => void;
		/** Called when rename is requested */
		onRename?: (node: FileNode) => void;
		/** Called when delete is requested */
		onDelete?: (node: FileNode) => void;
		/** Called when lock is requested */
		onLock?: (node: FileNode) => void;
		/** Called when unlock is requested */
		onUnlock?: (node: FileNode) => void;
		/** Additional CSS class */
		class?: string;
	}

	let {
		files,
		selectedPath = null,
		userId = '',
		lockStatuses = new Map(),
		agentsByFile = new Map(),
		fileStatuses,
		gitStatuses,
		showLocks = true,
		showAgents = true,
		showFileStatus,
		showGitStatus,
		onSelect,
		onOpen,
		onToggle,
		onNewFile,
		onNewFolder,
		onRename,
		onDelete,
		onLock,
		onUnlock,
		class: className = ''
	}: Props = $props();

	// Use fileStatuses if provided, fall back to gitStatuses for backwards compatibility
	const statusMap = $derived(fileStatuses ?? gitStatuses ?? new Map<string, FileChangeStatus>());
	const showStatus = $derived(showFileStatus ?? showGitStatus ?? true);

	// Helper to get file change status for a file path
	function getFileStatus(path: string): FileChangeStatus {
		return statusMap.get(path) ?? 'clean';
	}

	// Helper to check if a folder contains any files with changes
	function folderHasChanges(node: FileNode): boolean {
		if (node.type === 'file') {
			return getFileStatus(node.path) !== 'clean';
		}
		if (!node.children) return false;
		return node.children.some((child) => folderHasChanges(child));
	}

	// Get the most "important" status for a folder (deleted > modified > created > renamed)
	function getFolderStatus(node: FileNode): FileChangeStatus {
		if (node.type === 'file') return getFileStatus(node.path);
		if (!node.children) return 'clean';

		let hasDeleted = false;
		let hasModified = false;
		let hasCreated = false;
		let hasRenamed = false;

		function checkChildren(children: FileNode[]) {
			for (const child of children) {
				if (child.type === 'file') {
					const status = getFileStatus(child.path);
					if (status === 'deleted') hasDeleted = true;
					else if (status === 'modified') hasModified = true;
					else if (status === 'created') hasCreated = true;
					else if (status === 'renamed') hasRenamed = true;
				} else if (child.children) {
					checkChildren(child.children);
				}
			}
		}

		checkChildren(node.children);

		if (hasDeleted) return 'deleted';
		if (hasModified) return 'modified';
		if (hasCreated) return 'created';
		if (hasRenamed) return 'renamed';
		return 'clean';
	}

	// Helper to check if file is locked by current user
	function isOwnedByMe(path: string): boolean {
		const status = lockStatuses.get(path);
		if (status?.status !== 'locked') return false;
		return status.lock.holder === userId;
	}

	// Helper to check if file is locked by an AI agent
	function isLockedByAI(path: string): boolean {
		const status = lockStatuses.get(path);
		if (status?.status !== 'locked') return false;
		return status.lock.holderType === 'agent';
	}

	// Get agents currently editing a file
	function getAgentsForFile(path: string): Agent[] {
		return agentsByFile.get(path) ?? [];
	}

	let expandedFolders = $state<Set<string>>(new Set());
	let contextMenuNode = $state<FileNode | null>(null);
	let contextMenuPos = $state({ x: 0, y: 0 });
	let showContextMenu = $state(false);

	// Inline creation state
	let inlineCreation = $state<{
		parentPath: string;
		type: 'file' | 'folder';
		name: string;
	} | null>(null);
	let inlineInputRef = $state<HTMLInputElement | null>(null);

	// Cleanup on component destruction
	onDestroy(() => {
		// Clear inline creation state to release any DOM references
		inlineCreation = null;
		inlineInputRef = null;
	});

	function toggleFolder(node: FileNode) {
		if (node.type !== 'folder') return;

		const newExpanded = new Set(expandedFolders);
		if (newExpanded.has(node.path)) {
			newExpanded.delete(node.path);
		} else {
			newExpanded.add(node.path);
		}
		expandedFolders = newExpanded;
		onToggle?.(node);
	}

	// Inline creation functions
	async function startInlineCreation(parentPath: string, type: 'file' | 'folder') {
		// Expand parent folder if it's not root
		if (parentPath) {
			const newExpanded = new Set(expandedFolders);
			newExpanded.add(parentPath);
			expandedFolders = newExpanded;
		}

		inlineCreation = {
			parentPath,
			type,
			name: ''
		};

		// Focus the input after DOM update
		await tick();
		inlineInputRef?.focus();
	}

	function confirmInlineCreation() {
		if (!inlineCreation || !inlineCreation.name.trim()) {
			cancelInlineCreation();
			return;
		}

		const { parentPath, type, name } = inlineCreation;
		const trimmedName = name.trim();

		if (type === 'file') {
			onNewFile?.(parentPath, trimmedName);
		} else {
			onNewFolder?.(parentPath, trimmedName);
		}

		inlineCreation = null;
	}

	function cancelInlineCreation() {
		inlineCreation = null;
	}

	function handleInlineKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			confirmInlineCreation();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelInlineCreation();
		}
	}

	function handleClick(node: FileNode) {
		if (node.type === 'folder') {
			toggleFolder(node);
		}
		onSelect?.(node);
	}

	function handleDoubleClick(node: FileNode) {
		if (node.type === 'file') {
			onOpen?.(node);
		}
	}

	function handleKeyDown(e: KeyboardEvent, node: FileNode) {
		if (e.key === 'Enter') {
			if (node.type === 'folder') {
				toggleFolder(node);
			} else {
				onOpen?.(node);
			}
		} else if (e.key === 'ArrowRight' && node.type === 'folder') {
			if (!expandedFolders.has(node.path)) {
				toggleFolder(node);
			}
		} else if (e.key === 'ArrowLeft' && node.type === 'folder') {
			if (expandedFolders.has(node.path)) {
				toggleFolder(node);
			}
		}
	}

	function handleContextMenu(e: MouseEvent, node: FileNode) {
		e.preventDefault();
		contextMenuNode = node;
		contextMenuPos = { x: e.clientX, y: e.clientY };
		showContextMenu = true;
	}

	function closeContextMenu() {
		showContextMenu = false;
		contextMenuNode = null;
	}

	// Memoized context menu items - only recalculates when dependencies change
	let contextMenuItems = $derived.by((): ContextMenuItem[] => {
		if (!contextMenuNode) return [];

		const items: ContextMenuItem[] = [];

		if (contextMenuNode.type === 'folder') {
			items.push(
				{
					id: 'new-file',
					label: 'New File',
					icon: 'file-plus'
				},
				{
					id: 'new-folder',
					label: 'New Folder',
					icon: 'folder-plus'
				},
				{
					id: 'separator-1',
					label: '',
					separator: true
				}
			);
		}

		// Lock/Unlock options for files
		if (contextMenuNode.type === 'file' && showLocks) {
			const lockStatus = lockStatuses.get(contextMenuNode.path);
			if (lockStatus?.status === 'locked' && isOwnedByMe(contextMenuNode.path)) {
				items.push({
					id: 'unlock',
					label: 'Unlock',
					icon: 'unlock'
				});
			} else if (lockStatus?.status !== 'locked') {
				items.push({
					id: 'lock',
					label: 'Lock for Editing',
					icon: 'lock'
				});
			}
			items.push({
				id: 'separator-2',
				label: '',
				separator: true
			});
		}

		items.push(
			{
				id: 'rename',
				label: 'Rename',
				icon: 'edit',
				shortcut: ['F2']
			},
			{
				id: 'delete',
				label: 'Delete',
				icon: 'trash',
				danger: true
			}
		);

		return items;
	});

	function handleContextMenuSelect(item: ContextMenuItem) {
		if (!contextMenuNode) return;

		switch (item.id) {
			case 'new-file':
				startInlineCreation(contextMenuNode.path, 'file');
				break;
			case 'new-folder':
				startInlineCreation(contextMenuNode.path, 'folder');
				break;
			case 'rename':
				onRename?.(contextMenuNode);
				break;
			case 'delete':
				onDelete?.(contextMenuNode);
				break;
			case 'lock':
				onLock?.(contextMenuNode);
				break;
			case 'unlock':
				onUnlock?.(contextMenuNode);
				break;
		}
	}

	function isExpanded(node: FileNode): boolean {
		return expandedFolders.has(node.path);
	}

	function sortNodes(nodes: FileNode[]): FileNode[] {
		return [...nodes].sort((a, b) => {
			// Folders first
			if (a.type !== b.type) {
				return a.type === 'folder' ? -1 : 1;
			}
			// Then alphabetically
			return a.name.localeCompare(b.name);
		});
	}
</script>

<div class="file-explorer {className}">
	<div class="file-explorer__header">
		<span class="file-explorer__title">Explorer</span>
		<div class="file-explorer__actions">
			<Button variant="ghost" size="xs" onclick={() => startInlineCreation('', 'file')} title="New File">
				<Icon name="file-plus" size={14} />
			</Button>
			<Button variant="ghost" size="xs" onclick={() => startInlineCreation('', 'folder')} title="New Folder">
				<Icon name="folder-plus" size={14} />
			</Button>
		</div>
	</div>

	<div class="file-explorer__tree" role="tree">
		<!-- Inline creation at root level -->
		{#if inlineCreation && inlineCreation.parentPath === ''}
			{@render inlineInput(0)}
		{/if}
		{#each sortNodes(files) as node (node.id)}
			{@render fileNode(node, 0)}
		{/each}
	</div>

	{#if showContextMenu && contextMenuNode}
		<ContextMenu
			items={contextMenuItems}
			x={contextMenuPos.x}
			y={contextMenuPos.y}
			onSelect={handleContextMenuSelect}
			onClose={closeContextMenu}
		/>
	{/if}
</div>

{#snippet fileNode(node: FileNode, depth: number)}
	{@const lockStatus = lockStatuses.get(node.path)}
	{@const fileAgents = getAgentsForFile(node.path)}
	{@const isLockedByAnother = lockStatus?.status === 'locked' && !isOwnedByMe(node.path)}
	{@const changeStatus = node.type === 'file' ? getFileStatus(node.path) : getFolderStatus(node)}
	<div
		class="file-node"
		class:file-node--selected={selectedPath === node.path}
		class:file-node--folder={node.type === 'folder'}
		class:file-node--locked={isLockedByAnother}
		class:file-node--status-created={showStatus && changeStatus === 'created'}
		class:file-node--status-modified={showStatus && changeStatus === 'modified'}
		class:file-node--status-deleted={showStatus && changeStatus === 'deleted'}
		class:file-node--status-renamed={showStatus && changeStatus === 'renamed'}
		style="--depth: {depth}"
		role="treeitem"
		aria-selected={selectedPath === node.path}
		aria-expanded={node.type === 'folder' ? isExpanded(node) : undefined}
		tabindex={0}
		onclick={() => handleClick(node)}
		ondblclick={() => handleDoubleClick(node)}
		onkeydown={(e) => handleKeyDown(e, node)}
		oncontextmenu={(e) => handleContextMenu(e, node)}
	>
		<div class="file-node__content">
			<!-- File change status dot indicator -->
			{#if showStatus && changeStatus !== 'clean'}
				<span
					class="file-node__status-dot"
					class:file-node__status-dot--created={changeStatus === 'created'}
					class:file-node__status-dot--modified={changeStatus === 'modified'}
					class:file-node__status-dot--deleted={changeStatus === 'deleted'}
					class:file-node__status-dot--renamed={changeStatus === 'renamed'}
					title={changeStatus === 'created' ? 'New' : changeStatus === 'modified' ? 'Modified' : changeStatus === 'deleted' ? 'Deleted' : 'Renamed'}
				></span>
			{/if}
			{#if node.type === 'folder'}
				<span class="file-node__chevron" class:file-node__chevron--expanded={isExpanded(node)}>
					<Icon name="chevron-right" size={12} />
				</span>
				<Icon name={isExpanded(node) ? 'folder-open' : 'folder'} size={16} />
			{:else}
				<span class="file-node__spacer"></span>
				<div class="file-node__icon-wrapper">
					<FileIcon filename={node.name} size={16} />
					{#if showLocks && lockStatus && lockStatus.status !== 'unlocked'}
						<div class="file-node__lock-badge">
							<LockIndicator
								status={lockStatus}
								isOwned={isOwnedByMe(node.path)}
								isAI={isLockedByAI(node.path)}
								size="xs"
							/>
						</div>
					{/if}
				</div>
			{/if}
			<span class="file-node__name">{node.name}</span>

			<!-- Agent indicators -->
			{#if showAgents && fileAgents.length > 0}
				<div class="file-node__agents">
					{#each fileAgents.slice(0, 3) as agent (agent.id)}
						<Tooltip content="{agent.name} is editing">
							<AgentAvatar {agent} size="xs" showStatus={false} showBadge={false} showProgress={false} />
						</Tooltip>
					{/each}
					{#if fileAgents.length > 3}
						<Tooltip content="{fileAgents.length - 3} more agents editing">
							<span class="file-node__agent-count">+{fileAgents.length - 3}</span>
						</Tooltip>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#if node.type === 'folder' && isExpanded(node)}
		<div class="file-node__children" role="group">
			<!-- Inline creation inside this folder -->
			{#if inlineCreation && inlineCreation.parentPath === node.path}
				{@render inlineInput(depth + 1)}
			{/if}
			{#if node.children}
				{#each sortNodes(node.children) as child (child.id)}
					{@render fileNode(child, depth + 1)}
				{/each}
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet inlineInput(depth: number)}
	{#if inlineCreation}
		<div class="file-node file-node--inline-create" style="--depth: {depth}">
			<div class="file-node__content">
				<span class="file-node__spacer"></span>
				{#if inlineCreation.type === 'folder'}
					<Icon name="folder" size={16} />
				{:else}
					<Icon name="file" size={16} />
				{/if}
				<input
					bind:this={inlineInputRef}
					type="text"
					class="file-node__inline-input"
					bind:value={inlineCreation.name}
					onkeydown={handleInlineKeydown}
					onblur={confirmInlineCreation}
					placeholder={inlineCreation.type === 'folder' ? 'folder name' : 'file name'}
				/>
			</div>
		</div>
	{/if}
{/snippet}

<style>
	.file-explorer {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: var(--ide-bg-secondary);
		overflow: hidden;
	}

	.file-explorer__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--ide-spacing-sm) var(--ide-spacing-md);
		border-bottom: 1px solid var(--ide-border);
	}

	.file-explorer__title {
		font-size: var(--ide-font-size-xs);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--ide-text-secondary);
	}

	.file-explorer__actions {
		display: flex;
		gap: var(--ide-spacing-xs);
	}

	.file-explorer__tree {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: var(--ide-spacing-xs) 0;
	}

	.file-node {
		display: flex;
		align-items: center;
		cursor: pointer;
		user-select: none;
	}

	.file-node__content {
		display: flex;
		align-items: center;
		gap: var(--ide-spacing-xs);
		padding: 2px var(--ide-spacing-sm);
		padding-left: calc(var(--ide-spacing-sm) + var(--depth) * 12px);
		width: 100%;
		min-height: 24px;
		transition: background-color 0.1s ease;
	}

	.file-node:hover .file-node__content {
		background: var(--ide-bg-hover);
	}

	.file-node--selected .file-node__content {
		background: var(--ide-bg-tertiary);
	}

	.file-node--selected:hover .file-node__content {
		background: var(--ide-bg-tertiary);
	}

	.file-node:focus {
		outline: none;
	}

	.file-node:focus-visible .file-node__content {
		outline: 1px solid var(--ide-interactive);
		outline-offset: -1px;
	}

	.file-node__chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 12px;
		height: 12px;
		transition: transform 0.15s ease;
		color: var(--ide-text-muted);
	}

	.file-node__chevron--expanded {
		transform: rotate(90deg);
	}

	.file-node__spacer {
		width: 12px;
	}

	.file-node__name {
		flex: 1;
		font-size: var(--ide-font-size-sm);
		color: var(--ide-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-node--folder .file-node__name {
		color: var(--ide-text-primary);
	}

	.file-node__children {
		display: flex;
		flex-direction: column;
	}

	/* Folder icons */
	.file-node--folder :global(.icon) {
		color: var(--color-nocturnium-aurora-yellow, #f0c674);
	}

	/* Locked file styling */
	.file-node--locked .file-node__name {
		opacity: 0.6;
	}

	/* Icon wrapper for positioning lock badge */
	.file-node__icon-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.file-node__lock-badge {
		position: absolute;
		bottom: -4px;
		right: -4px;
		background: var(--ide-bg-secondary);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Agent indicators */
	.file-node__agents {
		display: flex;
		align-items: center;
		gap: 2px;
		margin-left: auto;
		padding-left: var(--ide-spacing-xs);
	}

	.file-node__agent-count {
		font-size: 10px;
		color: var(--ide-text-muted);
		background: var(--ide-bg-tertiary);
		padding: 0 4px;
		border-radius: var(--ide-radius-sm);
	}

	/* Inline creation input */
	.file-node--inline-create {
		background: var(--ide-bg-tertiary);
	}

	.file-node__inline-input {
		flex: 1;
		background: var(--ide-bg-primary);
		border: 1px solid var(--ide-interactive);
		border-radius: var(--ide-radius-sm);
		color: var(--ide-text-primary);
		font-size: var(--ide-font-size-sm);
		font-family: inherit;
		padding: 2px 6px;
		outline: none;
		min-width: 0;
	}

	.file-node__inline-input::placeholder {
		color: var(--ide-text-muted);
	}

	.file-node__inline-input:focus {
		border-color: var(--ide-interactive);
		box-shadow: 0 0 0 2px rgba(var(--ide-interactive-rgb, 79, 140, 201), 0.2);
	}

	/* ==================== File Change Status Indicators ==================== */

	/* Status dot indicator */
	.file-node__status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
		margin-right: 2px;
	}

	.file-node__status-dot--created {
		background: var(--ide-status-created, #4ade80);
		box-shadow: 0 0 4px var(--ide-status-created, #4ade80);
	}

	.file-node__status-dot--modified {
		background: var(--ide-status-modified, #facc15);
		box-shadow: 0 0 4px var(--ide-status-modified, #facc15);
	}

	.file-node__status-dot--deleted {
		background: var(--ide-status-deleted, #ef4444);
		box-shadow: 0 0 4px var(--ide-status-deleted, #ef4444);
	}

	.file-node__status-dot--renamed {
		background: var(--ide-status-renamed, #a78bfa);
		box-shadow: 0 0 4px var(--ide-status-renamed, #a78bfa);
	}

	/* Status text colors */
	.file-node--status-created .file-node__name {
		color: var(--ide-status-created, #4ade80);
	}

	.file-node--status-modified .file-node__name {
		color: var(--ide-status-modified, #facc15);
	}

	.file-node--status-deleted .file-node__name {
		color: var(--ide-status-deleted, #ef4444);
		text-decoration: line-through;
		opacity: 0.7;
	}

	.file-node--status-renamed .file-node__name {
		color: var(--ide-status-renamed, #a78bfa);
		font-style: italic;
	}

	/* Folder icon color when it contains changes */
	.file-node--folder.file-node--status-created :global(.icon) {
		color: var(--ide-status-created, #4ade80);
	}

	.file-node--folder.file-node--status-modified :global(.icon) {
		color: var(--ide-status-modified, #facc15);
	}

	.file-node--folder.file-node--status-deleted :global(.icon) {
		color: var(--ide-status-deleted, #ef4444);
	}

	.file-node--folder.file-node--status-renamed :global(.icon) {
		color: var(--ide-status-renamed, #a78bfa);
	}
</style>
