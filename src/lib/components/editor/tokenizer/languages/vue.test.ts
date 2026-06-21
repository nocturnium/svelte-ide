import { describe, it } from 'vitest';
import { createVueTokenizer } from './vue';
import { tok, tokLines, expectToken, expectTokenType, expectLossless } from '../test-helpers';

describe('VueTokenizer', () => {
	describe('template tags', () => {
		it('tokenizes an opening tag name and brackets', () => {
			const line = tok(createVueTokenizer(), '<template>');
			expectToken(line, 'tag.punctuation', '<');
			expectToken(line, 'tag.name', 'template');
			expectToken(line, 'tag.punctuation', '>');
		});

		it('tokenizes a closing tag', () => {
			const line = tok(createVueTokenizer(), '</template>');
			expectToken(line, 'tag.punctuation', '</');
			expectToken(line, 'tag.name', 'template');
		});

		it('tokenizes a self-closing component tag', () => {
			const line = tok(createVueTokenizer(), '<MyComponent />');
			expectToken(line, 'tag.name', 'MyComponent');
			expectToken(line, 'tag.punctuation', '/>');
		});

		it('tokenizes plain attributes with quoted values', () => {
			const line = tok(createVueTokenizer(), '<div class="card">');
			expectToken(line, 'tag.attribute', 'class');
			expectToken(line, 'punctuation', '=');
			expectToken(line, 'tag.attribute.value', '"card"');
		});
	});

	describe('directives', () => {
		it('recognizes a v-if directive as an attribute', () => {
			const line = tok(createVueTokenizer(), '<p v-if="visible">');
			expectToken(line, 'tag.attribute', 'v-if');
		});

		it('recognizes v-for', () => {
			const line = tok(createVueTokenizer(), '<li v-for="item in items">');
			expectToken(line, 'tag.attribute', 'v-for');
		});

		it('recognizes the :bind shorthand', () => {
			const line = tok(createVueTokenizer(), '<img :src="url">');
			expectToken(line, 'tag.attribute', ':src');
		});

		it('recognizes the @on shorthand with a modifier', () => {
			const line = tok(createVueTokenizer(), '<button @click.stop="save">');
			expectToken(line, 'tag.attribute', '@click.stop');
		});

		it('recognizes the #slot shorthand', () => {
			const line = tok(createVueTokenizer(), '<template #header>');
			expectToken(line, 'tag.attribute', '#header');
		});

		it('recognizes v-model', () => {
			const line = tok(createVueTokenizer(), '<input v-model="name">');
			expectToken(line, 'tag.attribute', 'v-model');
		});

		// Regression: a full directive with an argument (`v-bind:class`,
		// `v-model:value`, `v-on:click`, `v-slot:header`) must stay ONE attribute
		// token. A prior bug split it into `v-bind` + `:class`, where the `:class`
		// tail re-read as a separate v-bind shorthand — a different attribute.
		it('keeps v-bind:class as a single directive token', () => {
			const line = tok(createVueTokenizer(), '<div v-bind:class="cls">');
			expectToken(line, 'tag.attribute', 'v-bind:class');
			expectLossless(line, '<div v-bind:class="cls">');
		});

		it('keeps v-model:value as a single directive token', () => {
			const line = tok(createVueTokenizer(), '<input v-model:value="text">');
			expectToken(line, 'tag.attribute', 'v-model:value');
		});

		it('keeps v-on:click.stop (argument + modifier) as a single token', () => {
			const line = tok(createVueTokenizer(), '<button v-on:click.stop="go">');
			expectToken(line, 'tag.attribute', 'v-on:click.stop');
			expectLossless(line, '<button v-on:click.stop="go">');
		});

		it('keeps v-slot:header as a single directive token', () => {
			const line = tok(createVueTokenizer(), '<template v-slot:header>');
			expectToken(line, 'tag.attribute', 'v-slot:header');
		});
	});

	describe('mustache interpolation', () => {
		it('emits the braces as punctuation and tokenizes the expression', () => {
			const line = tok(createVueTokenizer(), '{{ count }}');
			expectToken(line, 'punctuation.brace', '{{');
			expectToken(line, 'punctuation.brace', '}}');
		});

		it('tokenizes an expression with a method call inside mustache', () => {
			const line = tok(createVueTokenizer(), '<span>{{ formatDate(now) }}</span>');
			expectToken(line, 'punctuation.brace', '{{');
			expectTokenType(line, 'function.call');
		});

		it('keeps surrounding text losslessly', () => {
			const line = tok(createVueTokenizer(), 'Total: {{ total }} items');
			expectToken(line, 'punctuation.brace', '{{');
			expectLossless(line, 'Total: {{ total }} items');
		});
	});

	describe('comments', () => {
		it('tokenizes an HTML comment in the template', () => {
			const line = tok(createVueTokenizer(), '<!-- a note -->');
			expectTokenType(line, 'comment');
		});

		it('keeps a comment line lossless', () => {
			const line = tok(createVueTokenizer(), '  <!-- TODO: refactor -->');
			expectLossless(line, '  <!-- TODO: refactor -->');
		});

		// Regression: an HTML comment that opens on one line and closes on a later
		// line must stay a `comment` on EVERY line. A prior bug only highlighted the
		// opening line; the body and `-->` of following lines bled out as live
		// template `text`.
		it('threads a multi-line HTML comment across lines', () => {
			const lines = tokLines(createVueTokenizer(), [
				'  <!-- a multi-line',
				'       comment block',
				'       still going -->',
				'  <div>after</div>'
			]);
			// Opening line: comment recognized.
			expectTokenType(lines[0], 'comment');
			// Interior and closing lines must be comment, NOT bled-out text.
			expectToken(lines[1], 'comment', '       comment block');
			expectToken(lines[2], 'comment', '       still going -->');
			// After the comment closes, real markup resumes.
			expectToken(lines[3], 'tag.name', 'div');
			for (let i = 0; i < lines.length; i++) {
				expectLossless(lines[i], lines[i].text);
			}
		});

		it('resumes live markup after a multi-line comment closes mid-line', () => {
			const lines = tokLines(createVueTokenizer(), [
				'<!-- open',
				'close --><span>hi</span>'
			]);
			expectToken(lines[1], 'comment', 'close -->');
			expectToken(lines[1], 'tag.name', 'span');
			expectLossless(lines[1], 'close --><span>hi</span>');
		});
	});

	describe('script block delegation', () => {
		it('tokenizes JS keywords inside a single-line script block', () => {
			const lines = tokLines(createVueTokenizer(), ['<script>', 'const x = 1;', '</script>']);
			expectTokenType(lines[1], 'keyword.definition');
			expectToken(lines[1], 'number.integer', '1');
		});

		it('threads script state across multiple lines', () => {
			const lines = tokLines(createVueTokenizer(), [
				'<script setup>',
				'function greet() {',
				'  return "hi";',
				'}',
				'</script>'
			]);
			expectTokenType(lines[1], 'keyword.definition');
			expectTokenType(lines[2], 'string');
			expectToken(lines[4], 'tag.name', 'script');
		});

		it('uses the TypeScript tokenizer when lang="ts"', () => {
			const lines = tokLines(createVueTokenizer(), [
				'<script setup lang="ts">',
				'const n: number = 42;',
				'</script>'
			]);
			expectToken(lines[0], 'tag.attribute', 'lang');
			expectToken(lines[1], 'number.integer', '42');
		});

		it('tokenizes a string with escapes inside the script', () => {
			const lines = tokLines(createVueTokenizer(), ['<script>', 'const s = "a\\nb";', '</script>']);
			expectTokenType(lines[1], 'string');
		});
	});

	describe('style block delegation', () => {
		it('tokenizes a CSS rule inside a style block', () => {
			const lines = tokLines(createVueTokenizer(), [
				'<style>',
				'.card { color: red; }',
				'</style>'
			]);
			expectLossless(lines[1], '.card { color: red; }');
			expectToken(lines[2], 'tag.name', 'style');
		});

		it('handles scoped style attribute', () => {
			const lines = tokLines(createVueTokenizer(), [
				'<style scoped>',
				'p { margin: 0; }',
				'</style>'
			]);
			expectToken(lines[0], 'tag.attribute', 'scoped');
			expectLossless(lines[1], 'p { margin: 0; }');
		});
	});

	describe('losslessness', () => {
		it('is lossless for an indented directive line', () => {
			const src = '    <div v-bind:class="cls" @click="go">';
			expectLossless(tok(createVueTokenizer(), src), src);
		});

		it('is lossless for a tag with multiple attributes', () => {
			const src = '<input type="text" :value="val" @input="onInput" />';
			expectLossless(tok(createVueTokenizer(), src), src);
		});

		it('is lossless for a mustache expression with operators', () => {
			const src = '<p>{{ a + b * c }}</p>';
			expectLossless(tok(createVueTokenizer(), src), src);
		});

		it('is lossless across a full script block (trickiest construct)', () => {
			const lines = tokLines(createVueTokenizer(), [
				'<script setup lang="ts">',
				'import { ref } from "vue";',
				'const count = ref(0);',
				'</script>'
			]);
			expectLossless(lines[0], '<script setup lang="ts">');
			expectLossless(lines[1], 'import { ref } from "vue";');
			expectLossless(lines[2], 'const count = ref(0);');
			expectLossless(lines[3], '</script>');
		});
	});

	describe('realistic component', () => {
		it('tokenizes a representative SFC end to end without dropping characters', () => {
			const src = [
				'<template>',
				'  <button class="btn" @click="increment">Count: {{ count }}</button>',
				'</template>',
				'',
				'<script setup lang="ts">',
				'import { ref } from "vue";',
				'const count = ref<number>(0);',
				'function increment(): void {',
				'  count.value++;',
				'}',
				'</script>',
				'',
				'<style scoped>',
				'.btn {',
				'  padding: 8px 16px;',
				'}',
				'</style>'
			];
			const lines = tokLines(createVueTokenizer(), src);
			for (let i = 0; i < src.length; i++) {
				expectLossless(lines[i], src[i]);
			}
			// Template directive + interpolation present.
			expectToken(lines[1], 'tag.attribute', '@click');
			expectToken(lines[1], 'punctuation.brace', '{{');
			// Script + style closing tags emitted as template tags.
			expectToken(lines[10], 'tag.name', 'script');
			expectToken(lines[16], 'tag.name', 'style');
		});
	});
});
