// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {JourneySoldiers} from "./JourneySoldiers.sol";

/// @notice Fixed price local test currency exchange. Minting remains separate.
contract JourneySoldierMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;
    JourneySoldiers public immutable collection;
    IERC20 public immutable currency;
    bytes32 public constant MARKET_POLICY=keccak256("journey-soldier-fixed-price-1");
    struct Listing {address seller;uint256 price;uint256 nonce;uint256 progressRevision;uint256 assetNonce;bytes32 buildHash;}
    mapping(uint256=>Listing) public listings;
    mapping(uint256=>uint256) public listingNonce;
    error Invalid();
    error Unauthorized();
    error StaleTerms();
    error UnexpectedAmount();
    event Listed(uint256 indexed tokenId,address indexed seller,uint256 price,uint256 nonce,uint256 progressRevision,uint256 assetNonce);
    event Cancelled(uint256 indexed tokenId,uint256 nonce);
    event Sale(uint256 indexed tokenId,address indexed seller,address indexed buyer,uint256 price,uint256 nonce,uint256 progressRevision);
    constructor(address soldiers,address token){
        if(soldiers.code.length==0||token.code.length==0||soldiers==token)revert Invalid();
        collection=JourneySoldiers(soldiers);currency=IERC20(token);
    }
    function listSoldier(uint256 tokenId,uint256 price,uint256 expectedProgressRevision,uint256 expectedAssetNonce) external nonReentrant {
        if(collection.ownerOf(tokenId)!=msg.sender)revert Unauthorized();
        if(price==0||collection.leaseActive(tokenId))revert Invalid();
        (,,uint256 revision,,)=collection.progress(tokenId);
        if(revision!=expectedProgressRevision||collection.progressNonce(tokenId)!=expectedAssetNonce)revert StaleTerms();
        uint256 nonce=++listingNonce[tokenId];
        listings[tokenId]=Listing(msg.sender,price,nonce,revision,expectedAssetNonce,collection.buildHash(tokenId));
        emit Listed(tokenId,msg.sender,price,nonce,revision,expectedAssetNonce);
    }
    function cancelListing(uint256 tokenId) external nonReentrant {
        if(collection.ownerOf(tokenId)!=msg.sender)revert Unauthorized();
        delete listings[tokenId];emit Cancelled(tokenId,++listingNonce[tokenId]);
    }
    function _current(uint256 tokenId,Listing memory offer) private view {
        (,,uint256 revision,,)=collection.progress(tokenId);
        if(offer.seller==address(0)||collection.ownerOf(tokenId)!=offer.seller||collection.leaseActive(tokenId)||offer.progressRevision!=revision||offer.assetNonce!=collection.progressNonce(tokenId)||offer.buildHash!=collection.buildHash(tokenId))revert StaleTerms();
    }
    function quote(uint256 tokenId) external view returns(Listing memory offer){offer=listings[tokenId];_current(tokenId,offer);}
    function buyListed(uint256 tokenId,address expectedSeller,uint256 expectedPrice,uint256 expectedNonce,uint256 expectedProgressRevision,uint256 expectedAssetNonce) external nonReentrant {
        Listing memory offer=listings[tokenId];
        if(offer.seller==msg.sender)revert Unauthorized();
        if(offer.seller!=expectedSeller||offer.price!=expectedPrice||offer.nonce!=expectedNonce||offer.progressRevision!=expectedProgressRevision||offer.assetNonce!=expectedAssetNonce)revert StaleTerms();
        _current(tokenId,offer);delete listings[tokenId];++listingNonce[tokenId];
        uint256 sellerBefore=currency.balanceOf(offer.seller);uint256 buyerBefore=currency.balanceOf(msg.sender);
        currency.safeTransferFrom(msg.sender,offer.seller,offer.price);
        if(currency.balanceOf(offer.seller)!=sellerBefore+offer.price||currency.balanceOf(msg.sender)+offer.price!=buyerBefore)revert UnexpectedAmount();
        // Recheck after the external currency call, before NFT delivery.
        _current(tokenId,offer);collection.safeTransferFrom(offer.seller,msg.sender,tokenId);
        emit Sale(tokenId,offer.seller,msg.sender,offer.price,offer.nonce,offer.progressRevision);
    }
}
