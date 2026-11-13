import {readFileSync,statSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {JsonRpcProvider,Wallet} from 'ethers';
import {TESTNET,survivalRulesHash} from '@last-signal/chain';
import {FUNDED_SURVIVAL_RULES} from '@last-signal/sim';
import {loadSurvivalGas} from '../../../packages/contracts/scripts/testnet-keys.ts';
import {settlementSigner} from './signer.ts';
import {PublicSurvivalVaultTransport} from './survival-vault-transport.ts';

export function configuredPublicSurvival(){
 if(process.env.SURVIVAL_VAULT_V2!=='true')return null;
 const manifestFile=process.env.SURVIVAL_DEPLOYMENT_FILE??resolve(import.meta.dirname,'../../../.runtime/testnet/survival-deployment.json');
 if(!isAbsolute(manifestFile))throw Error('Survival deployment manifest path must be absolute');
 const m=JSON.parse(readFileSync(manifestFile,'utf8'));
 if(m.chainId!==46630||m.rpc!==TESTNET.rpc||m.rulesHash!==survivalRulesHash(FUNDED_SURVIVAL_RULES)||m.confirmations!==2)throw Error('Unsupported funded survival deployment');
 const gameplay=settlementSigner(),keyFile=process.env.SURVIVAL_GAS_KEY_FILE;
 let gas:Wallet;if(keyFile){if(!isAbsolute(keyFile))throw Error('Survival gas secret path must be absolute');const info=statSync(keyFile);if(!info.isFile()||info.size>128||process.platform!=='win32'&&(info.mode&0o077)!==0)throw Error('Survival gas secret permissions invalid');const key=readFileSync(keyFile,'utf8').trim();if(!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Invalid survival gas secret file');gas=new Wallet(key);}else gas=loadSurvivalGas();
 if(gas.address!==m.gasWallet||gameplay.address!==m.gameplaySigner||new Set([m.deployer,m.gasWallet,m.gameplaySigner]).size!==3)throw Error('Funded survival role mismatch');
 const provider=new JsonRpcProvider(TESTNET.rpc,undefined,{cacheTimeout:-1,batchMaxCount:1,pollingInterval:1000}),transport=new PublicSurvivalVaultTransport(provider,gas.connect(provider),gas.address,{chain:46630n,vault:m.vault,token:m.token,treasury:m.treasury,signer:m.gameplaySigner,deployment:m.deployer,rulesHash:m.rulesHash,fromBlock:m.deploymentBlock,vaultCodeHash:m.codeHashes.vault,tokenCodeHash:m.codeHashes.token,treasuryCodeHash:m.codeHashes.treasury});
 return {transport,gameplay,close:()=>provider.destroy()};
}
