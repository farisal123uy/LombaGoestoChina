import type { ChildProcess, StdioOptions } from "node:child_process";
export function superviseProcesses(specifications: { name: string; executable?: string; args: string[]; cwd?: string; env?: NodeJS.ProcessEnv; stdio?: StdioOptions }[], options?: {
  maxRestarts?: number; windowMs?: number; baseDelayMs?: number; killTimeoutMs?: number; healthIntervalMs?: number; healthGraceMs?: number;
  healthCheck?(): Promise<boolean>;
  onSpawn?(name: string, child: ChildProcess): void;
  onEvent?(event: { code: string; cycle: number; totalRestarts: number; reason?: string; delayMs?: number }): void;
}): { result: Promise<{ code: number; totalRestarts: number }>; stop(): Promise<{ code: number; totalRestarts: number }>; snapshot(): { cycle: number; totalRestarts: number; stopping: boolean; restarting: boolean; children: { name: string; pid?: number }[] } };
