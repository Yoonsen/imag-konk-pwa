import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

Object.defineProperty(Document.prototype, 'adoptedStyleSheets', {
  configurable: true,
  writable: true,
  value: []
});

Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
  configurable: true,
  writable: true,
  value: []
});

afterEach(() => cleanup());
