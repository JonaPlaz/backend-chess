// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

contract ChessControl {
	uint8 constant empty_const = 0x0;
	uint8 constant pawn_const = 0x1; // 001
	uint8 constant bishop_const = 0x2; // 010
	uint8 constant knight_const = 0x3; // 011
	uint8 constant rook_const = 0x4; // 100
	uint8 constant queen_const = 0x5; // 101
	uint8 constant king_const = 0x6; // 110
	uint8 constant type_mask_const = 0x7;
	uint8 constant color_const = 0x8;

	uint8 constant piece_bit_size = 4;
	uint8 constant piece_pos_shift_bit = 2;

	uint32 constant en_passant_const = 0x000000ff;
	uint32 constant king_pos_mask = 0x0000ff00;
	uint32 constant king_pos_zero_mask = 0xffff00ff;
	uint16 constant king_pos_bit = 8;
	/**
        @dev For castling masks, mask only the last bit of an uint8, to block any under/overflows.
     */
	uint32 constant rook_king_side_move_mask = 0x00800000;
	uint16 constant rook_king_side_move_bit = 16;
	uint32 constant rook_queen_side_move_mask = 0x80000000;
	uint16 constant rook_queen_side_move_bit = 24;
	uint32 constant king_move_mask = 0x80800000;

	uint16 constant pieces_left_bit = 32;

	uint8 constant king_white_start_pos = 0x04;
	uint8 constant king_black_start_pos = 0x3c;

	uint16 constant pos_move_mask = 0xfff;

	uint16 constant request_draw_const = 0x1000;
	uint16 constant accept_draw_const = 0x2000;
	uint16 constant resign_const = 0x3000;

	uint8 constant inconclusive_outcome = 0x0;
	uint8 constant draw_outcome = 0x1;
	uint8 constant white_win_outcome = 0x2;
	uint8 constant black_win_outcome = 0x3;

	uint256 constant game_state_start = 0xcbaedabc99999999000000000000000000000000000000001111111143265234;

	uint256 constant full_long_word_mask = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

	uint256 constant invalid_move_constant = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;

	/** @dev    Initial white state:
                0f: 15 (non-king) pieces left
                00: Queen-side rook at a1 position
                07: King-side rook at h1 position
                04: King at e1 position
                ff: En-passant at invalid position
    */
	uint32 constant initial_white_state = 0x000704ff;

	/** @dev    Initial black state:
                0f: 15 (non-king) pieces left
                38: Queen-side rook at a8 position
                3f: King-side rook at h8 position
                3c: King at e8 position
                ff: En-passant at invalid position
    */
	uint32 constant initial_black_state = 0x383f3cff;

	error UnsupportedPieceType(uint8 fromType, string message);

	constructor() {}

	function checkGameFromStart(uint16[] memory moves) public pure returns (uint8, uint256, uint32, uint32) {
		require(moves.length > 0, "Moves array cannot be empty"); // Validation ajoutée
		return checkGame(game_state_start, initial_white_state, initial_black_state, false, moves);
	}

	/**
    @dev Calculates the outcome of a game depending on the moves from a starting position.
         Reverts when an invalid move is found.
    @param startingGameState Game state from which start the movements
    @param startingPlayerState State of the first playing player
    @param startingOpponentState State of the other playing player
    @param startingTurnBlack Whether the starting player is the black pieces
    @param moves is the input array containing all the moves in the game
    @return outcome can be 0 for inconclusive, 1 for draw, 2 for white winning, 3 for black winning
 */
	function checkGame(
		uint256 startingGameState,
		uint32 startingPlayerState,
		uint32 startingOpponentState,
		bool startingTurnBlack,
		uint16[] memory moves
	) public pure returns (uint8 outcome, uint256 gameState, uint32 playerState, uint32 opponentState) {
		gameState = startingGameState;
		playerState = startingPlayerState;
		opponentState = startingOpponentState;
		outcome = inconclusive_outcome;
		bool currentTurnBlack = startingTurnBlack;

		require(moves.length > 0, "Invalid moves array");

		if (moves[moves.length - 1] == accept_draw_const) {
			// Handle draw condition
			require(moves.length >= 2, "Invalid draw sequence");
			require(moves[moves.length - 2] == request_draw_const, "Invalid draw request");
			outcome = draw_outcome;
		} else if (moves[moves.length - 1] == resign_const) {
			// Handle resignation
			outcome = ((moves.length % 2) == 1) != currentTurnBlack ? black_win_outcome : white_win_outcome;
		} else {
			// Process entire game moves
			for (uint256 i = 0; i < moves.length; i++) {
				(gameState, opponentState, playerState) = verifyExecuteMove(
					gameState,
					moves[i],
					playerState,
					opponentState,
					currentTurnBlack
				);

				require(!checkForCheck(gameState, opponentState), "Invalid check state");

				// Toggle turn
				currentTurnBlack = !currentTurnBlack;
			}

			// Check for endgame condition
			uint8 endgameOutcome = checkEndgame(gameState, playerState, opponentState);

			if (endgameOutcome == 2) {
				outcome = currentTurnBlack ? white_win_outcome : black_win_outcome;
			} else if (endgameOutcome == 1) {
				outcome = draw_outcome;
			}
		}
	}

	/**
    @dev Calculates the outcome of a single move given the current game state.
         Reverts for invalid movement.
    @param gameState current game state on which to perform the movement.
    @param move is the move to execute: 16-bit var, high word = from pos, low word = to pos
            move can also be: resign, request draw, accept draw.
    @param currentTurnBlack true if it's black turn
    @return newGameState the new game state after it's executed.
 */
	function verifyExecuteMove(
		uint256 gameState,
		uint16 move,
		uint32 playerState,
		uint32 opponentState,
		bool currentTurnBlack
	) public pure returns (uint256 newGameState, uint32 newPlayerState, uint32 newOpponentState) {
		// Extract positions from the move
		uint8 fromPos = uint8((move >> 6) & 0x3f);
		uint8 toPos = uint8(move & 0x3f);

		// Validate positions
		require(fromPos != toPos, "Invalid move: stale position");

		// Identify the piece being moved
		uint8 fromPiece = pieceAtPosition(gameState, fromPos);
		require(((fromPiece & color_const) > 0) == currentTurnBlack, "Invalid move: incorrect piece color");

		// Extract piece type
		uint8 fromType = fromPiece & type_mask_const;

		// Initialize new state variables
		newPlayerState = playerState;
		newOpponentState = opponentState;

		if (fromType == pawn_const) {
			(newGameState, newPlayerState) = verifyExecutePawnMove(
				gameState,
				fromPos,
				toPos,
				uint8(move >> 12),
				currentTurnBlack,
				playerState,
				opponentState
			);
		} else if (fromType == knight_const) {
			newGameState = verifyExecuteKnightMove(gameState, fromPos, toPos, currentTurnBlack);
		} else if (fromType == bishop_const) {
			newGameState = verifyExecuteBishopMove(gameState, fromPos, toPos, currentTurnBlack);
		} else if (fromType == rook_const) {
			newGameState = verifyExecuteRookMove(gameState, fromPos, toPos, currentTurnBlack);
			// Update playerState for rook moves
			if (fromPos == uint8(playerState >> rook_king_side_move_bit)) {
				newPlayerState = playerState | rook_king_side_move_mask;
			} else if (fromPos == uint8(playerState >> rook_queen_side_move_bit)) {
				newPlayerState = playerState | rook_queen_side_move_mask;
			}
		} else if (fromType == queen_const) {
			newGameState = verifyExecuteQueenMove(gameState, fromPos, toPos, currentTurnBlack);
		} else if (fromType == king_const) {
			(newGameState, newPlayerState) = verifyExecuteKingMove(gameState, fromPos, toPos, currentTurnBlack, playerState);
		} else {
			revert UnsupportedPieceType(fromType, "Invalid move");
		}

		// Ensure move is valid
		require(newGameState != invalid_move_constant, "Invalid move: game state");

		// Handle en passant rule
		if (toPos == (opponentState & en_passant_const)) {
			if (currentTurnBlack) {
				newGameState = zeroPosition(newGameState, toPos + 8);
			} else {
				newGameState = zeroPosition(newGameState, toPos - 8);
			}
		}

		// Update opponent state
		newOpponentState = opponentState | en_passant_const;
	}

	/**
    @dev Calculates the outcome of a single move of a pawn given the current game state.
         Returns invalid_move_constant for invalid movement.
    @param gameState current game state on which to perform the movement.
    @param fromPos is position moving from.
    @param toPos is position moving to.
    @param currentTurnBlack true if it's black turn.
    @param moveExtra extra data for pawn promotion.
    @param playerState current player state.
    @param opponentState opponent player state.
    @return newGameState the new game state after it's executed.
    @return newPlayerState the updated player state.
 */
	function verifyExecutePawnMove(
		uint256 gameState,
		uint8 fromPos,
		uint8 toPos,
		uint8 moveExtra,
		bool currentTurnBlack,
		uint32 playerState,
		uint32 opponentState
	) public pure returns (uint256 newGameState, uint32 newPlayerState) {
		newPlayerState = playerState;

		// Validate pawn movement direction
		if (currentTurnBlack != (toPos < fromPos)) {
			return (invalid_move_constant, 0x0);
		}

		uint8 diff = fromPos > toPos ? fromPos - toPos : toPos - fromPos;
		uint8 pieceToPosition = pieceAtPosition(gameState, toPos);

		// Handle standard pawn moves (single or double square forward)
		if (diff == 8 || diff == 16) {
			if (pieceToPosition != 0) {
				return (invalid_move_constant, 0x0);
			}

			if (diff == 16) {
				// Validate initial double move positions
				if ((currentTurnBlack && ((fromPos >> 3) != 0x6)) || (!currentTurnBlack && ((fromPos >> 3) != 0x1))) {
					return (invalid_move_constant, 0x0);
				}

				uint8 posToInBetween = toPos > fromPos ? fromPos + 8 : toPos + 8;
				if (pieceAtPosition(gameState, posToInBetween) != 0) {
					return (invalid_move_constant, 0x0);
				}

				// Update en passant state
				newPlayerState = (newPlayerState & (~en_passant_const)) | uint32(posToInBetween);
			}

			// Handle diagonal captures
		} else if (diff == 7 || diff == 9) {
			if (getVerticalMovement(fromPos, toPos) != 1) {
				return (invalid_move_constant, 0x0);
			}

			// Check en passant or regular capture
			if ((uint8(opponentState & en_passant_const)) != toPos) {
				if (
					(pieceToPosition == 0) || (currentTurnBlack == ((pieceToPosition & color_const) == color_const)) // Must move to occupied square // Must capture opponent piece
				) {
					return (invalid_move_constant, 0x0);
				}
			}

			// Invalid move for a pawn
		} else {
			return (invalid_move_constant, 0x0);
		}

		// Commit move
		newGameState = commitMove(gameState, fromPos, toPos);

		// Handle pawn promotion
		if ((currentTurnBlack && ((toPos >> 3) == 0x0)) || (!currentTurnBlack && ((toPos >> 3) == 0x7))) {
			require(
				(moveExtra == bishop_const) || (moveExtra == knight_const) || (moveExtra == rook_const) || (moveExtra == queen_const),
				"Invalid promotion"
			);

			newGameState = setPosition(zeroPosition(newGameState, toPos), toPos, currentTurnBlack ? moveExtra | color_const : moveExtra);
		}
	}

	/**
    @dev Calculates the outcome of a single move of a knight given the current game state.
         Returns invalid_move_constant for invalid movement.
    @param gameState current game state on which to perform the movement.
    @param fromPos is position moving from.
    @param toPos is position moving to.
    @param currentTurnBlack true if it's black turn
    @return newGameState the new game state after it's executed.
 */
	function verifyExecuteKnightMove(uint256 gameState, uint8 fromPos, uint8 toPos, bool currentTurnBlack) public pure returns (uint256) {
		// Check if destination square is occupied by a piece of the same color
		uint8 pieceToPosition = pieceAtPosition(gameState, toPos);
		if (pieceToPosition > 0) {
			if (((pieceToPosition & color_const) == color_const) == currentTurnBlack) {
				return invalid_move_constant;
			}
		}

		// Validate knight movement (L-shaped move: 2 horizontal + 1 vertical or 1 horizontal + 2 vertical)
		uint8 h = getHorizontalMovement(fromPos, toPos);
		uint8 v = getVerticalMovement(fromPos, toPos);
		if (!((h == 2 && v == 1) || (h == 1 && v == 2))) {
			return invalid_move_constant;
		}

		// Commit the move if valid
		return commitMove(gameState, fromPos, toPos);
	}

	/**
    @dev Calculates the outcome of a single move of a bishop given the current game state.
         Returns invalid_move_constant for invalid movement.
    @param gameState current game state on which to perform the movement.
    @param fromPos is position moving from.
    @param toPos is position moving to.
    @param currentTurnBlack true if it's black turn
    @return newGameState the new game state after it's executed.
 */
	function verifyExecuteBishopMove(uint256 gameState, uint8 fromPos, uint8 toPos, bool currentTurnBlack) public pure returns (uint256) {
		// Check if the destination square is occupied by a piece of the same color
		uint8 pieceToPosition = pieceAtPosition(gameState, toPos);
		if (pieceToPosition > 0) {
			if (((pieceToPosition & color_const) == color_const) == currentTurnBlack) {
				return invalid_move_constant;
			}
		}

		// Validate diagonal movement: horizontal and vertical distances must be equal
		uint8 h = getHorizontalMovement(fromPos, toPos);
		uint8 v = getVerticalMovement(fromPos, toPos);
		if ((h != v) || ((gameState & getInBetweenMask(fromPos, toPos)) != 0x00)) {
			return invalid_move_constant;
		}

		// Commit the move if valid
		return commitMove(gameState, fromPos, toPos);
	}

	/**
    @dev Calculates the outcome of a single move of a rook given the current game state.
         Returns invalid_move_constant for invalid movement.
    @param gameState current game state on which to perform the movement.
    @param fromPos is position moving from.
    @param toPos is position moving to.
    @param currentTurnBlack true if it's black turn
    @return newGameState the new game state after it's executed.
 */
	function verifyExecuteRookMove(uint256 gameState, uint8 fromPos, uint8 toPos, bool currentTurnBlack) public pure returns (uint256) {
		// Check if the destination square is occupied by a piece of the same color
		uint8 pieceToPosition = pieceAtPosition(gameState, toPos);
		if (pieceToPosition > 0) {
			if (((pieceToPosition & color_const) == color_const) == currentTurnBlack) {
				return invalid_move_constant;
			}
		}

		// Validate rook movement: must move in a straight line (either horizontal or vertical)
		uint8 h = getHorizontalMovement(fromPos, toPos);
		uint8 v = getVerticalMovement(fromPos, toPos);
		if (
			((h > 0) == (v > 0)) || (gameState & getInBetweenMask(fromPos, toPos)) != 0x00 // Cannot move both horizontally and vertically // Path must be clear
		) {
			return invalid_move_constant;
		}

		// Commit the move if valid
		return commitMove(gameState, fromPos, toPos);
	}

	/**
    @dev Calculates the outcome of a single move of the queen given the current game state.
         Returns invalid_move_constant for invalid movement.
    @param gameState current game state on which to perform the movement.
    @param fromPos is position moving from.
    @param toPos is position moving to.
    @param currentTurnBlack true if it's black turn
    @return newGameState the new game state after it's executed.
 */
	function verifyExecuteQueenMove(uint256 gameState, uint8 fromPos, uint8 toPos, bool currentTurnBlack) public pure returns (uint256) {
		// Check if the destination square is occupied by a piece of the same color
		uint8 pieceToPosition = pieceAtPosition(gameState, toPos);
		if (pieceToPosition > 0) {
			if (((pieceToPosition & color_const) == color_const) == currentTurnBlack) {
				return invalid_move_constant;
			}
		}

		// Validate queen movement: must move in a straight line or diagonally
		uint8 h = getHorizontalMovement(fromPos, toPos);
		uint8 v = getVerticalMovement(fromPos, toPos);
		if (
			((h != v) && (h != 0) && (v != 0)) || (gameState & getInBetweenMask(fromPos, toPos)) != 0x00 // Not a valid straight or diagonal move // Path must be clear
		) {
			return invalid_move_constant;
		}

		// Commit the move if valid
		return commitMove(gameState, fromPos, toPos);
	}

	/**
    @dev Calculates the outcome of a single move of the king given the current game state.
         Returns invalid_move_constant for invalid movement.
    @param gameState current game state on which to perform the movement.
    @param fromPos is position moving from. Behavior is undefined for values >= 0x40.
    @param toPos is position moving to. Behavior is undefined for values >= 0x40.
    @param currentTurnBlack true if it's black turn
    @param playerState current state of the player's pieces
    @return newGameState the new game state after it's executed.
    @return newPlayerState updated player state after the move.
 */
	function verifyExecuteKingMove(
		uint256 gameState,
		uint8 fromPos,
		uint8 toPos,
		bool currentTurnBlack,
		uint32 playerState
	) public pure returns (uint256 newGameState, uint32 newPlayerState) {
		// Update player state for the king's new position
		newPlayerState = ((playerState | king_move_mask) & king_pos_zero_mask) | ((uint32)(toPos) << king_pos_bit);

		// Check if destination square is occupied by a piece of the same color
		uint8 pieceToPosition = pieceAtPosition(gameState, toPos);
		if (pieceToPosition > 0) {
			if (((pieceToPosition & color_const) == color_const) == currentTurnBlack) {
				return (invalid_move_constant, newPlayerState);
			}
		}

		// Validate positions
		if (toPos >= 0x40 || fromPos >= 0x40) {
			return (invalid_move_constant, newPlayerState);
		}

		// Validate king's normal moves (one square in any direction)
		uint8 h = getHorizontalMovement(fromPos, toPos);
		uint8 v = getVerticalMovement(fromPos, toPos);
		if ((h <= 1) && (v <= 1)) {
			return (commitMove(gameState, fromPos, toPos), newPlayerState);
		}

		// Validate castling moves
		if ((h == 2) && (v == 0)) {
			if (!pieceUnderAttack(gameState, fromPos)) {
				// Queen-side castling
				uint8 castlingRookPosition = uint8(playerState >> rook_queen_side_move_bit);
				if (castlingRookPosition + 2 == toPos) {
					if ((getInBetweenMask(castlingRookPosition, fromPos) & gameState) == 0) {
						newGameState = commitMove(gameState, fromPos, fromPos - 1);
						if (!pieceUnderAttack(newGameState, fromPos - 1)) {
							return (
								commitMove(commitMove(newGameState, fromPos - 1, toPos), castlingRookPosition, fromPos - 1),
								newPlayerState
							);
						}
					}
				} else {
					// King-side castling
					castlingRookPosition = uint8(playerState >> rook_king_side_move_bit);
					if (castlingRookPosition - 1 == toPos) {
						if ((getInBetweenMask(castlingRookPosition, fromPos) & gameState) == 0) {
							newGameState = commitMove(gameState, fromPos, fromPos + 1);
							if (!pieceUnderAttack(newGameState, fromPos + 1)) {
								return (
									commitMove(commitMove(newGameState, fromPos + 1, toPos), castlingRookPosition, fromPos + 1),
									newPlayerState
								);
							}
						}
					}
				}
			}
		}

		// Invalid move
		return (invalid_move_constant, 0x00);
	}

	function checkQueenValidMoves(uint256 gameState, uint8 fromPos, uint32 playerState, bool currentTurnBlack) public pure returns (bool) {
		uint8 kingPos = uint8(playerState >> king_pos_bit); // King's position is unaffected by Queen's moves

		// Directions: horizontal, vertical, and diagonal
		if (checkDirectionQueen(gameState, fromPos, -1, 0x0, kingPos, currentTurnBlack)) return true; // Left
		if (checkDirectionQueen(gameState, fromPos, 1, 0x7, kingPos, currentTurnBlack)) return true; // Right
		if (checkDirectionQueen(gameState, fromPos, 8, 0x40, kingPos, currentTurnBlack)) return true; // Up
		if (checkDirectionQueen(gameState, fromPos, -8, 0x40, kingPos, currentTurnBlack)) return true; // Down
		if (checkDirectionQueen(gameState, fromPos, 9, 0x7, kingPos, currentTurnBlack)) return true; // Up-right
		if (checkDirectionQueen(gameState, fromPos, 7, 0x0, kingPos, currentTurnBlack)) return true; // Up-left
		if (checkDirectionQueen(gameState, fromPos, -7, 0x7, kingPos, currentTurnBlack)) return true; // Down-right
		if (checkDirectionQueen(gameState, fromPos, -9, 0x0, kingPos, currentTurnBlack)) return true; // Down-left

		return false;
	}

	function checkDirectionQueen(
		uint256 gameState,
		uint8 fromPos,
		int8 step,
		uint8 limitCheck,
		uint8 kingPos,
		bool currentTurnBlack
	) public pure returns (bool) {
		uint256 newGameState;
		uint8 toPos;

		for (
			toPos = uint8(int8(fromPos) + step);
			(toPos & 0x7) != limitCheck && toPos < 0x40 && toPos >= 0;
			toPos = uint8(int8(toPos) + step)
		) {
			newGameState = verifyExecuteQueenMove(gameState, fromPos, toPos, currentTurnBlack);
			if ((newGameState != invalid_move_constant) && (!pieceUnderAttack(newGameState, kingPos))) {
				return true;
			}
			if (((gameState >> (toPos << piece_pos_shift_bit)) & 0xF) != 0) {
				break;
			}
		}
		return false;
	}

	function checkBishopValidMoves(uint256 gameState, uint8 fromPos, uint32 playerState, bool currentTurnBlack) public pure returns (bool) {
		uint8 kingPos = uint8(playerState >> king_pos_bit); // King's position is unaffected by Bishop's moves

		// Check directions for bishop movement
		if (checkDirectionBishop(gameState, fromPos, 9, 0x7, kingPos, currentTurnBlack)) return true; // Up-right
		if (checkDirectionBishop(gameState, fromPos, 7, 0x0, kingPos, currentTurnBlack)) return true; // Up-left
		if (checkDirectionBishop(gameState, fromPos, -7, 0x7, kingPos, currentTurnBlack)) return true; // Down-right
		if (checkDirectionBishop(gameState, fromPos, -9, 0x0, kingPos, currentTurnBlack)) return true; // Down-left

		return false;
	}

	function checkDirectionBishop(
		uint256 gameState,
		uint8 fromPos,
		int8 step,
		uint8 limitCheck,
		uint8 kingPos,
		bool currentTurnBlack
	) public pure returns (bool) {
		uint256 newGameState;
		uint8 toPos;

		for (
			toPos = uint8(int8(fromPos) + step);
			(toPos & 0x7) != limitCheck && toPos < 0x40 && toPos >= 0;
			toPos = uint8(int8(toPos) + step)
		) {
			newGameState = verifyExecuteBishopMove(gameState, fromPos, toPos, currentTurnBlack);
			if ((newGameState != invalid_move_constant) && (!pieceUnderAttack(newGameState, kingPos))) {
				return true;
			}
			if (((gameState >> (toPos << piece_pos_shift_bit)) & 0xF) != 0) {
				break;
			}
		}
		return false;
	}

	function checkRookValidMoves(uint256 gameState, uint8 fromPos, uint32 playerState, bool currentTurnBlack) public pure returns (bool) {
		uint8 kingPos = uint8(playerState >> king_pos_bit); // King's position is unaffected by Rook's moves

		// Check directions for rook movement
		if (checkDirectionRook(gameState, fromPos, -1, 0x0, kingPos, currentTurnBlack)) return true; // Left
		if (checkDirectionRook(gameState, fromPos, 1, 0x7, kingPos, currentTurnBlack)) return true; // Right
		if (checkDirectionRook(gameState, fromPos, 8, 0x40, kingPos, currentTurnBlack)) return true; // Up
		if (checkDirectionRook(gameState, fromPos, -8, 0x40, kingPos, currentTurnBlack)) return true; // Down

		return false;
	}

	function checkDirectionRook(
		uint256 gameState,
		uint8 fromPos,
		int8 step,
		uint8 limitCheck,
		uint8 kingPos,
		bool currentTurnBlack
	) public pure returns (bool) {
		uint256 newGameState;
		uint8 toPos;

		for (
			toPos = uint8(int8(fromPos) + step);
			(toPos & 0x7) != limitCheck && toPos < 0x40 && toPos >= 0;
			toPos = uint8(int8(toPos) + step)
		) {
			newGameState = verifyExecuteRookMove(gameState, fromPos, toPos, currentTurnBlack);
			if ((newGameState != invalid_move_constant) && (!pieceUnderAttack(newGameState, kingPos))) {
				return true;
			}
			if (((gameState >> (toPos << piece_pos_shift_bit)) & 0xF) != 0) {
				break;
			}
		}
		return false;
	}

	function checkKnightValidMoves(uint256 gameState, uint8 fromPos, uint32 playerState, bool currentTurnBlack) public pure returns (bool) {
		uint256 newGameState;
		uint8 kingPos = uint8(playerState >> king_pos_bit); // King's position is unaffected by knight's moves

		// List of all possible knight moves
		int8[8] memory knightMoves = [int8(6), int8(-6), int8(10), int8(-10), int8(17), int8(-17), int8(15), int8(-15)];

		for (uint8 i = 0; i < knightMoves.length; i++) {
			int8 toPos = int8(fromPos) + knightMoves[i];
			if (toPos >= 0 && toPos < 64) {
				// Ensure toPos is within board limits
				newGameState = verifyExecuteKnightMove(gameState, fromPos, uint8(toPos), currentTurnBlack);
				if ((newGameState != invalid_move_constant) && (!pieceUnderAttack(newGameState, kingPos))) {
					return true;
				}
			}
		}

		return false;
	}

	function checkPawnValidMoves(
		uint256 gameState,
		uint8 fromPos,
		uint32 playerState,
		uint32 opponentState,
		bool currentTurnBlack
	) public pure returns (bool) {
		uint256 newGameState;
		uint8 moveExtra = queen_const; // Since this is supposed to be endgame, movement of promoted piece is irrelevant.
		uint8 kingPos = uint8(playerState >> king_pos_bit); // King's position is unaffected by pawn's moves

		// List of possible pawn moves
		int8[4] memory pawnMoves = currentTurnBlack ? [int8(-7), int8(-8), int8(-9), int8(-16)] : [int8(7), int8(8), int8(9), int8(16)];

		for (uint8 i = 0; i < pawnMoves.length; i++) {
			int8 toPos = int8(fromPos) + pawnMoves[i];
			if (toPos >= 0 && toPos < 64) {
				// Ensure toPos is within board limits
				(newGameState, ) = verifyExecutePawnMove(
					gameState,
					fromPos,
					uint8(toPos),
					moveExtra,
					currentTurnBlack,
					playerState,
					opponentState
				);
				if ((newGameState != invalid_move_constant) && (!pieceUnderAttack(newGameState, kingPos))) {
					return true;
				}
			}
		}

		return false;
	}

	function checkKingValidMoves(uint256 gameState, uint8 fromPos, uint32 playerState, bool currentTurnBlack) public pure returns (bool) {
		uint256 newGameState;

		// List of all possible king moves
		int8[8] memory kingMoves = [-9, -8, -7, -1, 1, 7, 8, 9];

		for (uint8 i = 0; i < kingMoves.length; i++) {
			int8 toPos = int8(fromPos) + kingMoves[i];
			if (toPos >= 0 && toPos < 64) {
				// Ensure toPos is within board limits
				(newGameState, ) = verifyExecuteKingMove(gameState, fromPos, uint8(toPos), currentTurnBlack, playerState);
				if ((newGameState != invalid_move_constant) && (!pieceUnderAttack(newGameState, uint8(toPos)))) {
					return true;
				}
			}
		}

		/* TODO: Check castling */

		return false;
	}

	/**
    @dev Performs one iteration of recursive search for pieces. 
    @param gameState Game state from which start the movements
    @param playerState State of the player
    @param opponentState State of the opponent
    @param color Color of the pieces to search for
    @param pBitOffset Current bit offset for the recursive search
    @param bitSize Current bit size of the segment being checked
    @return returns true if any of the pieces in the current offset has legal moves
 */
	function searchPiece(
		uint256 gameState,
		uint32 playerState,
		uint32 opponentState,
		uint8 color,
		uint16 pBitOffset,
		uint16 bitSize
	) public pure returns (bool) {
		if (bitSize > piece_bit_size) {
			uint16 newBitSize = bitSize / 2;
			uint256 mask = ~(full_long_word_mask << newBitSize);

			// Check higher half
			uint256 higher = (gameState >> (pBitOffset + newBitSize)) & mask;
			if (higher != 0) {
				if (searchPiece(gameState, playerState, opponentState, color, pBitOffset + newBitSize, newBitSize)) {
					return true;
				}
			}

			// Check lower half
			uint256 lower = (gameState >> pBitOffset) & mask;
			if (lower != 0) {
				if (searchPiece(gameState, playerState, opponentState, color, pBitOffset, newBitSize)) {
					return true;
				}
			}
		} else {
			uint8 piece = uint8((gameState >> pBitOffset) & 0xF);

			if ((piece > 0) && ((piece & color_const) == color)) {
				uint8 pos = uint8(pBitOffset / piece_bit_size);
				bool currentTurnBlack = color != 0;
				uint8 pieceType = piece & type_mask_const;

				if (
					(pieceType == king_const && checkKingValidMoves(gameState, pos, playerState, currentTurnBlack)) ||
					(pieceType == pawn_const && checkPawnValidMoves(gameState, pos, playerState, opponentState, currentTurnBlack)) ||
					(pieceType == knight_const && checkKnightValidMoves(gameState, pos, playerState, currentTurnBlack)) ||
					(pieceType == rook_const && checkRookValidMoves(gameState, pos, playerState, currentTurnBlack)) ||
					(pieceType == bishop_const && checkBishopValidMoves(gameState, pos, playerState, currentTurnBlack)) ||
					(pieceType == queen_const && checkQueenValidMoves(gameState, pos, playerState, currentTurnBlack))
				) {
					return true;
				}
			}
		}

		return false;
	}

	/**
    @dev Checks the endgame state and determines whether the last user is checkmated, stalemated, or neither.
    @param gameState Game state to evaluate.
    @param playerState State of the current player.
    @param opponentState State of the opponent.
    @return outcome Returns:
            - 0 for inconclusive or only check.
            - 1 for stalemate.
            - 2 for checkmate.
 */
	function checkEndgame(uint256 gameState, uint32 playerState, uint32 opponentState) public pure returns (uint8) {
		// Retrieve the king's position and validate it's the king piece
		uint8 kingPosition = uint8(playerState >> king_pos_bit);
		uint8 kingPiece = uint8((gameState >> (kingPosition << piece_pos_shift_bit)) & 0xF);
		assert((kingPiece & (~color_const)) == king_const);

		// Check if there are any legal moves available for the player
		bool legalMoves = searchPiece(gameState, playerState, opponentState, kingPiece & color_const, 0, 256);

		// Evaluate the endgame state
		if (checkForCheck(gameState, playerState)) {
			return legalMoves ? 0 : 2; // 2 = Checkmate, 0 = In check but not checkmate
		}

		return legalMoves ? 0 : 1; // 1 = Stalemate, 0 = Not in stalemate
	}

	/**
    @dev Gets the mask of the in-between squares.
         It performs bit-shifts depending on the movement direction.
         - Down: >> 8
         - Up: << 8
         - Right: << 1
         - Left: >> 1
         - UpRight: << 9
         - DownLeft: >> 9
         - DownRight: >> 7
         - UpLeft: << 7
         Reverts for invalid movement.
    @param fromPos is position moving from.
    @param toPos is position moving to.
    @return mask of the in-between squares, can be bitwise-ANDed with the game state to check squares.
 */
	function getInBetweenMask(uint8 fromPos, uint8 toPos) public pure returns (uint256) {
		uint8 h = getHorizontalMovement(fromPos, toPos);
		uint8 v = getVerticalMovement(fromPos, toPos);

		// Ensure the movement is valid (diagonal, vertical, or horizontal)
		require((h == v) || (h == 0) || (v == 0), "Invalid move");

		uint256 startMask = getPositionMask(fromPos);
		uint256 endMask = getPositionMask(toPos);

		int8 x = int8(toPos & 0x7) - int8(fromPos & 0x7);
		int8 y = int8(toPos >> 3) - int8(fromPos >> 3);

		uint8 step = 0;
		if (((x > 0) && (y > 0)) || ((x < 0) && (y < 0)))
			step = 9 * 4; // Diagonal UpRight or DownLeft
		else if ((x == 0) && (y != 0))
			step = 8 * 4; // Vertical Up or Down
		else if (((x > 0) && (y < 0)) || ((x < 0) && (y > 0)))
			step = 7 * 4; // Diagonal DownRight or UpLeft
		else if ((x != 0) && (y == 0)) step = 1 * 4; // Horizontal Left or Right

		uint256 outMask = 0x00;

		// Build the mask by iterating between start and end masks
		while (endMask != startMask) {
			if (startMask < endMask) {
				startMask <<= step;
			} else {
				startMask >>= step;
			}

			if (endMask != startMask) {
				outMask |= startMask;
			}
		}

		return outMask;
	}

	/**
    @dev Gets the mask (0xF) of a square.
    @param pos The square position (0-63).
    @return mask A 256-bit value with the mask set for the given square.
 */
	function getPositionMask(uint8 pos) public pure returns (uint256) {
		return (uint256(0xF) << (((pos >> 3) * 32) + ((pos & 0x7) * 4)));
	}

	function getHorizontalMovement(uint8 fromPos, uint8 toPos) public pure returns (uint8) {
		return uint8((fromPos & 0x7) > (toPos & 0x7) ? (fromPos & 0x7) - (toPos & 0x7) : (toPos & 0x7) - (fromPos & 0x7));
	}

	function getVerticalMovement(uint8 fromPos, uint8 toPos) public pure returns (uint8) {
		return uint8((fromPos >> 3) > (toPos >> 3) ? (fromPos >> 3) - (toPos >> 3) : (toPos >> 3) - (fromPos >> 3));
	}

	function checkForCheck(uint256 gameState, uint32 playerState) public pure returns (bool) {
		uint8 kingsPosition = uint8(playerState >> king_pos_bit);
		assert(king_const == (pieceAtPosition(gameState, kingsPosition) & type_mask_const));
		return pieceUnderAttack(gameState, kingsPosition);
	}

	function pieceUnderAttack(uint256 gameState, uint8 pos) public pure returns (bool) {
		uint8 currPiece = uint8(gameState >> (pos * piece_bit_size)) & 0xF;

		uint8 enemyPawn = pawn_const | ((currPiece & color_const) > 0 ? 0x0 : color_const);
		uint8 enemyBishop = bishop_const | ((currPiece & color_const) > 0 ? 0x0 : color_const);
		uint8 enemyKnight = knight_const | ((currPiece & color_const) > 0 ? 0x0 : color_const);
		uint8 enemyRook = rook_const | ((currPiece & color_const) > 0 ? 0x0 : color_const);
		uint8 enemyQueen = queen_const | ((currPiece & color_const) > 0 ? 0x0 : color_const);
		uint8 enemyKing = king_const | ((currPiece & color_const) > 0 ? 0x0 : color_const);

		// Check all directions: vertical, horizontal, diagonal, and knight moves
		return
			checkDirectionalAttack(gameState, pos, enemyRook, enemyQueen, enemyKing) ||
			checkDiagonalAttack(gameState, pos, enemyBishop, enemyQueen, enemyKing, enemyPawn) ||
			checkKnightAttack(gameState, pos, enemyKnight);
	}

	function checkDirectionalAttack(
		uint256 gameState,
		uint8 pos,
		uint8 enemyRook,
		uint8 enemyQueen,
		uint8 enemyKing
	) internal pure returns (bool) {
		int8[4] memory directions = [int8(8), int8(-8), int8(1), int8(-1)]; // Up, Down, Right, Left
		for (uint8 i = 0; i < directions.length; i++) {
			bool firstSq = true;
			int8 currPos = int8(pos);
			while (true) {
				currPos += directions[i];
				if (currPos < 0 || currPos >= 64 || ((directions[i] == 1 || directions[i] == -1) && (uint8(currPos) >> 3) != (pos >> 3))) {
					break;
				}
				uint8 currPiece = uint8(gameState >> (uint8(currPos) * piece_bit_size)) & 0xF;
				if (currPiece > 0) {
					if (currPiece == enemyRook || currPiece == enemyQueen || (firstSq && currPiece == enemyKing)) {
						return true;
					}
					break;
				}
				firstSq = false;
			}
		}
		return false;
	}

	function checkDiagonalAttack(
		uint256 gameState,
		uint8 pos,
		uint8 enemyBishop,
		uint8 enemyQueen,
		uint8 enemyKing,
		uint8 enemyPawn
	) internal pure returns (bool) {
		int8[4] memory directions = [int8(9), int8(7), int8(-7), int8(-9)]; // UpRight, UpLeft, DownRight, DownLeft
		for (uint8 i = 0; i < directions.length; i++) {
			bool firstSq = true;
			int8 currPos = int8(pos);
			while (true) {
				currPos += directions[i];
				if (
					currPos < 0 || currPos >= 64 || ((directions[i] == 9 || directions[i] == -9) && ((uint8(currPos) & 0x7) != (pos & 0x7)))
				) {
					break;
				}
				uint8 currPiece = uint8(gameState >> (uint8(currPos) * piece_bit_size)) & 0xF;
				if (currPiece > 0) {
					if (
						currPiece == enemyBishop ||
						currPiece == enemyQueen ||
						(firstSq &&
							(currPiece == enemyKing ||
								(currPiece == enemyPawn && ((enemyPawn & color_const) == (currPiece & color_const)))))
					) {
						return true;
					}
					break;
				}
				firstSq = false;
			}
		}
		return false;
	}

	function checkKnightAttack(uint256 gameState, uint8 pos, uint8 enemyKnight) internal pure returns (bool) {
		int8[8] memory knightMoves = [int8(17), int8(15), int8(10), int8(6), int8(-6), int8(-10), int8(-15), int8(-17)];

		for (uint8 i = 0; i < knightMoves.length; i++) {
			int8 currPos = int8(pos) + knightMoves[i];
			if (currPos >= 0 && currPos < 64 && ((gameState >> (uint8(currPos) * piece_bit_size)) & 0xF) == enemyKnight) {
				return true;
			}
		}
		return false;
	}

	/**
        @dev Commits a move into the game state. Validity of the move is not checked.
        @param gameState current game state
        @param fromPos is the position to move a piece from.
        @param toPos is the position to move a piece to.
        @return newGameState
     */
	function commitMove(uint256 gameState, uint8 fromPos, uint8 toPos) public pure returns (uint256 newGameState) {
		uint8 bitpos = fromPos * piece_bit_size;

		uint8 piece = (uint8)((gameState >> bitpos) & 0xF);
		newGameState = gameState & ~(0xF << bitpos);

		newGameState = setPosition(newGameState, toPos, piece);
	}

	/**
    @dev Zeroes out a piece position in the current game state.
         Behavior is undefined for position values greater than 0x3F (63).
    @param gameState The current game state.
    @param pos The position to zero out: 6-bit var, 3-bit word, high word = row, low word = column.
    @return newGameState The updated game state with the piece at the given position removed.
 */
	function zeroPosition(uint256 gameState, uint8 pos) public pure returns (uint256) {
		require(pos < 64, "Invalid position: exceeds board limits");
		return gameState & ~(0xF << (pos * piece_bit_size));
	}

	/**
    @dev Sets a piece position in the current game state.
         Behavior is undefined for position values greater than 0x3F (63).
    @param gameState The current game state.
    @param pos The position to set the piece: 6-bit var, 3-bit word, high word = row, low word = column.
    @param piece The piece to set, including color.
    @return newGameState The updated game state with the piece at the given position.
 */
	function setPosition(uint256 gameState, uint8 pos, uint8 piece) public pure returns (uint256) {
		require(pos < 64, "Invalid position: exceeds board limits");
		uint8 bitpos = pos * piece_bit_size;
		return (gameState & ~(0xF << bitpos)) | (uint256(piece) << bitpos);
	}

	/**
    @dev Gets the piece at a given position in the current gameState.
         Behavior is undefined for position values greater than 0x3F (63).
    @param gameState The current game state.
    @param pos The position to get the piece: 6-bit var, 3-bit word, high word = row, low word = column.
    @return piece The piece value, including color.
 */
	function pieceAtPosition(uint256 gameState, uint8 pos) public pure returns (uint8) {
		require(pos < 64, "Invalid position: exceeds board limits");
		return uint8((gameState >> (pos * piece_bit_size)) & 0xF);
	}
}
