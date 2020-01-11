const purgecss = require('@fullhuman/postcss-purgecss');
const cssnano = require('cssnano');

module.exports = {
	plugins: [
		require('tailwindcss'),
		require('autoprefixer'),
		cssnano({ preset: 'default' }),
		purgecss({
			content: ['./js/ChessBotPy.user.js'],
			defaultExtractor: content => {
				const contentWithoutStyleBlocks = content.replace(/<style[^]+?<\/style>/gi, '');
				return contentWithoutStyleBlocks.match(/[A-Za-z0-9-_/:]*[A-Za-z0-9-_/]+/g) || [];
			},
			whitelist: [],
			whitelistPatterns: [
				/-(leave|enter|appear)(|-(to|from|active))$/,
				/^(?!cursor-move).+-move$/,
				/^router-link(|-exact)-active$/,
				/^vgt-/,
			],
		}),
	],
};
