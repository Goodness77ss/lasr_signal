// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface ISurvivalReserveConsumer {
    function token() external view returns (address);
}

/// @notice Finite mock reward capacity. Deployment binds one immutable consumer.
/// Reservations are reward backing, not player wallet balances or pull claims.
/// The future vault computes player credits and holds its own deposit and claim liabilities.
contract SurvivalTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable binder;
    address public vault;
    uint256 public reserved;
    uint256 public totalFunded;
    uint256 public totalRecycled;
    uint256 public totalPaid;
    uint256 public constant MAX_SEGMENT_RESERVE = 30 ether;
    struct Reservation { address player; uint256 amount; bool closed; }
    mapping(bytes32 => Reservation) public reservations;
    mapping(address => uint256) public reservedFor;
    event VaultBound(address indexed vault);
    event Funded(address indexed sender, uint256 amount, bool recycled);
    event Reserved(bytes32 indexed key, address indexed player, uint256 amount);
    event Resolved(bytes32 indexed key, address indexed player, uint256 used, uint256 released);
    error Invalid();
    error Unauthorized();
    error InsufficientCapacity();
    error UnexpectedTokenAmount();

    constructor(address token_, address binder_) {
        if(token_.code.length==0||binder_==address(0))revert Invalid();
        token=IERC20(token_);binder=binder_;
    }
    /// @dev One deployment setup action. No later consumer rotation or withdrawals.
    function bindVault(address candidate) external {
        if(msg.sender!=binder||vault!=address(0))revert Unauthorized();
        if(candidate.code.length==0||ISurvivalReserveConsumer(candidate).token()!=address(token))revert Invalid();
        vault=candidate;emit VaultBound(candidate);
    }
    function freeCapacity() public view returns(uint256) {
        uint256 balance=token.balanceOf(address(this));
        if(balance<reserved)revert InsufficientCapacity();
        return balance-reserved;
    }
    function fund(uint256 amount) external nonReentrant { _fund(amount,false); }
    /// @dev Only the bound vault may label an inflow recycled game revenue.
    function recycle(uint256 amount) external nonReentrant {
        if(msg.sender!=vault)revert Unauthorized();
        _fund(amount,true);
    }
    function _fund(uint256 amount,bool recycled) private {
        if(amount==0)revert Invalid();
        uint256 beforeBalance=token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender,address(this),amount);
        if(token.balanceOf(address(this))!=beforeBalance+amount)revert UnexpectedTokenAmount();
        totalFunded+=amount;if(recycled)totalRecycled+=amount;
        emit Funded(msg.sender,amount,recycled);
    }
    function reserve(bytes32 key,address player,uint256 amount) external nonReentrant {
        if(msg.sender!=vault)revert Unauthorized();
        if(key==bytes32(0)||player==address(0)||amount==0||amount>MAX_SEGMENT_RESERVE||reservations[key].player!=address(0))revert Invalid();
        if(freeCapacity()<amount)revert InsufficientCapacity();
        reservations[key]=Reservation(player,amount,false);reserved+=amount;reservedFor[player]+=amount;
        emit Reserved(key,player,amount);
    }
    /// @dev Releases unused backing and transfers only computed reward use to the vault.
    /// Destination is fixed; a caller cannot redirect the reservation to another wallet.
    function resolve(bytes32 key,uint256 used) external nonReentrant {
        if(msg.sender!=vault)revert Unauthorized();
        Reservation storage r=reservations[key];
        if(r.player==address(0)||r.closed||used>r.amount)revert Invalid();
        r.closed=true;reserved-=r.amount;reservedFor[r.player]-=r.amount;totalPaid+=used;
        if(used!=0){
            uint256 beforeBalance=token.balanceOf(address(this));uint256 beforeVault=token.balanceOf(vault);
            token.safeTransfer(vault,used);
            if(token.balanceOf(address(this))+used!=beforeBalance||token.balanceOf(vault)!=beforeVault+used)revert UnexpectedTokenAmount();
        }
        emit Resolved(key,r.player,used,r.amount-used);
    }
}
