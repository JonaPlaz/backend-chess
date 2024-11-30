// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "./ChessControl.sol";

contract ChessTemplate is ChessControl {
    address public player1;
    address public player2;
    uint256 public betAmount;
    bool public gameActive;
    bool public currentTurnBlack; // true = black's turn, false = white's turn
    uint256 public gameState;
    uint32 public player1State;
    uint32 public player2State;

    event GameStarted(address player1, address player2, uint256 betAmount);
    event MovePlayed(address player, uint16 move);
    event GameEnded(uint8 outcome, address winner);

    modifier onlyPlayers() {
        require(msg.sender == player1 || msg.sender == player2, "Not a participant");
        _;
    }

    // Fonction d'initialisation pour configurer le contrat cloné
    function initialize(
        address _player1,
        address _player2,
        uint256 _betAmount
    ) external {
        require(player1 == address(0) && player2 == address(0), "Already initialized");

        player1 = _player1;
        player2 = _player2;
        betAmount = _betAmount;
        gameState = game_state_start;
        player1State = initial_white_state;
        player2State = initial_black_state;
        gameActive = true;
        currentTurnBlack = false; // White starts
        emit GameStarted(player1, player2, betAmount);
    }

    function playMove(uint16 move) external onlyPlayers {
        require(gameActive, "Game is not active");
        require((msg.sender == player1 && !currentTurnBlack) || (msg.sender == player2 && currentTurnBlack), "Not your turn");

        uint32 playerState = currentTurnBlack ? player2State : player1State;
        uint32 opponentState = currentTurnBlack ? player1State : player2State;

        uint16[] memory moves = new uint16[](1);
        moves[0] = move;

        (uint8 outcome, uint256 newGameState, uint32 newPlayerState, uint32 newOpponentState) = checkGame(
            gameState,
            playerState,
            opponentState,
            currentTurnBlack,
            moves
        );

        require(outcome == inconclusive_outcome, "Game has ended");

        // Update states
        gameState = newGameState;
        if (currentTurnBlack) {
            player2State = newPlayerState;
            player1State = newOpponentState;
        } else {
            player1State = newPlayerState;
            player2State = newOpponentState;
        }
        currentTurnBlack = !currentTurnBlack;

        emit MovePlayed(msg.sender, move);

        // Check for game end
        if (outcome != inconclusive_outcome) {
            endGame(outcome);
        }
    }

    function endGame(uint8 outcome) internal {
        gameActive = false;
        address winner;

        if (outcome == white_win_outcome) {
            winner = player1;
        } else if (outcome == black_win_outcome) {
            winner = player2;
        }

        emit GameEnded(outcome, winner);

        if (winner != address(0)) {
            payable(winner).transfer(betAmount * 2);
        }
    }
}
