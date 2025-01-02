// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "./IChessTemplate.sol";
import "./IChessFactory.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./ChessControl.sol";
import "./ChessFactory.sol";

/**
 * @title ChessTemplate
 * @dev A decentralized chess game contract that manages game state, player interactions, and reward distributions.
 * Inherits from ChessControl, ReentrancyGuard, and Ownable for extended functionalities and security.
 */
contract ChessTemplate is IChessTemplate, ChessControl, ReentrancyGuard, Ownable {
	// ==============================
	// ============ STATE ============
	// ==============================

	IChessFactory public chessFactory;

	address public player1;
	address public player2;
	address public abandoner;
	address public proposer;

	bool public gameActive;
	bool public drawProposed;

	uint8 private currentOutcome;

	uint256 public lastMoveTime;
	uint256 public moveCount;

	uint16[] private storedMoves;

	uint256 public constant BET_AMOUNT = 1000 * 10 ** 18;
	uint256 public constant PLATFORM_FEE = 500 * 10 ** 18;
	uint256 public constant WINNER_REWARD = 1500 * 10 ** 18;
	uint256 public constant DRAW_REWARD = 750 * 10 ** 18;
	uint256 public constant MOVE_TIMEOUT = 15 minutes;

	// ===============================
	// ============ STATUS ============
	// ===============================

	enum GameStatus {
		Inactive,
		Active,
		Draw,
		Abandoned,
		Ended
	}

	GameStatus public status;

	// ===============================
	// ============ EVENTS ============
	// ===============================

	event Player1Set(address indexed previousPlayer1, address indexed newPlayer1);
	event Player2Set(address indexed previousPlayer2, address indexed newPlayer2);
	event GameStarted(uint256 betAmount);
	event MovePlayed(address indexed player, uint16 move);
	event DrawProposed(address indexed proposer);
	event DrawAccepted(address indexed proposer, address indexed accepter);
	event GameAbandoned(address indexed loser, address indexed winner);
	event GameEnded(uint16 outcome, address indexed winner);
	event GameEndedForTimeout(address indexed winner, address indexed loser);
	event GameForcedDraw(address indexed player1, address indexed player2);

	// ================================
	// ============ ERRORS ============
	// ================================

	error AlreadyInitialized();
	error NotParticipant();
	error GameNotActive();
	error NotYourTurn();
	error InvalidChessFactory();
	error PlayersNotRegistered();
	error GameAlreadyActive();
	error EmptyMovesArray();
	error DrawAlreadyProposed();
	error ProposerCannotAccept();
	error TimeoutNotPassed();
	error OnlyChessFactory();
	error InvalidPlayers();

	// ===============================
	// ========== MODIFIERS ==========
	// ===============================

	/**
	 * @dev Restricts function access to only the registered players of the game.
	 */
	modifier onlyPlayers() {
		if (player1 == address(0) || player2 == address(0)) revert PlayersNotRegistered();
		if (msg.sender != player1 && msg.sender != player2) revert NotParticipant();
		_;
	}

	/**
	 * @dev Restricts function access to only the ChessFactory contract.
	 */
	modifier onlyChessFactory() {
		if (msg.sender != address(chessFactory)) revert OnlyChessFactory();
		_;
	}

	// ===============================
	// =========== CONSTRUCTOR ========
	// ===============================

	constructor() Ownable(msg.sender) {}

	// ===============================
	// =========== FUNCTIONS ==========
	// ===============================

	/**
	 * @notice Initializes the cloned ChessTemplate contract with fixed parameters.
	 * @dev This function can only be called once by the owner to set up the game.
	 * @param _chessFactory Address of the ChessFactory contract.
	 */
	function initialize(address _chessFactory) external nonReentrant {
		if (_chessFactory == address(0)) revert InvalidChessFactory();

		chessFactory = IChessFactory(_chessFactory);

		gameActive = false;
		status = GameStatus.Inactive;
		moveCount = 0;

		emit GameStarted(BET_AMOUNT);
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
	 */
	function setPlayer1(address _player1) external onlyChessFactory nonReentrant {
		if (player1 != address(0)) revert AlreadyInitialized();
		if (_player1 == address(0)) revert InvalidPlayers();

		// Émettre un événement pour signaler la modification
		emit Player1Set(player1, _player1);

		player1 = _player1;
	}

	/**
	 * @notice Sets the address of player2.
	 * @dev Can only be called by the ChessFactory contract.
	 * @param _player2 Address of the second player.
	 */
	function setPlayer2(address _player2) external onlyChessFactory nonReentrant {
		if (player2 != address(0)) revert AlreadyInitialized();
		if (_player2 == address(0)) revert InvalidPlayers();

		// Émettre un événement pour signaler la modification
		emit Player2Set(player2, _player2);

		player2 = _player2;
	}

	/**
	 * @notice Activates the game, allowing players to start making moves.
	 * @dev Can only be called by the ChessFactory contract.
	 */
	function setGameActive() external onlyChessFactory nonReentrant {
		if (player1 == address(0) || player2 == address(0)) revert PlayersNotRegistered();
		if (gameActive) revert GameAlreadyActive();

		gameActive = true;
		status = GameStatus.Active;
		lastMoveTime = block.timestamp;
	}

	/**
	 * @notice Allows players to make a move by submitting an array of moves.
	 * @dev Only callable by registered players when the game is active.
	 * @param moves An array of moves made by the player.
	 */
	function playMove(uint16[] calldata moves) external onlyPlayers nonReentrant {
		if (!gameActive) revert GameNotActive();
		if (moves.length == 0) revert EmptyMovesArray();

		(uint8 outcome, , , ) = checkGameFromStart(moves);

		for (uint256 i = 0; i < moves.length; i++) {
			storedMoves.push(moves[i]);
			emit MovePlayed(msg.sender, moves[i]);
		}

		currentOutcome = outcome;
		lastMoveTime = block.timestamp;
		moveCount += moves.length;

		if (outcome != inconclusive_outcome) {
			_finalizeGame(outcome);
		}
	}

	/**
	 * @notice Finalizes the game and distributes rewards if there is a winner.
	 * @dev Internal function that follows the Checks-Effects-Interactions pattern.
	 * @param outcome The result of the game determining the winner..
	 */
	function _finalizeGame(uint16 outcome) internal {
		gameActive = false;
		status = GameStatus.Ended;
		address winner = address(0); // Initialisation explicite de winner

		if (outcome == white_win_outcome) {
			winner = player1;
		} else if (outcome == black_win_outcome) {
			winner = player2;
		}

		emit GameEnded(outcome, winner);

		if (winner != address(0)) {
			chessFactory.distributeRewards(player1, player2, winner, PLATFORM_FEE, WINNER_REWARD);
		}
	}

	/**
	 * @notice Allows a player to abandon the game.
	 * @dev Only callable by registered players when the game is active.
	 */
	function abandon() external onlyPlayers nonReentrant {
		if (!gameActive) revert GameNotActive();

		gameActive = false;
		status = GameStatus.Abandoned;
		abandoner = msg.sender;
		address winner = (msg.sender == player1) ? player2 : player1;

		emit GameAbandoned(msg.sender, winner);

		chessFactory.distributeRewards(player1, player2, winner, PLATFORM_FEE, WINNER_REWARD);
	}

	/**
	 * @notice Allows a player to propose a draw.
	 * @dev Only callable by registered players when the game is active and no draw has been proposed yet.
	 */
	function proposeDraw() external onlyPlayers {
		if (!gameActive) revert GameNotActive();
		if (drawProposed) revert DrawAlreadyProposed();

		drawProposed = true;
		proposer = msg.sender;

		emit DrawProposed(msg.sender);
	}

	/**
	 * @notice Allows a player to accept a proposed draw.
	 * @dev Only callable by registered players when the game is active and a draw has been proposed.
	 * @dev The proposer cannot accept their own draw.
	 */
	function acceptDraw() external onlyPlayers nonReentrant {
		if (!gameActive) revert GameNotActive();
		if (msg.sender == proposer) revert ProposerCannotAccept();
		if (player1 == address(0) || player2 == address(0)) revert InvalidPlayers();
		if (msg.sender != player1 && msg.sender != player2) revert NotParticipant();

		gameActive = false;
		status = GameStatus.Draw;

		emit DrawAccepted(proposer, msg.sender);

		chessFactory.distributeRewards(player1, player2, address(0), PLATFORM_FEE, DRAW_REWARD);
	}

	/**
	 * @notice Allows the owner to declare a winner if no move has been made within the timeout period.
	 * @dev Only callable by the contract owner.
	 */
	function forceWinDueToTimeout() external onlyOwner nonReentrant {
		if (!gameActive) revert GameNotActive();
		if (block.timestamp < lastMoveTime + MOVE_TIMEOUT) revert TimeoutNotPassed();

		address loser = _getCurrentPlayerTurn();
		address winner = (loser == player1) ? player2 : player1;

		// Finalize the game by declaring the winner
		_finalizeForcedWin(winner, loser);
	}

	/**
	 * @notice Allows the owner to force a draw if the opponent has not responded within the timeout period.
	 * @dev Only callable by the contract owner.
	 */
	function forceDrawDueToTimeout() external onlyOwner nonReentrant {
		if (!gameActive) revert GameNotActive();
		if (block.timestamp < lastMoveTime + MOVE_TIMEOUT) revert TimeoutNotPassed();

		gameActive = false;
		status = GameStatus.Draw;

		emit GameForcedDraw(player1, player2);
		emit GameEndedForTimeout(address(0), address(0));

		chessFactory.distributeRewards(player1, player2, address(0), PLATFORM_FEE, DRAW_REWARD);
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
	 */
	function _finalizeForcedWin(address winner, address loser) internal {
		gameActive = false;
		status = GameStatus.Ended;

		emit GameEndedForTimeout(winner, loser);

		chessFactory.distributeRewards(player1, player2, winner, PLATFORM_FEE, WINNER_REWARD);
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
		loser = (status == GameStatus.Abandoned) ? abandoner : address(0);
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
			return (abandoner == player1) ? player2 : player1;
		}
		return address(0);
	}
}
