// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;
import {JourneyGunCollection} from "../src/JourneyGunCollection.sol";
/// @dev Claim delivery failure fixture. Intentionally not an ERC721 receiver.
contract RejectingJourneyGunReceiver {
    function claim(JourneyGunCollection collection,JourneyGunCollection.Claim[] calldata claims,bytes[] calldata signatures) external {
        collection.claimLoot(claims,signatures);
    }
}
