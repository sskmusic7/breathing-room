// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DebtPots} from "../src/DebtPots.sol";
import {DebtPotsAutomation} from "../src/DebtPotsAutomation.sol";

contract DebtPotsAutomationTest is Test {
    DebtPots pots;
    DebtPotsAutomation automation;

    address debtor = makeAddr("debtor");
    address payable creditor = payable(makeAddr("creditor"));

    uint256 constant LIVING = 0.2 ether;
    uint256 constant SAVINGS = 0.005 ether;

    function setUp() public {
        vm.prank(debtor);
        pots = new DebtPots(debtor, LIVING, SAVINGS);
        automation = new DebtPotsAutomation(payable(address(pots)));
    }

    function _setOneCreditor() internal {
        DebtPots.Creditor[] memory table = new DebtPots.Creditor[](1);
        table[0] = DebtPots.Creditor({
            wallet: creditor,
            label: "Test Creditor",
            debtBalanceWei: 1 ether,
            proRataShareBps: 10_000,
            priorityFixedAmountWei: 0,
            isPriority: false
        });
        vm.prank(debtor);
        pots.setCreditors(table);
    }

    function test_checkUpkeep_falseWhenEmpty() public view {
        (bool upkeepNeeded, ) = automation.checkUpkeep("");
        assertFalse(upkeepNeeded, "no balance, no creditors -> nothing to do");
    }

    function test_checkUpkeep_falseWhenBalanceBelowAllowance() public {
        _setOneCreditor();
        vm.deal(address(pots), LIVING); // below LIVING + SAVINGS
        (bool upkeepNeeded, ) = automation.checkUpkeep("");
        assertFalse(upkeepNeeded);
    }

    function test_checkUpkeep_falseWhenNoCreditorsEvenWithBalance() public {
        vm.deal(address(pots), 1 ether);
        (bool upkeepNeeded, ) = automation.checkUpkeep("");
        assertFalse(upkeepNeeded, "balance alone isn't enough - needs a creditor table too");
    }

    function test_checkUpkeep_trueWhenPaydayLanded() public {
        _setOneCreditor();
        vm.deal(address(pots), 1 ether);
        (bool upkeepNeeded, bytes memory performData) = automation.checkUpkeep("");
        assertTrue(upkeepNeeded);
        assertEq(abi.decode(performData, (uint256)), 1 ether);
    }

    function test_performUpkeep_sweepsAndEmits() public {
        _setOneCreditor();
        vm.deal(address(pots), 1 ether);

        vm.expectEmit(false, false, false, true, address(automation));
        emit DebtPotsAutomation.UpkeepPerformed(1 ether);
        automation.performUpkeep("");

        assertEq(address(pots).balance, 0, "sweep should have emptied the pot");
        assertEq(creditor.balance, 1 ether - LIVING - SAVINGS);
    }

    function test_performUpkeep_anyoneCanCall() public {
        // Automation registries call from their own forwarder address, which
        // is never known in advance - performUpkeep must not be gated by
        // msg.sender (matches sweep()'s own "anyone can call" design).
        _setOneCreditor();
        vm.deal(address(pots), 1 ether);

        vm.prank(makeAddr("randomKeeper"));
        automation.performUpkeep("");

        assertEq(address(pots).balance, 0);
    }

    function test_performUpkeep_revertsIfNothingToSweep() public {
        _setOneCreditor();
        vm.expectRevert(bytes("nothing to sweep"));
        automation.performUpkeep("");
    }

    function test_performUpkeep_revertsIfNoCreditors() public {
        vm.deal(address(pots), 1 ether);
        vm.expectRevert(bytes("no creditors configured"));
        automation.performUpkeep("");
    }

    function test_performUpkeep_revalidatesRatherThanTrustingPerformData() public {
        // Stale/forged performData must not matter - only current on-chain
        // state decides whether the sweep actually happens.
        _setOneCreditor();
        vm.deal(address(pots), 1 ether);

        automation.performUpkeep(abi.encode(uint256(999 ether))); // lying performData
        assertEq(address(pots).balance, 0);
        assertEq(creditor.balance, 1 ether - LIVING - SAVINGS, "must sweep real balance, not the forged value");
    }
}
