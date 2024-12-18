// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "./ChessControl.sol";

contract ChessTemplate is ChessControl {
    address public player1;
    address public player2;
    uint256 public betAmount;
    bool public gameActive = false;

    event GameStarted(address player1, address player2, uint256 betAmount);
    event MovePlayed(address player, uint16 move);
    event GameEnded(uint16 outcome, address winner);

    error AlreadyInitialized();
    error NotParticipant();
    error GameNotActive();
    error NotYourTurn();

    modifier onlyPlayers() {
        require(
            player1 != address(0) && player2 != address(0),
            "Players not registered"
        );
        require(
            msg.sender == player1 || msg.sender == player2,
            "Not a participant"
        );
        _;
    }

    /// @notice Initializes the cloned contract
    function initialize(
        address _player1,
        address _player2,
        uint256 _betAmount
    ) external {
        require(
            player1 == address(0) && player2 == address(0),
            "Already initialized"
        );

        player1 = _player1;
        player2 = _player2;
        betAmount = _betAmount;

        gameActive = false; // La partie est inactive par défaut
        emit GameStarted(player1, player2, betAmount);
    }

    function isGameActive() external view returns (bool) {
        return gameActive;
    }

    /// @notice Sets Player 1's address
    function setPlayer1(address _player1) external {
        require(player1 == address(0), "Player 1 already assigned");
        player1 = _player1;
    }

    /// @notice Sets Player 2's address
    function setPlayer2(address _player2) external {
        require(player2 == address(0), "Player 2 already assigned");
        player2 = _player2;
    }

    function setGameActive() external {
        require(
            player1 != address(0) && player2 != address(0),
            "Players not registered"
        );
        require(!gameActive, "Game is already active");

        gameActive = true;
    }

    event DebugPlayMove(uint16[] moves, address player);
    /// @notice Validates and plays moves in sequence
    /// @param moves The list of moves played so far
    function playMove(uint16[] memory moves) external onlyPlayers {
        require(gameActive, "Game has ended");

        // Validation de la partie entière via checkGameFromStart
        (uint8 outcome, , , ) = checkGameFromStart(moves);

        // Envoie un event pour indiquer le dernier coup joué
        emit MovePlayed(msg.sender, moves[moves.length - 1]);

        // Fin de partie si un résultat a été trouvé
        if (outcome != inconclusive_outcome) {
            _finalizeGame(outcome);
        }
    }

    /// @notice Finalizes the game and sends the rewards
    function _finalizeGame(uint16 outcome) internal {
        gameActive = false;
        address winner = outcome == white_win_outcome
            ? player1
            : outcome == black_win_outcome
                ? player2
                : address(0);

        emit GameEnded(outcome, winner);

        if (winner != address(0)) {
            payable(winner).transfer(betAmount * 2);
        }
    }
}
