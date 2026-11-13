// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {SurvivalTreasury} from "../src/SurvivalTreasury.sol";
import {SurvivalWelcomeGrant} from "../src/SurvivalWelcomeGrant.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Test only. This is not the Step 12 vault and has no player credit accounting.
contract SurvivalReserveHarness {
    SurvivalTreasury public immutable treasury;
    address public immutable token;
    constructor(SurvivalTreasury t){treasury=t;token=address(t.token());}
    function reserve(bytes32 key,address player,uint256 amount) external {treasury.reserve(key,player,amount);}
    function resolve(bytes32 key,uint256 used) external {treasury.resolve(key,used);}
    function recycle(uint256 amount) external {IERC20(token).approve(address(treasury),amount);treasury.recycle(amount);}
}

contract ReentrantWelcomeReceiver {
    SurvivalWelcomeGrant public immutable grant;
    bytes32 public target;
    bool public attempted;
    bool public reentered;
    constructor(SurvivalWelcomeGrant g){grant=g;}
    function claim(bytes32 campaign,bytes32 nested) external {target=nested;grant.claim(campaign);}
    function onTokens() external {
        require(msg.sender==address(grant.token()));attempted=true;
        (reentered,)=address(grant).call(abi.encodeCall(grant.claim,(target)));
    }
}
