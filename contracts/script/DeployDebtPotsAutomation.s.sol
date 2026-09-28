// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DebtPotsAutomation} from "../src/DebtPotsAutomation.sol";

/// @notice Deploys a DebtPotsAutomation wrapper around an already-deployed
/// DebtPots instance, then register the deployed address as a new Custom
/// Logic upkeep at https://automation.chain.link (Monad testnet) funded with
/// testnet LINK.
///
/// Usage:
///   forge script script/DeployDebtPotsAutomation.s.sol:DeployDebtPotsAutomation \
///     --rpc-url monad_testnet --broadcast --private-key $PRIVATE_KEY
///
/// Env vars:
///   PRIVATE_KEY   - deployer key
///   DEBT_POTS_ADDRESS - the DebtPots contract this upkeep should sweep
contract DeployDebtPotsAutomation is Script {
    function run() external returns (DebtPotsAutomation automation) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address payable debtPotsAddress = payable(vm.envAddress("DEBT_POTS_ADDRESS"));

        vm.startBroadcast(deployerKey);
        automation = new DebtPotsAutomation(debtPotsAddress);
        vm.stopBroadcast();

        console.log("DebtPotsAutomation deployed at:", address(automation));
        console.log("Watching DebtPots at:", debtPotsAddress);
        console.log("Next: register this address as a Custom Logic upkeep at automation.chain.link");
    }
}
