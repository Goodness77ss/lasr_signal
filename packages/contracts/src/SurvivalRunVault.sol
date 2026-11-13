// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {SurvivalTreasury} from "./SurvivalTreasury.sol";
interface ISurvivalBurnable is IERC20 { function burn(uint256 amount) external; }

/// @notice Bounded server attested mock token accounting, not proof of combat.
/// Deployment, gameplay signing and transaction submission are separate roles.
contract SurvivalRunVault is EIP712,ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    SurvivalTreasury public immutable treasury;
    address public immutable settlementSigner;
    bytes32 public immutable rulesHash;
    uint256 public constant MAX_DEPOSIT=100 ether;
    uint256 public constant STATION_RESERVE=24 ether;
    uint256 public constant BONUS_RESERVE=6 ether;
    uint256 public constant RUN_STATION_CAP=120 ether;
    uint256 public constant RUN_BONUS_CAP=30 ether;
    uint256 public constant WALLET_CAP=200 ether;
    uint256 public constant WINDOW=86400;
    uint256 public constant HARD_TIMEOUT=900;
    uint256 public constant SOFT_CLOSE=600;
    uint256 public constant MISSION_STAKE=5 ether;
    uint256 public constant MISSION_BONUS=3 ether;
    uint256 private constant HISTORY=256;
    enum Outcome { CHECKPOINT, DEATH, EXTRACTED, SURRENDER, ABORT }
    struct Entry {
        bytes32 runId;address player;address currency;bytes32 rulesHash;
        uint256 segment;uint256 sequence;uint256 deposit;uint256 stationReserve;uint256 bonusReserve;
        uint256 carryCap;uint256 nonce;uint256 expiry;
    }
    struct Result {
        bytes32 runId;address player;address currency;bytes32 rulesHash;
        uint256 segment;uint256 sequence;uint256 deposit;uint256 stationEarned;uint256 bonusEarned;
        uint256 spent;uint256 failedStake;uint8 successMask;uint8 failureMask;uint8 abortMask;
        Outcome outcome;bytes32 resultHash;uint256 expiry;uint256 nextStationReserve;uint256 nextBonusReserve;
    }
    struct MissionPermit {
        bytes32 runId;bytes32 missionId;address player;address currency;bytes32 rulesHash;
        uint256 segment;uint256 sequence;uint256 stationEarned;uint256 spent;
        uint8 successMask;uint8 failureMask;uint8 abortMask;uint256 expiry;
    }
    struct Run {
        address player;bool active;bool ended;uint256 segment;uint256 sequence;
        uint256 deposit;uint256 stationReserve;uint256 bonusReserve;uint256 activatedAt;uint256 deadline;uint256 carryCap;
        uint256 totalStation;uint256 totalBonus;uint256 stationFloor;uint256 spendFloor;
        uint8 accepted;uint8 successes;uint8 failures;uint8 aborts;
    }
    struct Closing {uint256 credit;uint256 burn;uint256 recycled;uint256 earned;uint256 carry;uint256 segment;bytes32 authorization;}
    struct Earned {uint256 at;uint256 amount;}
    struct RewardWindow {uint256 head;uint256 count;Earned[256] entries;}
    mapping(bytes32=>Run) private runs;
    mapping(address=>RewardWindow) private windows;
    mapping(address=>bytes32) public activeRun;
    mapping(address=>uint256) public entryNonce;
    mapping(address=>uint256) public pendingRewards;
    mapping(bytes32=>bool) public missionUsed;
    mapping(bytes32=>mapping(uint256=>bytes32)) public finalized;
    mapping(address=>uint256) public claimable;
    uint256 public lockedLiability;
    uint256 public claimLiability;

    bytes32 public constant ENTRY_TYPEHASH=keccak256("Entry(bytes32 runId,address player,address currency,bytes32 rulesHash,uint256 segment,uint256 sequence,uint256 deposit,uint256 stationReserve,uint256 bonusReserve,uint256 carryCap,uint256 nonce,uint256 expiry)");
    bytes32 public constant RESULT_TYPEHASH=keccak256("Result(bytes32 runId,address player,address currency,bytes32 rulesHash,uint256 segment,uint256 sequence,uint256 deposit,uint256 stationEarned,uint256 bonusEarned,uint256 spent,uint256 failedStake,uint8 successMask,uint8 failureMask,uint8 abortMask,uint8 outcome,bytes32 resultHash,uint256 expiry,uint256 nextStationReserve,uint256 nextBonusReserve)");
    bytes32 public constant MISSION_TYPEHASH=keccak256("MissionPermit(bytes32 runId,bytes32 missionId,address player,address currency,bytes32 rulesHash,uint256 segment,uint256 sequence,uint256 stationEarned,uint256 spent,uint8 successMask,uint8 failureMask,uint8 abortMask,uint256 expiry)");
    error Invalid();error Unauthorized();error Closed();error Expired();error Capacity();error UnexpectedTokenAmount();error NothingToClaim();
    event Opened(bytes32 indexed runId,address indexed player,uint256 segment,uint256 sequence,uint256 deposit,uint256 stationReserve,uint256 bonusReserve,uint256 deadline,uint256 carryCap);
    event MissionAccepted(bytes32 indexed runId,bytes32 indexed missionId,uint256 segment,uint256 index,uint256 stake);
    event CarryConsent(bytes32 indexed runId,uint256 cap);
    event ToppedUp(bytes32 indexed runId,uint256 amount,uint256 deposit);
    event Settled(bytes32 indexed runId,uint256 indexed segment,Outcome outcome,uint256 credit,uint256 burn,uint256 recycled,uint256 carry,bytes32 resultHash,bytes32 authorization);
    event TimeoutRecovered(bytes32 indexed runId,uint256 indexed segment,address indexed player,uint256 credit);
    event Claimed(address indexed player,uint256 amount);

    constructor(address token_,address treasury_,address signer_,bytes32 rules_) EIP712("LAST SIGNAL SurvivalRunVault","2") {
        if(token_.code.length==0||treasury_.code.length==0||signer_==address(0)||rules_==bytes32(0))revert Invalid();
        token=IERC20(token_);treasury=SurvivalTreasury(treasury_);settlementSigner=signer_;rulesHash=rules_;
        if(address(treasury.token())!=token_)revert Invalid();
    }
    function entryDigest(Entry calldata e) public view returns(bytes32){return _hashTypedDataV4(keccak256(abi.encode(ENTRY_TYPEHASH,e)));}
    function resultDigest(Result calldata r) public view returns(bytes32){return _hashTypedDataV4(keccak256(abi.encode(RESULT_TYPEHASH,r)));}
    function missionDigest(MissionPermit calldata p) public view returns(bytes32){return _hashTypedDataV4(keccak256(abi.encode(MISSION_TYPEHASH,p)));}
    function run(bytes32 runId) external view returns(Run memory){return runs[runId];}
    function reserveKey(bytes32 runId,uint256 segment) public view returns(bytes32){return keccak256(abi.encode(address(this),runId,segment));}
    function liabilities() external view returns(uint256){return lockedLiability+claimLiability;}
    function walletEarned(address player) public view returns(uint256 amount){
        RewardWindow storage w=windows[player];
        for(uint256 i=0;i<w.count;i++){Earned storage e=w.entries[(w.head+i)%HISTORY];if(!_expired(e.at))amount+=e.amount;}
    }
    function walletRemaining(address player) public view returns(uint256){uint256 used=walletEarned(player)+pendingRewards[player];return used>=WALLET_CAP?0:WALLET_CAP-used;}
    function _expired(uint256 at_) private view returns(bool){return block.timestamp>=WINDOW&&at_<=block.timestamp-WINDOW;}
    function _prune(address player) private {
        RewardWindow storage w=windows[player];
        while(w.count!=0&&_expired(w.entries[w.head].at)){delete w.entries[w.head];w.head=(w.head+1)%HISTORY;w.count--;}
    }
    function _record(address player,uint256 at_,uint256 amount) private {
        if(amount==0)return;_prune(player);if(_expired(at_))return;
        RewardWindow storage w=windows[player];if(w.count>=HISTORY)revert Capacity();
        w.entries[(w.head+w.count)%HISTORY]=Earned(at_,amount);w.count++;
    }
    function _budgets(uint256 station,uint256 bonus) private pure returns(bool){return station<=STATION_RESERVE&&bonus<=BONUS_RESERVE&&station+bonus!=0;}
    function _authenticate(bytes32 digest,bytes calldata sig) private view {if(ECDSA.recover(digest,sig)!=settlementSigner)revert Unauthorized();}
    function _identity(address player,address currency,bytes32 rules_) private view {if(player==address(0)||currency!=address(token)||rules_!=rulesHash)revert Invalid();}
    function open(Entry calldata e,bytes calldata signature) external nonReentrant {
        _identity(e.player,e.currency,e.rulesHash);
        if(msg.sender!=e.player)revert Unauthorized();
        if(block.timestamp>=e.expiry||e.expiry>block.timestamp+SOFT_CLOSE)revert Expired();
        if(e.runId==bytes32(0)||e.deposit>MAX_DEPOSIT||e.carryCap>MAX_DEPOSIT||!_budgets(e.stationReserve,e.bonusReserve)||e.nonce!=entryNonce[e.player]||activeRun[e.player]!=bytes32(0))revert Invalid();
        _authenticate(entryDigest(e),signature);
        Run storage r=runs[e.runId];
        if(r.player==address(0)){if(e.segment!=1||e.sequence!=0)revert Invalid();r.player=e.player;}
        else if(r.player!=e.player||r.active||r.ended||e.segment!=r.segment+1||e.sequence!=r.sequence)revert Invalid();
        _prune(e.player);
        if(r.totalStation+e.stationReserve>RUN_STATION_CAP||r.totalBonus+e.bonusReserve>RUN_BONUS_CAP||walletRemaining(e.player)<e.stationReserve+e.bonusReserve||windows[e.player].count>=HISTORY)revert Capacity();
        entryNonce[e.player]++;r.carryCap=e.carryCap;
        _activate(e.runId,r,e.segment,e.deposit,e.stationReserve,e.bonusReserve);
        if(e.deposit!=0){uint256 beforeBalance=token.balanceOf(address(this));token.safeTransferFrom(e.player,address(this),e.deposit);if(token.balanceOf(address(this))!=beforeBalance+e.deposit)revert UnexpectedTokenAmount();}
    }
    function _activate(bytes32 runId,Run storage r,uint256 segment,uint256 deposit,uint256 station,uint256 bonus) private {
        treasury.reserve(reserveKey(runId,segment),r.player,station+bonus);
        r.active=true;r.segment=segment;r.deposit=deposit;r.stationReserve=station;r.bonusReserve=bonus;
        r.activatedAt=block.timestamp;r.deadline=block.timestamp+HARD_TIMEOUT;r.stationFloor=0;r.spendFloor=0;r.accepted=0;r.successes=0;r.failures=0;r.aborts=0;
        pendingRewards[r.player]+=station+bonus;lockedLiability+=deposit;activeRun[r.player]=runId;
        emit Opened(runId,r.player,segment,r.sequence,deposit,station,bonus,r.deadline,r.carryCap);
    }
    function setCarryCap(bytes32 runId,uint256 cap) external {
        Run storage r=runs[runId];if(msg.sender!=r.player)revert Unauthorized();if(r.ended||cap>MAX_DEPOSIT)revert Invalid();r.carryCap=cap;emit CarryConsent(runId,cap);
    }
    function topUp(bytes32 runId,uint256 amount) external nonReentrant {
        Run storage r=runs[runId];if(msg.sender!=r.player)revert Unauthorized();if(!r.active||r.ended)revert Closed();
        if(block.timestamp>=r.activatedAt+SOFT_CLOSE)revert Expired();if(amount==0||r.deposit+amount>MAX_DEPOSIT)revert Invalid();
        r.deposit+=amount;lockedLiability+=amount;uint256 beforeBalance=token.balanceOf(address(this));token.safeTransferFrom(msg.sender,address(this),amount);if(token.balanceOf(address(this))!=beforeBalance+amount)revert UnexpectedTokenAmount();emit ToppedUp(runId,amount,r.deposit);
    }
    function _count(uint8 bits) private pure returns(uint256 n){while(bits!=0){n+=bits&1;bits>>=1;}}
    function _outcomes(Run storage r,uint8 success,uint8 failure,uint8 abort_) private view returns(uint256 bonus,uint256 failed){
        uint8 all=uint8((uint256(1)<<r.accepted)-1);
        if((success|failure|abort_)!=all||(success&failure)!=0||(success&abort_)!=0||(failure&abort_)!=0||(success&r.successes)!=r.successes||(failure&r.failures)!=r.failures||(abort_&r.aborts)!=r.aborts)revert Invalid();
        bonus=_count(success)*MISSION_BONUS;failed=_count(failure)*MISSION_STAKE;
    }
    function acceptMission(MissionPermit calldata p,bytes calldata signature) external nonReentrant {
        _identity(p.player,p.currency,p.rulesHash);Run storage r=runs[p.runId];
        if(msg.sender!=r.player||p.player!=r.player)revert Unauthorized();if(!r.active||r.ended)revert Closed();
        if(block.timestamp>=p.expiry||p.expiry>r.deadline||block.timestamp+60>r.activatedAt+SOFT_CLOSE||block.timestamp<r.activatedAt+90)revert Expired();
        if(p.segment!=r.segment||p.sequence!=r.sequence||p.missionId==bytes32(0)||r.accepted>=2||p.stationEarned<r.stationFloor||p.stationEarned>r.stationReserve||p.spent<r.spendFloor)revert Invalid();
        bytes32 key=keccak256(abi.encode(p.runId,p.missionId));if(missionUsed[key])revert Invalid();_authenticate(missionDigest(p),signature);
        (uint256 bonus,uint256 failed)=_outcomes(r,p.successMask,p.failureMask,p.abortMask);
        if(bonus+MISSION_BONUS>r.bonusReserve||p.spent+failed+MISSION_STAKE>r.deposit+p.stationEarned+bonus)revert Invalid();
        missionUsed[key]=true;r.stationFloor=p.stationEarned;r.spendFloor=p.spent;r.successes=p.successMask;r.failures=p.failureMask;r.aborts=p.abortMask;r.accepted++;
        emit MissionAccepted(p.runId,p.missionId,r.segment,r.accepted-1,MISSION_STAKE);
    }
    function settle(Result calldata s,bytes calldata signature) external nonReentrant {
        _identity(s.player,s.currency,s.rulesHash);Run storage r=runs[s.runId];
        if(!r.active||r.ended)revert Closed();
        // A later player top up cannot invalidate known earnings or failed stakes.
        // Signed deposit is a lower bound; credit always uses the full stored deposit.
        if(s.player!=r.player||s.segment!=r.segment||s.sequence!=r.sequence||s.deposit>r.deposit||s.resultHash==bytes32(0)||s.nextStationReserve>STATION_RESERVE||s.nextBonusReserve>BONUS_RESERVE)revert Invalid();
        if(block.timestamp>=r.deadline||block.timestamp>=s.expiry||s.expiry>r.deadline)revert Expired();
        if(s.outcome==Outcome.CHECKPOINT&&block.timestamp<r.activatedAt+300)revert Invalid();
        Closing memory c;c.authorization=resultDigest(s);_authenticate(c.authorization,signature);
        if(s.outcome==Outcome.ABORT){
            if(s.stationEarned!=0||s.bonusEarned!=0||s.spent!=0||s.failedStake!=0||s.successMask!=0||s.failureMask!=0||s.abortMask!=uint8((uint256(1)<<r.accepted)-1)||s.nextStationReserve!=0||s.nextBonusReserve!=0)revert Invalid();
        }else{
            (uint256 bonus,uint256 failed)=_outcomes(r,s.successMask,s.failureMask,s.abortMask);
            if(s.stationEarned<r.stationFloor||s.stationEarned>r.stationReserve||s.spent<r.spendFloor||s.bonusEarned!=bonus||bonus>r.bonusReserve||s.failedStake!=failed||s.spent+failed>r.deposit+s.stationEarned+bonus)revert Invalid();
            if(s.outcome!=Outcome.CHECKPOINT&&(s.nextStationReserve!=0||s.nextBonusReserve!=0))revert Invalid();
        }
        c.credit=r.deposit+s.stationEarned+s.bonusEarned-s.spent-s.failedStake;
        c.burn=s.spent/10;c.recycled=s.spent-c.burn+s.failedStake;c.segment=r.segment;c.earned=s.stationEarned+s.bonusEarned;
        pendingRewards[r.player]-=r.stationReserve+r.bonusReserve;lockedLiability-=r.deposit;r.active=false;activeRun[r.player]=bytes32(0);
        r.totalStation+=s.stationEarned;r.totalBonus+=s.bonusEarned;r.sequence++;
        finalized[s.runId][c.segment]=c.authorization;
        treasury.resolve(reserveKey(s.runId,c.segment),c.earned);_record(r.player,r.activatedAt,c.earned);
        if(c.burn!=0){uint256 supply=token.totalSupply();uint256 balance=token.balanceOf(address(this));ISurvivalBurnable(address(token)).burn(c.burn);if(token.totalSupply()+c.burn!=supply||token.balanceOf(address(this))+c.burn!=balance)revert UnexpectedTokenAmount();}
        if(c.recycled!=0){token.forceApprove(address(treasury),c.recycled);treasury.recycle(c.recycled);}
        if(s.outcome==Outcome.CHECKPOINT)c.carry=_renew(s.runId,r,c.credit,s.nextStationReserve,s.nextBonusReserve);
        else r.ended=true;
        claimable[r.player]+=c.credit-c.carry;claimLiability+=c.credit-c.carry;
        _emitSettlement(s,c);
    }
    function _emitSettlement(Result calldata s,Closing memory c) private {emit Settled(s.runId,c.segment,s.outcome,c.credit,c.burn,c.recycled,c.carry,s.resultHash,c.authorization);}
    function _renew(bytes32 runId,Run storage r,uint256 credit,uint256 station,uint256 bonus) private returns(uint256 carry){
        if(r.carryCap==0||credit==0||!_budgets(station,bonus)||r.totalStation+station>RUN_STATION_CAP||r.totalBonus+bonus>RUN_BONUS_CAP||walletRemaining(r.player)<station+bonus||windows[r.player].count>=HISTORY)return 0;
        carry=credit<r.carryCap?credit:r.carryCap;
        // Reserve races bank the credit instead of preventing the canonical settlement.
        try treasury.reserve(reserveKey(runId,r.segment+1),r.player,station+bonus) {}catch{return 0;}
        r.segment++;r.active=true;r.deposit=carry;r.stationReserve=station;r.bonusReserve=bonus;r.activatedAt=block.timestamp;r.deadline=block.timestamp+HARD_TIMEOUT;r.stationFloor=0;r.spendFloor=0;r.accepted=0;r.successes=0;r.failures=0;r.aborts=0;
        pendingRewards[r.player]+=station+bonus;lockedLiability+=carry;activeRun[r.player]=runId;
        emit Opened(runId,r.player,r.segment,r.sequence,carry,station,bonus,r.deadline,r.carryCap);
    }
    function refundExpired(bytes32 runId) external nonReentrant {
        Run storage r=runs[runId];if(!r.active||r.ended)revert Closed();if(block.timestamp<r.deadline)revert Expired();
        uint256 credit=r.deposit;r.active=false;r.ended=true;r.sequence++;activeRun[r.player]=bytes32(0);lockedLiability-=credit;pendingRewards[r.player]-=r.stationReserve+r.bonusReserve;
        finalized[runId][r.segment]=keccak256(abi.encode("TIMEOUT",runId,r.segment,r.player,credit));
        treasury.resolve(reserveKey(runId,r.segment),0);claimable[r.player]+=credit;claimLiability+=credit;
        emit TimeoutRecovered(runId,r.segment,r.player,credit);
    }
    function claim() external nonReentrant {
        uint256 amount=claimable[msg.sender];if(amount==0)revert NothingToClaim();claimable[msg.sender]=0;claimLiability-=amount;
        uint256 balance=token.balanceOf(address(this));uint256 recipient=token.balanceOf(msg.sender);token.safeTransfer(msg.sender,amount);if(token.balanceOf(address(this))+amount!=balance||token.balanceOf(msg.sender)!=recipient+amount)revert UnexpectedTokenAmount();emit Claimed(msg.sender,amount);
    }
}
