export const survivalVaultDomain=(chainId:bigint,contract:string)=>({name:'LAST SIGNAL SurvivalRunVault',version:'2',chainId,verifyingContract:contract});
export const survivalEntryTypes={Entry:[
 {name:'runId',type:'bytes32'},{name:'player',type:'address'},{name:'currency',type:'address'},{name:'rulesHash',type:'bytes32'},
 {name:'segment',type:'uint256'},{name:'sequence',type:'uint256'},{name:'deposit',type:'uint256'},{name:'stationReserve',type:'uint256'},{name:'bonusReserve',type:'uint256'},
 {name:'carryCap',type:'uint256'},{name:'nonce',type:'uint256'},{name:'expiry',type:'uint256'},
]};
export const survivalResultTypes={Result:[
 {name:'runId',type:'bytes32'},{name:'player',type:'address'},{name:'currency',type:'address'},{name:'rulesHash',type:'bytes32'},
 {name:'segment',type:'uint256'},{name:'sequence',type:'uint256'},{name:'deposit',type:'uint256'},{name:'stationEarned',type:'uint256'},{name:'bonusEarned',type:'uint256'},
 {name:'spent',type:'uint256'},{name:'failedStake',type:'uint256'},{name:'successMask',type:'uint8'},{name:'failureMask',type:'uint8'},{name:'abortMask',type:'uint8'},
 {name:'outcome',type:'uint8'},{name:'resultHash',type:'bytes32'},{name:'expiry',type:'uint256'},{name:'nextStationReserve',type:'uint256'},{name:'nextBonusReserve',type:'uint256'},
]};
export const survivalMissionTypes={MissionPermit:[
 {name:'runId',type:'bytes32'},{name:'missionId',type:'bytes32'},{name:'player',type:'address'},{name:'currency',type:'address'},{name:'rulesHash',type:'bytes32'},
 {name:'segment',type:'uint256'},{name:'sequence',type:'uint256'},{name:'stationEarned',type:'uint256'},{name:'spent',type:'uint256'},
 {name:'successMask',type:'uint8'},{name:'failureMask',type:'uint8'},{name:'abortMask',type:'uint8'},{name:'expiry',type:'uint256'},
]};
export type SurvivalEntry={runId:string;player:string;currency:string;rulesHash:string;segment:bigint;sequence:bigint;deposit:bigint;stationReserve:bigint;bonusReserve:bigint;carryCap:bigint;nonce:bigint;expiry:bigint};
export type SurvivalResult={runId:string;player:string;currency:string;rulesHash:string;segment:bigint;sequence:bigint;deposit:bigint;stationEarned:bigint;bonusEarned:bigint;spent:bigint;failedStake:bigint;successMask:number;failureMask:number;abortMask:number;outcome:number;resultHash:string;expiry:bigint;nextStationReserve:bigint;nextBonusReserve:bigint};
export type SurvivalMissionPermit={runId:string;missionId:string;player:string;currency:string;rulesHash:string;segment:bigint;sequence:bigint;stationEarned:bigint;spent:bigint;successMask:number;failureMask:number;abortMask:number;expiry:bigint};
