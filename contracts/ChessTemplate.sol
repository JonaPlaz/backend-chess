// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "./ChessControl.sol";
import "./ChessFactory.sol";

// si partie gagnée, abandon ou draw gameActive = false mais impossible de le repaser à true !! SECURITE trop facile d'utiliser setGameActive
// ajouter fonction abandon si joueur ne joue pas dans les temps : temps à définir
// déterminer le montant des récompenses ici
// le draw est automatiquement accepté si l'autre joueur ne répond pas dans un certain délai : temps à définir
contract ChessTemplate is ChessControl {
	address public player1;
	address public player2;
	uint256 public betAmount;
	bool public gameActive = false;
	uint16[] private storedMoves;
	uint8 private currentOutcome;
	address private owner;
	address public chessFactory;
	address public abandoner;

	enum GameStatus {
		Inactive,
		Active,
		Draw,
		Abandoned,
		Ended
	}
	GameStatus public status;

	event GameStarted(address player1, address player2, uint256 betAmount);
	event MovePlayed(address player, uint16 move);
	event GameAbandoned(address loser, address winner);
	event GameEnded(uint16 outcome, address winner);

	error AlreadyInitialized();
	error NotParticipant();
	error GameNotActive();
	error NotYourTurn();

	modifier onlyPlayers() {
		require(player1 != address(0) && player2 != address(0), "Players not registered");
		require(msg.sender == player1 || msg.sender == player2, "Not a participant");
		_;
	}

	/// @notice Initializes the cloned contract
	function initialize(address _player1, address _player2, uint256 _betAmount, address _chessFactory) external {
		require(chessFactory == address(0), "Already initialized");

		player1 = _player1;
		player2 = _player2;
		betAmount = _betAmount;
		chessFactory = _chessFactory;

		gameActive = false;
		status = GameStatus.Inactive;

		emit GameStarted(player1, player2, betAmount);
	}

	function isGameActive() external view returns (bool) {
		return gameActive;
	}

	function setPlayer1(address _player1) external {
		require(player1 == address(0), "Player 1 already assigned");
		player1 = _player1;
	}

	function setPlayer2(address _player2) external {
		require(player2 == address(0), "Player 2 already assigned");
		player2 = _player2;
	}

	function setGameActive() external {
		require(player1 != address(0) && player2 != address(0), "Players not registered");
		require(!gameActive, "Game is already active");

		gameActive = true;
		status = GameStatus.Active;
	}

	function playMove(uint16[] memory moves) external onlyPlayers {
		require(gameActive, "Game is inactive");
		require(moves.length > 0, "Moves array is empty");

		(uint8 outcome, , , ) = checkGameFromStart(moves);

		storedMoves = moves;
		currentOutcome = outcome;

		emit MovePlayed(msg.sender, moves[moves.length - 1]);

		if (outcome != inconclusive_outcome) {
			_finalizeGame(outcome);
		}
	}

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
			uint256 totalPot = betAmount * 2;
			uint256 platformFee = (totalPot * 25) / 100;
			uint256 winnerReward = totalPot - platformFee;

			ChessFactory(owner).distributeRewards(player1, player2, winner, platformFee, winnerReward);
		}
	}

	function abandon() external onlyPlayers {
		require(gameActive, "Game is inactive");
		require(chessFactory != address(0), "ChessFactory address not set");

		gameActive = false;
		status = GameStatus.Abandoned;
		abandoner = msg.sender; // Enregistre le joueur qui a abandonné
		address winner = msg.sender == player1 ? player2 : player1;

		emit GameAbandoned(msg.sender, winner);

		uint256 totalPot = betAmount * 2;
		uint256 platformFee = (totalPot * 25) / 100;
		uint256 winnerReward = totalPot - platformFee;

		(bool success, ) = chessFactory.call(
			abi.encodeWithSignature(
				"distributeRewards(address,address,address,uint256,uint256)",
				player1,
				player2,
				winner,
				platformFee,
				winnerReward
			)
		);
		require(success, "Failed to distribute rewards");
	}

	function getGameState()
		external
		view
		returns (uint16[] memory moves, uint8 outcome, GameStatus currentStatus, address winner, address loser)
	{
		moves = storedMoves;
		outcome = currentOutcome;
		currentStatus = status;
		winner = (status == GameStatus.Ended || status == GameStatus.Abandoned) ? _getWinner() : address(0);
		loser = (status == GameStatus.Abandoned) ? abandoner : address(0); // Identifie le perdant si abandon
	}

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
