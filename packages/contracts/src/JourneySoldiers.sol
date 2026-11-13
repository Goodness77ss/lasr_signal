// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Separate development soldier collection. Mint policy is configured
/// at deployment; this contract has no purchase or currency transfer function.
contract JourneySoldiers is ERC721Enumerable,EIP712,ReentrancyGuard {
    address public immutable mintAuthority;
    address public immutable gameplaySigner;
    bytes32 public immutable rulesHash;
    uint256 public immutable classSupplyCap;
    uint256 public immutable maxSupply;
    bytes32 public constant PROGRESS_POLICY=keccak256("journey-progress-1");
    uint8 public constant CLASS_COUNT=7;
    uint64 public constant MAX_LEASE_DURATION=3600;
    bytes32 public constant LEASE_POLICY=keccak256("journey-owner-run-lock-1");
    struct RunLease {bytes32 id;bytes32 runId;address owner;address service;uint64 expiresAt;uint256 nonce;}
    mapping(uint256=>RunLease) public runLease;
    mapping(uint256=>uint256) public leaseNonce;
    mapping(uint256=>mapping(bytes32=>bool)) public leasedRun;
    uint256 public nextTokenId=1;
    bytes32[7] private builds;
    mapping(uint8=>uint256) public classMinted;
    mapping(uint256=>uint8) private classes;
    mapping(uint256=>bytes32) public provenance;
    mapping(bytes32=>bool) public mintedSource;
    mapping(uint256=>uint256) public progressNonce;
    mapping(uint256=>mapping(bytes32=>bool)) public usedProgressSource;
    struct ProgressState {uint256 cumulativeXp;uint256 furthestCheckpoint;uint256 revision;bool hasCheckpoint;bytes32 bankSource;}
    struct Progress {uint256 tokenId;address owner;bytes32 bankSource;bytes32 rulesHash;bytes32 policy;uint256 nonce;uint256 cumulativeXp;uint256 furthestCheckpoint;bool hasCheckpoint;uint256 expiry;}
    mapping(uint256=>ProgressState) public progress;
    bytes32 private constant PROGRESS_TYPEHASH=keccak256("Progress(uint256 tokenId,address owner,bytes32 bankSource,bytes32 rulesHash,bytes32 policy,uint256 nonce,uint256 cumulativeXp,uint256 furthestCheckpoint,bool hasCheckpoint,uint256 expiry)");
    error Invalid();
    error Unauthorized();
    error ActiveLease();
    event SoldierMinted(uint256 indexed tokenId,address indexed recipient,uint8 classId,bytes32 indexed source,bytes32 build);
    event ProgressAccepted(uint256 indexed tokenId,address indexed owner,bytes32 indexed bankSource,uint256 revision,uint256 cumulativeXp,uint256 furthestCheckpoint,bool hasCheckpoint);
    event LeaseStarted(uint256 indexed tokenId,bytes32 indexed leaseId,bytes32 indexed runId,address owner,address service,uint64 expiresAt,uint256 nonce);
    event LeaseEnded(uint256 indexed tokenId,bytes32 indexed leaseId,uint8 reason);

    constructor(address signer,bytes32 rules,bytes32[7] memory classBuilds,uint256 perClassCap)
        ERC721("LAST SIGNAL Journey Soldiers","LSSOLDIER") EIP712("LAST SIGNAL Journey Soldiers","1") {
        if(signer==address(0)||rules==bytes32(0)||perClassCap==0||perClassCap>1000)revert Invalid();
        for(uint8 i;i<CLASS_COUNT;i++){
            if(classBuilds[i]==bytes32(0))revert Invalid();
            for(uint8 j;j<i;j++)if(classBuilds[i]==classBuilds[j])revert Invalid();
        }
        mintAuthority=msg.sender;gameplaySigner=signer;rulesHash=rules;builds=classBuilds;
        classSupplyCap=perClassCap;maxSupply=perClassCap*CLASS_COUNT;
    }
    function classOf(uint256 tokenId) public view returns(uint8){_requireOwned(tokenId);return classes[tokenId];}
    function buildForClass(uint8 classId) public view returns(bytes32){if(classId>=CLASS_COUNT)revert Invalid();return builds[classId];}
    function buildHash(uint256 tokenId) public view returns(bytes32){return buildForClass(classOf(tokenId));}
    function leaseActive(uint256 tokenId) public view returns(bool){
        _requireOwned(tokenId);RunLease memory lease=runLease[tokenId];return lease.id!=bytes32(0)&&block.timestamp<lease.expiresAt;
    }
    /// @notice Consent is the owner's transaction for this exact run, service
    /// and expiry. ERC721 operator approval alone cannot grant a run lease.
    function startLease(uint256 tokenId,bytes32 runId,address service,uint64 expiresAt) external nonReentrant returns(bytes32 leaseId){
        if(ownerOf(tokenId)!=msg.sender)revert Unauthorized();
        if(leaseActive(tokenId))revert ActiveLease();
        if(runId==bytes32(0)||service==address(0)||expiresAt<=block.timestamp||expiresAt>block.timestamp+MAX_LEASE_DURATION||leasedRun[tokenId][runId])revert Invalid();
        uint256 nonce=++leaseNonce[tokenId];
        leaseId=keccak256(abi.encode(block.chainid,address(this),tokenId,msg.sender,runId,service,expiresAt,nonce));
        leasedRun[tokenId][runId]=true;
        runLease[tokenId]=RunLease(leaseId,runId,msg.sender,service,expiresAt,nonce);
        progressNonce[tokenId]++;
        emit LeaseStarted(tokenId,leaseId,runId,msg.sender,service,expiresAt,nonce);
    }
    function releaseLease(uint256 tokenId,bytes32 leaseId) external nonReentrant {
        RunLease memory lease=runLease[tokenId];
        if(lease.id==bytes32(0)||lease.id!=leaseId||block.timestamp>=lease.expiresAt)revert Invalid();
        if(msg.sender!=lease.service)revert Unauthorized();
        _endLease(tokenId,leaseId,0);
    }
    /// @notice Anybody can clear an expired record. Transfer is also available
    /// at expiry without calling this function or contacting the run service.
    function clearExpiredLease(uint256 tokenId,bytes32 leaseId) external nonReentrant {
        RunLease memory lease=runLease[tokenId];
        if(lease.id==bytes32(0)||lease.id!=leaseId||block.timestamp<lease.expiresAt)revert Invalid();
        _endLease(tokenId,leaseId,1);
    }
    function _endLease(uint256 tokenId,bytes32 leaseId,uint8 reason) private {
        delete runLease[tokenId];progressNonce[tokenId]++;emit LeaseEnded(tokenId,leaseId,reason);
    }
    function mintDevelopment(address recipient,uint8 classId,bytes32 source) external nonReentrant returns(uint256 tokenId){
        if(msg.sender!=mintAuthority)revert Unauthorized();
        if(recipient==address(0)||classId>=CLASS_COUNT||source==bytes32(0)||mintedSource[source]||classMinted[classId]>=classSupplyCap||totalSupply()>=maxSupply)revert Invalid();
        mintedSource[source]=true;classMinted[classId]++;tokenId=nextTokenId++;
        classes[tokenId]=classId;provenance[tokenId]=source;_safeMint(recipient,tokenId);
        emit SoldierMinted(tokenId,recipient,classId,source,builds[classId]);
    }
    function applyProgress(Progress calldata p,bytes calldata signature) external nonReentrant {
        if(ownerOf(p.tokenId)!=msg.sender||p.owner!=msg.sender)revert Unauthorized();
        ProgressState storage prior=progress[p.tokenId];
        if(p.bankSource==bytes32(0)||usedProgressSource[p.tokenId][p.bankSource]||p.rulesHash!=rulesHash||p.policy!=PROGRESS_POLICY||p.nonce!=progressNonce[p.tokenId]||block.timestamp>=p.expiry||p.cumulativeXp<prior.cumulativeXp||p.furthestCheckpoint>type(uint64).max)revert Invalid();
        if(!p.hasCheckpoint&&(p.furthestCheckpoint!=0||p.cumulativeXp!=0)||prior.hasCheckpoint&&(!p.hasCheckpoint||p.furthestCheckpoint<prior.furthestCheckpoint))revert Invalid();
        if(p.cumulativeXp==prior.cumulativeXp&&p.hasCheckpoint==prior.hasCheckpoint&&p.furthestCheckpoint==prior.furthestCheckpoint)revert Invalid();
        bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(PROGRESS_TYPEHASH,p.tokenId,p.owner,p.bankSource,p.rulesHash,p.policy,p.nonce,p.cumulativeXp,p.furthestCheckpoint,p.hasCheckpoint,p.expiry)));
        if(ECDSA.recover(digest,signature)!=gameplaySigner)revert Unauthorized();
        usedProgressSource[p.tokenId][p.bankSource]=true;progressNonce[p.tokenId]++;
        prior.cumulativeXp=p.cumulativeXp;prior.furthestCheckpoint=p.furthestCheckpoint;prior.hasCheckpoint=p.hasCheckpoint;prior.bankSource=p.bankSource;prior.revision++;
        emit ProgressAccepted(p.tokenId,p.owner,p.bankSource,prior.revision,p.cumulativeXp,p.furthestCheckpoint,p.hasCheckpoint);
    }
    function _update(address to,uint256 tokenId,address auth) internal override returns(address from){
        if(_ownerOf(tokenId)!=address(0)){
            if(leaseActive(tokenId))revert ActiveLease();
            if(runLease[tokenId].id!=bytes32(0))_endLease(tokenId,runLease[tokenId].id,1);
        }
        from=super._update(to,tokenId,auth);
        // Ownership changes invalidate outstanding vouchers, including transfers
        // away and back to a prior owner. Verified token history remains intact.
        if(from!=address(0))progressNonce[tokenId]++;
    }
    function ownedPage(address account,uint256 offset,uint256 limit) external view returns(uint256[] memory ids,uint8[] memory kinds){
        if(limit==0||limit>32)revert Invalid();uint256 total=balanceOf(account);uint256 n=offset<total?(total-offset<limit?total-offset:limit):0;
        ids=new uint256[](n);kinds=new uint8[](n);for(uint256 i;i<n;i++){ids[i]=tokenOfOwnerByIndex(account,offset+i);kinds[i]=classes[ids[i]];}
    }
    function className(uint8 classId) public pure returns(string memory){
        if(classId>=CLASS_COUNT)revert Invalid();
        string[7] memory names=["Mara / Anchor","Kestrel / Scout","Rook / Bulwark","Imani / Medic","Flint / Grenadier","Vale / Marksman","Beck / Ranger"];return names[classId];
    }
    function _image(uint256 tokenId,uint8 kind) private pure returns(string memory){
        string memory serial=Strings.toString(tokenId);string memory label=className(kind);
        string memory svg=string.concat('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360"><rect width="480" height="360" fill="#252c24"/><circle cx="240" cy="115" r="34" fill="#c0ad80"/><path d="M188 160h104l20 118H168z" fill="#7f8c65"/><path d="M175 180h130v15H175z" fill="#b59a62"/><text x="24" y="38" fill="#f0dfb7" font-family="monospace" font-size="18">LAST SIGNAL JOURNEY SOLDIERS</text><text x="24" y="315" fill="#f0dfb7" font-family="monospace" font-size="18">',label,' #',serial,'</text><text x="24" y="340" fill="#c1c7b6" font-family="monospace" font-size="11">LOCAL DEVELOPMENT / NO MONETARY VALUE</text></svg>');
        return Base64.encode(bytes(svg));
    }
    function _history(uint256 tokenId) private view returns(string memory){
        ProgressState memory p=progress[tokenId];
        string memory value=string.concat('"progress":{"policy":"journey-progress-1","rulesHash":"',Strings.toHexString(uint256(rulesHash),32),'","revision":"',Strings.toString(p.revision),'"');
        value=string.concat(value,',"cumulativeXp":"',Strings.toString(p.cumulativeXp),'","hasCheckpoint":',p.hasCheckpoint?'true':'false');
        return string.concat(value,',"furthestCheckpoint":"',Strings.toString(p.furthestCheckpoint),'","bankSource":"',Strings.toHexString(uint256(p.bankSource),32),'"}');
    }
    function tokenURI(uint256 tokenId) public view override returns(string memory){
        uint8 kind=classOf(tokenId);
        string memory metadata=string.concat('{"name":"',className(kind),' #',Strings.toString(tokenId),'","description":"Original LAST SIGNAL local development soldier. Immutable class and provenance. Verified cosmetic progress is separate from its build. Owned Journey deployment requires a supported adapter and run lease. No monetary value.","image":"data:image/svg+xml;base64,',_image(tokenId,kind),'"');
        metadata=string.concat(metadata,',"classId":',Strings.toString(kind),',"buildHash":"',Strings.toHexString(uint256(builds[kind]),32),'"');
        metadata=string.concat(metadata,',"provenance":"',Strings.toHexString(uint256(provenance[tokenId]),32),'","gameplayAvailability":"REQUIRES_ADAPTER_AND_RUN_LEASE",',_history(tokenId),'}');
        return string.concat('data:application/json;base64,',Base64.encode(bytes(metadata)));
    }
}
