// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {JourneySupplies} from "./JourneySupplies.sol";

/// @notice Local unopened pack sales. ERC1155 operator approval is explicit and revocable.
contract JourneySupplyMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;
    JourneySupplies public immutable collection;
    IERC20 public immutable currency;
    struct Listing {uint256 quantity;uint256 unitPrice;uint256 revision;uint256 epoch;uint256 expiry;}
    mapping(address=>mapping(uint256=>Listing)) public listings;
    event Listed(address indexed seller,uint256 indexed itemClass,uint256 quantity,uint256 unitPrice,uint256 revision,uint256 expiry);
    event Cancelled(address indexed seller,uint256 indexed itemClass,uint256 revision);
    event Sale(address indexed seller,address indexed buyer,uint256 indexed itemClass,uint256 quantity,uint256 unitPrice,uint256 total,uint256 revision);
    constructor(address packs,address token) {
        require(block.chainid==31337 && packs.code.length>0 && token.code.length>0 && packs!=token,"local contracts required");
        collection=JourneySupplies(packs);currency=IERC20(token);
    }
    function list(uint256 itemClass,uint256 quantity,uint256 unitPrice,uint256 expiry) external nonReentrant {
        require(collection.validClass(itemClass)&&quantity>0&&unitPrice>0&&expiry>block.timestamp,"invalid terms");
        require(collection.balanceOf(msg.sender,itemClass)>=quantity,"insufficient packs");
        Listing storage offer=listings[msg.sender][itemClass];
        uint256 revision=offer.revision+1;
        listings[msg.sender][itemClass]=Listing(quantity,unitPrice,revision,collection.balanceEpoch(msg.sender,itemClass),expiry);
        emit Listed(msg.sender,itemClass,quantity,unitPrice,revision,expiry);
    }
    function cancel(uint256 itemClass) external nonReentrant {
        Listing storage offer=listings[msg.sender][itemClass];offer.quantity=0;++offer.revision;
        emit Cancelled(msg.sender,itemClass,offer.revision);
    }
    function quote(address seller,uint256 itemClass) public view returns(Listing memory offer) {
        offer=listings[seller][itemClass];
        require(offer.quantity>0&&offer.expiry>block.timestamp&&offer.epoch==collection.balanceEpoch(seller,itemClass),"stale listing");
        require(collection.balanceOf(seller,itemClass)>=offer.quantity&&collection.isApprovedForAll(seller,address(this)),"unavailable packs");
    }
    function buy(address seller,uint256 itemClass,uint256 quantity,uint256 expectedUnitPrice,uint256 expectedTotal,uint256 expectedRevision,uint256 expectedExpiry) external nonReentrant {
        Listing memory offer=quote(seller,itemClass);
        require(seller!=msg.sender&&quantity>0&&quantity<=offer.quantity,"invalid quantity");
        uint256 total=quantity*offer.unitPrice;
        require(offer.unitPrice==expectedUnitPrice&&total==expectedTotal&&offer.revision==expectedRevision&&offer.expiry==expectedExpiry,"changed terms");
        Listing storage remaining=listings[seller][itemClass];remaining.quantity-=quantity;++remaining.revision;
        uint256 sellerBefore=currency.balanceOf(seller);uint256 buyerBefore=currency.balanceOf(msg.sender);
        currency.safeTransferFrom(msg.sender,seller,total);
        require(currency.balanceOf(seller)==sellerBefore+total&&currency.balanceOf(msg.sender)+total==buyerBefore,"unexpected payment");
        require(collection.balanceEpoch(seller,itemClass)==offer.epoch,"packs changed");
        collection.safeTransferFrom(seller,msg.sender,itemClass,quantity,"");
        remaining.epoch=collection.balanceEpoch(seller,itemClass);
        emit Sale(seller,msg.sender,itemClass,quantity,offer.unitPrice,total,offer.revision);
    }
}
