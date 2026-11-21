import { Hono } from 'hono';
import worker from '../../../app/worker/src/worker';
import { workerStore } from '../../../app/worker/src/worker_store';
import { CONSTANTS } from '../../../app/worker/src/constants';
import mailApi from './mail-api';

const testApi = new Hono<HonoCustomType>();
testApi.post('/seed_mail', c => mailApi.seedMail(c.req.raw, c.env));
testApi.post('/receive_mail', c => mailApi.receiveMail(c.req.raw, c.env, c.executionCtx as ExecutionContext));
testApi.get('/telegram_binding', async c => {
  const address = c.req.query('address');
  if (!address) return c.text('address is required', 400);
  return c.json(await workerStore(c.env).get(`${CONSTANTS.TG_KV_PREFIX}:${address}`));
});

const app = new Hono<HonoCustomType>();
app.route('/__test', testApi);
app.all('*', c => worker.fetch(c.req.raw, c.env, c.executionCtx));

export default { ...worker, fetch: app.fetch };
