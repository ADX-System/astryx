// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Checks a docsite served under a path prefix: open the main pages in a
 *   browser and fail on any same-origin request outside the prefix, any
 *   failed response, or a page whose first internal link drops the prefix.
 * @input A running site and its prefix:
 *   node scripts/check-base-path.mjs http://127.0.0.1:8128 /adxs-ui
 *   node scripts/check-base-path.mjs --selftest   (proves the check fires)
 * @output One line per page; exit 1 when anything is wrong.
 * @position ADX-System fork tooling for the /adxs-ui deployment.
 */

import {createServer} from 'node:http';
import {chromium} from 'playwright';

const PAGES = [
  '/',
  '/docs/getting-started',
  '/components',
  '/components/Table',
  '/components/SchemaGraph',
  '/templates',
  '/themes',
  '/playground',
  '/blog',
  '/community',
  '/changelog',
  '/docs/adxs',
  '/blog/astryx-v0-7-0',
];

// Pages the footer links to that only Vercel deployments stage (next.config
// rewrites): they are missing at the root too, so they are reported apart.
const NOT_STAGED_HERE = /^\/(?:storybook|sandbox)\/?$/u;

export async function check(origin, base, pages = PAGES) {
  const browser = await chromium.launch();
  const problems = [];
  let opened = 0;
  try {
    for (const page of pages) {
      const tab = await browser.newPage();
      const bad = [];
      tab.on('request', req => {
        const url = new URL(req.url());
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          return; // blob: and data: are in-page objects, not requests to the site
        }
        if (url.origin === origin && url.pathname !== base && !url.pathname.startsWith(`${base}/`)) {
          bad.push(`outside ${base}: ${url.pathname}`);
        }
      });
      tab.on('response', res => {
        const url = new URL(res.url());
        if (url.origin === origin && res.status() >= 400) {
          if (NOT_STAGED_HERE.test(url.pathname.slice(base.length))) {
            return;
          }
          bad.push(`${res.status()} ${url.pathname}${url.search.slice(0, 60)}`);
        }
      });
      const res = await tab.goto(origin + base + page, {waitUntil: 'load', timeout: 60000}).catch(e => {
        bad.push(`goto failed: ${e.message.split('\n')[0]}`);
        return null;
      });
      if (res) {
        opened += 1;
        await tab.mouse.wheel(0, 4000);
        await tab.waitForTimeout(1500);
        const links = await tab.$$eval('a[href^="/"]', as => as.map(a => a.getAttribute('href')));
        for (const href of links) {
          if (!href.startsWith(`${base}/`) && href !== base) {
            bad.push(`link without ${base}: ${href}`);
          }
        }
      }
      const uniq = [...new Set(bad)];
      console.log(`${uniq.length ? 'FAIL' : 'ok  '} ${page}${uniq.length ? `\n  ${uniq.slice(0, 12).join('\n  ')}` : ''}`);
      problems.push(...uniq.map(p => `${page}: ${p}`));
      await tab.close();
    }
  } finally {
    await browser.close();
  }
  if (opened === 0) {
    problems.push('no page opened');
  }
  return problems;
}

async function selftest() {
  // A page that loads one asset outside the prefix and links outside it: both must be caught.
  const server = createServer((req, res) => {
    if (req.url === '/p/') {
      res.setHeader('content-type', 'text/html');
      res.end('<img src="/outside.png"><a href="/docs">x</a>');
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const problems = await check(origin, '/p', ['/']);
  server.close();
  const caught = ['outside /p: /outside.png', 'link without /p: /docs'].every(want =>
    problems.some(p => p.includes(want)),
  );
  console.log(caught ? 'selftest ok' : `selftest FAILED: ${problems.join('; ')}`);
  process.exit(caught ? 0 : 1);
}

if (process.argv[2] === '--selftest') {
  await selftest();
} else {
  const [origin, base] = process.argv.slice(2);
  const problems = await check(origin.replace(/\/$/u, ''), base);
  console.log(problems.length ? `${problems.length} problem(s)` : 'all pages ok');
  process.exit(problems.length ? 1 : 0);
}
