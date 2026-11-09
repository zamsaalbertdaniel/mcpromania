import path from 'node:path';

const root = process.cwd();

function quote(filename) {
  return `"${filename}"`;
}

function toPackageRelative(filename, packageRoot) {
  const absolute = path.isAbsolute(filename) ? filename : path.resolve(root, filename);
  return path.relative(packageRoot, absolute).split(path.sep).join('/');
}

function eslintAndPrettier(packageRoot, filter) {
  return (filenames) => {
    const relative = filenames
      .map((filename) => toPackageRelative(filename, packageRoot))
      .map(quote)
      .join(' ');
    const original = filenames.map(quote).join(' ');
    return [
      `pnpm --filter ${filter} exec eslint --fix ${relative}`,
      `prettier --write ${original}`,
    ];
  };
}

const dashboardRoot = path.join(root, 'apps', 'dashboard');
const gatewayRoot = path.join(root, 'apps', 'gateway');
const typesRoot = path.join(root, 'packages', 'types');

export default {
  'apps/dashboard/**/*.{js,jsx,mjs,ts,tsx}': eslintAndPrettier(
    dashboardRoot,
    '@mcpromania/dashboard'
  ),
  'apps/gateway/**/*.{js,jsx,mjs,ts,tsx}': eslintAndPrettier(gatewayRoot, '@mcpromania/gateway'),
  'packages/types/**/*.{js,jsx,mjs,ts,tsx}': eslintAndPrettier(typesRoot, '@mcpromania/types'),
  'apps/workers/**/*.{js,jsx,ts,tsx}': 'prettier --write',
  '*.{json,md,css,yml,yaml}': 'prettier --write',
};
