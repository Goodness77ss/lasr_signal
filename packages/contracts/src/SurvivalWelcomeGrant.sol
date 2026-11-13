// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Finite transfers of original mock tWIF. No mint privilege or identity claim.
/// Once per wallet per campaign in this canonical distributor, not once per person.
contract SurvivalWelcomeGrant is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    address public immutable campaignAdmin;
    uint256 public constant GRANT = 100 ether;
    uint256 public allocated;
    uint256 public totalGranted;
    struct Campaign { bool exists; uint256 remaining; uint256 claims; }
    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => mapping(address => bool)) public claimed;
    event CampaignCreated(bytes32 indexed campaign);
    event CampaignFunded(bytes32 indexed campaign,address indexed sender,uint256 amount);
    event DonationAssigned(bytes32 indexed campaign,uint256 amount);
    event WelcomeClaimed(bytes32 indexed campaign,address indexed player,uint256 amount);
    error Invalid();
    error Unauthorized();
    error AlreadyClaimed();
    error EmptyPool();
    error UnexpectedTokenAmount();

    constructor(address token_,address admin_) {
        if(token_.code.length==0||admin_==address(0))revert Invalid();
        token=IERC20(token_);campaignAdmin=admin_;
    }
    function createCampaign(bytes32 campaign) external {
        if(msg.sender!=campaignAdmin)revert Unauthorized();
        if(campaign==bytes32(0)||campaigns[campaign].exists)revert Invalid();
        campaigns[campaign].exists=true;emit CampaignCreated(campaign);
    }
    function fundCampaign(bytes32 campaign,uint256 amount) external nonReentrant {
        if(!campaigns[campaign].exists||amount==0)revert Invalid();
        uint256 beforeBalance=token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender,address(this),amount);
        if(token.balanceOf(address(this))!=beforeBalance+amount)revert UnexpectedTokenAmount();
        campaigns[campaign].remaining+=amount;allocated+=amount;
        emit CampaignFunded(campaign,msg.sender,amount);
    }
    function unallocated() public view returns(uint256){
        uint256 balance=token.balanceOf(address(this));if(balance<allocated)revert EmptyPool();return balance-allocated;
    }
    /// @dev Can assign only unsolicited, unallocated donations. Existing campaign funds cannot move.
    function assignDonation(bytes32 campaign,uint256 amount) external nonReentrant {
        if(msg.sender!=campaignAdmin)revert Unauthorized();
        if(!campaigns[campaign].exists||amount==0||amount>unallocated())revert Invalid();
        campaigns[campaign].remaining+=amount;allocated+=amount;emit DonationAssigned(campaign,amount);
    }
    function claim(bytes32 campaign) external nonReentrant {
        Campaign storage c=campaigns[campaign];if(!c.exists)revert Invalid();
        if(claimed[campaign][msg.sender])revert AlreadyClaimed();
        if(c.remaining<GRANT)revert EmptyPool();
        claimed[campaign][msg.sender]=true;c.remaining-=GRANT;c.claims++;allocated-=GRANT;totalGranted+=GRANT;
        uint256 beforeBalance=token.balanceOf(address(this));uint256 beforePlayer=token.balanceOf(msg.sender);
        token.safeTransfer(msg.sender,GRANT);
        if(token.balanceOf(address(this))+GRANT!=beforeBalance||token.balanceOf(msg.sender)!=beforePlayer+GRANT)revert UnexpectedTokenAmount();
        emit WelcomeClaimed(campaign,msg.sender,GRANT);
    }
}
