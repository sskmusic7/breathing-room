// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {DebtPots} from "../src/DebtPots.sol";

/// @notice Deploys a DebtPots instance for a single debtor.
///
/// Usage (Monad testnet):
///   forge script script/DeployDebtPots.s.sol:DeployDebtPots \
///     --rpc-url monad_testnet --broadcast --private-key $PRIVATE_KEY
///
/// Env vars:
///   PRIVATE_KEY              - deployer/debtor key (testnet only, never mainnet funds)
///   DEBTOR_ADDRESS           - optional, defaults to the deployer
///   LIVING_ALLOWANCE_WEI     - optional, defaults to 0
///   SAVINGS_BUFFER_WEI       - optional, defaults to 0
contract DeployDebtPots is Script {
    function run() external returns (DebtPots pots) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address debtor = vm.envOr("DEBTOR_ADDRESS", deployer);
        uint256 livingAllowance = vm.envOr("LIVING_ALLOWANCE_WEI", uint256(0));
        uint256 savingsBuffer = vm.envOr("SAVINGS_BUFFER_WEI", uint256(0));

        vm.startBroadcast(deployerKey);
        pots = new DebtPots(debtor, livingAllowance, savingsBuffer);
        vm.stopBroadcast();

        console.log("DebtPots deployed at:", address(pots));
        console.log("Debtor (owner):", debtor);
    }
}
