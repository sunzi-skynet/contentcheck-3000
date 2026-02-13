import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ComparisonResult } from './types';

const DEFAULT_TTL_HOURS = 168; // 7 days
const CLEANUP_INTERVAL_MS = 3600_000; // 1 hour

export interface ResultMetadata {
  id: string;
  createdAt: string;
  expiresAt: string;
  sourceUrl: string;
  targetUrl: string;
  overallScore: number;
  apiKeyName?: string;
}

export interface StoredResult {
  metadata: ResultMetadata;
  result: ComparisonResult;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidResultId(id: string): boolean {
  return UUID_REGEX.test(id);
}

export interface ResultStore {
  save(result: ComparisonResult, options?: { apiKeyName?: string }): Promise<ResultMetadata>;
  load(id: string): Promise<StoredResult | null>;
  delete(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Supabase implementation
// ---------------------------------------------------------------------------

export class SupabaseResultStore implements ResultStore {
  private client: SupabaseClient;
  private ttlHours: number;

  constructor(supabaseUrl: string, supabaseKey: string, ttlHours?: number) {
    this.client = createClient(supabaseUrl, supabaseKey);
    this.ttlHours = ttlHours ?? (parseInt(process.env.RESULT_TTL_HOURS || '', 10) || DEFAULT_TTL_HOURS);
  }

  async save(
    result: ComparisonResult,
    options?: { apiKeyName?: string }
  ): Promise<ResultMetadata> {
    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 3600_000);

    const metadata: ResultMetadata = {
      id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      sourceUrl: result.source.url,
      targetUrl: result.target.url,
      overallScore: result.overallScore,
      apiKeyName: options?.apiKeyName,
    };

    const { error } = await this.client.from('results').insert({
      id,
      created_at: metadata.createdAt,
      expires_at: metadata.expiresAt,
      source_url: metadata.sourceUrl,
      target_url: metadata.targetUrl,
      overall_score: metadata.overallScore,
      api_key_name: metadata.apiKeyName ?? null,
      result_data: result,
    });

    if (error) throw new Error(`Supabase insert failed: ${error.message}`);

    return metadata;
  }

  async load(id: string): Promise<StoredResult | null> {
    if (!isValidResultId(id)) return null;

    const { data, error } = await this.client
      .from('results')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) return null;

    // Check expiry
    if (new Date(data.expires_at) < new Date()) {
      await this.delete(id);
      return null;
    }

    const metadata: ResultMetadata = {
      id: data.id,
      createdAt: data.created_at,
      expiresAt: data.expires_at,
      sourceUrl: data.source_url,
      targetUrl: data.target_url,
      overallScore: data.overall_score,
      apiKeyName: data.api_key_name ?? undefined,
    };

    return { metadata, result: data.result_data as ComparisonResult };
  }

  async delete(id: string): Promise<void> {
    if (!isValidResultId(id)) return;
    await this.client.from('results').delete().eq('id', id);
  }
}

// ---------------------------------------------------------------------------
// Filesystem implementation (local dev / fallback)
// ---------------------------------------------------------------------------

export class FileSystemResultStore implements ResultStore {
  private baseDir: string;
  private ttlHours: number;
  private lastCleanup = 0;

  constructor(baseDir?: string, ttlHours?: number) {
    this.baseDir = baseDir ?? path.join(
      process.env.VERCEL ? '/tmp' : process.cwd(),
      'data', 'results'
    );
    this.ttlHours = ttlHours ?? (parseInt(process.env.RESULT_TTL_HOURS || '', 10) || DEFAULT_TTL_HOURS);
  }

  async save(
    result: ComparisonResult,
    options?: { apiKeyName?: string }
  ): Promise<ResultMetadata> {
    await fs.mkdir(this.baseDir, { recursive: true });

    const id = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlHours * 3600_000);

    const metadata: ResultMetadata = {
      id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      sourceUrl: result.source.url,
      targetUrl: result.target.url,
      overallScore: result.overallScore,
      apiKeyName: options?.apiKeyName,
    };

    const stored: StoredResult = { metadata, result };
    const filePath = path.join(this.baseDir, `${id}.json`);
    await fs.writeFile(filePath, JSON.stringify(stored), 'utf-8');

    // Trigger lazy cleanup
    this.maybeCleanup();

    return metadata;
  }

  async load(id: string): Promise<StoredResult | null> {
    if (!isValidResultId(id)) return null;

    const filePath = path.join(this.baseDir, `${id}.json`);
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const stored: StoredResult = JSON.parse(data);

      // Check if expired
      if (new Date(stored.metadata.expiresAt) < new Date()) {
        await this.delete(id);
        return null;
      }

      return stored;
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    if (!isValidResultId(id)) return;

    const filePath = path.join(this.baseDir, `${id}.json`);
    try {
      await fs.unlink(filePath);
    } catch {
      // File may already be deleted
    }
  }

  async cleanup(): Promise<number> {
    let removed = 0;
    try {
      const files = await fs.readdir(this.baseDir);
      const now = new Date();

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.baseDir, file);
        try {
          const data = await fs.readFile(filePath, 'utf-8');
          const stored: StoredResult = JSON.parse(data);

          if (new Date(stored.metadata.expiresAt) < now) {
            await fs.unlink(filePath);
            removed++;
          }
        } catch {
          // Skip malformed files
        }
      }
    } catch {
      // Directory may not exist yet
    }

    return removed;
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup > CLEANUP_INTERVAL_MS) {
      this.lastCleanup = now;
      // Fire and forget — don't block the response
      this.cleanup().catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton — Supabase if configured, filesystem fallback
// ---------------------------------------------------------------------------

let instance: ResultStore | null = null;

export function getResultStore(): ResultStore {
  if (!instance) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseKey) {
      instance = new SupabaseResultStore(supabaseUrl, supabaseKey);
    } else {
      instance = new FileSystemResultStore();
    }
  }
  return instance;
}

/** Reset singleton (for testing) */
export function resetResultStore(): void {
  instance = null;
}
