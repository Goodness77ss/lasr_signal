// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice J12 disposable local unopened packs. Opened stock lives in the service journal.
contract JourneySupplies is ERC1155, ReentrancyGuard {
    address public immutable developmentAuthority;
    bytes32 public immutable policyHash;
    uint256 public constant UNITS_PER_PACK = 3;
    uint256 public redemptionSequence;
    mapping(address=>mapping(uint256=>uint256)) public balanceEpoch;
    event DevelopmentIssued(address indexed recipient,uint256 indexed itemClass,uint256 packs);
    event Redeemed(address indexed owner,uint256 indexed itemClass,uint256 packs,uint256 units,uint256 sequence,bytes32 policyHash);

    constructor(bytes32 approvedPolicyHash) ERC1155("") {
        require(block.chainid == 31337,"local only");
        require(approvedPolicyHash != bytes32(0),"policy required");
        developmentAuthority=msg.sender;
        policyHash=approvedPolicyHash;
    }
    function _update(address from,address to,uint256[] memory ids,uint256[] memory values) internal override {
        super._update(from,to,ids,values);
        for(uint256 i=0;i<ids.length;++i) {
            if(values[i]==0)continue;
            if(from!=address(0))++balanceEpoch[from][ids[i]];
            if(to!=address(0)&&to!=from)++balanceEpoch[to][ids[i]];
        }
    }
    function uri(uint256 itemClass) public view override returns(string memory) {
        require(validClass(itemClass),"invalid pack class");
        string[4] memory names=[string("Health kit"),"Grenade pack","Ammunition pack","Armour repair kit"];
        string memory image=string.concat('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="#20291f"/><rect x="50" y="65" width="220" height="185" rx="12" fill="#657450" stroke="#d6d2af" stroke-width="3"/><path d="M135 65V45h50v20M50 125h220" fill="none" stroke="#d6d2af" stroke-width="8"/><text x="160" y="165" text-anchor="middle" fill="#fff" font-size="18">',names[itemClass],'</text><text x="160" y="205" text-anchor="middle" fill="#fff" font-size="16">3 UNITS / UNOPENED</text><text x="160" y="285" text-anchor="middle" fill="#d6d2af" font-size="13">LOCAL DEVELOPMENT</text></svg>');
        return string.concat('data:application/json;base64,',Base64.encode(bytes(string.concat('{"name":"LAST SIGNAL ',names[itemClass],'","description":"Disposable local unopened pack. Redeeming burns this pack for three nontransferable service units after confirmation. Unused opened stock persists after quit or death. No public value.","image":"data:image/svg+xml;base64,',Base64.encode(bytes(image)),'","itemClass":',Strings.toString(itemClass),',"unitsPerPack":3,"policyHash":"',Strings.toHexString(uint256(policyHash),32),'"}'))));
    }
    function validClass(uint256 itemClass) public pure returns(bool) { return itemClass < 4; }
    function issueDevelopment(address recipient,uint256 itemClass,uint256 packs) external nonReentrant {
        require(msg.sender==developmentAuthority,"development authority");
        require(validClass(itemClass)&&packs>0,"invalid pack");
        _mint(recipient,itemClass,packs,"");
        emit DevelopmentIssued(recipient,itemClass,packs);
    }
    /// Caller burns its own exact packs. No operator approval or alternate recipient.
    function redeem(uint256 itemClass,uint256 packs) external nonReentrant {
        require(validClass(itemClass)&&packs>0,"invalid pack");
        uint256 units=packs*UNITS_PER_PACK;
        _burn(msg.sender,itemClass,packs);
        emit Redeemed(msg.sender,itemClass,packs,units,++redemptionSequence,policyHash);
    }
}


