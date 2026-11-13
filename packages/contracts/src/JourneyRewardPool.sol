// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
/// @notice J13 disposable test reward backing. No player deposits or stakes.
contract JourneyRewardPool is ReentrancyGuard {
 using SafeERC20 for IERC20;
 IERC20 public immutable currency;
 address public immutable service;
 uint256 public constant CREDIT=1e18;
 uint256 public constant RUN_CAP=15*CREDIT;
 uint256 public constant TIMEOUT=1200;
 bytes32 public constant POLICY=keccak256("journey-local-rewards-J13");
 uint256 public reserved;
 struct Run {address player;uint64 deadline;bool closed;uint256 paid;bytes32 resultHash;}
 mapping(bytes32=>Run) public runs;
 event Funded(address indexed sender,uint256 amount);
 event Reserved(bytes32 indexed runId,address indexed player,uint256 amount,uint256 deadline);
 event Settled(bytes32 indexed runId,address indexed player,uint256 paid,uint256 released,bytes32 resultHash);
 event TimedOut(bytes32 indexed runId,uint256 released);
 constructor(address token,address runService){require(block.chainid==31337&&token.code.length>0&&runService!=address(0),"local configuration required");currency=IERC20(token);service=runService;}
 function available() public view returns(uint256){return currency.balanceOf(address(this))-reserved;}
 function fund(uint256 amount) external nonReentrant {require(amount>0,"positive backing required");uint256 beforeBalance=currency.balanceOf(address(this));currency.safeTransferFrom(msg.sender,address(this),amount);require(currency.balanceOf(address(this))==beforeBalance+amount,"exact backing required");emit Funded(msg.sender,amount);}
 function open(bytes32 runId,address player) external nonReentrant {
  require(msg.sender==service,"run service required");require(runId!=bytes32(0)&&player!=address(0)&&runs[runId].player==address(0),"unique run required");require(available()>=RUN_CAP,"backing unavailable");
  uint64 deadline=uint64(block.timestamp+TIMEOUT);runs[runId]=Run(player,deadline,false,0,bytes32(0));reserved+=RUN_CAP;emit Reserved(runId,player,RUN_CAP,deadline);
 }
 function settle(bytes32 runId,bool bank,uint256 payout,bytes32 resultHash) external nonReentrant {
  require(msg.sender==service,"run service required");Run storage run=runs[runId];require(run.player!=address(0)&&!run.closed&&block.timestamp<run.deadline,"active run required");
  require(resultHash!=bytes32(0)&&(bank?(payout==10*CREDIT||payout==RUN_CAP):payout==0),"approved terminal payout required");
  run.closed=true;run.paid=payout;run.resultHash=resultHash;reserved-=RUN_CAP;
  if(payout>0){uint256 beforePlayer=currency.balanceOf(run.player);uint256 beforePool=currency.balanceOf(address(this));currency.safeTransfer(run.player,payout);require(currency.balanceOf(run.player)==beforePlayer+payout&&currency.balanceOf(address(this))+payout==beforePool,"exact payout required");}
  emit Settled(runId,run.player,payout,RUN_CAP-payout,resultHash);
 }
 function timeout(bytes32 runId) external nonReentrant {Run storage run=runs[runId];require(run.player!=address(0)&&!run.closed&&block.timestamp>=run.deadline,"expired run required");run.closed=true;reserved-=RUN_CAP;emit TimedOut(runId,RUN_CAP);}
}

