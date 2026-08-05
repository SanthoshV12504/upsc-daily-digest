import { runWorkflow } from './services/workflowEngine.js';

const args = process.argv.slice(2);

if (args.includes('--run') || args.includes('-r')) {
  console.log('Executing UPSC Daily Digest via CLI...');
  runWorkflow({ hoursLookback: 48 }) // test with 48h lookback for demo data if recent feeds are quiet
    .then(res => {
      console.log('CLI Execution Finished:', JSON.stringify({
        runId: res.runId,
        status: res.status,
        articlesProcessed: res.articlesProcessed,
        telegramMessages: res.telegramResult?.messagesCount || 0
      }, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('CLI Execution Error:', err);
      process.exit(1);
    });
} else {
  console.log(`
UPSC Daily Current Affairs Digest CLI
-------------------------------------
Usage:
  node src/cli.js --run        Run the automation workflow now
  npm start                    Start the web dashboard server & daily scheduler
`);
}
