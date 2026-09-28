// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DebtPots} from "../src/DebtPots.sol";

/// @dev A creditor that reverts on receive — simulates a blocked/closed account.
contract RevertingCreditor {
    receive() external payable {
        revert("nope");
    }
}

/// @dev A creditor that tries to re-enter sweep() when paid — simulates an attacker.
contract ReentrantCreditor {
    DebtPots public target;

    function setTarget(DebtPots _target) external {
        target = _target;
    }

    receive() external payable {
        // Attempt reentrancy; must fail silently (best-effort payout) and not revert the sweep.
        try target.sweep() {} catch {}
    }
}

contract DebtPotsTest is Test {
    DebtPots pots;

    address debtor = makeAddr("debtor");
    address payable hmrc = payable(makeAddr("hmrc")); // priority
    address payable aqua = payable(makeAddr("aqua")); // non-priority 59.1%
    address payable halifax = payable(makeAddr("halifax")); // non-priority 22.9%
    address payable paypal = payable(makeAddr("paypal")); // non-priority remainder

    uint256 constant LIVING = 200 ether / 1000; // 0.2 ether stand-in for living costs
    uint256 constant SAVINGS = 5 ether / 1000; // 0.005 ether stand-in for savings buffer

    function setUp() public {
        vm.prank(debtor);
        pots = new DebtPots(debtor, LIVING, SAVINGS);
    }

    function _setSfsCreditorTable() internal {
        DebtPots.Creditor[] memory table = new DebtPots.Creditor[](4);
        table[0] = DebtPots.Creditor({
            wallet: hmrc,
            label: "HMRC Income Tax",
            debtBalanceWei: 1679.69 ether / 1000,
            proRataShareBps: 0,
            priorityFixedAmountWei: 1 ether / 1000, // token hold, e.g. GBP1 equivalent
            isPriority: true
        });
        table[1] = DebtPots.Creditor({
            wallet: aqua,
            label: "Aqua/NewDay CCJ",
            debtBalanceWei: 2834 ether / 1000,
            proRataShareBps: 5910, // 59.1%
            priorityFixedAmountWei: 0,
            isPriority: false
        });
        table[2] = DebtPots.Creditor({
            wallet: halifax,
            label: "Halifax Overdraft",
            debtBalanceWei: 1096.23 ether / 1000,
            proRataShareBps: 2290, // 22.9%
            priorityFixedAmountWei: 0,
            isPriority: false
        });
        table[3] = DebtPots.Creditor({
            wallet: paypal,
            label: "PayPal Loan",
            debtBalanceWei: 409.19 ether / 1000,
            proRataShareBps: 1800, // remainder to reach 10_000
            priorityFixedAmountWei: 0,
            isPriority: false
        });

        vm.prank(debtor);
        pots.setCreditors(table);
    }

    function test_constructorSetsOwnerAndAllowance() public view {
        assertEq(pots.owner(), debtor);
        assertEq(pots.livingExpensesAllowanceWei(), LIVING);
        assertEq(pots.savingsBufferWei(), SAVINGS);
    }

    function test_onlyDebtorCanSetAllowance() public {
        vm.expectRevert();
        pots.setAllowance(1 ether, 1 ether);

        vm.prank(debtor);
        pots.setAllowance(1 ether, 2 ether);
        assertEq(pots.livingExpensesAllowanceWei(), 1 ether);
        assertEq(pots.savingsBufferWei(), 2 ether);
    }

    function test_setCreditors_revertsOnBpsOverflow() public {
        DebtPots.Creditor[] memory bad = new DebtPots.Creditor[](1);
        bad[0] = DebtPots.Creditor({
            wallet: aqua,
            label: "Overflow",
            debtBalanceWei: 1 ether,
            proRataShareBps: 10_001,
            priorityFixedAmountWei: 0,
            isPriority: false
        });

        vm.prank(debtor);
        vm.expectRevert(abi.encodeWithSelector(DebtPots.BpsOverflow.selector, 10_001));
        pots.setCreditors(bad);
    }

    function test_sweep_revertsIfBelowAllowance() public {
        _setSfsCreditorTable();
        vm.deal(address(pots), LIVING); // less than LIVING + SAVINGS
        vm.expectRevert(
            abi.encodeWithSelector(DebtPots.InsufficientForAllowance.selector, LIVING, LIVING + SAVINGS)
        );
        pots.sweep();
    }

    function test_sweep_revertsIfNoCreditors() public {
        vm.deal(address(pots), 10 ether);
        vm.expectRevert(DebtPots.EmptyCreditorSet.selector);
        pots.sweep();
    }

    function test_sweep_ringfencesAllowanceAndDistributesProRata() public {
        _setSfsCreditorTable();

        uint256 payday = 1 ether; // arbitrary payday deposit, well above allowance
        vm.deal(address(pots), payday);

        uint256 debtorBefore = debtor.balance;

        pots.sweep();

        uint256 reserved = LIVING + SAVINGS;
        assertEq(debtor.balance - debtorBefore, reserved, "debtor should receive exactly the ring-fenced amount");

        uint256 surplusAfterReserve = payday - reserved;
        uint256 hmrcOffer = 1 ether / 1000;
        uint256 surplusAfterPriority = surplusAfterReserve - hmrcOffer;

        assertEq(hmrc.balance, hmrcOffer, "priority creditor gets its fixed token offer");
        assertEq(aqua.balance, (surplusAfterPriority * 5910) / 10_000, "aqua pro-rata share");
        assertEq(halifax.balance, (surplusAfterPriority * 2290) / 10_000, "halifax pro-rata share");
        assertEq(paypal.balance, (surplusAfterPriority * 1800) / 10_000, "paypal pro-rata share");

        assertEq(address(pots).balance, 0, "contract should not retain funds when all payouts succeed");
    }

    function test_sweep_failingCreditorDoesNotBlockOthers() public {
        RevertingCreditor blocked = new RevertingCreditor();

        DebtPots.Creditor[] memory table = new DebtPots.Creditor[](2);
        table[0] = DebtPots.Creditor({
            wallet: payable(address(blocked)),
            label: "Blocked account",
            debtBalanceWei: 100 ether,
            proRataShareBps: 5000,
            priorityFixedAmountWei: 0,
            isPriority: false
        });
        table[1] = DebtPots.Creditor({
            wallet: aqua,
            label: "Aqua",
            debtBalanceWei: 100 ether,
            proRataShareBps: 5000,
            priorityFixedAmountWei: 0,
            isPriority: false
        });

        vm.prank(debtor);
        pots.setCreditors(table);

        vm.deal(address(pots), 1 ether);
        pots.sweep(); // must not revert even though `blocked` reverts on receive

        uint256 surplus = 1 ether - LIVING - SAVINGS;
        assertEq(aqua.balance, surplus / 2, "aqua still gets paid despite the other creditor reverting");
        assertEq(address(pots).balance, surplus / 2, "blocked creditor's share stays in the contract, not lost");
    }

    function test_sweep_reentrancyGuardBlocksReentry() public {
        ReentrantCreditor attacker = new ReentrantCreditor();
        attacker.setTarget(pots);

        DebtPots.Creditor[] memory table = new DebtPots.Creditor[](1);
        table[0] = DebtPots.Creditor({
            wallet: payable(address(attacker)),
            label: "Attacker",
            debtBalanceWei: 1 ether,
            proRataShareBps: 10_000,
            priorityFixedAmountWei: 0,
            isPriority: false
        });

        vm.prank(debtor);
        pots.setCreditors(table);

        vm.deal(address(pots), 1 ether);
        // Should complete normally; the attacker's reentrant call reverts internally
        // (caught by its own try/catch) and never double-spends the surplus.
        pots.sweep();
        assertEq(address(pots).balance, 0);
    }

    function test_withdraw_onlyDebtor() public {
        vm.deal(address(pots), 1 ether);

        vm.expectRevert();
        pots.withdraw(1 ether);

        uint256 before = debtor.balance;
        vm.prank(debtor);
        pots.withdraw(1 ether);
        assertEq(debtor.balance - before, 1 ether);
    }
}
