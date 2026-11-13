import { it,expect } from 'vitest';
import { buildServer } from '../apps/server/src/app.ts';
it('binds Journey only when enabled and reports actual service capability',async()=>{
  for(const enabled of [false,true]){
    const server=await buildServer({database:':memory:',manual:true,journey:enabled});
    try{
      const response=await server.app.inject('/journey/config');
      expect(response.json()).toMatchObject({enabled,authoritativeGameplay:enabled,walletRewards:false,environment:enabled?'LOCAL_SERVER_PRACTICE':'LOCAL_PRACTICE'});
      expect(!!server.journey).toBe(enabled);expect((await server.app.inject('/health')).statusCode).toBe(200);
      expect((await server.app.inject('/journey/roster')).statusCode).toBe(enabled?200:503);
    }finally{await server.app.close();}
  }
},30000);
