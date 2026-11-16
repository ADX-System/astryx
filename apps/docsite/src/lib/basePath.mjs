// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The path prefix the docsite is served under, and the one way to
 *   address a file `public` serves or a route a plain browser API (fetch,
 *   iframe, script, img, metadata) requests.
 * @input NEXT_PUBLIC_BASE_PATH at build time (unset = served at the root).
 * @output withBasePath('/x') = '<base>/x'. Next's Link, router and redirect()
 *   add the prefix themselves, so navigation hrefs stay root-relative.
 * @position Shared by pages, components and build-time loaders.
 */

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * @param {string} path a root-relative path; anything else is returned as is
 * @returns {string}
 */
export function withBasePath(path) {
  if (!BASE_PATH || !path.startsWith('/') || path.startsWith('//')) {
    return path;
  }
  // Already prefixed (a value that went through here once) stays as is.
  return path === BASE_PATH || path.startsWith(`${BASE_PATH}/`)
    ? path
    : BASE_PATH + path;
}
