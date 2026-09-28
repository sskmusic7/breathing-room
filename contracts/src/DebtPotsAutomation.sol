// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AutomationCompatibleInterface} from "./interfaces/AutomationCompatibleInterface.sol";
import {DebtPots} from "./DebtPots.sol";

/// @title DebtPotsAutomation
/// @notice Chainlink Automation-compatible trigger for DebtPots.sweep().
///
/// This is the actual "autopilot" in "debts managed, on autopilot": without
/// this, someone (the backend, or the debtor themselves) has to notice a
/// payday deposit and manually call sweep(). With a Chainlink Automation
/// upkeep registered against this contract, the sweep fires on-chain the
/// moment funds land - no centralized cron job or backend has to be trusted
/// or even be online for the debtor's creditors to get paid on time.
///
/// One instance per DebtPots (per debtor), matching DebtPots' own 1:1 model.
/// Deliberately a separate, minimal contract rather than baking Automation
/// hooks into DebtPots itself, so DebtPots' already-audited-by-tests surface
/// area (see test/DebtPots.t.sol, 9/9 passing) never has to change to pick up
/// a new trigger mechanism.
contract DebtPotsAutomation is AutomationCompatibleInterface {
    DebtPots public immutable pots;

    event UpkeepPerformed(uint256 balanceSwept);

    constructor(address payable _pots) {
        pots = DebtPots(_pots);
    }

    /// @notice Simulated off-chain by the Chainlink Automation network.
    /// Upkeep is needed once the contract holds enough to cover the ring-fenced
    /// living allowance + savings buffer (i.e. a payday deposit has landed)
    /// and there's a creditor table to pay out to.
    function checkUpkeep(bytes calldata /* checkData */)
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        uint256 balance = address(pots).balance;
        uint256 reserved = pots.livingExpensesAllowanceWei() + pots.savingsBufferWei();

        upkeepNeeded = balance >= reserved && balance > 0 && pots.creditorCount() > 0;
        performData = abi.encode(balance);
    }

    /// @notice Executed on-chain by the Automation registry once checkUpkeep
    /// returns true. Re-validates the condition itself rather than trusting
    /// performData, per Chainlink's own guidance - state may have changed
    /// (e.g. another keeper, or the debtor, already swept) between the
    /// simulation and this call.
    function performUpkeep(bytes calldata /* performData */) external override {
        uint256 balance = address(pots).balance;
        uint256 reserved = pots.livingExpensesAllowanceWei() + pots.savingsBufferWei();

        require(balance >= reserved && balance > 0, "nothing to sweep");
        require(pots.creditorCount() > 0, "no creditors configured");

        pots.sweep();
        emit UpkeepPerformed(balance);
    }
}
