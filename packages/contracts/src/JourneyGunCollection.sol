// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Separate Journey builds. No reinterpretation of old gun IDs or SVGs.
/// Initial acquisition requires a designated signer claim, not a new mint price.
contract JourneyGunCollection is ERC721Enumerable,EIP712,ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable currency;
    address public immutable gameplaySigner;
    bytes32 public immutable rulesHash;
    bytes32[2] private builds;
    struct Claim {bytes32 dropId;bytes32 runId;address recipient;uint8 kind;bytes32 rulesHash;bytes32 buildHash;uint256 expiry;}
    bytes32 private constant CLAIM_TYPEHASH=keccak256("Claim(bytes32 dropId,bytes32 runId,address recipient,uint8 kind,bytes32 rulesHash,bytes32 buildHash,uint256 expiry)");
    struct Listing {address seller;uint256 price;bytes32 buildHash;uint256 nonce;}
    mapping(uint256=>Listing) public listings;
    mapping(uint256=>uint256) public listingNonce;
    mapping(bytes32=>bool) public claimed;
    mapping(bytes32=>uint8) public runClaims;
    mapping(uint256=>bytes32) public provenance;
    mapping(uint256=>bytes32) public sourceRun;
    mapping(uint256=>uint8) private kinds;
    uint256 public nextTokenId=1;
    error Invalid();error Unauthorized();error StaleTerms();error UnexpectedAmount();
    event GunClaimed(uint256 indexed tokenId,address indexed recipient,bytes32 indexed dropId,bytes32 runId,uint8 kind,bytes32 buildHash);
    event Listed(uint256 indexed tokenId,address indexed seller,uint256 price,bytes32 buildHash,uint256 nonce);
    event ListingCancelled(uint256 indexed tokenId,uint256 nonce);
    event Sale(uint256 indexed tokenId,address indexed seller,address indexed buyer,uint256 price,bytes32 buildHash,uint256 nonce);
    constructor(address token,address signer,bytes32 rules,bytes32[2] memory classBuilds)
        ERC721("LAST SIGNAL Journey Guns","LSJGUN") EIP712("LAST SIGNAL Journey Guns","1") {
        if(token.code.length==0||signer==address(0)||rules==bytes32(0)||classBuilds[0]==bytes32(0)||classBuilds[1]==bytes32(0)||classBuilds[0]==classBuilds[1])revert Invalid();
        currency=IERC20(token);gameplaySigner=signer;rulesHash=rules;builds=classBuilds;
    }
    function buildForKind(uint8 kind) public view returns(bytes32){if(kind>=2)revert Invalid();return builds[kind];}
    function gunKind(uint256 tokenId) public view returns(uint8){_requireOwned(tokenId);return kinds[tokenId];}
    function buildHash(uint256 tokenId) public view returns(bytes32){return buildForKind(gunKind(tokenId));}
    function claimLoot(Claim[] calldata claims,bytes[] calldata signatures) external nonReentrant {
        if(claims.length==0||claims.length>3||claims.length!=signatures.length)revert Invalid();
        for(uint256 i;i<claims.length;i++){
            Claim calldata c=claims[i];
            if(c.recipient!=msg.sender)revert Unauthorized();
            if(c.dropId==bytes32(0)||c.runId==bytes32(0)||claimed[c.dropId]||c.rulesHash!=rulesHash||block.timestamp>=c.expiry||c.buildHash!=buildForKind(c.kind)||runClaims[c.runId]>=3)revert Invalid();
            bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH,c.dropId,c.runId,c.recipient,c.kind,c.rulesHash,c.buildHash,c.expiry)));
            if(ECDSA.recover(digest,signatures[i])!=gameplaySigner)revert Unauthorized();
            claimed[c.dropId]=true;runClaims[c.runId]++;uint256 tokenId=nextTokenId++;
            kinds[tokenId]=c.kind;provenance[tokenId]=c.dropId;sourceRun[tokenId]=c.runId;_safeMint(msg.sender,tokenId);
            emit GunClaimed(tokenId,msg.sender,c.dropId,c.runId,c.kind,c.buildHash);
        }
    }
    function listGun(uint256 tokenId,uint256 price,bytes32 expectedBuildHash) external nonReentrant {
        if(ownerOf(tokenId)!=msg.sender)revert Unauthorized();
        if(price==0||expectedBuildHash!=buildHash(tokenId))revert Invalid();
        uint256 nonce=++listingNonce[tokenId];listings[tokenId]=Listing(msg.sender,price,expectedBuildHash,nonce);
        emit Listed(tokenId,msg.sender,price,expectedBuildHash,nonce);
    }
    function cancelListing(uint256 tokenId) external nonReentrant {
        if(ownerOf(tokenId)!=msg.sender)revert Unauthorized();delete listings[tokenId];emit ListingCancelled(tokenId,++listingNonce[tokenId]);
    }
    function quote(uint256 tokenId) public view returns(Listing memory offer){
        offer=listings[tokenId];if(offer.seller==address(0)||ownerOf(tokenId)!=offer.seller||offer.buildHash!=buildHash(tokenId))revert StaleTerms();
    }
    function buyListed(uint256 tokenId,address expectedSeller,uint256 expectedPrice,bytes32 expectedBuildHash,uint256 expectedNonce) external nonReentrant {
        Listing memory offer=quote(tokenId);
        if(offer.seller==msg.sender)revert Unauthorized();
        if(offer.seller!=expectedSeller||offer.price!=expectedPrice||offer.buildHash!=expectedBuildHash||offer.nonce!=expectedNonce)revert StaleTerms();
        delete listings[tokenId];
        uint256 sellerBefore=currency.balanceOf(offer.seller);uint256 buyerBefore=currency.balanceOf(msg.sender);
        currency.safeTransferFrom(msg.sender,offer.seller,offer.price);
        if(currency.balanceOf(offer.seller)!=sellerBefore+offer.price||currency.balanceOf(msg.sender)+offer.price!=buyerBefore)revert UnexpectedAmount();
        _safeTransfer(offer.seller,msg.sender,tokenId,"");emit Sale(tokenId,offer.seller,msg.sender,offer.price,offer.buildHash,offer.nonce);
    }
    function _update(address to,uint256 tokenId,address auth) internal override returns(address from){
        from=super._update(to,tokenId,auth);if(from!=address(0)){delete listings[tokenId];listingNonce[tokenId]++;}
    }
    function ownedPage(address account,uint256 offset,uint256 limit) external view returns(uint256[] memory ids){
        if(limit==0||limit>32)revert Invalid();uint256 total=balanceOf(account);uint256 n=offset<total?(total-offset<limit?total-offset:limit):0;
        ids=new uint256[](n);for(uint256 i;i<n;i++)ids[i]=tokenOfOwnerByIndex(account,offset+i);
    }
    function tokenURI(uint256 tokenId) public view override returns(string memory){
        uint8 kind=gunKind(tokenId);string memory label=kind==0?"Marksman rifle":"Support gun";
        string memory svg=string.concat('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300"><rect width="480" height="300" fill="#252c24"/><path d="M48 170h132l28-24h218v14H221l-32 30H48z" fill="#a98b5b"/><path d="M196 134h230v8H196z" fill="#b9bcb0"/>',kind==0?'<rect x="224" y="112" width="72" height="14" fill="#b9bcb0"/>':'<rect x="227" y="163" width="30" height="40" fill="#7b8262"/>','<text x="24" y="38" fill="#f0dfb7" font-family="monospace" font-size="20">LAST SIGNAL JOURNEY GUNS</text><text x="24" y="246" fill="#f0dfb7" font-family="monospace" font-size="20">',label,'</text><text x="24" y="276" fill="#c1c7b6" font-family="monospace" font-size="12">LOCAL DEVELOPMENT / NO MONETARY VALUE</text></svg>');
        string memory value=string.concat('{"name":"',label,' #',Strings.toString(tokenId),'","description":"Original LAST SIGNAL local collectible. Gameplay requires the exact supported build and current ownership. No monetary value.","image":"data:image/svg+xml;base64,',Base64.encode(bytes(svg)),'","kind":',Strings.toString(kind));
        value=string.concat(value,',"buildHash":"',Strings.toHexString(uint256(buildHash(tokenId)),32),'","provenance":"',Strings.toHexString(uint256(provenance[tokenId]),32),'","sourceRun":"',Strings.toHexString(uint256(sourceRun[tokenId]),32),'"}');
        return string.concat('data:application/json;base64,',Base64.encode(bytes(value)));
    }
}
