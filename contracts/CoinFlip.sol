pragma solidity 0.8.7;

import "@chainlink/contracts/src/v0.8/VRFConsumerBase.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CoinFlip is VRFConsumerBase, Ownable {
    uint8 constant CHOICE_HEAD = 1;
    uint8 constant CHOICE_TAIL = 2;
    uint8 constant WIN_ODDS_MULTIPLIER = 2;
    uint8 constant FLIP_IN_PROGRESS = 0;
    uint8 constant NO_FLIP = 99;

    uint256 constant MIN_BET = 0.01 ether;
    uint256 constant MAX_BET = 10 ether;

    uint256 constant HOUSE_EDGE_PERCENT = 1;
    uint256 constant HOUSE_EDGE_MIN = 0.0003 ether;

    uint256 lockedInBets;

    struct Bet {
        uint256 amount;
        //uint256 winAmount;
        uint8 choice;
        uint8 flipResult;
        //bytes32 requestId;
        //address gambler;
    }

    mapping(address => Bet) bets;
    mapping(bytes32 => address) rollers;

    event CoinFlipped(
        bytes32 indexed requestId,
        address indexed gambler,
        uint8 choice,
        uint256 amount
    );

    event CoinLanded(
        bytes32 indexed requestId,
        address indexed gambler,
        bool indexed isWon,
        uint8 result,
        uint256 wonAmount
    );

    bytes32 private s_keyHash;
    uint256 private s_fee;

    constructor(
        address vrfCoordinator,
        address link,
        bytes32 keyHash,
        uint256 fee
    ) public VRFConsumerBase(vrfCoordinator, link) {
        s_keyHash = keyHash;
        s_fee = fee;
    }

    fallback() external payable {}

    function flip(uint8 _choice) external payable returns (bytes32 requestId) {
        require(
            LINK.balanceOf(address(this)) >= s_fee,
            "Not enough LINK to pay fee"
        );

        require(
            _choice == CHOICE_HEAD || _choice == CHOICE_TAIL,
            "Choice must be head or tail."
        );

        uint256 bet = msg.value;
        address gambler = msg.sender;

        // TODO: Max bet should be dynamic, 1/10th of the current pot
        require(
            bet >= MIN_BET && bet <= MAX_BET,
            "Amount should be within range."
        );

        Bet storage myBet = bets[gambler];

        require(myBet.amount == 0, "Previous bet not processed.");

        uint256 possibleWinAmount = getWinAmount(bet);

        require(
            (lockedInBets + possibleWinAmount) <= address(this).balance,
            "Not enough balance."
        );

        lockedInBets += possibleWinAmount;

        requestId = requestRandomness(s_keyHash, s_fee);

        myBet.amount = bet;
        myBet.choice = _choice;
        myBet.flipResult = FLIP_IN_PROGRESS;
        //myBet.requestId = requestId;

        rollers[requestId] = gambler;

        emit CoinFlipped(requestId, gambler, _choice, bet);

        return requestId;
    }

    function getWinAmount(uint256 _amount) public pure returns (uint256) {
        require(_amount > 0, "Amount need to be bigger than 0.");
        uint256 houseEdge = _getHouseEdge(_amount);
        require(houseEdge <= _amount, "Does not cover the house edge.");

        return _getWinAmount(_amount);
    }

    function _getHouseEdge(uint256 _amount) private pure returns (uint256) {
        uint256 houseEdge = (_amount * HOUSE_EDGE_PERCENT) / 100;
        return houseEdge < HOUSE_EDGE_MIN ? HOUSE_EDGE_MIN : houseEdge;
    }

    function _getWinAmount(uint256 _amount) private pure returns (uint256) {
        return
            (_amount - _getHouseEdge(_amount)) * uint256(WIN_ODDS_MULTIPLIER);
    }

    function fulfillRandomness(bytes32 requestId, uint256 randomness)
        internal
        override
    {
        uint8 result = uint8((randomness % 2) + 1);
        address gambler = rollers[requestId];

        Bet storage myBet = bets[gambler];

        uint256 winAmount = _getWinAmount(myBet.amount);

        myBet.flipResult = result;
        //myBet.winAmount = winAmount;
        bool isWon = _isBetWon(gambler);
        if (!isWon) {
            lockedInBets -= winAmount;
            myBet.amount = 0;
        }

        emit CoinLanded(
            requestId,
            gambler,
            isWon,
            result,
            isWon ? winAmount : 0
        );
    }

    function withdrawWinning() external {
        require(_isBetWon(msg.sender), "Nothing to withdraw.");

        Bet storage myBet = bets[msg.sender];
        uint256 winAmount = getWinAmount(myBet.amount);

        require(winAmount != 0);
        require(address(this).balance >= winAmount);

        myBet.amount = 0;
        lockedInBets -= winAmount;

        payable(msg.sender).transfer(winAmount);
    }

    function withdrawLink() public onlyOwner {
        require(
            LINK.transfer(msg.sender, LINK.balanceOf(address(this))),
            "Unable to transfer"
        );
    }

    function widthdrawFunds(uint256 _amount) public onlyOwner {
        require(_amount <= address(this).balance, "Amount larger than balance");
        require(
            lockedInBets + _amount <= address(this).balance,
            "Not enough funds"
        );

        payable(msg.sender).transfer(_amount);
    }

    function _isBetWon(address _gambler) private view returns (bool) {
        Bet storage myBet = bets[_gambler];
        // dev: When flipResult and choice compared together it's still possible that
        //      after a won bet which was claimed this function still returns with "true"
        //      to prevent this issue, either we have to compare the amount which is zeroed out after claim
        //      or set the flipResult back to 99 when claimed.
        return (myBet.flipResult == myBet.choice && myBet.amount != 0);
    }

    function isBetWon() external view returns (bool) {
        return _isBetWon(msg.sender);
    }
}
