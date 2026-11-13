import {getAddress,id,ZeroAddress} from 'ethers';
export const SOLDIER_PROGRESS_POLICY=id('journey-progress-1');
export const SOLDIER_LEASE_POLICY=id('journey-owner-run-lock-1');
export const SOLDIER_MARKET_POLICY=id('journey-soldier-fixed-price-1');
export const SOLDIER_MAX_LEASE_SECONDS=3600;
export function soldierRunHash(runId:string){if(!/^[-a-zA-Z0-9:_]{1,128}$/.test(runId))throw Error('Exact run identity required');return id('LAST_SIGNAL_JOURNEY_RUN:'+runId);}
export const soldierProgressTypes={Progress:[{name:'tokenId',type:'uint256'},{name:'owner',type:'address'},{name:'bankSource',type:'bytes32'},{name:'rulesHash',type:'bytes32'},{name:'policy',type:'bytes32'},{name:'nonce',type:'uint256'},{name:'cumulativeXp',type:'uint256'},{name:'furthestCheckpoint',type:'uint256'},{name:'hasCheckpoint',type:'bool'},{name:'expiry',type:'uint256'}]};
export type SoldierProgressVoucher={tokenId:string;owner:string;bankSource:string;rulesHash:string;policy:string;nonce:string;cumulativeXp:string;furthestCheckpoint:string;hasCheckpoint:boolean;expiry:string};
export function soldierProgressDomain(chainId:bigint,collection:string){const address=getAddress(collection);if(chainId<=0n||address===ZeroAddress)throw Error('Explicit soldier signing domain required');return {name:'LAST SIGNAL Journey Soldiers',version:'1',chainId,verifyingContract:address};}
