#!/usr/bin/env node
/**
 * Writes shared/theme/theme-palettes.json (90 palettes, ~45 light / ~45 dark).
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'shared', 'theme', 'theme-palettes.json');

/** @type {import('../shared/theme/theme-catalog.types').ThemePalette[]} */
const palettes = [
  { id: 'light', label: 'Light', appearance: 'light', bg: '#fafafa', surface: '#ffffff', text: '#111111', primary: '#0066ff', secondary: '#868e96', accent: '#17c1ff', border: '#d1d5db' },
  { id: 'dark', label: 'Dark', appearance: 'dark', bg: '#121212', surface: '#1e1e1e', text: '#e0e0e0', primary: '#bb86fc', secondary: '#03dac6', accent: '#ff4081', border: '#2c2c2c' },
  { id: 'ayu-light', label: 'Ayu Light', appearance: 'light', bg: '#f0f0f0', surface: '#ffffff', text: '#3b4252', primary: '#f07178', secondary: '#ffb454', accent: '#57c7ff', border: '#d0d4d8' },
  { id: 'ayu-dark', label: 'Ayu Dark', appearance: 'dark', bg: '#0d1017', surface: '#10141c', text: '#bfbdb6', primary: '#e6b450', secondary: '#59c2ff', accent: '#39bae6', border: '#1b1f29' },
  { id: 'one-light', label: 'One Light', appearance: 'light', bg: '#fafafa', surface: '#ffffff', text: '#383a42', primary: '#4078f2', secondary: '#a626a4', accent: '#50a14f', border: '#e5e5e6' },
  { id: 'one-dark', label: 'One Dark', appearance: 'dark', bg: '#282c34', surface: '#21252b', text: '#abb2bf', primary: '#61afef', secondary: '#c678dd', accent: '#98c379', border: '#181a1f' },
  { id: 'github-light', label: 'GitHub Light', appearance: 'light', bg: '#ffffff', surface: '#f6f8fa', text: '#1f2328', primary: '#0969da', secondary: '#8250df', accent: '#1a7f37', border: '#d0d7de' },
  { id: 'github-dark', label: 'GitHub Dark', appearance: 'dark', bg: '#0d1117', surface: '#161b22', text: '#e6edf3', primary: '#2f81f7', secondary: '#a371f7', accent: '#3fb950', border: '#30363d' },
  { id: 'tokyo-night-light', label: 'Tokyo Night Day', appearance: 'light', bg: '#e1e2e7', surface: '#d5d6db', text: '#343b59', primary: '#2e7de9', secondary: '#9854f1', accent: '#007197', border: '#c4c8da' },
  { id: 'tokyo-night', label: 'Tokyo Night', appearance: 'dark', bg: '#1a1b26', surface: '#16161e', text: '#a9b1d6', primary: '#7aa2f7', secondary: '#bb9af7', accent: '#7dcfff', border: '#292e42' },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', appearance: 'light', bg: '#eff1f5', surface: '#e6e9ef', text: '#4c4f69', primary: '#8839ef', secondary: '#1e66f5', accent: '#40a02b', border: '#bcc0cc' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', appearance: 'dark', bg: '#1e1e2e', surface: '#181825', text: '#cdd6f4', primary: '#cba6f7', secondary: '#89b4fa', accent: '#a6e3a1', border: '#45475a' },
  { id: 'gruvbox-light', label: 'Gruvbox Light', appearance: 'light', bg: '#fbf1c7', surface: '#f9f5d7', text: '#3c3836', primary: '#b57614', secondary: '#79740e', accent: '#af3a03', border: '#d5c4a1' },
  { id: 'gruvbox-dark', label: 'Gruvbox Dark', appearance: 'dark', bg: '#282828', surface: '#32302f', text: '#ebdbb2', primary: '#fabd2f', secondary: '#b8bb26', accent: '#fe8019', border: '#3c3836' },
  { id: 'nord', label: 'Nord', appearance: 'dark', bg: '#2e3440', surface: '#3b4252', text: '#eceff4', primary: '#88c0d0', secondary: '#81a1c1', accent: '#a3be8c', border: '#4c566a' },
  { id: 'dracula', label: 'Dracula', appearance: 'dark', bg: '#282a36', surface: '#373844', text: '#f8f8f2', primary: '#ff79c6', secondary: '#bd93f9', accent: '#8be9fd', border: '#6272a4' },
  { id: 'night-owl-light', label: 'Night Owl Light', appearance: 'light', bg: '#fdf6ff', surface: '#ffffff', text: '#5c6773', primary: '#8250df', secondary: '#36b7b7', accent: '#ef6155', border: '#dcdde1' },
  { id: 'night-owl-dark', label: 'Night Owl', appearance: 'dark', bg: '#000c1d', surface: '#001122', text: '#8badc1', primary: '#82aaff', secondary: '#c792ea', accent: '#ffcb6b', border: '#102a44' },
  { id: 'solarized-light', label: 'Solarized Light', appearance: 'light', bg: '#fdf6e3', surface: '#eee8d5', text: '#657b83', primary: '#b58900', secondary: '#2aa198', accent: '#cb4b16', border: '#93a1a1' },
  { id: 'solarized-dark', label: 'Solarized Dark', appearance: 'dark', bg: '#002b36', surface: '#073642', text: '#839496', primary: '#268bd2', secondary: '#2aa198', accent: '#cb4b16', border: '#586e75' },
  { id: 'monokai', label: 'Monokai', appearance: 'dark', bg: '#272822', surface: '#3e3d32', text: '#f8f8f2', primary: '#f92672', secondary: '#fd971f', accent: '#a6e22e', border: '#49483e' },
  { id: 'high-contrast-dark', label: 'High Contrast Dark', appearance: 'dark', bg: '#000000', surface: '#1a1a1a', text: '#ffffff', primary: '#ffff00', secondary: '#00ff00', accent: '#ff00ff', border: '#555555' },
  { id: 'high-contrast-darklight', label: 'High Contrast Dark Light', appearance: 'dark', bg: '#1a1a1a', surface: '#2a2a2a', text: '#ffffff', primary: '#ffcc00', secondary: '#00ffcc', accent: '#ff00cc', border: '#666666' },
  { id: 'material-palenight', label: 'Material Palenight', appearance: 'dark', bg: '#292d3e', surface: '#32374d', text: '#bfc7d5', primary: '#82aaff', secondary: '#c792ea', accent: '#89ddff', border: '#3b3f51' },
  { id: 'material-ocean', label: 'Material Ocean', appearance: 'dark', bg: '#0f111a', surface: '#1a1f2e', text: '#8f93a2', primary: '#84ffff', secondary: '#c792ea', accent: '#ffcb6b', border: '#2a2f3f' },
  { id: 'synthwave-84', label: 'Synthwave 84', appearance: 'dark', bg: '#241b2f', surface: '#2a2139', text: '#f0eff1', primary: '#ff7edb', secondary: '#36f9f6', accent: '#fede5d', border: '#34294f' },
  { id: 'rose-pine-dawn', label: 'Rose Pine Dawn', appearance: 'light', bg: '#faf4ed', surface: '#fffaf3', text: '#575279', primary: '#907aa9', secondary: '#286983', accent: '#d7827e', border: '#dfdad9' },
  { id: 'rose-pine-moon', label: 'Rose Pine Moon', appearance: 'dark', bg: '#232136', surface: '#2a273f', text: '#e0def4', primary: '#c4a7e7', secondary: '#9ccfd8', accent: '#f6c177', border: '#393552' },
  { id: 'everforest-light', label: 'Everforest Light', appearance: 'light', bg: '#efebd4', surface: '#fdf6e3', text: '#5c6a72', primary: '#8da101', secondary: '#3a94c5', accent: '#f85552', border: '#d8d4c4' },
  { id: 'everforest-dark', label: 'Everforest Dark', appearance: 'dark', bg: '#2d353b', surface: '#343f44', text: '#d3c6aa', primary: '#a7c080', secondary: '#83c092', accent: '#e69875', border: '#4f585e' },
  { id: 'kanagawa-wave', label: 'Kanagawa Wave', appearance: 'dark', bg: '#1f1f28', surface: '#2a2a37', text: '#dcd7ba', primary: '#7e9cd8', secondary: '#957fb8', accent: '#98bb6c', border: '#363646' },
  { id: 'kanagawa-lotus', label: 'Kanagawa Lotus', appearance: 'light', bg: '#f2ecbc', surface: '#e7e0c7', text: '#545464', primary: '#4d699b', secondary: '#b35b79', accent: '#6a9589', border: '#d7cfb0' },
  { id: 'quiet-light', label: 'Quiet Light', appearance: 'light', bg: '#f5f5f5', surface: '#ffffff', text: '#333333', primary: '#4078c0', secondary: '#6a9fb5', accent: '#4d9375', border: '#e0e0e0' },
  { id: 'vscode-light', label: 'Light+ (VS Code)', appearance: 'light', bg: '#ffffff', surface: '#f3f3f3', text: '#333333', primary: '#006ab1', secondary: '#795e26', accent: '#098658', border: '#e5e5e5' },
  { id: 'vscode-dark', label: 'Dark+ (VS Code)', appearance: 'dark', bg: '#1e1e1e', surface: '#252526', text: '#d4d4d4', primary: '#569cd6', secondary: '#c586c0', accent: '#4ec9b0', border: '#3c3c3c' },
  { id: 'flexoki-light', label: 'Flexoki Light', appearance: 'light', bg: '#fffcf0', surface: '#f2f0e5', text: '#100f0f', primary: '#205ea6', secondary: '#66800b', accent: '#bc5215', border: '#e6e4d9' },
  { id: 'flexoki-dark', label: 'Flexoki Dark', appearance: 'dark', bg: '#100f0f', surface: '#1c1b1a', text: '#cecdc3', primary: '#66a0c8', secondary: '#879a39', accent: '#da702c', border: '#2d2c2b' },
  { id: 'catppuccin-frappe', label: 'Catppuccin Frappé', appearance: 'dark', bg: '#303446', surface: '#292c3c', text: '#c6d0f5', primary: '#ca9ee6', secondary: '#8caaee', accent: '#a6d189', border: '#45475a' },
  { id: 'catppuccin-macchiato', label: 'Catppuccin Macchiato', appearance: 'dark', bg: '#24273a', surface: '#1e2030', text: '#cad3f5', primary: '#c6a0f6', secondary: '#8aadf4', accent: '#a6da95', border: '#494d64' },
  { id: 'nord-light', label: 'Nord Light', appearance: 'light', bg: '#eceff4', surface: '#e5e9f0', text: '#4c566a', primary: '#5e81ac', secondary: '#81a1c1', accent: '#a3be8c', border: '#d8dee9' },
  { id: 'slack-light', label: 'Slack Light', appearance: 'light', bg: '#ffffff', surface: '#f8f8f8', text: '#1d1c1d', primary: '#1264a3', secondary: '#e01e5a', accent: '#007a5a', border: '#e0e0e0' },
  { id: 'paper-color-light', label: 'Paper Color Light', appearance: 'light', bg: '#fbf1c7', surface: '#ffffff', text: '#444444', primary: '#1976d2', secondary: '#e91e63', accent: '#4caf50', border: '#e0e0e0' },
  { id: 'paper-color-dark', label: 'Paper Color Dark', appearance: 'dark', bg: '#1e1e1e', surface: '#2d2d2d', text: '#d4d4d4', primary: '#42a5f5', secondary: '#f48fb1', accent: '#66bb6a', border: '#404040' },
  { id: 'base16-eighties-light', label: 'Base16 Eighties Light', appearance: 'light', bg: '#f2f0ec', surface: '#ffffff', text: '#515151', primary: '#6c9ef8', secondary: '#f2777a', accent: '#99cc99', border: '#e0e0e0' },
  { id: 'spacemacs', label: 'Spacemacs', appearance: 'dark', bg: '#292b2e', surface: '#34393e', text: '#b2b2b2', primary: '#4f97d7', secondary: '#a31db1', accent: '#2d9574', border: '#474747' },
  { id: 'noctis', label: 'Noctis', appearance: 'dark', bg: '#1e2736', surface: '#283142', text: '#c5cdd8', primary: '#52a8c6', secondary: '#e9ae58', accent: '#84b37b', border: '#354458' },
  { id: 'arctic', label: 'Arctic', appearance: 'light', bg: '#ffffff', surface: '#f5f7fa', text: '#2e3440', primary: '#5e81ac', secondary: '#81a1c1', accent: '#a3be8c', border: '#d8dee9' },
  { id: 'min-light', label: 'Min Light', appearance: 'light', bg: '#ffffff', surface: '#fafafa', text: '#24292e', primary: '#0366d6', secondary: '#6f42c1', accent: '#22863a', border: '#e1e4e8' },
  { id: 'min-dark', label: 'Min Dark', appearance: 'dark', bg: '#1f1f1f', surface: '#2b2b2b', text: '#e0e0e0', primary: '#3794ff', secondary: '#b392f0', accent: '#3fb950', border: '#404040' },
  { id: 'material-light', label: 'Material Light', appearance: 'light', bg: '#fafafa', surface: '#ffffff', text: '#546e7a', primary: '#039be5', secondary: '#e91e63', accent: '#43a047', border: '#e0e0e0' },
  { id: 'hop-light', label: 'Hop Light', appearance: 'light', bg: '#fafafa', surface: '#ffffff', text: '#333333', primary: '#7c4dff', secondary: '#00bfa5', accent: '#ff6d00', border: '#e0e0e0' },
  { id: 'bluloco-light', label: 'Bluloco Light', appearance: 'light', bg: '#f7f7f7', surface: '#ffffff', text: '#383a42', primary: '#0099dd', secondary: '#d52753', accent: '#23974a', border: '#e0e0e0' },
  { id: 'bluloco-dark', label: 'Bluloco Dark', appearance: 'dark', bg: '#282c34', surface: '#31353f', text: '#abb2bf', primary: '#3fc56b', secondary: '#10b1fe', accent: '#ff78f8', border: '#3e4451' },
  { id: 'monokai-pro', label: 'Monokai Pro', appearance: 'dark', bg: '#2d2a2e', surface: '#403e41', text: '#fcfcfa', primary: '#ffd866', secondary: '#ab9df2', accent: '#a9dc76', border: '#5b595c' },
  { id: 'gruvbox-material-dark', label: 'Gruvbox Material Dark', appearance: 'dark', bg: '#292828', surface: '#32302f', text: '#d4be98', primary: '#fabd2f', secondary: '#b8bb26', accent: '#fe8019', border: '#3c3836' },
  { id: 'ayu-mirage', label: 'Ayu Mirage', appearance: 'dark', bg: '#1f2430', surface: '#242936', text: '#cccac2', primary: '#ffcc66', secondary: '#5ccfe6', accent: '#95e6cb', border: '#2d3340' },
  { id: 'ayu-wild', label: 'Ayu Wild', appearance: 'dark', bg: '#161a1e', surface: '#1c2028', text: '#c7c7c7', primary: '#ffcc66', secondary: '#5ccfe6', accent: '#95e6cb', border: '#242930' },
  { id: 'edge-light', label: 'Edge Light', appearance: 'light', bg: '#fafafa', surface: '#ffffff', text: '#5f6368', primary: '#375fad', secondary: '#5f6368', accent: '#375fad', border: '#e0e0e0' },
  { id: 'edge-dark', label: 'Edge Dark', appearance: 'dark', bg: '#1e2127', surface: '#2c2f36', text: '#b3b9c5', primary: '#6cb6eb', secondary: '#a0a8b7', accent: '#6cb6eb', border: '#3a3f4b' },
  { id: 'coldark-light', label: 'Coldark Light', appearance: 'light', bg: '#f5f7fa', surface: '#ffffff', text: '#3b4252', primary: '#409fff', secondary: '#e6b450', accent: '#4cbf99', border: '#e0e4eb' },
  { id: 'github-dark-dimmed', label: 'GitHub Dark Dimmed', appearance: 'dark', bg: '#22272e', surface: '#2d333b', text: '#adbac7', primary: '#539bf5', secondary: '#b083f0', accent: '#57ab5a', border: '#444c56' },
  { id: 'jetbrains-dark', label: 'JetBrains Dark', appearance: 'dark', bg: '#1e1f22', surface: '#2b2d30', text: '#bcbec4', primary: '#548af7', secondary: '#c77dbb', accent: '#6aab73', border: '#43454a' },
  { id: 'jetbrains-light', label: 'JetBrains Light', appearance: 'light', bg: '#ffffff', surface: '#f7f8fa', text: '#1e1f22', primary: '#3574f0', secondary: '#8347c5', accent: '#2d9f50', border: '#e0e0e0' },
  { id: 'atom-one-light', label: 'Atom One Light', appearance: 'light', bg: '#fafafa', surface: '#ffffff', text: '#383a42', primary: '#4078f2', secondary: '#a626a4', accent: '#50a14f', border: '#e5e5e6' },
  { id: 'gruvbox-material-light', label: 'Gruvbox Material Light', appearance: 'light', bg: '#fbf1c7', surface: '#f9f5d7', text: '#654735', primary: '#b57614', secondary: '#79740e', accent: '#af3a03', border: '#d5c4a1' },
  { id: 'chalk', label: 'Chalk', appearance: 'light', bg: '#f9f9f9', surface: '#ffffff', text: '#333333', primary: '#3b82f6', secondary: '#8b5cf6', accent: '#10b981', border: '#e5e7eb' },
  { id: 'dayfox', label: 'Dayfox', appearance: 'light', bg: '#f6f2ee', surface: '#ffffff', text: '#423f3c', primary: '#955f61', secondary: '#6a848e', accent: '#e4b692', border: '#e7e2dd' },
  { id: 'iceberg-light', label: 'Iceberg Light', appearance: 'light', bg: '#e8e9ec', surface: '#ffffff', text: '#33374c', primary: '#2e63a6', secondary: '#5890c8', accent: '#5a8e3e', border: '#d8dae1' },
  { id: 'blush', label: 'Blush', appearance: 'light', bg: '#f8f0f3', surface: '#ffffff', text: '#5c4a52', primary: '#d4476a', secondary: '#8e6a8f', accent: '#e8a87c', border: '#ead6de' },
  { id: 'cotton-candy', label: 'Cotton Candy', appearance: 'light', bg: '#f7f4ff', surface: '#ffffff', text: '#4a4458', primary: '#9b6dff', secondary: '#ff7eb6', accent: '#5ed4d4', border: '#e8e0f5' },
  { id: 'fairy-floss', label: 'Fairy Floss', appearance: 'light', bg: '#fff5fb', surface: '#ffffff', text: '#5b4a5f', primary: '#e84a8a', secondary: '#7c6cff', accent: '#ffb86c', border: '#f0d9e8' },
  { id: 'rem-light', label: 'ReM Light', appearance: 'light', bg: '#fafafa', surface: '#ffffff', text: '#3a3a3a', primary: '#007acc', secondary: '#6a9955', accent: '#ce9178', border: '#e0e0e0' },
  { id: 'vitesse-light', label: 'Vitesse Light', appearance: 'light', bg: '#ffffff', surface: '#f7f7f7', text: '#222222', primary: '#1c6b48', secondary: '#a16928', accent: '#b31d28', border: '#e5e5e5' },
  { id: 'solarized-light-hc', label: 'Solarized Light HC', appearance: 'light', bg: '#fdf6e3', surface: '#eee8d5', text: '#586e75', primary: '#657b83', secondary: '#2aa198', accent: '#cb4b16', border: '#93a1a1' },
  { id: 'catppuccin-rosewater', label: 'Catppuccin Rosewater', appearance: 'light', bg: '#f5eff0', surface: '#ffffff', text: '#575279', primary: '#dc8a78', secondary: '#8839ef', accent: '#40a02b', border: '#e0d8da' },
  { id: 'latte-macchiato', label: 'Latte Macchiato', appearance: 'light', bg: '#f4f0e8', surface: '#ffffff', text: '#4a4035', primary: '#8b5a2b', secondary: '#6b8e23', accent: '#c97b63', border: '#e0d8cc' },
  { id: 'unikitty-light', label: 'Unikitty Light', appearance: 'light', bg: '#ffffff', surface: '#f8f8f8', text: '#333333', primary: '#e45649', secondary: '#4078f2', accent: '#50a14f', border: '#e0e0e0' },
  { id: 'serendipity-light', label: 'Serendipity Light', appearance: 'light', bg: '#f5f0e8', surface: '#ffffff', text: '#4a4540', primary: '#7d6b8c', secondary: '#5a8f8f', accent: '#c9a227', border: '#e5ddd0' },
  { id: 'pear-light', label: 'Pear Light', appearance: 'light', bg: '#f5f7f0', surface: '#ffffff', text: '#3d4a3a', primary: '#6b8e23', secondary: '#8fbc8f', accent: '#daa520', border: '#dce5d4' },
  { id: 'carbonight-light', label: 'Carbonight Light', appearance: 'light', bg: '#f0f0f0', surface: '#ffffff', text: '#333333', primary: '#0e639c', secondary: '#811f3f', accent: '#098658', border: '#d4d4d4' },
  { id: 'pandora-light', label: 'Pandora Light', appearance: 'light', bg: '#f7f5fa', surface: '#ffffff', text: '#4a4458', primary: '#7c4dff', secondary: '#00bfa5', accent: '#ff6d00', border: '#e8e4ef' },
  { id: 'cobalt2', label: 'Cobalt2', appearance: 'dark', bg: '#193549', surface: '#1f3d5c', text: '#e1efff', primary: '#ffc600', secondary: '#ff9d00', accent: '#3ad900', border: '#2d4a6a' },
  { id: 'winter-is-coming', label: 'Winter Is Coming', appearance: 'dark', bg: '#011627', surface: '#0b2942', text: '#d6deeb', primary: '#82aaff', secondary: '#c792ea', accent: '#21c7a8', border: '#1d3b53' },
  { id: 'panda-syntax', label: 'Panda Syntax', appearance: 'dark', bg: '#292a2b', surface: '#323436', text: '#e6e6e6', primary: '#19f9d8', secondary: '#ffb86c', accent: '#ff6ac1', border: '#3c3d40' },
  { id: 'horizon', label: 'Horizon', appearance: 'dark', bg: '#1c1e26', surface: '#232530', text: '#c4c3c4', primary: '#e95678', secondary: '#25b0bc', accent: '#fab795', border: '#2e303e' },
  { id: 'vesper', label: 'Vesper', appearance: 'dark', bg: '#101010', surface: '#1a1a1a', text: '#ffffff', primary: '#ffc799', secondary: '#99ffe4', accent: '#ff8080', border: '#2a2a2a' },
  { id: 'poimandres', label: 'Poimandres', appearance: 'dark', bg: '#1b1e28', surface: '#24283b', text: '#b4b9c9', primary: '#a6accd', secondary: '#89ddff', accent: '#c3e88d', border: '#303348' },
  { id: 'city-lights', label: 'City Lights', appearance: 'dark', bg: '#1e252b', surface: '#28323a', text: '#b7c5d3', primary: '#5ec4ff', secondary: '#e27e8a', accent: '#70e1e8', border: '#323d46' },
  { id: 'aura', label: 'Aura', appearance: 'dark', bg: '#15141b', surface: '#1f1d2e', text: '#edecee', primary: '#a277ff', secondary: '#61ffca', accent: '#ffca85', border: '#2d2a3e' },
  { id: 'hop-dark', label: 'Hop Dark', appearance: 'dark', bg: '#1a1b26', surface: '#24283b', text: '#a9b1d6', primary: '#bb9af7', secondary: '#7dcfff', accent: '#9ece6a', border: '#292e42' },
];

const ids = new Set();
for (const p of palettes) {
  if (ids.has(p.id)) throw new Error('duplicate id ' + p.id);
  ids.add(p.id);
}

if (palettes.length !== 90) {
  throw new Error(`Expected 90 palettes, got ${palettes.length}`);
}

const light = palettes.filter((p) => p.appearance === 'light').length;
const dark = palettes.filter((p) => p.appearance === 'dark').length;
if (light < 44 || light > 46) {
  console.warn(`Light count ${light} (target ~45)`);
}
if (dark < 44 || dark > 46) {
  console.warn(`Dark count ${dark} (target ~45)`);
}

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(palettes, null, 2) + '\n', 'utf8');
console.log(`Wrote ${palettes.length} palettes (${light} light, ${dark} dark) to ${path.relative(root, outPath)}`);
