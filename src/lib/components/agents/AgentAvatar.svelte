<script lang="ts">
	/**
	 * AgentAvatar - Premium avatar with AI presence
	 *
	 * Visual hierarchy:
	 * - Status ring: Immediate state awareness
	 * - Progress ring: Work completion with gradient glow
	 * - Type badge: Agent role at a glance with premium AI treatment
	 * - Micro-animations: Every state change feels intentional
	 */

	import type { Agent, AgentStatus } from '$lib/types';
	import { Avatar } from '$lib/components/core';

	interface Props {
		agent: Agent;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
		showStatus?: boolean;
		showBadge?: boolean;
		showProgress?: boolean;
		/** Show phase label below avatar */
		showPhase?: boolean;
		class?: string;
	}

	let {
		agent,
		size = 'md',
		showStatus = true,
		showBadge = true,
		showProgress = true,
		showPhase = false,
		class: className = ''
	}: Props = $props();

	const sizeMap = { xs: 20, sm: 24, md: 32, lg: 40, xl: 48 };
	const badgeSizeMap = { xs: 10, sm: 12, md: 14, lg: 16, xl: 20 };
	const strokeWidthMap = { xs: 1.5, sm: 2, md: 2, lg: 2.5, xl: 3 };

	let avatarSize = $derived(sizeMap[size]);
	let badgeSize = $derived(badgeSizeMap[size]);
	let strokeWidth = $derived(strokeWidthMap[size]);

	// Progress calculations
	let progress = $derived(agent.currentTask?.progress.percentage ?? 0);
	let radius = $derived(avatarSize / 2 + 2);
	let circumference = $derived(2 * Math.PI * radius);
	let strokeDashoffset = $derived(circumference - (progress / 100) * circumference);

	// Phase display
	let phaseLabel = $derived.by(() => {
		if (!agent.currentTask?.progress.phase) return null;
		const phase = agent.currentTask.progress.phase;
		switch (phase) {
			case 'planning': return 'Planning...';
			case 'implementing': return 'Coding...';
			case 'testing': return 'Testing...';
			case 'complete': return 'Done';
			default: return phase;
		}
	});

	// Is this an AI agent?
	let isAI = $derived(
		agent.type === 'coder' ||
		agent.type === 'reviewer' ||
		agent.type === 'tester' ||
		agent.type === 'architect'
	);

	// Unique ID for SVG gradients
	let gradientId = $derived(`progress-gradient-${agent.id.slice(0, 8)}`);

	function getStatusClass(status: AgentStatus): string {
		return `agent-avatar__ring--${status}`;
	}
</script>

<div
	class="agent-avatar agent-avatar--{size} {className}"
	class:agent-avatar--ai={isAI}
	class:agent-avatar--busy={agent.status === 'busy'}
	style="--avatar-size: {avatarSize}px"
>
	<!-- SVG Definitions for gradients -->
	<svg class="agent-avatar__defs" aria-hidden="true">
		<defs>
			<!-- AI Progress Gradient -->
			<linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
				<stop offset="0%" stop-color="var(--ide-agent-ai-primary)" />
				<stop offset="50%" stop-color="var(--color-nocturnium-flame)" />
				<stop offset="100%" stop-color="var(--ide-agent-ai-secondary)" />
			</linearGradient>
			<!-- Glow filter -->
			<filter id="glow-{agent.id.slice(0, 8)}" x="-50%" y="-50%" width="200%" height="200%">
				<feGaussianBlur stdDeviation="2" result="coloredBlur"/>
				<feMerge>
					<feMergeNode in="coloredBlur"/>
					<feMergeNode in="SourceGraphic"/>
				</feMerge>
			</filter>
		</defs>
	</svg>

	<!-- Base Avatar -->
	<div class="agent-avatar__inner">
		<Avatar name={agent.name} src={agent.avatar} {size} status={agent.status} />
	</div>

	<!-- Status Ring -->
	{#if showStatus && agent.status !== 'offline'}
		<div class="agent-avatar__ring {getStatusClass(agent.status)}" aria-hidden="true"></div>
	{/if}

	<!-- Progress Ring (for busy agents with tasks) -->
	{#if showProgress && agent.status === 'busy' && agent.currentTask}
		<svg
			class="agent-avatar__progress"
			viewBox="0 0 {avatarSize + 8} {avatarSize + 8}"
			aria-label="Progress: {progress}%"
		>
			<!-- Background track -->
			<circle
				cx={(avatarSize + 8) / 2}
				cy={(avatarSize + 8) / 2}
				r={radius}
				fill="none"
				stroke="var(--ide-progress-track)"
				stroke-width={strokeWidth}
				opacity="0.3"
			/>
			<!-- Progress arc with gradient -->
			<circle
				class="agent-avatar__progress-arc"
				cx={(avatarSize + 8) / 2}
				cy={(avatarSize + 8) / 2}
				r={radius}
				fill="none"
				stroke="url(#{gradientId})"
				stroke-width={strokeWidth}
				stroke-linecap="round"
				stroke-dasharray={circumference}
				stroke-dashoffset={strokeDashoffset}
				transform="rotate(-90 {(avatarSize + 8) / 2} {(avatarSize + 8) / 2})"
				filter="url(#glow-{agent.id.slice(0, 8)})"
			/>
		</svg>
	{/if}

	<!-- Type Badge with Premium AI Treatment -->
	{#if showBadge}
		<div
			class="agent-avatar__badge"
			class:agent-avatar__badge--ai={isAI}
			style="--badge-size: {badgeSize}px"
			title={agent.type}
			aria-label="{agent.type} agent"
		>
			<div class="agent-avatar__badge-inner">
				{#if agent.type === 'coder'}
					<!-- Code brackets icon -->
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="16 18 22 12 16 6" />
						<polyline points="8 6 2 12 8 18" />
					</svg>
				{:else if agent.type === 'reviewer'}
					<!-- Checkmark icon -->
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="20 6 9 17 4 12" />
					</svg>
				{:else if agent.type === 'tester'}
					<!-- Flask icon -->
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9 3h6v6l4 9H5l4-9V3z" />
						<path d="M9 3h6" />
					</svg>
				{:else if agent.type === 'architect'}
					<!-- Blueprint/compass icon -->
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="12" r="10" />
						<polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
					</svg>
				{:else}
					<!-- User icon -->
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
						<circle cx="12" cy="7" r="4" />
					</svg>
				{/if}
			</div>
			<!-- AI Glow effect -->
			{#if isAI}
				<div class="agent-avatar__badge-glow" aria-hidden="true"></div>
			{/if}
		</div>
	{/if}

	<!-- Phase Label -->
	{#if showPhase && phaseLabel}
		<div class="agent-avatar__phase">
			{phaseLabel}
		</div>
	{/if}
</div>

<style>
	.agent-avatar {
		position: relative;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.agent-avatar__defs {
		position: absolute;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	.agent-avatar__inner {
		position: relative;
		transition: transform var(--ide-transition-bounce);
	}

	/* Subtle scale on busy */
	.agent-avatar--busy .agent-avatar__inner {
		animation: avatar-breathe 3s ease-in-out infinite;
	}

	@keyframes avatar-breathe {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.02); }
	}

	/* Status Ring */
	.agent-avatar__ring {
		position: absolute;
		inset: -3px;
		border: 2px solid transparent;
		border-radius: 50%;
		pointer-events: none;
		transition: all var(--ide-transition-normal);
	}

	.agent-avatar__ring--online {
		border-color: var(--ide-agent-online);
		box-shadow: 0 0 8px color-mix(in srgb, var(--ide-agent-online) 40%, transparent);
		animation: ring-pulse 2.5s ease-in-out infinite;
	}

	.agent-avatar__ring--busy {
		border-color: var(--ide-agent-busy);
		border-style: dashed;
		animation: ring-spin 4s linear infinite;
	}

	.agent-avatar__ring--error {
		border-color: var(--ide-agent-error);
		box-shadow: 0 0 8px color-mix(in srgb, var(--ide-agent-error) 50%, transparent);
		animation: ring-error 0.6s ease-in-out infinite;
	}

	.agent-avatar__ring--stalled {
		border-color: var(--ide-agent-stalled);
		animation: ring-stalled 1.2s ease-in-out infinite;
	}

	.agent-avatar__ring--offline {
		border-color: var(--ide-agent-offline);
		border-style: dotted;
		opacity: 0.5;
	}

	@keyframes ring-pulse {
		0%, 100% {
			opacity: 1;
			box-shadow: 0 0 8px color-mix(in srgb, var(--ide-agent-online) 40%, transparent);
		}
		50% {
			opacity: 0.7;
			box-shadow: 0 0 16px color-mix(in srgb, var(--ide-agent-online) 60%, transparent);
		}
	}

	@keyframes ring-spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	@keyframes ring-error {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.6; transform: scale(1.05); }
	}

	@keyframes ring-stalled {
		0%, 100% { opacity: 0.8; }
		50% { opacity: 0.3; }
	}

	/* Progress Ring */
	.agent-avatar__progress {
		position: absolute;
		inset: -4px;
		pointer-events: none;
	}

	.agent-avatar__progress-arc {
		transition: stroke-dashoffset 0.3s ease-out;
	}

	/* Type Badge */
	.agent-avatar__badge {
		position: absolute;
		bottom: -2px;
		right: -2px;
		width: var(--badge-size);
		height: var(--badge-size);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--ide-bg-secondary);
		border: 1.5px solid var(--ide-border);
		color: var(--ide-text-secondary);
		transition: all var(--ide-transition-normal);
		z-index: 2;
	}

	.agent-avatar__badge-inner {
		width: 60%;
		height: 60%;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		z-index: 1;
	}

	.agent-avatar__badge-inner svg {
		width: 100%;
		height: 100%;
	}

	/* Premium AI Badge */
	.agent-avatar__badge--ai {
		background: linear-gradient(
			135deg,
			var(--ide-agent-ai-primary) 0%,
			var(--color-nocturnium-flame) 50%,
			var(--ide-agent-ai-secondary) 100%
		);
		background-size: 200% 200%;
		border: none;
		color: white;
		box-shadow:
			0 2px 8px color-mix(in srgb, var(--ide-agent-ai-primary) 50%, transparent),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
		animation: badge-shimmer 3s ease-in-out infinite;
	}

	@keyframes badge-shimmer {
		0%, 100% { background-position: 0% 50%; }
		50% { background-position: 100% 50%; }
	}

	/* Badge Glow */
	.agent-avatar__badge-glow {
		position: absolute;
		inset: -3px;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			color-mix(in srgb, var(--ide-agent-ai-primary) 30%, transparent) 0%,
			transparent 70%
		);
		animation: glow-pulse 2s ease-in-out infinite;
		pointer-events: none;
	}

	@keyframes glow-pulse {
		0%, 100% { opacity: 0.5; transform: scale(1); }
		50% { opacity: 1; transform: scale(1.3); }
	}

	/* Phase Label */
	.agent-avatar__phase {
		font-size: 10px;
		font-weight: 500;
		color: var(--ide-text-secondary);
		white-space: nowrap;
		animation: phase-fade-in 0.3s ease-out;
	}

	@keyframes phase-fade-in {
		from { opacity: 0; transform: translateY(-4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* Size-specific adjustments */
	.agent-avatar--xs .agent-avatar__ring { inset: -2px; border-width: 1.5px; }
	.agent-avatar--sm .agent-avatar__ring { inset: -2px; border-width: 1.5px; }
	.agent-avatar--lg .agent-avatar__ring { inset: -4px; border-width: 2.5px; }
	.agent-avatar--xl .agent-avatar__ring { inset: -4px; border-width: 3px; }

	/* Hover state */
	.agent-avatar:hover .agent-avatar__inner {
		transform: scale(1.05);
	}

	.agent-avatar:hover .agent-avatar__badge--ai {
		box-shadow:
			0 4px 12px color-mix(in srgb, var(--ide-agent-ai-primary) 60%, transparent),
			inset 0 1px 0 rgba(255, 255, 255, 0.3);
	}
</style>
