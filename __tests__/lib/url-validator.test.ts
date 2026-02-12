import { describe, it, expect } from 'vitest';
import { isPrivateIP, validateSelector } from '@/lib/url-validator';

describe('isPrivateIP', () => {
  it('blocks loopback addresses', () => {
    expect(isPrivateIP('127.0.0.1')).toBe(true);
    expect(isPrivateIP('127.255.255.255')).toBe(true);
  });

  it('blocks private class A (10.x.x.x)', () => {
    expect(isPrivateIP('10.0.0.1')).toBe(true);
    expect(isPrivateIP('10.255.255.255')).toBe(true);
  });

  it('blocks private class B (172.16-31.x.x)', () => {
    expect(isPrivateIP('172.16.0.1')).toBe(true);
    expect(isPrivateIP('172.31.255.255')).toBe(true);
    expect(isPrivateIP('172.15.0.1')).toBe(false);
    expect(isPrivateIP('172.32.0.1')).toBe(false);
  });

  it('blocks private class C (192.168.x.x)', () => {
    expect(isPrivateIP('192.168.0.1')).toBe(true);
    expect(isPrivateIP('192.168.255.255')).toBe(true);
  });

  it('blocks link-local / cloud metadata (169.254.x.x)', () => {
    expect(isPrivateIP('169.254.169.254')).toBe(true);
    expect(isPrivateIP('169.254.0.1')).toBe(true);
  });

  it('blocks 0.x.x.x (current network)', () => {
    expect(isPrivateIP('0.0.0.0')).toBe(true);
  });

  it('blocks CGNAT range (100.64-127.x.x)', () => {
    expect(isPrivateIP('100.64.0.1')).toBe(true);
    expect(isPrivateIP('100.127.255.255')).toBe(true);
    expect(isPrivateIP('100.63.0.1')).toBe(false);
    expect(isPrivateIP('100.128.0.1')).toBe(false);
  });

  it('allows public IPs', () => {
    expect(isPrivateIP('8.8.8.8')).toBe(false);
    expect(isPrivateIP('1.1.1.1')).toBe(false);
    expect(isPrivateIP('203.0.113.1')).toBe(false);
  });

  it('blocks IPv6 loopback', () => {
    expect(isPrivateIP('::1')).toBe(true);
    expect(isPrivateIP('::')).toBe(true);
  });

  it('blocks IPv6 unique local (fc00::/7)', () => {
    expect(isPrivateIP('fc00::1')).toBe(true);
    expect(isPrivateIP('fd00::1')).toBe(true);
  });

  it('blocks IPv6 link-local (fe80::/10)', () => {
    expect(isPrivateIP('fe80::1')).toBe(true);
  });

  it('blocks IPv4-mapped IPv6 with private IPv4', () => {
    expect(isPrivateIP('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateIP('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateIP('::ffff:169.254.169.254')).toBe(true);
  });

  it('allows IPv4-mapped IPv6 with public IPv4', () => {
    expect(isPrivateIP('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('validateSelector', () => {
  it('allows simple tag names', () => {
    expect(validateSelector('main')).toBe(true);
    expect(validateSelector('article')).toBe(true);
    expect(validateSelector('div')).toBe(true);
  });

  it('allows class selectors', () => {
    expect(validateSelector('.content')).toBe(true);
    expect(validateSelector('.entry-content')).toBe(true);
  });

  it('allows ID selectors', () => {
    expect(validateSelector('#content')).toBe(true);
    expect(validateSelector('#main-content')).toBe(true);
  });

  it('allows simple descendant combinators', () => {
    expect(validateSelector('div article')).toBe(true);
  });

  it('allows simple child combinators', () => {
    expect(validateSelector('div > article')).toBe(true);
  });

  it('rejects empty selectors', () => {
    expect(validateSelector('')).toBe(false);
    expect(validateSelector('   ')).toBe(false);
  });

  it('rejects attribute selectors', () => {
    expect(validateSelector('[data-content]')).toBe(false);
    expect(validateSelector('div[class*="foo"]')).toBe(false);
  });

  it('rejects pseudo-classes', () => {
    expect(validateSelector(':nth-child(2)')).toBe(false);
    expect(validateSelector('div:hover')).toBe(false);
  });

  it('rejects overly long selectors', () => {
    expect(validateSelector('a'.repeat(101))).toBe(false);
  });
});
