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

interface ISurvivalGunBurn {function burn(uint256 amount) external;}

/// @notice Separate, valueless V2 collection. No mutation of the original GunArmory.
contract SurvivalGunCollection is ERC721Enumerable,EIP712,ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable currency;
    address public immutable gameplaySigner;
    bytes32 public immutable rulesHash;
    uint8 public constant MAX_KIND=2;
    uint256 public constant PRICE=35 ether;
    bytes32 public constant BUILD_HASH=keccak256("LAST SIGNAL Trench Shotgun build 1; maxDamage=30; shotTicks=16; magazine=6; reloadTicks=44; range=8; coneDegrees=30");
    bytes32 public constant RIFLE_BUILD=keccak256("LAST SIGNAL Service Rifle build 1; damage=20; shotTicks=5; magazine=20; reloadTicks=30; range=14");
    bytes32 public constant CARBINE_BUILD=keccak256("LAST SIGNAL Field Carbine build 1; damage=12; shotTicks=3; magazine=30; reloadTicks=30; range=14");
    bytes32 private constant CLAIM_TYPEHASH=keccak256("Claim(bytes32 dropId,bytes32 runId,address recipient,uint8 kind,bytes32 rulesHash,bytes32 buildHash,uint256 expiry)");
    struct Claim {bytes32 dropId;bytes32 runId;address recipient;uint8 kind;bytes32 rulesHash;bytes32 buildHash;uint256 expiry;}
    struct Listing {address seller;uint256 price;bytes32 buildHash;uint256 nonce;}
    mapping(uint256=>bytes32) public provenance;
    mapping(uint256=>uint8) private classes;
    mapping(bytes32=>bool) public claimed;
    mapping(uint256=>Listing) public listings;
    mapping(uint256=>uint256) public listingNonce;
    uint256 public nextTokenId=1;
    error Invalid();
    error Unauthorized();
    error UnexpectedAmount();
    event GunAcquired(address indexed recipient,uint256 indexed tokenId,uint8 kind,bytes32 indexed dropId);
    event Listed(uint256 indexed tokenId,address indexed seller,uint256 price,bytes32 buildHash,uint256 nonce);
    event ListingCancelled(uint256 indexed tokenId,uint256 nonce);
    event Sale(uint256 indexed tokenId,address indexed seller,address indexed buyer,uint256 price,bytes32 buildHash,uint256 nonce);

    constructor(address token,address signer,bytes32 rules) ERC721("LAST SIGNAL Survival Guns","LSGUN2") EIP712("LAST SIGNAL Survival Guns","2") {
        if(token.code.length==0||signer==address(0)||rules==bytes32(0))revert Invalid();
        currency=IERC20(token);gameplaySigner=signer;rulesHash=rules;
    }
    function gunKind(uint256 tokenId) public view returns(uint8){_requireOwned(tokenId);return classes[tokenId];}
    function buildForKind(uint8 kind) public pure returns(bytes32){if(kind>MAX_KIND)revert Invalid();return kind==0?RIFLE_BUILD:kind==1?CARBINE_BUILD:BUILD_HASH;}
    function buildHash(uint256 tokenId) public view returns(bytes32){return buildForKind(gunKind(tokenId));}
    function gunPrice(uint8 kind) public pure returns(uint256){if(kind>MAX_KIND)revert Invalid();return kind==0?20 ether:kind==1?30 ether:PRICE;}
    function _gun(address recipient,uint8 kind,bytes32 dropId) private returns(uint256 tokenId){
        if(kind>MAX_KIND)revert Invalid();tokenId=nextTokenId++;classes[tokenId]=kind;provenance[tokenId]=dropId;_safeMint(recipient,tokenId);
        emit GunAcquired(recipient,tokenId,kind,dropId);
    }
    function buyGun(uint8 kind) external nonReentrant returns(uint256){
        uint256 price=gunPrice(kind);uint256 beforeBalance=currency.balanceOf(address(this));uint256 beforeBuyer=currency.balanceOf(msg.sender);
        currency.safeTransferFrom(msg.sender,address(this),price);
        if(currency.balanceOf(address(this))!=beforeBalance+price||currency.balanceOf(msg.sender)+price!=beforeBuyer)revert UnexpectedAmount();
        ISurvivalGunBurn(address(currency)).burn(price);
        if(currency.balanceOf(address(this))!=beforeBalance)revert UnexpectedAmount();
        return _gun(msg.sender,kind,bytes32(0));
    }
    function claimLoot(Claim[] calldata rewards,bytes[] calldata signatures) external nonReentrant {
        if(rewards.length==0||rewards.length>3||rewards.length!=signatures.length)revert Invalid();
        for(uint256 i;i<rewards.length;i++){
            Claim calldata c=rewards[i];
            if(c.recipient!=msg.sender||c.kind>MAX_KIND||c.rulesHash!=rulesHash||c.buildHash!=buildForKind(c.kind)||c.dropId==bytes32(0)||c.runId==bytes32(0)||block.timestamp>=c.expiry||claimed[c.dropId])revert Invalid();
            bytes32 digest=_hashTypedDataV4(keccak256(abi.encode(CLAIM_TYPEHASH,c.dropId,c.runId,c.recipient,c.kind,c.rulesHash,c.buildHash,c.expiry)));
            if(ECDSA.recover(digest,signatures[i])!=gameplaySigner)revert Unauthorized();
            claimed[c.dropId]=true;_gun(msg.sender,c.kind,c.dropId);
        }
    }
    function listGun(uint256 tokenId,uint256 price,bytes32 expectedBuildHash) external nonReentrant {
        if(ownerOf(tokenId)!=msg.sender)revert Unauthorized();
        bytes32 build=buildHash(tokenId);if(price==0||price>1000 ether||expectedBuildHash!=build)revert Invalid();
        uint256 nonce=++listingNonce[tokenId];listings[tokenId]=Listing(msg.sender,price,build,nonce);
        emit Listed(tokenId,msg.sender,price,build,nonce);
    }
    function cancelListing(uint256 tokenId) external nonReentrant {
        if(ownerOf(tokenId)!=msg.sender)revert Unauthorized();
        delete listings[tokenId];emit ListingCancelled(tokenId,++listingNonce[tokenId]);
    }
    function buyListed(uint256 tokenId,uint256 expectedPrice,bytes32 expectedBuildHash,uint256 expectedNonce) external nonReentrant {
        Listing memory offer=listings[tokenId];
        if(offer.seller==address(0)||offer.seller==msg.sender||ownerOf(tokenId)!=offer.seller)revert Unauthorized();
        if(offer.price!=expectedPrice||offer.buildHash!=expectedBuildHash||expectedBuildHash!=buildHash(tokenId)||offer.nonce!=expectedNonce)revert Invalid();
        delete listings[tokenId];
        uint256 sellerBefore=currency.balanceOf(offer.seller);uint256 buyerBefore=currency.balanceOf(msg.sender);
        currency.safeTransferFrom(msg.sender,offer.seller,offer.price);
        if(currency.balanceOf(offer.seller)!=sellerBefore+offer.price||currency.balanceOf(msg.sender)+offer.price!=buyerBefore)revert UnexpectedAmount();
        _safeTransfer(offer.seller,msg.sender,tokenId,"");
        emit Sale(tokenId,offer.seller,msg.sender,offer.price,offer.buildHash,offer.nonce);
    }
    function _update(address to,uint256 tokenId,address auth) internal override returns(address from){
        from=super._update(to,tokenId,auth);
        if(from!=address(0)){delete listings[tokenId];listingNonce[tokenId]++;}
    }
    function ownedPage(address account,uint256 offset,uint256 limit) external view returns(uint256[] memory ids,uint8[] memory kinds,bytes32[] memory sources){
        if(limit==0||limit>32)revert Invalid();uint256 total=balanceOf(account);uint256 n=offset<total?(total-offset<limit?total-offset:limit):0;
        ids=new uint256[](n);kinds=new uint8[](n);sources=new bytes32[](n);
        for(uint256 i;i<n;i++){uint256 tokenId=tokenOfOwnerByIndex(account,offset+i);ids[i]=tokenId;kinds[i]=gunKind(tokenId);sources[i]=provenance[tokenId];}
    }
    function marketPage(uint256 start,uint256 limit) external view returns(uint256[] memory ids,address[] memory sellers,uint256[] memory prices,bytes32[] memory builds,uint256[] memory nonces){
        if(start==0||limit==0||limit>32)revert Invalid();uint256 n=start<nextTokenId?(nextTokenId-start<limit?nextTokenId-start:limit):0;
        ids=new uint256[](n);sellers=new address[](n);prices=new uint256[](n);builds=new bytes32[](n);nonces=new uint256[](n);
        for(uint256 i;i<n;i++){uint256 tokenId=start+i;Listing memory l=listings[tokenId];ids[i]=tokenId;sellers[i]=l.seller;prices[i]=l.price;builds[i]=l.buildHash;nonces[i]=l.nonce;}
    }
    function tokenURI(uint256 tokenId) public view override returns(string memory){
        _requireOwned(tokenId);string memory serial=Strings.toString(tokenId);string memory weapon=classes[tokenId]==0?"Service Rifle":classes[tokenId]==1?"Field Carbine":"Trench Shotgun";
        string memory build=Strings.toHexString(uint256(buildHash(tokenId)),32);
        string memory svg=string.concat('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300"><rect width="480" height="300" fill="#252c24"/><path d="M72 175h118l42-26h157v18H240l-43 32-125 10z" fill="#ad8754"/><path d="M218 140h188v9H218z" fill="#b8bbae"/><text x="24" y="42" fill="#f0dfb7" font-family="monospace" font-size="20">LAST SIGNAL SURVIVAL GUNS V2</text><text x="24" y="245" fill="#f0dfb7" font-family="monospace" font-size="21">',weapon,' #',serial,'</text><text x="24" y="275" fill="#c1c7b6" font-family="monospace" font-size="12">TESTNET COLLECTIBLE / NO MONETARY VALUE</text></svg>');
        return string.concat("data:application/json;base64,",Base64.encode(bytes(string.concat('{"name":"',weapon,' #',serial,'","description":"Original LAST SIGNAL V2 testnet collectible. Gameplay requires the matching supported rules. No monetary value. Not official WIF.","image":"data:image/svg+xml;base64,',Base64.encode(bytes(svg)),'","attributes":[{"trait_type":"Build","value":"',build,'"}]}'))));
    }
}
