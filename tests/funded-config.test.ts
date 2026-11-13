import {test,expect} from 'vitest';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Wallet,id,type JsonRpcProvider} from 'ethers';
import {buildServer} from '../apps/server/src/app.ts';
import {SurvivalVaultTransport,LocalSurvivalVaultTransport,PublicSurvivalVaultTransport,type SurvivalVaultManifest} from '../apps/server/src/survival-vault-transport.ts';

test('missing funded deployment disables custody while preserving free server practice',async()=>{
 const enabled=process.env.SURVIVAL_VAULT_V2,file=process.env.SURVIVAL_DEPLOYMENT_FILE;process.env.SURVIVAL_VAULT_V2='true';process.env.SURVIVAL_DEPLOYMENT_FILE=resolve('.runtime',randomUUID(),'missing.json');
 try{const s=await buildServer({database:':memory:',manual:true,survival:true});try{expect((await s.app.inject('/survival/funded/config')).json().enabled).toBe(false);const practice=(await s.app.inject('/survival/config')).json();expect(practice.enabled).toBe(true);expect(practice.rewards).toBe(false);expect(practice.settlementWorker).toBe(false);expect((await s.app.inject('/health')).statusCode).toBe(200);}finally{await s.app.close();}}
 finally{if(enabled===undefined)delete process.env.SURVIVAL_VAULT_V2;else process.env.SURVIVAL_VAULT_V2=enabled;if(file===undefined)delete process.env.SURVIVAL_DEPLOYMENT_FILE;else process.env.SURVIVAL_DEPLOYMENT_FILE=file;}
});
test('transport constructors reject mainnet and distinguish local from public testnet labels',()=>{
 const gas=Wallet.createRandom(),p=null as unknown as JsonRpcProvider,m:SurvivalVaultManifest={chain:4663n,vault:'0x'+'11'.repeat(20),token:'0x'+'22'.repeat(20),treasury:'0x'+'33'.repeat(20),signer:'0x'+'44'.repeat(20),deployment:'0x'+'55'.repeat(20),rulesHash:id('rules'),fromBlock:0,vaultCodeHash:id('vault'),tokenCodeHash:id('token'),treasuryCodeHash:id('treasury')};
 expect(()=>new SurvivalVaultTransport(p,gas,gas.address,m)).toThrow();expect(()=>new LocalSurvivalVaultTransport(p,gas,gas.address,{...m,chain:46630n})).toThrow();expect(()=>new PublicSurvivalVaultTransport(p,gas,gas.address,{...m,chain:31337n})).toThrow();
 expect(new LocalSurvivalVaultTransport(p,gas,gas.address,{...m,chain:31337n}).mode).toBe('LOCAL_BLOCKCHAIN');expect(new PublicSurvivalVaultTransport(p,gas,gas.address,{...m,chain:46630n}).mode).toBe('PUBLIC_TESTNET');
});
