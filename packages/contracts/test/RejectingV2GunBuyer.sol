// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
interface IV2TestCurrency {function faucet() external;function approve(address,uint256) external returns(bool);}
interface IV2GunMarket {function buyListed(uint256,uint256,bytes32,uint256) external;}
contract RejectingV2GunBuyer {
    function fund(address token) external {IV2TestCurrency(token).faucet();}
    function buy(address token,address market,uint256 tokenId,uint256 price,bytes32 build,uint256 nonce) external {
        IV2TestCurrency(token).approve(market,price);IV2GunMarket(market).buyListed(tokenId,price,build,nonce);
    }
}
