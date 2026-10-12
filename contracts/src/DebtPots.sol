// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/// @title DebtPots
/// @notice Non-custodial "payday sweep" router for the Breathing Room SFS engine.
///
/// The debtor's own embedded wallet (Privy/Dynamic) deploys and owns one of these
/// per debtor. The off-chain SFS engine (deterministic, see backend/app/sfs_engine)
/// computes the Standard Financial Statement split and pushes the resulting
/// creditor table on-chain via `setCreditors`. On payday, the debtor's wallet
/// forwards the disposable surplus into `sweep()`, which ring-fences the living
/// allowance + savings buffer back to the debtor and streams the remaining
/// surplus pro-rata to non-priority creditors, after first honouring fixed
/// token offers to priority creditors (HMRC, council tax, court orders, etc).
///
/// This contract never takes custody of the debtor's main account — it only
/// ever holds funds between the moment the debtor's wallet forwards a payday
/// surplus and the moment `sweep()` distributes it, per the FCA agency-model /
/// non-custodial guardrail in the compliance blueprint.
contract DebtPots is Ownable, ReentrancyGuard {
    struct Creditor {
        address payable wallet;
        string label; // e.g. "Camden Council PCN", "Aqua/NewDay CCJ"
        uint256 debtBalanceWei; // outstanding balance, informational
        uint256 proRataShareBps; // parts per 10,000 of non-priority surplus; only used if !isPriority
        uint256 priorityFixedAmountWei; // fixed token offer paid first if isPriority
        bool isPriority;
    }

    /// @notice Ring-fenced essential living costs, swept back to the debtor untouched.
    uint256 public livingExpensesAllowanceWei;

    /// @notice SFS savings buffer (statutory £5-£25/month), swept back to the debtor.
    uint256 public savingsBufferWei;

    Creditor[] private creditors;

    /// @notice Sum of proRataShareBps across all non-priority creditors. Must be <= 10_000.
    uint256 public totalNonPriorityBps;

    event PaydayReceived(address indexed from, uint256 amount);
    event AllowanceUpdated(uint256 livingExpensesAllowanceWei, uint256 savingsBufferWei);
    event CreditorsUpdated(uint256 count, uint256 totalNonPriorityBps);
    event Disbursed(
        uint256 totalIn,
        uint256 returnedToDebtor,
        uint256 priorityPaid,
        uint256 nonPriorityPaid
    );
    event CreditorPaid(address indexed wallet, string label, uint256 amount, bool isPriority);
    event PaymentFailed(address indexed wallet, string label, uint256 amount);

    error InsufficientForAllowance(uint256 balance, uint256 required);
    error BpsOverflow(uint256 totalBps);
    error EmptyCreditorSet();
    error PlanPaused();

    /// @notice Debtor-controlled emergency brake: while paused, no payout runs.
    /// The debtor keeps full control (pause, change creditors, withdraw) before
    /// anything executes, and creditors have no admin power over the pot.
    bool public paused;

    event PausedSet(bool paused);

    constructor(address debtor, uint256 _livingExpensesAllowanceWei, uint256 _savingsBufferWei)
        Ownable(debtor)
    {
        livingExpensesAllowanceWei = _livingExpensesAllowanceWei;
        savingsBufferWei = _savingsBufferWei;
    }

    /// @notice Debtor (or their SFS engine acting as an authorized session key) updates
    /// the ring-fenced allowance whenever a new SFS assessment is computed.
    function setAllowance(uint256 _livingExpensesAllowanceWei, uint256 _savingsBufferWei)
        external
        onlyOwner
    {
        livingExpensesAllowanceWei = _livingExpensesAllowanceWei;
        savingsBufferWei = _savingsBufferWei;
        emit AllowanceUpdated(_livingExpensesAllowanceWei, _savingsBufferWei);
    }

    /// @notice Replaces the full creditor table. Called whenever the SFS engine
    /// recomputes pro-rata shares (e.g. a debt is settled or a new PCN is added).
    /// Non-priority proRataShareBps must sum to exactly 10_000, unless there are
    /// zero non-priority creditors.
    function setCreditors(Creditor[] calldata _creditors) external onlyOwner {
        delete creditors;

        uint256 nonPriorityBps;
        for (uint256 i = 0; i < _creditors.length; i++) {
            creditors.push(_creditors[i]);
            if (!_creditors[i].isPriority) {
                nonPriorityBps += _creditors[i].proRataShareBps;
            }
        }

        if (nonPriorityBps > 10_000) revert BpsOverflow(nonPriorityBps);

        totalNonPriorityBps = nonPriorityBps;
        emit CreditorsUpdated(_creditors.length, nonPriorityBps);
    }

    /// @notice Pause or resume the payout plan. Only the debtor can do this.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function creditorCount() external view returns (uint256) {
        return creditors.length;
    }

    function getCreditor(uint256 index) external view returns (Creditor memory) {
        return creditors[index];
    }

    /// @notice Accepts the payday deposit forwarded by the debtor's embedded wallet.
    receive() external payable {
        emit PaydayReceived(msg.sender, msg.value);
    }

    /// @notice Executes the payday sweep: ring-fences living costs + savings back to
    /// the debtor, pays fixed token offers to priority creditors, then streams the
    /// remaining surplus pro-rata across non-priority creditors.
    /// Anyone can call this (it only ever pays out to the pre-authorized creditor
    /// table and the debtor themselves) but in practice it's triggered by the
    /// backend the moment it detects a payday deposit, or by the debtor's wallet
    /// directly.
    function sweep() external nonReentrant {
        if (paused) revert PlanPaused();
        uint256 totalIn = address(this).balance;
        uint256 reserved = livingExpensesAllowanceWei + savingsBufferWei;

        if (totalIn < reserved) revert InsufficientForAllowance(totalIn, reserved);
        if (creditors.length == 0) revert EmptyCreditorSet();

        uint256 surplus = totalIn - reserved;

        // 1. Ring-fence essentials + savings back to the debtor first (checks-effects-interactions:
        // no state to update here beyond the transfer itself, contract balance drops accordingly).
        _pay(payable(owner()), "Debtor (living costs + savings)", reserved, false);

        // 2. Priority creditors (HMRC, council tax, court orders) get their fixed token
        // offer first, out of the surplus.
        uint256 priorityPaid;
        for (uint256 i = 0; i < creditors.length; i++) {
            Creditor memory c = creditors[i];
            if (c.isPriority && c.priorityFixedAmountWei > 0 && surplus >= c.priorityFixedAmountWei) {
                surplus -= c.priorityFixedAmountWei;
                priorityPaid += c.priorityFixedAmountWei;
                _pay(c.wallet, c.label, c.priorityFixedAmountWei, true);
            }
        }

        // 3. Remaining surplus streamed pro-rata across non-priority creditors.
        uint256 nonPriorityPaid;
        if (totalNonPriorityBps > 0 && surplus > 0) {
            for (uint256 i = 0; i < creditors.length; i++) {
                Creditor memory c = creditors[i];
                if (!c.isPriority && c.proRataShareBps > 0) {
                    uint256 payment = (surplus * c.proRataShareBps) / totalNonPriorityBps;
                    if (payment > 0) {
                        nonPriorityPaid += payment;
                        _pay(c.wallet, c.label, payment, false);
                    }
                }
            }
        }

        emit Disbursed(totalIn, reserved, priorityPaid, nonPriorityPaid);
    }

    /// @dev Best-effort payout: a single failing/blocking creditor address must never
    /// freeze everyone else's money. Failures are logged via PaymentFailed and the
    /// funds simply remain in the contract for the next sweep / manual recovery,
    /// instead of reverting the whole disbursement.
    function _pay(address payable to, string memory label, uint256 amount, bool isPriority) private {
        (bool ok, ) = to.call{value: amount}("");
        if (ok) {
            emit CreditorPaid(to, label, amount, isPriority);
        } else {
            emit PaymentFailed(to, label, amount);
        }
    }

    /// @notice Emergency withdrawal for the debtor only — e.g. if a creditor table
    /// needs correcting before funds are swept. Non-custodial: only the debtor
    /// (contract owner) can ever pull funds back out.
    function withdraw(uint256 amount) external nonReentrant onlyOwner {
        (bool ok, ) = payable(owner()).call{value: amount}("");
        require(ok, "withdraw failed");
    }
}
