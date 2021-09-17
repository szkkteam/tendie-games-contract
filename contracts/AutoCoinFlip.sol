pragma solidity 0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
//import "@openzeppelin/contracts/security/Pausable.sol";
 /*, Pausable */
contract AutoCoinFlip is VRFConsumerBase, Ownable {

    enum Position {
        Head,
        Tail
    }

    struct Round {
        uint256 epoch;
        uint256 totalAmount;
        uint256 headAmount;
        uint256 tailAmount;     
        uint256 rewardBaseCalAmount;
        uint256 rewardAmount;
        Position result;   
        bool isRoundLocked;
        bool isRoundResolved;
    }   

    struct BetInfo {
        Position position;
        uint256 amount;
        bool claimed; // default false
    }

    uint256 public minBetAmount;
    uint256 public treasuryFee;

    uint256 public treasuryAmount;
    uint256 public currentEpoch;

    mapping(address => uint256[]) public userRounds;
    mapping(uint256 => mapping(address => BetInfo)) public ledger;
    mapping(uint256 => Round) public rounds;

    bytes32 private s_keyHash;
    uint256 private s_fee;

    /**
     * EVENTS
    */
    event BetHead(address indexed sender, uint256 indexed epoch, uint256 amount);
    event BetTail(address indexed sender, uint256 indexed epoch, uint256 amount);

    event TossCoin(uint256 indexed epoch, bytes32 requestId);
    event CoinLanded(uint256 indexed epoch, bytes32 requestId, uint8 result);
    event RewardsCalculated(uint256 indexed epoch, 
        uint256 rewardBaseCalAmount,
        uint256 rewardAmount,
        uint256 treasuryAmount);
    event StartRound(uint256 indexed epoch);
    event EndRound(uint256 indexed epoch);
    event Claim(uint256 indexed epoch, address indexed user, uint256 amount);

    constructor(
        address vrfCoordinator,
        address link,
        bytes32 keyHash,
        uint256 fee
    ) public VRFConsumerBase(vrfCoordinator, link) {
        s_keyHash = keyHash;
        s_fee = fee;
    }

    function betHead(uint256 epoch) external payable {
        require(epoch == currentEpoch, "Bet is too early/late");
        require(msg.value >= minBetAmount, "Bet amount must be greater than minBetAmount");
        require(ledger[epoch][msg.sender].amount == 0, "Can only bet once per round");
        require(!rounds[epoch].isRoundLocked, "Round is locked");

        uint256 amount = msg.value;

        // Update the round data
        Round storage round = rounds[epoch];
        round.totalAmount = round.totalAmount + amount;
        round.headAmount = round.headAmount + amount;

        // Update the user data
        BetInfo storage betInfo = ledger[epoch][msg.sender];
        betInfo.position = Position.Head;
        betInfo.amount = amount;
        userRounds[msg.sender].push(epoch);

        emit BetHead(msg.sender, epoch, amount);
    }

    function betTail(uint256 epoch) external payable {
        require(epoch == currentEpoch, "Bet is too early/late");
        require(msg.value >= minBetAmount, "Bet amount must be greater than minBetAmount");
        require(ledger[epoch][msg.sender].amount == 0, "Can only bet once per round");
        require(!rounds[epoch].isRoundLocked, "Round is locked");

        uint256 amount = msg.value;

        // Update the round data
        Round storage round = rounds[epoch];
        round.totalAmount = round.totalAmount + amount;
        round.tailAmount = round.tailAmount + amount;

        // Update the user data
        BetInfo storage betInfo = ledger[epoch][msg.sender];
        betInfo.position = Position.Tail;
        betInfo.amount = amount;
        userRounds[msg.sender].push(epoch);

        emit BetTail(msg.sender, epoch, amount);
    }

    function claim(uint256[] calldata epochs) external {
        uint256 reward;

        for (uint256 i = 0; i < epochs.length; ++i) {
            require(rounds[epochs[i]].isRoundResolved, "Round is not resolved yet");

            uint256 addedReward = 0;
            require(claimable(epochs[i], msg.sender), "Not eliglible for claim");
            Round memory round = rounds[epochs[i]];

            addedReward = (ledger[epochs[i]][msg.sender].amount * round.rewardAmount) / round.rewardBaseCalAmount;
            // TODO: How to handle invalid rounds which are not resolved by chainlink vrf?

            ledger[epochs[i]][msg.sender].claimed = true;
            reward += addedReward;

            emit Claim(epochs[i], msg.sender, addedReward);
        }

        payable(msg.sender).transfer(reward);
    }

    function executeRound() external {
        _safeLockRound();
        // Send randomness request     
        bytes32 requestId = requestRandomness(s_keyHash, s_fee);

        emit TossCoin(currentEpoch, requestId);   
    }

    function claimable(uint256 epoch, address user) public view returns (bool) {
        BetInfo memory betInfo = ledger[epoch][user];
        Round memory round = rounds[epoch];

        return (round.isRoundResolved && round.result == betInfo.position && !betInfo.claimed && betInfo.amount != 0);
    }

    /**
     * INTERNALS
     */

    function _safeLockRound() internal {
        require(!rounds[currentEpoch].isRoundLocked, "Round is locked");

        rounds[currentEpoch].isRoundLocked = true;
    }

    function _calculateRewards(uint256 epoch) internal {
        require(rounds[epoch].rewardBaseCalAmount == 0 && rounds[epoch].rewardAmount == 0, "Rewards already calculated");

        Round storage round = rounds[epoch];
        uint256 rewardBaseCalAmount;
        uint256 treasuryAmt;
        uint256 rewardAmount;

        if (round.result == Position.Head) {
            rewardBaseCalAmount = round.headAmount;
            treasuryAmt = (round.totalAmount * treasuryFee) / 10000;
            rewardAmount = round.totalAmount - treasuryAmt;
        }
        else if (round.result == Position.Tail) {
            rewardBaseCalAmount = round.tailAmount;
            treasuryAmt = (round.totalAmount * treasuryFee) / 10000;
            rewardAmount = round.totalAmount - treasuryAmt;
        }
        else {
            rewardBaseCalAmount = 0;
            rewardAmount = 0;
            treasuryAmt = round.totalAmount;
        }

        round.rewardBaseCalAmount = rewardBaseCalAmount;
        round.rewardAmount = rewardAmount;

        // Add to treasury
        treasuryAmount = treasuryAmt;

        emit RewardsCalculated(epoch, rewardBaseCalAmount, rewardAmount, treasuryAmount);
    }

    function _startRound(uint256 epoch) internal {
        Round storage round = rounds[epoch];

        round.epoch = epoch;
        round.totalAmount = 0;

        emit StartRound(epoch);
    }

    function _endRound(uint256 epoch) internal {
        Round storage round = rounds[epoch];
        round.isRoundResolved = true;

        emit EndRound(epoch);
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        uint8 result = uint8((randomness % 2) + 1);

        Round storage round = rounds[currentEpoch];
        round.result = Position(result);

        emit CoinLanded(currentEpoch, requestId, result);

        // Calculate reward
        _calculateRewards(currentEpoch);
        // Close the current epoch
        _endRound(currentEpoch);
        uint256 next_epoch = currentEpoch + 1;
        // Open the next epoch        
        _startRound(next_epoch);
        currentEpoch = next_epoch;
    }

}