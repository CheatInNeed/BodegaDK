import { spawn } from 'node:child_process';

const commands = [
    ['npm', 'run', 'server:local'],
    ['npm', 'run', 'web:watch'],
    ['npm', 'run', 'web:serve'],
];

await runCommand(['npm', 'run', 'web:build']);

const children = commands.map(runPersistentCommand);

for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
        stopChildren();
        process.exit(0);
    });
}

function runCommand(command) {
    return new Promise((resolve, reject) => {
        const child = spawnCommand(command);
        child.on('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command.join(' ')} exited with ${code ?? 1}`));
        });
        child.on('error', reject);
    });
}

function runPersistentCommand(command) {
    const child = spawnCommand(command);
    child.on('exit', (code, signal) => {
        if (signal) {
            return;
        }

        console.error(`[local-dev] ${command.join(' ')} exited with ${code ?? 1}`);
        stopChildren(child);
        process.exit(code ?? 1);
    });
    return child;
}

function spawnCommand(command) {
    if (process.platform === 'win32') {
        return spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command.map(quoteForCmd).join(' ')], {
            stdio: 'inherit',
            windowsHide: true,
        });
    }

    return spawn(command[0], command.slice(1), {
        stdio: 'inherit',
    });
}

function stopChildren(except) {
    for (const child of children) {
        if (child !== except && !child.killed) {
            child.kill();
        }
    }
}

function quoteForCmd(value) {
    if (!/[ \t"&|<>()^]/u.test(value)) {
        return value;
    }

    return `"${value.replace(/"/gu, '\\"')}"`;
}
