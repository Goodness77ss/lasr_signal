import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {getAddress,type BrowserProvider} from 'ethers';
import {armoryAction,isArmoryBusy,publishArmoryWallet,verifyArmoryWallet} from '../apps/web/src/armory-runtime.ts';

const address=getAddress('0x0000000000000000000000000000000000000001');
beforeEach(()=>vi.stubGlobal('document',new EventTarget()));
afterEach(()=>{publishArmoryWallet(null);vi.unstubAllGlobals();});
function connect(chain=46630,expires=Date.now()+60000,accounts=[address]){
 const send=vi.fn(async(method:string)=>method==='eth_accounts'?accounts:'0x'+chain.toString(16));
 publishArmoryWallet({provider:{send} as unknown as BrowserProvider,address,chainId:46630,session:'test-session',expires});
 return send;
}
describe('shared Armory wallet',()=>{
 it('checks the current account and network again before a wallet action',async()=>{const send=connect();await verifyArmoryWallet(46630,address);expect(send).toHaveBeenCalledWith('eth_accounts',[]);expect(send).toHaveBeenCalledWith('eth_chainId',[]);});
 it('rejects expired login, changed accounts and changed network',async()=>{connect(46630,Date.now()-1);await expect(verifyArmoryWallet(46630,address)).rejects.toThrow();connect(46630,Date.now()+60000,[]);await expect(verifyArmoryWallet(46630,address)).rejects.toThrow();connect(1);await expect(verifyArmoryWallet(46630,address)).rejects.toThrow();});
 it('rejects a disconnected wallet and mainnet',async()=>{publishArmoryWallet(null);await expect(verifyArmoryWallet(46630,address)).rejects.toThrow();connect();await expect(verifyArmoryWallet(1,address)).rejects.toThrow();});
 it('prevents simultaneous actions across sections and unlocks after failure',async()=>{let finish!:()=>void;const work=armoryAction(()=>new Promise<void>(resolve=>{finish=resolve;}));expect(isArmoryBusy()).toBe(true);await expect(armoryAction(async()=>{})).rejects.toThrow('Finish');finish();await work;expect(isArmoryBusy()).toBe(false);await expect(armoryAction(async()=>{throw Error('cancelled');})).rejects.toThrow('cancelled');expect(isArmoryBusy()).toBe(false);});
});
