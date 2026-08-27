import { spawn } from 'node:child_process';

const children = ['server.mjs', 'bridge-worker.mjs'].map((script) =>
  spawn(process.execPath, [script], { stdio: 'inherit' }),
);

let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill(signal));
  setTimeout(() => process.exit(0), 500).unref();
}

children.forEach((child) => child.on('exit', (code) => {
  if (!stopping && code !== 0) {
    console.error('A development process stopped unexpectedly.');
    stop('SIGTERM');
  }
}));

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
