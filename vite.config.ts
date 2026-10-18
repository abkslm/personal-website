import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      // Vite ships HTML comments verbatim; strip them so disabled markup in
      // index.html stays out of the deployed page source.
      name: 'strip-html-comments',
      apply: 'build',
      transformIndexHtml: html => html.replace(/<!--[\s\S]*?-->\s*/g, ''),
    },
  ],
})
