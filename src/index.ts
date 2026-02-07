#!/usr/bin/env node
// USAGE: Just talk normally to Claude/Codex
// say reset to reset chat
// Start message with $ to run shell commands, e.g. $date
const USE_CLAUDE = (process.env.USE_CLAUDE ?? 'true').toLowerCase() === 'true';
const ALLOWED_CHAT_IDS = [Number(process.env.MY_TG_CHAT_ID)];
const os = require('os');
const { exec } = require('child_process') as typeof import('child_process');
import { Bot, Context } from 'grammy';

const RESET_CMD: string = USE_CLAUDE
  ? `claude -p '(NOTE: Resetting session. Say "Session reset." and exit.)'`
  : `codex exec '(NOTE: Resetting session. Say "Session reset." and exit.)'`;
const EXEC_CMD: string = USE_CLAUDE
  ? `claude --dangerously-skip-permissions --continue -p`
  : `codex --yolo exec resume --last`;

function stripAnsi(str: string): string {
  return str.replace(/\x1b[^a-zA-Z]*[a-zA-Z]|\x1b\].*?(?:\x07|\x1b\\)/g, '');
}

const everyMinute = (fn: () => void) => setInterval(fn, 60_000);
const everyHour = (fn: () => void) => setInterval(fn, 60 * 60_000);
const everyDay = (fn: () => void) => setInterval(fn, 24 * 60 * 60_000);

function executeCommand(cmd: string, callback: (output: string) => void): void {
  exec(cmd, (err, stdout, stderr) => {
    console.log(stdout + stderr);
    let out = stdout;
    if (err) { 
      console.error(err); 
      out += stderr; 
    }
    if (USE_CLAUDE) out = stripAnsi(out);
    callback(out || '(No output)');
  });
}

function runAgent(prompt: string, callback: (output: string) => void): void {
  let cmd = USE_CLAUDE
    ? `claude -p ${JSON.stringify(prompt)}`
    : `codex exec ${JSON.stringify(prompt)}`;
  
  if (USE_CLAUDE) {
    cmd = `script -q -c ${JSON.stringify(cmd)} /dev/null`;
  }
  
  executeCommand(cmd, callback);
}

async function main(): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required');
  }
  
  const bot = new Bot(token);
  const me = await bot.api.getMe();
  console.log(`Connected: @${me.username}`);
  console.log(`Allowed: ${ALLOWED_CHAT_IDS}`);

  // // HEARTBEAT
  // everyMinute(() => {
  //   runAgent('System health check. Repeat the word of the day and exit.', (output) => {
  //     ALLOWED_CHAT_IDS.forEach(chatId => {
  //       bot.api.sendMessage(chatId, output).catch(console.error);
  //     });
  //   });
  // });

  bot.on('message:text', async (ctx: Context) => {
    const text = ctx.message?.text;
    const chatId = ctx.chat?.id;
    if (!text || !chatId) return;
    
    if (!ALLOWED_CHAT_IDS.includes(chatId)) {
      await ctx.reply('Unauthorized');
      return;
    }

    let cmd: string;
    if (text == 'reset' || text == 'Reset' || text == 'reset.' || text == 'Reset.') {
      cmd = RESET_CMD;
    } else {
      cmd = EXEC_CMD + ' ' + JSON.stringify(text);
    }
    
    if (USE_CLAUDE) cmd = `script -q -c ${JSON.stringify(cmd)} /dev/null`;
    
    if (text.startsWith('$')) {
      cmd = text.slice(1);
    }
    
    executeCommand(cmd, (output) => {
      ctx.reply(output);
    });
  });

  await bot.start();
}

main().catch(err => {
  console.error('Failed:', err);
  process.exit(1);
});
