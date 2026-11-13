// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {JourneySoldierMarket} from "../src/JourneySoldierMarket.sol";
/// @dev Explicit failure fixture. No ERC721 receiver implementation.
contract RejectingSoldierBuyer {
    function buy(address token,address market,uint256 tokenId,address seller,uint256 price,uint256 nonce,uint256 revision,uint256 assetNonce) external {
        IERC20(token).approve(market,price);
        JourneySoldierMarket(market).buyListed(tokenId,seller,price,nonce,revision,assetNonce);
    }
}
