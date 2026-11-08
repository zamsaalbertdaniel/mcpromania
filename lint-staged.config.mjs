import path from 'node:path';

const root = process.cwd();
const dashboardRoot = path.join(root, 'apps', 'dashboard');

function quote(filename) {
  return `"${filename}"`;
}

function toDashboardRelative(filename) {
  const absolute = path.isAbsolute(filename) ? filename : path.resolve(root, filename);
  return path.relative(dashboardRoot, absolute).split(path.sep).join('/');
}

export default {
  'apps/dashboard/**/*.{js,jsx,ts,tsx}': (filenames) => {
    const relative = filenames.map(toDashboardRelative).map(quote).join(' ');
    const original = filenames.map(quote).join(' ');
    return [
      `pnpm --filter @mcpromania/dashboard exec eslint --fix ${relative}`,
      `prettier --write ${original}`,
    ];
  },
  'packages/**/*.{js,jsx,ts,tsx}': 'prettier --write',
  'apps/gateway/**/*.{js,jsx,ts,tsx}': 'prettier --write',
  'apps/workers/**/*.{js,jsx,ts,tsx}': 'prettier --write',
  '*.{json,md,css,yml,yaml}': 'prettier --write',
};
