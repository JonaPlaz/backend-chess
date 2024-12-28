// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ChessControl.sol";
import "./ChessFactory.sol";

/**
 * @title ChessTemplate
 * @dev A decentralized chess game contract that manages game state, player interactions, and reward distributions.
 * Inherits from ChessControl, ReentrancyGuard, and Ownable for extended functionalities and security.
 */
contract ChessTemplate is ChessControl, ReentrancyGuard, Ownable {
	// ==============================
	// ============ STATE ============
	// ==============================

	/// @notice Address of the first player.
	address public player1;

	/// @notice Address of the second player.
	address public player2;

	/// @notice Fixed bet amount per player in chessToken (assuming 18 decimals).
	uint256 public constant BET_AMOUNT = 1000 * 10 ** 18;

	/// @notice Indicates whether the game is currently active.
	bool public gameActive = false;

	/// @notice Array storing all moves made in the game.
	uint16[] private storedMoves;

	/// @notice Current outcome of the game.
	uint8 private currentOutcome;

	/// @notice Address of the ChessFactory contract managing game creation and reward distribution.
	address payable public chessFactory;

	/// @notice Address of the player who has abandoned the game, if any.
	address public abandoner;

	/// @notice Indicates whether a draw has been proposed.
	bool public drawProposed;

	/// @notice Address of the player who proposed a draw.
	address public proposer;

	/// @notice Timestamp of the last move made in the game.
	uint256 public lastMoveTime;

	/// @notice Fixed timeout period for moves (15 minutes).
	uint256 public constant MOVE_TIMEOUT = 15 minutes;

	/// @notice Counter for the number of moves made in the game.
	uint256 public moveCount;

	/// @notice Fixed reward for the winner in chessToken.
	uint256 public constant WINNER_REWARD = 1500 * 10 ** 18;

	/// @notice Fixed platform fee in chessToken.
	uint256 public constant PLATFORM_FEE = 500 * 10 ** 18;

	/// @notice Fixed reward per player in case of a draw in chessToken.
	uint256 public constant DRAW_REWARD = 750 * 10 ** 18;

	/**
	 * @dev Enum representing the various statuses of a game.
	 */
	enum GameStatus {
		Inactive, // Game has not started yet.
		Active, // Game is currently active.
		Draw, // Game ended in a draw.
		Abandoned, // Game was abandoned by a player.
		Ended // Game has concluded with a winner.
	}

	/// @notice Current status of the game.
	GameStatus public status;

	// ===============================
	// ============ EVENTS ============
	// ===============================

	/// @notice Emitted when a new game is started.
	/// @param player1 Address of the first player.
	/// @param player2 Address of the second player.
	/// @param betAmount Fixed bet amount per player.
	event GameStarted(address indexed player1, address indexed player2, uint256 betAmount);

	/// @notice Emitted when a player makes a move.
	/// @param player Address of the player making the move.
	/// @param move The move made by the player.
	event MovePlayed(address indexed player, uint16 move);

	/// @notice Emitted when a player proposes a draw.
	/// @param proposer Address of the player proposing the draw.
	event DrawProposed(address indexed proposer);

	/// @notice Emitted when a player accepts a proposed draw.
	/// @param proposer Address of the player who proposed the draw.
	/// @param accepter Address of the player who accepted the draw.
	event DrawAccepted(address indexed proposer, address indexed accepter);

	/// @notice Emitted when a player abandons the game.
	/// @param loser Address of the player who abandoned.
	/// @param winner Address of the player who wins by abandonment.
	event GameAbandoned(address indexed loser, address indexed winner);

	/// @notice Emitted when the game ends with a winner.
	/// @param outcome Result of the game determining the winner.
	/// @param winner Address of the winner.
	event GameEnded(uint16 outcome, address indexed winner);

	/// @notice Emitted when the game ends due to a timeout, declaring a winner.
	/// @param winner Address of the player who wins by timeout.
	/// @param loser Address of the player who loses by timeout.
	event GameEndedForTimeout(address indexed winner, address indexed loser);

	/// @notice Emitted when the owner forces a draw due to a timeout.
	/// @param player1 Address of the first player.
	/// @param player2 Address of the second player.
	event GameForcedDraw(address indexed player1, address indexed player2);

	// ================================
	// ============ ERRORS ============
	// ================================

	/// @notice Error thrown when attempting to initialize an already initialized contract.
	error AlreadyInitialized();

	/// @notice Error thrown when a non-participant attempts to perform a restricted action.
	error NotParticipant();

	/// @notice Error thrown when attempting to perform an action on an inactive game.
	error GameNotActive();

	/// @notice Error thrown when a player attempts to make a move out of turn.
	error NotYourTurn();

	// ===============================
	// ========== MODIFIERS ==========
	// ===============================

	/**
	 * @dev Restricts function access to only the registered players of the game.
	 */
	modifier onlyPlayers() {
		require(player1 != address(0) && player2 != address(0), "Players not registered");
		require(msg.sender == player1 || msg.sender == player2, "Not a participant");
		_;
	}

	// ===============================
	// =========== CONSTRUCTOR ========
	// ===============================

	/**
	 * @notice Constructor that initializes the Ownable contract with the deployer as the owner.
	 */
	constructor() Ownable(msg.sender) {}

	// ===============================
	// =========== FUNCTIONS ==========
	// ===============================

	/**
	 * @notice Initializes the cloned ChessTemplate contract with fixed parameters.
	 * @dev This function can only be called once by the owner to set up the game.
	 * @param _player1 Address of the first player.
	 * @param _player2 Address of the second player.
	 * @param _chessFactory Address of the ChessFactory contract.
	 *
	 * Requirements:
	 * - The contract must not have been initialized before.
	 * - Player addresses and ChessFactory address must not be zero.
	 *
	 * Emits a {GameStarted} event.
	 */
	function initialize(address _player1, address _player2, address _chessFactory) external {
		if (chessFactory != address(0)) revert AlreadyInitialized();
		require(_chessFactory != address(0), "Invalid ChessFactory address");

		// Initialisation des joueurs à address(0) si non spécifiés
		player1 = _player1;
		player2 = _player2;
		chessFactory = payable(_chessFactory);

		gameActive = false;
		status = GameStatus.Inactive;
		moveCount = 0;

		emit GameStarted(player1, player2, BET_AMOUNT);
	}

	/**
	 * @notice Checks if the game is currently active.
	 * @return bool indicating whether the game is active.
	 */
	function isGameActive() external view returns (bool) {
		return gameActive;
	}

	/**
	 * @notice Sets the address of player1.
	 * @dev Can only be called by the ChessFactory contract.
	 * @param _player1 Address of the first player.
	 *
	 * Requirements:
	 * - player1 must not have been set before.
	 */
	function setPlayer1(address _player1) external {
		require(player1 == address(0), "Player 1 already assigned");
		player1 = _player1;
	}

	/**
	 * @notice Sets the address of player2.
	 * @dev Can only be called by the ChessFactory contract.
	 * @param _player2 Address of the second player.
	 *
	 * Requirements:
	 * - player2 must not have been set before.
	 */
	function setPlayer2(address _player2) external {
		require(player2 == address(0), "Player 2 already assigned");
		player2 = _player2;
	}

	/**
	 * @notice Activates the game, allowing players to start making moves.
	 * @dev Can only be called by the ChessFactory contract.
	 *
	 * Requirements:
	 * - Both players must be registered.
	 * - The game must not already be active.
	 *
	 * Emits no events.
	 */
	function setGameActive() external {
		require(msg.sender == chessFactory, "Only ChessFactory can call this function");
		require(player1 != address(0) && player2 != address(0), "Players not registered");
		require(!gameActive, "Game is already active");

		gameActive = true;
		status = GameStatus.Active;
		lastMoveTime = block.timestamp; // Initialize the timestamp
	}

	/**
	 * @notice Allows players to make a move by submitting an array of moves.
	 * @dev Only callable by registered players when the game is active.
	 * @param moves An array of moves made by the player.
	 *
	 * Requirements:
	 * - The game must be active.
	 * - The moves array must not be empty.
	 *
	 * Emits a {MovePlayed} event and possibly a {GameEnded} event.
	 */
	function playMove(uint16[] memory moves) external onlyPlayers {
		require(gameActive, "Game is inactive");
		require(moves.length > 0, "Moves array is empty");

		(uint8 outcome, , , ) = checkGameFromStart(moves);

		storedMoves = moves;
		currentOutcome = outcome;
		lastMoveTime = block.timestamp; // Update the timestamp
		moveCount += 1; // Increment the move count

		emit MovePlayed(msg.sender, moves[moves.length - 1]);

		if (outcome != inconclusive_outcome) {
			_finalizeGame(outcome);
		}
	}

	/**
	 * @notice Finalizes the game and distributes rewards if there is a winner.
	 * @dev Internal function that should follow the Checks-Effects-Interactions pattern.
	 * @param outcome The result of the game determining the winner.
	 *
	 * Emits a {GameEnded} event.
	 */
	function _finalizeGame(uint16 outcome) internal {
		gameActive = false;
		status = GameStatus.Ended;
		address winner;

		if (outcome == white_win_outcome) {
			winner = player1;
		} else if (outcome == black_win_outcome) {
			winner = player2;
		}

		emit GameEnded(outcome, winner);

		if (winner != address(0)) {
			// Distribute fixed rewards
			ChessFactory(chessFactory).distributeRewards(player1, player2, winner, PLATFORM_FEE, WINNER_REWARD);
		}
	}

	/**
	 * @notice Allows a player to abandon the game.
	 * @dev Only callable by registered players when the game is active.
	 *
	 * Requirements:
	 * - The game must be active.
	 * - ChessFactory address must be set.
	 *
	 * Emits a {GameAbandoned} event.
	 */
	function abandon() external onlyPlayers {
		require(gameActive, "Game is inactive");

		gameActive = false;
		status = GameStatus.Abandoned;
		abandoner = msg.sender; // Record the abandoning player
		address winner = msg.sender == player1 ? player2 : player1;

		emit GameAbandoned(msg.sender, winner);

		// Distribute fixed rewards via ChessFactory
		ChessFactory(chessFactory).distributeRewards(player1, player2, winner, PLATFORM_FEE, WINNER_REWARD);
	}

	/**
	 * @notice Allows a player to propose a draw.
	 * @dev Only callable by registered players when the game is active and no draw has been proposed yet.
	 *
	 * Requirements:
	 * - The game must be active.
	 * - No draw must have been proposed already.
	 *
	 * Emits a {DrawProposed} event.
	 */
	function proposeDraw() external onlyPlayers {
		require(gameActive, "Game is inactive");
		require(!drawProposed, "Draw already proposed");
		require(msg.sender == player1 || msg.sender == player2, "Only players can propose");
		require(status == GameStatus.Active, "Game is not active"); // Ensure the game is ongoing

		drawProposed = true;
		proposer = msg.sender;

		emit DrawProposed(msg.sender);
	}

	/**
	 * @notice Allows a player to accept a proposed draw.
	 * @dev Only callable by registered players when the game is active and a draw has been proposed.
	 * @dev The proposer cannot accept their own draw.
	 *
	 * Requirements:
	 * - The game must be active.
	 * - ChessFactory address must be set.
	 * - The accepter cannot be the proposer.
	 * - Both players must be valid and distinct.
	 *
	 * Emits a {DrawAccepted} event.
	 */
	function acceptDraw() external onlyPlayers {
		require(gameActive, "Game is inactive");
		require(msg.sender != proposer, "Proposer cannot accept their own draw");
		require(player1 != address(0) && player2 != address(0), "Invalid players");
		require(msg.sender == player1 || msg.sender == player2, "Only players can accept the draw");

		gameActive = false;
		status = GameStatus.Draw;

		emit DrawAccepted(proposer, msg.sender);

		// Distribute fixed rewards in case of a draw
		ChessFactory(chessFactory).distributeRewards(player1, player2, address(0), PLATFORM_FEE, DRAW_REWARD);
	}

	/**
	 * @notice Allows the owner to declare a winner if no move has been made within the timeout period.
	 * @dev Only callable by the contract owner.
	 *
	 * Requirements:
	 * - The game must be active.
	 * - The timeout period must have passed since the last move.
	 *
	 * Emits a {GameEndedForTimeout} event.
	 */
	function forceWinDueToTimeout() external onlyOwner {
		require(gameActive, "Game is not active");
		require(block.timestamp >= lastMoveTime + MOVE_TIMEOUT, "Timeout period has not yet passed");

		// Determine the loser based on the current turn
		address loser = _getCurrentPlayerTurn();
		address winner = (loser == player1) ? player2 : player1;

		// Finalize the game by declaring the winner
		_finalizeForcedWin(winner, loser);
	}

	/**
	 * @notice Allows the owner to force a draw if the opponent has not responded within the timeout period.
	 * @dev Only callable by the contract owner.
	 *
	 * Requirements:
	 * - The game must be active.
	 * - The timeout period must have passed since the last move.
	 *
	 * Emits {GameForcedDraw} and {GameEndedForTimeout} events.
	 */
	function forceDrawDueToTimeout() external onlyOwner {
		require(gameActive, "Game is not active");
		require(block.timestamp >= lastMoveTime + MOVE_TIMEOUT, "Timeout period has not yet passed");

		// Finalize the game by declaring a draw
		gameActive = false;
		status = GameStatus.Draw;

		emit GameForcedDraw(player1, player2);
		emit GameEndedForTimeout(address(0), address(0));

		// Distribute fixed rewards in case of a forced draw
		ChessFactory(chessFactory).distributeRewards(player1, player2, address(0), PLATFORM_FEE, DRAW_REWARD);
	}

	/**
	 * @notice Determines which player's turn it is based on the number of moves made.
	 * @dev Assumes player1 makes odd-numbered moves and player2 makes even-numbered moves.
	 * @return address of the player whose turn it is.
	 */
	function _getCurrentPlayerTurn() internal view returns (address) {
		// Assume player1 plays odd moves and player2 plays even moves
		if (moveCount % 2 == 0) {
			return player1;
		} else {
			return player2;
		}
	}

	/**
	 * @notice Finalizes the game by declaring a forced winner due to timeout.
	 * @dev Internal function following the Checks-Effects-Interactions pattern.
	 * @param winner Address of the player who wins by timeout.
	 * @param loser Address of the player who loses by timeout.
	 *
	 * Emits a {GameEndedForTimeout} event.
	 */
	function _finalizeForcedWin(address winner, address loser) internal {
		gameActive = false;
		status = GameStatus.Ended;

		emit GameEndedForTimeout(winner, loser);

		// Distribute fixed rewards
		ChessFactory(chessFactory).distributeRewards(player1, player2, winner, PLATFORM_FEE, WINNER_REWARD);
	}

	/**
	 * @notice Retrieves the current state of the game.
	 * @return moves Array of moves made in the game.
	 * @return outcome Current outcome of the game.
	 * @return currentStatus Current status of the game.
	 * @return winner Address of the winner, if applicable.
	 * @return loser Address of the loser, if applicable.
	 */
	function getGameState()
		external
		view
		returns (uint16[] memory moves, uint8 outcome, GameStatus currentStatus, address winner, address loser)
	{
		moves = storedMoves;
		outcome = currentOutcome;
		currentStatus = status;
		winner = (status == GameStatus.Ended || status == GameStatus.Abandoned) ? _getWinner() : address(0);
		loser = (status == GameStatus.Abandoned) ? abandoner : address(0); // Identify the loser if abandoned
	}

	/**
	 * @notice Determines the winner based on the outcome of the game.
	 * @dev Internal view function used to identify the winner.
	 * @return address of the winner.
	 */
	function _getWinner() internal view returns (address) {
		if (currentOutcome == white_win_outcome) {
			return player1;
		} else if (currentOutcome == black_win_outcome) {
			return player2;
		} else if (status == GameStatus.Abandoned) {
			return abandoner == player1 ? player2 : player1;
		}
		return address(0);
	}
}
