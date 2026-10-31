#!/usr/bin/env node
/**
 * 开发模式一键启动：后端（Flask）+ agent（Node）+ 前端（Vite）。Windows / macOS / Linux 通用。
 *
 *   node scripts/dev.mjs            启动三个进程，Ctrl+C 全部退出
 *   node scripts/dev.mjs --no-web   不启动 Vite（例如已经 build 过，直接用后端托管的页面）
 *
 * 会读取根目录的 .env（可选）。WREN_INTERNAL_TOKEN 为空时自动生成一个随机值。
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const isWin = process.platform === 'win32';

const env = { ...readDotEnv(join(root, '.env')), ...process.env };
if (!env.WREN_INTERNAL_TOKEN) env.WREN_INTERNAL_TOKEN = randomBytes(24).toString('hex');
env.WREN_BACKEND_PORT ||= '5280';
env.WREN_AGENT_PORT ||= '5281';
env.PYTHONUNBUFFERED = '1';

const python = findPython();
const procs = [
  { name: 'backend', color: 34, cmd: python, args: ['-m', 'wren'], cwd: join(root, 'backend') },
  { name: 'agent', color: 35, cmd: process.execPath, args: ['src/server.js'], cwd: join(root, 'agent') },
];
if (!args.has('--no-web')) {
  procs.push({
    name: 'web', color: 32, cmd: isWin ? 'npm.cmd' : 'npm', args: ['run', 'dev'],
    cwd: join(root, 'web'), shell: isWin,
  });
}

const children = [];
let exiting = false;
for (const p of procs) {
  const child = spawn(p.cmd, p.args, { cwd: p.cwd, env, shell: p.shell ?? false });
  children.push(child);
  const prefix = `\x1b[${p.color}m[${p.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('error', (err) => {
    console.error(`${prefix}启动失败：${err.message}`);
    shutdown(1);
  });
  child.on('exit', (code) => {
    if (!exiting) {
      console.error(`${prefix}已退出（code=${code}），关闭其余进程`);
      shutdown(code ?? 1);
    }
  });
}

console.log(
  `\n  后端  http://127.0.0.1:${env.WREN_BACKEND_PORT}` +
    `\n  agent http://127.0.0.1:${env.WREN_AGENT_PORT}` +
    (args.has('--no-web') ? '' : '\n  打开  http://127.0.0.1:5173') +
    '\n',
);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

/** @param {number} code */
function shutdown(code) {
  if (exiting) return;
  exiting = true;
  for (const child of children) {
    if (child.exitCode === null) {
      if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
      else child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 500);
}

function findPython() {
  const venv = isWin
    ? join(root, 'backend', '.venv', 'Scripts', 'python.exe')
    : join(root, 'backend', '.venv', 'bin', 'python');
  if (existsSync(venv)) return venv;
  return isWin ? 'python' : 'python3';
}

/** @param {string} path */
function readDotEnv(path) {
  if (!existsSync(path)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (value) out[key] = value;
  }
  return out;
}
