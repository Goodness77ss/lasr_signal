export type BackupReport={checkedAt:string;method:string;integrity:string;restore:string;tables:{name:string;rows:number}[]};
export function backupDatabase(sourcePath:string,privateRoot:string):Promise<{directory:string;report:BackupReport}>;
